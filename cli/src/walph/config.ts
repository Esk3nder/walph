import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { detectProject } from "../config/detector.ts";

export const WALPH_DIR = ".walph";
export const WALPH_CONFIG_FILE = "config.yaml";
export const WALPH_PROGRESS_FILE = "progress.txt";

/**
 * Get the full path to the walph directory
 */
export function getWalphDir(workDir = process.cwd()): string {
	return join(workDir, WALPH_DIR);
}

/**
 * Escape a value for safe YAML string
 */
function escapeYaml(value: string | undefined | null): string {
	return (value || "").replace(/"/g, '\\"');
}

/**
 * Initialize walph in a project directory.
 * Creates .walph/, milestones/.templates/, and PROJECT_PLAN.md
 */
export function initWalph(workDir = process.cwd()): {
	created: boolean;
	detected: ReturnType<typeof detectProject>;
} {
	const detected = detectProject(workDir);

	// Create .walph/ directory
	const walphDir = getWalphDir(workDir);
	mkdirSync(walphDir, { recursive: true });

	// Create .walph/config.yaml
	const configContent = `# Walph Configuration
# Milestone-aware wrapper for Ralphy

# Project info (auto-detected, edit if needed)
project:
  name: "${escapeYaml(detected.name)}"
  language: "${escapeYaml(detected.language || "Unknown")}"
  framework: "${escapeYaml(detected.framework)}"
  description: ""  # Add a brief description

# Commands (auto-detected)
commands:
  test: "${escapeYaml(detected.testCmd)}"
  lint: "${escapeYaml(detected.lintCmd)}"
  build: "${escapeYaml(detected.buildCmd)}"

# Rules - instructions the AI MUST follow
rules:
  # - "Always use TypeScript strict mode"
  # - "All API endpoints must have input validation"

# Boundaries - files/folders the AI should not modify
boundaries:
  never_touch:
    # - "migrations/**"
    # - "*.lock"
`;
	writeFileSync(join(walphDir, WALPH_CONFIG_FILE), configContent, "utf-8");

	// Create .walph/progress.txt
	writeFileSync(join(walphDir, WALPH_PROGRESS_FILE), "# Walph Progress Log\n\n", "utf-8");

	// Create milestones/.templates/ directory
	const templatesDir = join(workDir, "milestones", ".templates");
	mkdirSync(templatesDir, { recursive: true });

	// Create scope.md template
	const scopeTemplate = `# Milestone: {NAME}

## Objective
<!-- What this milestone achieves -->

## Scope
- [ ] Define scope items

## Acceptance Criteria
- [ ] Define acceptance criteria

## Out of Scope
<!-- What is explicitly NOT included -->

## Notes
<!-- Additional context -->
`;
	writeFileSync(join(templatesDir, "scope.md"), scopeTemplate, "utf-8");

	// Create code_review.md template
	const reviewTemplate = `# Code Review: {NAME}

## Summary of Changes
<!-- Brief description of what was implemented -->

## Files Modified
<!-- List of files changed -->

## Test Coverage
- [ ] Unit tests written
- [ ] Integration tests written
- [ ] All tests passing

## Checklist
- [ ] Code follows project conventions
- [ ] No dead code introduced
- [ ] Changes are within milestone scope
- [ ] Documentation updated if needed
`;
	writeFileSync(join(templatesDir, "code_review.md"), reviewTemplate, "utf-8");

	// Create PROJECT_PLAN.md if it doesn't exist
	const planPath = join(workDir, "PROJECT_PLAN.md");
	if (!existsSync(planPath)) {
		const planContent = `# Project Plan

## Overview
<!-- High-level project description -->

## Milestones

### Milestone 001 - TBD
- [ ] Task 1
- [ ] Task 2

## Architecture Decisions
<!-- Key technical decisions and rationale -->
`;
		writeFileSync(planPath, planContent, "utf-8");
	}

	return { created: true, detected };
}

/**
 * Recursively copy files from source to target, skipping existing files.
 */
function copyDirNoOverwrite(source: string, target: string): number {
	let copied = 0;
	mkdirSync(target, { recursive: true });

	const entries = readdirSync(source, { withFileTypes: true });
	for (const entry of entries) {
		const srcPath = join(source, entry.name);
		const destPath = join(target, entry.name);

		if (entry.isDirectory()) {
			copied += copyDirNoOverwrite(srcPath, destPath);
		} else {
			if (!existsSync(destPath)) {
				copyFileSync(srcPath, destPath);
				copied++;
			}
		}
	}
	return copied;
}

/**
 * Copy .claude/ directory (hooks, settings, rules, skills) from walph repo to target project.
 * Skips if source and target are the same directory.
 * Does not overwrite existing files.
 */
export function copyClaudeHooks(workDir: string): { copied: number } {
	// Navigate from cli/src/walph/ to repo root
	const walphRoot = resolve(import.meta.dirname, "..", "..", "..");
	const sourceDir = join(walphRoot, ".claude");
	const targetDir = join(workDir, ".claude");

	// Skip if source doesn't exist
	if (!existsSync(sourceDir) || !statSync(sourceDir).isDirectory()) {
		return { copied: 0 };
	}

	// Skip if source === target (already in walph repo)
	if (resolve(sourceDir) === resolve(targetDir)) {
		return { copied: 0 };
	}

	const copied = copyDirNoOverwrite(sourceDir, targetDir);
	return { copied };
}
