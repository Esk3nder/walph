import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import simpleGit, { type SimpleGit } from "simple-git";
import { slugify } from "../git/branch.ts";

/**
 * Scan milestones/ dirs and git branches for the highest milestone number.
 * Returns the next number, zero-padded to 3 digits.
 */
export async function getNextMilestoneNumber(workDir = process.cwd()): Promise<string> {
	let max = 0;

	// Scan milestones/ directories
	const milestonesDir = join(workDir, "milestones");
	if (existsSync(milestonesDir)) {
		const entries = readdirSync(milestonesDir, { withFileTypes: true });
		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			const match = entry.name.match(/^(\d{3})-/);
			if (match) {
				const num = Number.parseInt(match[1], 10);
				if (num > max) max = num;
			}
		}
	}

	// Scan git branches for milestone/* pattern
	try {
		const git: SimpleGit = simpleGit(workDir);
		const branches = await git.branchLocal();
		for (const name of branches.all) {
			const match = name.match(/^milestone\/(\d{3})-/);
			if (match) {
				const num = Number.parseInt(match[1], 10);
				if (num > max) max = num;
			}
		}
	} catch {
		// Ignore git errors (e.g. no repo, no commits)
	}

	const next = max + 1;
	return String(next).padStart(3, "0");
}

/**
 * Create a milestone branch: milestone/{NNN}-{slug}
 * Mirrors createTaskBranch from git/branch.ts
 */
export async function createMilestoneBranch(
	task: string,
	baseBranch: string,
	workDir = process.cwd(),
): Promise<{ branchName: string; number: string; slug: string }> {
	const git: SimpleGit = simpleGit(workDir);
	const number = await getNextMilestoneNumber(workDir);
	const slug = slugify(task);
	const branchName = `milestone/${number}-${slug}`;

	// Stash any changes
	let stashed = false;
	const status = await git.status();
	if (status.files.length > 0) {
		await git.stash(["push", "-m", "walph-autostash"]);
		stashed = true;
	}

	try {
		// Checkout base branch and pull
		await git.checkout(baseBranch);
		await git.pull("origin", baseBranch).catch(() => {
			// Ignore pull errors (e.g. offline)
		});

		// Create new branch (or checkout if exists)
		try {
			await git.checkoutLocalBranch(branchName);
		} catch {
			await git.checkout(branchName);
		}
	} finally {
		// Pop stash if we stashed
		if (stashed) {
			await git.stash(["pop"]).catch(() => {
				// Ignore stash pop errors
			});
		}
	}

	return { branchName, number, slug };
}

/**
 * Create a scope document from the template.
 * Copies milestones/.templates/scope.md, replaces {NAME} with milestone name.
 */
export function createScopeDocument(
	number: string,
	slug: string,
	task: string,
	workDir = process.cwd(),
): string {
	const milestoneName = `${number}-${slug}`;
	const milestoneDir = join(workDir, "milestones", milestoneName);
	const scopePath = join(milestoneDir, "scope.md");

	// Create milestone directory
	mkdirSync(milestoneDir, { recursive: true });

	// Try to read template
	const templatePath = join(workDir, "milestones", ".templates", "scope.md");
	let content: string;

	if (existsSync(templatePath)) {
		content = readFileSync(templatePath, "utf-8").replace(/\{NAME\}/g, milestoneName);
	} else {
		// Fallback: generate a basic scope document
		content = `# Milestone: ${milestoneName}

## Objective
${task}

## Scope
- [ ] Define scope items

## Acceptance Criteria
- [ ] Define acceptance criteria

## Notes
Created by walph.
`;
	}

	writeFileSync(scopePath, content, "utf-8");
	return scopePath;
}

/**
 * Build the milestone-specific prompt section that gets injected into the prompt.
 */
export function buildMilestonePromptSection(milestoneName: string): string {
	return `## Milestone Workflow

You are working on milestone: **${milestoneName}**

### TDD Workflow
1. Read the scope document at \`milestones/${milestoneName}/scope.md\` before starting
2. Write tests FIRST for each piece of functionality
3. Implement the minimum code to make tests pass
4. Refactor while keeping tests green

### Code Review Requirements
- All changes must be focused on the milestone scope
- Do not modify files outside the scope unless necessary for integration
- When complete, create or update \`milestones/${milestoneName}/code_review.md\` with:
  - Summary of changes made
  - Files modified
  - Test coverage notes

### Scope Boundaries
- Read \`milestones/${milestoneName}/scope.md\` to understand what is in/out of scope
- Stay within the defined scope
- If you need to make changes outside scope, document why in code_review.md`;
}
