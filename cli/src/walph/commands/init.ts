import { logInfo, logSuccess } from "../../ui/logger.ts";
import { initWalph } from "../config.ts";

/**
 * Run the walph --init command
 * Creates .walph/, milestones/.templates/, and PROJECT_PLAN.md
 */
export async function runWalphInit(): Promise<void> {
	const workDir = process.cwd();

	logInfo("Initializing walph...");

	const { detected } = initWalph(workDir);

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
	console.log("    PROJECT_PLAN.md             - Project plan");
	console.log("");
	console.log("  Next steps:");
	console.log('    walph "add feature X"       - Run a single task as a milestone');
	console.log("    walph --prd tasks.md        - Run PRD tasks as milestones");
	console.log("    walph                       - Run PRD loop (default: PRD.md)");
}
