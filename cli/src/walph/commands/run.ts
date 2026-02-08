import { existsSync } from "node:fs";
import simpleGit from "simple-git";
import { loadConfig } from "../../config/loader.ts";
import type { RuntimeOptions } from "../../config/types.ts";
import { createEngine, isEngineAvailable } from "../../engines/index.ts";
import type { AIEngineName } from "../../engines/types.ts";
import { isBrowserAvailable } from "../../execution/browser.ts";
import { type ExecutionOptions, runSequential } from "../../execution/sequential.ts";
import { getDefaultBaseBranch, returnToBaseBranch } from "../../git/branch.ts";
import {
	buildMilestonePromptSection,
	createMilestoneBranch,
	createScopeDocument,
} from "../../milestone/index.ts";
import { sendNotifications } from "../../notifications/webhook.ts";
import { CachedTaskSource, createTaskSource } from "../../tasks/index.ts";
import type { Task } from "../../tasks/types.ts";
import {
	formatDuration,
	formatTokens,
	logError,
	logInfo,
	logSuccess,
	setVerbose,
} from "../../ui/logger.ts";
import { notifyAllComplete } from "../../ui/notify.ts";
import { buildActiveSettings } from "../../ui/settings.ts";

/**
 * Run the PRD loop with milestone branches per task (walph mode)
 */
export async function runWalphLoop(
	options: RuntimeOptions,
	noMilestone = false,
): Promise<void> {
	const workDir = process.cwd();
	const startTime = Date.now();
	const config = loadConfig(workDir);

	setVerbose(options.verbose);

	// Validate PRD source
	if (
		options.prdSource === "markdown" ||
		options.prdSource === "yaml" ||
		options.prdSource === "json"
	) {
		if (!existsSync(options.prdFile)) {
			logError(`${options.prdFile} not found in current directory`);
			logInfo(`Create a ${options.prdFile} file with tasks`);
			process.exit(1);
		}
	} else if (options.prdSource === "markdown-folder") {
		if (!existsSync(options.prdFile)) {
			logError(`PRD folder ${options.prdFile} not found`);
			logInfo(`Create a ${options.prdFile}/ folder with markdown files containing tasks`);
			process.exit(1);
		}
	}

	if (options.prdSource === "github" && !options.githubRepo) {
		logError("GitHub repository not specified. Use --github owner/repo");
		process.exit(1);
	}

	// Check engine availability
	const engine = createEngine(options.aiEngine as AIEngineName);
	const available = await isEngineAvailable(options.aiEngine as AIEngineName);

	if (!available) {
		logError(`${engine.name} CLI not found. Make sure '${engine.cliCommand}' is in your PATH.`);
		process.exit(1);
	}

	// Create task source
	const innerTaskSource = createTaskSource({
		type: options.prdSource,
		filePath: options.prdFile,
		repo: options.githubRepo,
		label: options.githubLabel,
	});
	const taskSource = new CachedTaskSource(innerTaskSource);

	const remaining = await taskSource.countRemaining();
	if (remaining === 0) {
		logSuccess("No tasks remaining. All done!");
		return;
	}

	// Get base branch
	let baseBranch = options.baseBranch;
	if (!baseBranch) {
		baseBranch = await getDefaultBaseBranch(workDir);
		if (!baseBranch) {
			logError("Cannot run: repository has no commits yet.");
			logInfo("Please make an initial commit first:");
			logInfo('  git add . && git commit -m "Initial commit"');
			process.exit(1);
		}
	}

	logInfo(`Starting Walph with ${engine.name}`);
	logInfo(`Tasks remaining: ${remaining}`);
	logInfo("Mode: Sequential (milestone per task)");
	if (isBrowserAvailable(options.browserEnabled)) {
		logInfo("Browser automation enabled (agent-browser)");
	}
	console.log("");

	const activeSettings = buildActiveSettings(options);

	// Track the last created milestone name via closure
	let lastMilestoneName = "";

	// Create a milestone-aware branch creator
	const milestoneBranchCreator = async (
		taskTitle: string,
		base: string,
		wd: string,
	): Promise<string> => {
		const { branchName, number, slug } = await createMilestoneBranch(taskTitle, base, wd);
		lastMilestoneName = `${number}-${slug}`;

		// Create scope document
		const scopePath = createScopeDocument(number, slug, taskTitle, wd);

		// Stage and commit scope
		const git = simpleGit(wd);
		await git.add(scopePath);
		await git.commit(`milestone(${lastMilestoneName}): create scope document`);

		return branchName;
	};

	// Prompt enhancer injects milestone context using the name from the branch creator
	const milestonePromptEnhancer = (prompt: string, _task: Task): string => {
		if (!lastMilestoneName) return prompt;
		const section = buildMilestonePromptSection(lastMilestoneName);
		return `${section}\n\n${prompt}`;
	};

	// For walph, we always want branch-per-task with milestones
	const executionOptions: ExecutionOptions = {
		engine,
		taskSource,
		workDir,
		skipTests: options.skipTests,
		skipLint: options.skipLint,
		dryRun: options.dryRun,
		maxIterations: options.maxIterations,
		maxRetries: options.maxRetries,
		retryDelay: options.retryDelay,
		branchPerTask: true, // Always true for walph
		baseBranch,
		createPr: options.createPr,
		draftPr: options.draftPr,
		autoCommit: options.autoCommit,
		browserEnabled: options.browserEnabled,
		activeSettings,
		prdFile: options.prdFile,
		modelOverride: options.modelOverride,
		skipMerge: options.skipMerge,
		engineArgs: options.engineArgs,
		syncIssue: options.syncIssue,
		branchCreator: noMilestone ? undefined : milestoneBranchCreator,
		promptEnhancer: noMilestone ? undefined : milestonePromptEnhancer,
	};

	const result = await runSequential(executionOptions);

	// Return to base branch after all tasks
	await returnToBaseBranch(baseBranch, workDir);

	// Flush and cleanup
	await taskSource.flush();
	taskSource.dispose();

	// Summary
	const duration = Date.now() - startTime;
	console.log("");
	console.log("=".repeat(50));
	logInfo("Summary:");
	console.log(`  Completed: ${result.tasksCompleted}`);
	console.log(`  Failed:    ${result.tasksFailed}`);
	console.log(`  Duration:  ${formatDuration(duration)}`);
	if (result.totalInputTokens > 0 || result.totalOutputTokens > 0) {
		console.log(
			`  Tokens:    ${formatTokens(result.totalInputTokens, result.totalOutputTokens)}`,
		);
	}
	console.log("=".repeat(50));

	// Notifications
	const status = result.tasksFailed > 0 ? "failed" : "completed";
	await sendNotifications(config, status, {
		tasksCompleted: result.tasksCompleted,
		tasksFailed: result.tasksFailed,
	});

	if (result.tasksCompleted > 0) {
		notifyAllComplete(result.tasksCompleted);
	}

	if (result.tasksFailed > 0) {
		process.exit(1);
	}
}
