import simpleGit from "simple-git";
import { loadConfig } from "../../config/loader.ts";
import type { RuntimeOptions } from "../../config/types.ts";
import { createEngine, isEngineAvailable } from "../../engines/index.ts";
import type { AIEngineName } from "../../engines/types.ts";
import { isBrowserAvailable } from "../../execution/browser.ts";
import { buildPrompt } from "../../execution/prompt.ts";
import { isRetryableError, withRetry } from "../../execution/retry.ts";
import { getDefaultBaseBranch } from "../../git/branch.ts";
import {
	buildMilestonePromptSection,
	createMilestoneBranch,
	createScopeDocument,
} from "../../milestone/index.ts";
import { sendNotifications } from "../../notifications/webhook.ts";
import { formatTokens, logError, logInfo, logSuccess, setVerbose } from "../../ui/logger.ts";
import { notifyTaskComplete, notifyTaskFailed } from "../../ui/notify.ts";
import { buildActiveSettings } from "../../ui/settings.ts";
import { ProgressSpinner } from "../../ui/spinner.ts";

/**
 * Run a single task with milestone branch + scope (walph brownfield mode)
 */
export async function runWalphTask(
	task: string,
	options: RuntimeOptions,
	noMilestone = false,
): Promise<void> {
	const workDir = process.cwd();
	const config = loadConfig(workDir);

	setVerbose(options.verbose);

	// Check engine availability
	const engine = createEngine(options.aiEngine as AIEngineName);
	const available = await isEngineAvailable(options.aiEngine as AIEngineName);

	if (!available) {
		logError(`${engine.name} CLI not found. Make sure '${engine.cliCommand}' is in your PATH.`);
		process.exit(1);
	}

	// Determine base branch
	let baseBranch = options.baseBranch;
	if (!baseBranch) {
		baseBranch = await getDefaultBaseBranch(workDir);
	}

	let milestoneContext: string | undefined;
	let milestoneName: string | undefined;

	// Create milestone branch and scope
	if (!noMilestone && baseBranch) {
		try {
			logInfo("Creating milestone branch...");
			const { branchName, number, slug } = await createMilestoneBranch(task, baseBranch, workDir);
			milestoneName = `${number}-${slug}`;
			logSuccess(`Branch: ${branchName}`);

			// Create scope document
			const scopePath = createScopeDocument(number, slug, task, workDir);
			logInfo(`Scope: ${scopePath}`);

			// Stage and commit the scope document
			const git = simpleGit(workDir);
			await git.add(scopePath);
			await git.commit(`milestone(${milestoneName}): create scope document`);
			logSuccess("Scope document committed");

			// Build milestone prompt section
			milestoneContext = buildMilestonePromptSection(milestoneName);
		} catch (error) {
			logError(`Failed to create milestone: ${error}`);
			logInfo("Continuing without milestone...");
		}
	} else if (!baseBranch) {
		logInfo("No base branch detected. Running without milestone branch.");
	}

	logInfo(`Running task with ${engine.name}...`);

	if (isBrowserAvailable(options.browserEnabled)) {
		logInfo("Browser automation enabled (agent-browser)");
	}

	// Build prompt with milestone context
	const prompt = buildPrompt({
		task,
		autoCommit: options.autoCommit,
		workDir,
		browserEnabled: options.browserEnabled,
		skipTests: options.skipTests,
		skipLint: options.skipLint,
		milestoneContext,
		configDir: ".walph",
	});

	// Build active settings for display
	const activeSettings = buildActiveSettings(options);
	if (milestoneName) {
		activeSettings.push(`milestone:${milestoneName}`);
	}

	// Execute with spinner
	const spinner = new ProgressSpinner(task, activeSettings);

	if (options.dryRun) {
		spinner.success("(dry run) Would execute task");
		console.log("\nPrompt:");
		console.log(prompt);
		return;
	}

	try {
		const result = await withRetry(
			async () => {
				spinner.updateStep("Working");

				const engineOptions = {
					...(options.modelOverride && { modelOverride: options.modelOverride }),
					...(options.engineArgs &&
						options.engineArgs.length > 0 && { engineArgs: options.engineArgs }),
				};

				if (engine.executeStreaming) {
					return await engine.executeStreaming(
						prompt,
						workDir,
						(step) => {
							spinner.updateStep(step);
						},
						engineOptions,
					);
				}

				const res = await engine.execute(prompt, workDir, engineOptions);

				if (!res.success && res.error && isRetryableError(res.error)) {
					throw new Error(res.error);
				}

				return res;
			},
			{
				maxRetries: options.maxRetries,
				retryDelay: options.retryDelay,
				onRetry: (attempt) => {
					spinner.updateStep(`Retry ${attempt}`);
				},
			},
		);

		if (result.success) {
			const tokens = formatTokens(result.inputTokens, result.outputTokens);
			spinner.success(`Done ${tokens}`);

			await sendNotifications(config, "completed", {
				tasksCompleted: 1,
				tasksFailed: 0,
			});
			notifyTaskComplete(task);

			if (result.response && result.response !== "Task completed") {
				console.log("\nResult:");
				console.log(result.response.slice(0, 500));
				if (result.response.length > 500) {
					console.log("...");
				}
			}
		} else {
			spinner.error(result.error || "Unknown error");
			await sendNotifications(config, "failed", {
				tasksCompleted: 0,
				tasksFailed: 1,
			});
			notifyTaskFailed(task, result.error || "Unknown error");
			process.exit(1);
		}
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : String(error);
		spinner.error(errorMsg);
		await sendNotifications(config, "failed", {
			tasksCompleted: 0,
			tasksFailed: 1,
		});
		notifyTaskFailed(task, errorMsg);
		process.exit(1);
	}
}
