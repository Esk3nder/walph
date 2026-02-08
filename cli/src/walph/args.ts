import { existsSync, statSync } from "node:fs";
import { createProgram } from "../cli/args.ts";
import type { RuntimeOptions } from "../config/types.ts";

/**
 * Create a walph-specific CLI program
 */
export function createWalphProgram() {
	const program = createProgram("walph");

	// Override description
	program.description(
		"Milestone-aware AI Coding Loop - wraps Ralphy with milestone branch management",
	);

	// Add walph-specific options
	program.option("--no-milestone", "Skip milestone branch creation");

	return program;
}

/**
 * Parse command line arguments for walph
 */
export function parseWalphArgs(args: string[]): {
	options: RuntimeOptions;
	task: string | undefined;
	initMode: boolean | string;
	showConfig: boolean;
	addRule: string | undefined;
	noMilestone: boolean;
} {
	// Find the -- separator and extract engine-specific arguments
	const separatorIndex = args.indexOf("--");
	let engineArgs: string[] = [];
	let walphArgs = args;

	if (separatorIndex !== -1) {
		engineArgs = args.slice(separatorIndex + 1);
		walphArgs = args.slice(0, separatorIndex);
	}

	const program = createWalphProgram();
	program.parse(walphArgs);

	const opts = program.opts();
	const [task] = program.args;

	// Determine AI engine (--sonnet implies --claude)
	let aiEngine = "claude";
	if (opts.sonnet) aiEngine = "claude";
	else if (opts.opencode) aiEngine = "opencode";
	else if (opts.cursor) aiEngine = "cursor";
	else if (opts.codex) aiEngine = "codex";
	else if (opts.qwen) aiEngine = "qwen";
	else if (opts.droid) aiEngine = "droid";
	else if (opts.copilot) aiEngine = "copilot";
	else if (opts.gemini) aiEngine = "gemini";

	// Determine model override
	const modelOverride = opts.sonnet ? "sonnet" : opts.model || undefined;

	// Determine PRD source with auto-detection
	let prdSource: "markdown" | "markdown-folder" | "yaml" | "json" | "github" = "markdown";
	let prdFile = opts.prd || "PRD.md";
	let prdIsFolder = false;

	if (opts.json) {
		prdSource = "json";
		prdFile = opts.json;
	} else if (opts.yaml) {
		prdSource = "yaml";
		prdFile = opts.yaml;
	} else if (opts.github) {
		prdSource = "github";
	} else {
		if (existsSync(prdFile)) {
			const stat = statSync(prdFile);
			if (stat.isDirectory()) {
				prdSource = "markdown-folder";
				prdIsFolder = true;
			} else if (prdFile.toLowerCase().endsWith(".json")) {
				prdSource = "json";
			}
		}
	}

	// Handle --fast
	const skipTests = opts.fast || opts.skipTests;
	const skipLint = opts.fast || opts.skipLint;

	const options: RuntimeOptions = {
		skipTests,
		skipLint,
		aiEngine,
		dryRun: opts.dryRun || false,
		maxIterations: Number.parseInt(opts.maxIterations, 10) || 0,
		maxRetries: Number.parseInt(opts.maxRetries, 10) || 3,
		retryDelay: Number.parseInt(opts.retryDelay, 10) || 5,
		verbose: opts.verbose || false,
		branchPerTask: opts.branchPerTask || false,
		baseBranch: opts.baseBranch || "",
		createPr: opts.createPr || false,
		draftPr: opts.draftPr || false,
		parallel: opts.parallel || false,
		maxParallel: Number.parseInt(opts.maxParallel, 10) || 3,
		prdSource,
		prdFile,
		prdIsFolder,
		githubRepo: opts.github || "",
		githubLabel: opts.githubLabel || "",
		syncIssue: opts.syncIssue ? Number.parseInt(opts.syncIssue, 10) || undefined : undefined,
		autoCommit: opts.commit !== false,
		browserEnabled: opts.browser === true ? "true" : opts.browser === false ? "false" : "auto",
		modelOverride,
		skipMerge: opts.merge === false,
		useSandbox: opts.sandbox || false,
		engineArgs,
	};

	return {
		options,
		task,
		initMode: opts.init || false,
		showConfig: opts.config || false,
		addRule: opts.addRule,
		noMilestone: opts.milestone === false,
	};
}
