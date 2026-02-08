# Claude Code Guidelines for Ralphy

## Code Change Philosophy

### Keep Changes Small and Focused
- **One logical change per commit** - Each commit should do exactly one thing
- If a task feels too large, break it into subtasks
- Prefer multiple small commits over one large commit
- Run feedback loops after each change, not at the end

**Quality over speed. Small steps compound into big progress.**

### Task Prioritization

When choosing the next task, prioritize in this order:

1. **Architectural decisions and core abstractions** - Get the foundation right
2. **Integration points between modules** - Ensure components connect properly
3. **Unknown unknowns and spike work** - De-risk early
4. **Standard features and implementation** - Build on solid foundations
5. **Polish, cleanup, and quick wins** - Save easy wins for later

**Fail fast on risky work. Save easy wins for later.**

## Code Quality Standards

### Write Concise Code
After writing any code file, ask yourself: *"Would a senior engineer say this is overcomplicated?"*

If yes, **simplify**.

### Avoid Over-Engineering
- Only make changes that are directly requested or clearly necessary
- Don't add features beyond what was asked
- Don't refactor code that doesn't need it
- A bug fix doesn't need surrounding code cleaned up
- A simple feature doesn't need extra configurability

### Clean Code Practices
- Don't fill files just for the sake of it
- Don't leave dead code - if it's unused, delete it completely
- Be organized, concise, and clean in your work
- No backwards-compatibility hacks for removed code
- No `// removed` comments or re-exports for deleted items

### Task Decomposition
- Use micro tasks - smaller the task, better the code
- Break complex work into discrete, testable units
- Each micro task should be completable in one focused session

## Debugging Protocol

### Iron Law
No fixes without root cause investigation first. Never propose a fix before tracing the data flow.

### Four Phases
1. **Root Cause Investigation** — Read the code path, trace the data, understand the failure
2. **Pattern Analysis** — Is this a known pattern? Have we seen similar bugs?
3. **Hypothesis Testing** — Form a single hypothesis, test it, confirm or reject
4. **Implementation** — Fix the root cause, not the symptom

### Red Flags
- Proposing a fix before reading the failing code path
- Making multiple simultaneous changes ("let me try A and B and C")
- 3+ failed fix attempts → stop and question the architecture
- "Each fix reveals a new problem in a different place" → architectural issue, raise explicitly

## Verification Before Completion

### Iron Law
No completion claims without fresh verification evidence. Never say "should work now" or "I'm confident this fixes it."

### Gate Sequence
1. **IDENTIFY** — What needs to be verified (tests, lint, build)?
2. **RUN** — Execute the actual commands
3. **READ** — Read the full output, don't skim
4. **VERIFY** — Confirm all checks pass with zero errors
5. **CLAIM** — Only then claim completion

### Prohibited Phrases
- "should work now"
- "I'm confident"
- "this should fix it"
- "tests should pass"

### Regression Testing (bug fixes)
1. Write the fix → run tests (pass)
2. Revert the fix → run tests (MUST fail — confirms test catches the bug)
3. Restore the fix → run tests (pass)

### Merge Gate
The merge gate requires `verification.md` with pasted command output. Use the template in `milestones/.templates/verification.md`.

## Task Orchestration

### When to Use Subagents
When 3+ independent subtasks exist, consider dispatching subagents to work in parallel.

### How to Dispatch
- Group subtasks by problem domain
- Write a self-contained brief per agent (context, requirements, constraints)
- Subagents share the milestone branch (no worktrees)

### Two-Stage Review
1. **Spec compliance** — Does the output match the brief?
2. **Code quality** — Does it meet code standards?

Never combine these two stages.

### When NOT to Use Subagents
- Sequential dependencies between tasks
- Shared mutable state
- Simple tasks (< 3 independent streams)
- Exploratory or investigative work

## Planning Discipline

### When to Plan
For non-trivial tasks (multi-file changes, new features), write `milestones/{name}/plan.md` before coding.

### How to Plan
- Ask one clarifying question at a time (not question dumps)
- Present 2-3 approaches with trade-offs, recommended first
- Apply YAGNI ruthlessly — do not plan for hypothetical future requirements

### Plan Structure
1. Problem statement
2. Proposed approach (with alternatives)
3. Out of scope
4. Implementation sequence
5. Risks and mitigations

## Legacy and Technical Debt

This codebase will outlive you. Every shortcut you take becomes someone else's burden. Every hack compounds into technical debt that slows the whole team down.

You are not just writing code. You are shaping the future of this project. The patterns you establish will be copied. The corners you cut will be cut again.

**Fight entropy. Leave the codebase better than you found it.**

## Project-Specific Rules

### Tech Stack
- Runtime: Bun (with Node.js 18+ fallback)
- Language: TypeScript (strict mode)
- Linting/Formatting: Biome
- CLI Framework: Commander

### Directory Structure
```
cli/
├── src/
│   ├── cli/        # CLI argument parsing and commands
│   ├── config/     # Configuration management
│   ├── engines/    # AI engine integrations
│   ├── execution/  # Task execution orchestration
│   ├── git/        # Git operations
│   ├── tasks/      # Task source handlers
│   ├── notifications/  # Webhook notifications
│   ├── telemetry/  # Usage analytics
│   └── ui/         # User interface/logging
```

### Code Standards
- Use tabs for indentation (Biome config)
- Line width: 100 characters
- Use LF line endings
- Run `bun run check` before committing
- Keep imports organized (Biome handles this)

### Boundaries - Never Modify
- PRD files during execution
- `.ralphy/progress.txt`
- `.ralphy-worktrees`
- `.ralphy-sandboxes`
- `*.lock` files

### Testing
- Write tests for new features
- Run tests before committing: `bun test`
- Ensure linting passes: `bun run check`

## Commit Guidelines

1. One logical change per commit
2. Write descriptive commit messages
3. Commit message format: `type: brief description`
   - `feat:` new feature
   - `fix:` bug fix
   - `refactor:` code restructuring
   - `docs:` documentation
   - `test:` test additions/changes
   - `chore:` maintenance tasks
