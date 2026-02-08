import { existsSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { slugify } from "../../git/branch.ts";
import { createScopeDocument, getNextMilestoneNumber } from "../../milestone/index.ts";
import { createTaskSource } from "../../tasks/index.ts";
import type { TaskSourceType } from "../../tasks/types.ts";
import { logError, logInfo, logSuccess } from "../../ui/logger.ts";
import { copyClaudeHooks, initWalph } from "../config.ts";

/**
 * Detect PRD type from file extension.
 */
function detectPrdType(filePath: string): TaskSourceType {
	const lower = filePath.toLowerCase();
	if (lower.endsWith(".yaml") || lower.endsWith(".yml")) return "yaml";
	if (lower.endsWith(".json")) return "json";
	return "markdown";
}

/**
 * Decompose a PRD file into milestone directories with scope documents.
 */
async function decomposePrd(
	prdFile: string,
	workDir: string,
): Promise<{ milestones: Array<{ number: string; slug: string; title: string }> }> {
	const prdPath = resolve(prdFile);
	if (!existsSync(prdPath)) {
		throw new Error(`PRD file not found: ${prdFile}`);
	}

	const type = detectPrdType(prdFile);
	const taskSource = createTaskSource({ type, filePath: prdPath });
	const tasks = await taskSource.getAllTasks();

	if (tasks.length === 0) {
		throw new Error(`No tasks found in PRD file: ${prdFile}`);
	}

	const milestones: Array<{ number: string; slug: string; title: string }> = [];

	for (const task of tasks) {
		const number = await getNextMilestoneNumber(workDir);
		const slug = slugify(task.title);
		createScopeDocument(number, slug, task.title, workDir);
		milestones.push({ number, slug, title: task.title });
	}

	// Generate PROJECT_PLAN.md with the milestone list (overwrite placeholder)
	const planLines = [
		"# Project Plan",
		"",
		"## Overview",
		`Generated from \`${prdFile}\``,
		"",
		"## Milestones",
		"",
	];
	for (const m of milestones) {
		planLines.push(`- [ ] ${m.number}-${m.slug} — ${m.title}`);
	}
	planLines.push("");

	writeFileSync(join(workDir, "PROJECT_PLAN.md"), planLines.join("\n"), "utf-8");

	return { milestones };
}

/**
 * Run the walph --init command
 * Creates .walph/, milestones/.templates/, PROJECT_PLAN.md,
 * copies .claude/ hooks, and optionally decomposes a PRD into milestones.
 */
export async function runWalphInit(prdFile?: string): Promise<void> {
	const workDir = process.cwd();

	logInfo("Initializing walph...");

	const { detected } = initWalph(workDir);

	// Copy .claude/ hooks to project
	const { copied } = copyClaudeHooks(workDir);

	logSuccess("Walph initialized!");
	console.log("");

	if (detected.language) {
		console.log(
			`  Detected: ${detected.language}${detected.framework ? ` (${detected.framework})` : ""}`,
		);
	}

	console.log("");
	console.log("  Created:");
	console.log("    .walph/config.yaml         - Configuration");
	console.log("    .walph/progress.txt         - Progress log");
	console.log("    milestones/.templates/      - Milestone templates");
	if (copied > 0) {
		console.log(`    .claude/                    - Hooks & settings (${copied} files)`);
	}

	// Decompose PRD if provided
	if (prdFile) {
		console.log("");
		logInfo(`Decomposing PRD: ${prdFile}`);

		try {
			const { milestones } = await decomposePrd(prdFile, workDir);
			console.log("");
			logSuccess(`Created ${milestones.length} milestones from PRD`);
			console.log("");
			for (const m of milestones) {
				console.log(`    ${m.number}-${m.slug}`);
			}
			console.log("");
			console.log("    PROJECT_PLAN.md             - Milestone checklist");
		} catch (error) {
			logError(error instanceof Error ? error.message : String(error));
		}
	} else {
		console.log("    PROJECT_PLAN.md             - Project plan");
	}

	console.log("");
	console.log("  Next steps:");
	console.log('    walph "add feature X"       - Run a single task as a milestone');
	console.log("    walph --prd tasks.md        - Run PRD tasks as milestones");
	console.log("    walph                       - Run PRD loop (default: PRD.md)");
}
