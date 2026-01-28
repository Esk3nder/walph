import { randomUUID } from "node:crypto";
import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { logDebug } from "../ui/logger.ts";
import { BaseAIEngine, checkForErrors, execCommand, formatCommandError } from "./base.ts";
import type { AIResult, EngineOptions } from "./types.ts";

/** Directory for temporary prompt files */
const TEMP_DIR = join(tmpdir(), "ralphy-copilot");

/**
 * GitHub Copilot CLI AI Engine
 *
 * Note: executeStreaming is intentionally not implemented for Copilot
 * because the streaming function can hang on Windows due to how
 * Bun handles cmd.exe stream completion. The non-streaming execute()
 * method works reliably.
 *
 * Note: All engine output is captured internally for parsing and not displayed
 * to the end user. This is by design - the spinner shows step progress while
 * the actual CLI output is processed silently.
 *
 * Note: Prompts are passed via temporary files to preserve markdown formatting.
 * The -p parameter accepts a file path, which avoids shell escaping issues and
 * maintains the full structure of markdown (newlines, code blocks, etc.) that
 * would be lost if passed as a command line string.
 */
export class CopilotEngine extends BaseAIEngine {
	name = "GitHub Copilot";
	cliCommand = "copilot";

	/**
	 * Create a temporary file containing the prompt.
	 * Uses a unique filename to support parallel execution.
	 * @returns The path to the temporary prompt file
	 */
	private createPromptFile(prompt: string): string {
		// Ensure temp directory exists - wrapped in try-catch to handle
		// potential race conditions when multiple processes create it simultaneously
		try {
			mkdirSync(TEMP_DIR, { recursive: true });
		} catch (err) {
			// EEXIST is expected if another process created the directory first
			if ((err as NodeJS.ErrnoException).code !== "EEXIST") {
				throw err;
			}
		}

		// Generate unique filename using UUID for parallel safety
		const filename = `prompt-${randomUUID()}.md`;
		const filepath = join(TEMP_DIR, filename);

		// Write prompt to file preserving all formatting
		writeFileSync(filepath, prompt, "utf-8");
		logDebug(`[Copilot] Created prompt file: ${filepath}`);

		return filepath;
	}

	/**
	 * Clean up a temporary prompt file
	 */
	private cleanupPromptFile(filepath: string): void {
		try {
			unlinkSync(filepath);
			logDebug(`[Copilot] Cleaned up prompt file: ${filepath}`);
		} catch (err) {
			// Ignore cleanup errors - file may already be deleted
			logDebug(`[Copilot] Failed to cleanup prompt file: ${filepath}`);
		}
	}

	/**
	 * Build command arguments for Copilot CLI
	 * @param promptFilePath Path to the temporary file containing the prompt
	 */
	private buildArgs(promptFilePath: string, options?: EngineOptions): { args: string[] } {
		const args: string[] = [];

		// Use --yolo for non-interactive mode (allows all tools and paths)
		args.push("--yolo");

		// Pass prompt file path (Copilot CLI accepts file paths for -p)
		// NOTE: This is an undocumented feature of Copilot CLI but works reliably
		// since copilot is smart enough to detect file paths and read the content.
		args.push("-p", promptFilePath);

		if (options?.modelOverride) {
			args.push("--model", options.modelOverride);
		}
		// Add any additional engine-specific arguments
		if (options?.engineArgs && options.engineArgs.length > 0) {
			args.push(...options.engineArgs);
		}
		return { args };
	}

	async execute(prompt: string, workDir: string, options?: EngineOptions): Promise<AIResult> {
		// Create temporary prompt file to preserve markdown formatting
		const promptFilePath = this.createPromptFile(prompt);

		try {
			const { args } = this.buildArgs(promptFilePath, options);

			// Debug logging
			logDebug(`[Copilot] Working directory: ${workDir}`);
			logDebug(`[Copilot] Prompt length: ${prompt.length} chars`);
			logDebug(`[Copilot] Prompt preview: ${prompt.substring(0, 200)}...`);
			logDebug(`[Copilot] Prompt file: ${promptFilePath}`);
			logDebug(`[Copilot] Command: ${this.cliCommand} ${args.join(" ")}`);

			const startTime = Date.now();
			const { stdout, stderr, exitCode } = await execCommand(this.cliCommand, args, workDir);
			const durationMs = Date.now() - startTime;

			const output = stdout + stderr;

			// Debug logging
			logDebug(`[Copilot] Exit code: ${exitCode}`);
			logDebug(`[Copilot] Duration: ${durationMs}ms`);
			logDebug(`[Copilot] Output length: ${output.length} chars`);
			logDebug(`[Copilot] Output preview: ${output.substring(0, 500)}...`);

			// Check for JSON errors (from base)
			const jsonError = checkForErrors(output);
			if (jsonError) {
				return {
					success: false,
					response: "",
					inputTokens: 0,
					outputTokens: 0,
					error: jsonError,
				};
			}

			// Check for Copilot-specific errors (plain text)
			const copilotError = this.checkCopilotErrors(output);
			if (copilotError) {
				return {
					success: false,
					response: "",
					inputTokens: 0,
					outputTokens: 0,
					error: copilotError,
				};
			}

			// Parse Copilot output - extract response and token counts
			const { response, inputTokens, outputTokens } = this.parseOutput(output);

			// If command failed with non-zero exit code, provide a meaningful error
			if (exitCode !== 0) {
				return {
					success: false,
					response,
					inputTokens,
					outputTokens,
					error: formatCommandError(exitCode, output),
				};
			}

			return {
				success: true,
				response,
				inputTokens,
				outputTokens,
				cost: durationMs > 0 ? `duration:${durationMs}` : undefined,
			};
		} finally {
			// Always clean up the temporary prompt file
			this.cleanupPromptFile(promptFilePath);
		}
	}

	/**
	 * Check for Copilot-specific errors in output
	 * Copilot CLI outputs plain text errors (not JSON) and may return exit code 0
	 *
	 * Note: We are intentionally conservative with error detection here.
	 * The Copilot CLI response might contain text like "network error" as part
	 * of valid output (e.g., test results discussing network issues, feedback
	 * about handling network errors, etc.). We only treat something as an error
	 * if it's clearly a CLI-level error, not content within the response.
	 */
	private checkCopilotErrors(output: string): string | null {
		const lower = output.toLowerCase();
		const trimmed = output.trim();
		const trimmedLower = trimmed.toLowerCase();

		// Authentication errors - these are always fatal CLI errors
		// They typically appear at the start of output when the CLI can't proceed
		if (
			trimmedLower.startsWith("no authentication") ||
			trimmedLower.startsWith("not authenticated") ||
			trimmedLower.startsWith("authentication required") ||
			trimmedLower.startsWith("please authenticate")
		) {
			return "GitHub Copilot CLI is not authenticated. Run 'copilot' and use '/login' to authenticate, or set COPILOT_GITHUB_TOKEN environment variable.";
		}

		// Rate limiting - only treat as error if it's clearly a CLI-level rate limit response
		// (typically short output that's just the rate limit message)
		if (
			(trimmedLower.startsWith("rate limit") || trimmedLower.startsWith("too many requests")) &&
			trimmed.length < 200
		) {
			return "GitHub Copilot rate limit exceeded. Please wait and try again.";
		}

		// Note: We intentionally do NOT check for "network error" or "connection refused"
		// in the general output. These strings might appear in valid responses (e.g., test
		// results, error handling discussions, feedback about network-related code).
		// If the CLI truly has a network error, it will likely have a non-zero exit code.

		// Generic error detection - only if output STARTS with "error:" (CLI-level error)
		// We don't check for "\nerror:" in middle of output as that could be response content
		if (trimmedLower.startsWith("error:")) {
			// Extract the error message - capture until double-newline or end to support multi-line errors
			const match = trimmed.match(/^error:\s*(.+?)(?:\n\n|$)/is);
			if (match) {
				return match[1].trim();
			}
			return "GitHub Copilot CLI returned an error";
		}

		return null;
	}

	/**
	 * Parse a token count string like "17.5k" or "73" into a number
	 */
	private parseTokenCount(str: string): number {
		const trimmed = str.trim().toLowerCase();
		if (trimmed.endsWith("k")) {
			const value = Number.parseFloat(trimmed.slice(0, -1));
			return Number.isNaN(value) ? 0 : Math.round(value * 1000);
		}
		if (trimmed.endsWith("m")) {
			const value = Number.parseFloat(trimmed.slice(0, -1));
			return Number.isNaN(value) ? 0 : Math.round(value * 1000000);
		}
		const value = Number.parseFloat(trimmed);
		return Number.isNaN(value) ? 0 : Math.round(value);
	}

	/**
	 * Extract token counts from Copilot CLI output
	 * Format: "model-name       17.5k in, 73 out, 11.8k cached (Est. 1 Premium request)"
	 */
	private parseTokenCounts(output: string): { inputTokens: number; outputTokens: number } {
		// Look for the token count line in the "Breakdown by AI model" section
		// Pattern: number followed by "in," and number followed by "out,"
		const tokenMatch = output.match(/(\d+(?:\.\d+)?[km]?)\s+in,\s+(\d+(?:\.\d+)?[km]?)\s+out/i);

		if (tokenMatch) {
			const inputTokens = this.parseTokenCount(tokenMatch[1]);
			const outputTokens = this.parseTokenCount(tokenMatch[2]);
			logDebug(`[Copilot] Parsed tokens: ${inputTokens} in, ${outputTokens} out`);
			return { inputTokens, outputTokens };
		}

		return { inputTokens: 0, outputTokens: 0 };
	}

	private parseOutput(output: string): {
		response: string;
		inputTokens: number;
		outputTokens: number;
	} {
		// Extract token counts first
		const { inputTokens, outputTokens } = this.parseTokenCounts(output);

		// Copilot CLI may output text responses
		// Extract the meaningful response, filtering out control characters and prompts
		// Note: These filter patterns are specific to current Copilot CLI behavior
		// and may need updates if the CLI output format changes
		const lines = output.split("\n").filter(Boolean);

		// Filter out empty lines, CLI artifacts, and stats section
		const meaningfulLines = lines.filter((line) => {
			const trimmed = line.trim();
			return (
				trimmed &&
				!trimmed.startsWith("?") && // Interactive prompts
				!trimmed.startsWith("❯") && // Command prompts
				!trimmed.includes("Thinking...") && // Status messages
				!trimmed.includes("Working on it...") && // Status messages
				!trimmed.startsWith("Total usage") && // Stats section
				!trimmed.startsWith("API time") && // Stats section
				!trimmed.startsWith("Total session") && // Stats section
				!trimmed.startsWith("Total code") && // Stats section
				!trimmed.startsWith("Breakdown by") && // Stats section header
				!trimmed.match(/^\s*\S+\s+\d+(?:\.\d+)?[km]?\s+in,\s+\d+(?:\.\d+)?[km]?\s+out,\s+\d+(?:\.\d+)?[km]?\s+cached/) // Token count lines (model stats: "model-name 17.5k in, 73 out, 11.8k cached")
			);
		});

		const response = meaningfulLines.join("\n").trim() || "Task completed";
		return { response, inputTokens, outputTokens };
	}
}
