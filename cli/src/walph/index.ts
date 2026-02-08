#!/usr/bin/env bun
import { addRule, showConfig } from "../cli/commands/config.ts";
import { flushAllProgressWrites } from "../config/writer.ts";
import { logError } from "../ui/logger.ts";
import { parseWalphArgs } from "./args.ts";
import { runWalphInit } from "./commands/init.ts";
import { runWalphLoop } from "./commands/run.ts";
import { runWalphTask } from "./commands/task.ts";

async function main(): Promise<void> {
	try {
		const {
			options,
			task,
			initMode,
			showConfig: showConfigMode,
			addRule: rule,
			noMilestone,
		} = parseWalphArgs(process.argv);

		// Handle --init
		if (initMode) {
			const prdFile = typeof initMode === "string" ? initMode : undefined;
			await runWalphInit(prdFile);
			return;
		}

		// Handle --config
		if (showConfigMode) {
			await showConfig();
			return;
		}

		// Handle --add-rule
		if (rule) {
			await addRule(rule);
			return;
		}

		// Single task mode (brownfield with milestone)
		if (task) {
			await runWalphTask(task, options, noMilestone);
			return;
		}

		// PRD loop mode (each task gets its own milestone)
		await runWalphLoop(options, noMilestone);
	} catch (error) {
		logError(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	} finally {
		await flushAllProgressWrites();
	}
}

main();
