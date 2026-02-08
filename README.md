# Walph

Milestone workflow hooks for Claude Code. Enforces TDD discipline, structured branches, and code review gates so your AI agent can't take shortcuts.

Built on top of [Ralphy](https://github.com/michaelshimeles/ralphy) for the autonomous coding loop.

## What It Does

Walph adds Claude Code hooks that enforce a structured development workflow:

```
branch → scope → plan → write tests → lock tests → implement → verify → review → merge → update burndown
```

Every step is enforced by a hook. The agent physically cannot skip steps.

## Hooks

### PreToolUse (block bad actions)

| Hook | Trigger | What it does |
|------|---------|-------------|
| `milestone-gate.py` | Write, Edit | Blocks code changes outside `milestone/*` branches |
| `tdd-lock.py` | Write, Edit | Blocks test file modification after initial commit (unless in a dedicated test-fix commit) |
| `merge-gate.py` | Bash | Blocks merge/push to main without `scope.md`, `code_review.md`, and `verification.md` |
| `skill-reminder.sh` | Write, Edit | Reminds agent to invoke relevant skills before writing code |

### PostToolUse (inject context)

| Hook | Trigger | What it does |
|------|---------|-------------|
| `burndown-reminder.py` | Bash | Reminds to update `PROJECT_PLAN.md` after successful merge |
| `refactor-warn.py` | Write, Edit | Warns when a file exceeds 500 lines |

## Install

```bash
git clone https://github.com/Esk3nder/walph.git
cd walph
```

The hooks are pre-configured in `.claude/settings.json`. They activate automatically when you run Claude Code in this directory.

### Requirements

- Python 3.8+ (stdlib only, no pip packages needed)
- Git
- [Claude Code](https://github.com/anthropics/claude-code)

## Workflow

### 1. Start a milestone

```bash
git checkout -b milestone/001-user-auth
mkdir -p milestones/001-user-auth
```

Create `milestones/001-user-auth/scope.md` with your spec:

```markdown
# Milestone: User Auth

## User Story
As a user, I want to log in so that I can access my account.

## Acceptance Criteria
- [ ] Login endpoint returns JWT
- [ ] Password is hashed with bcrypt
- [ ] Invalid credentials return 401
```

### 2. Write tests first (TDD red phase)

```bash
# Write your test file
# Hook allows new test files freely
```

### 3. Commit tests to lock them

```bash
git add tests/test_auth.py
git commit -m "test: add auth tests"
```

After this commit, `tdd-lock.py` prevents modifying `test_auth.py` while implementation files are staged. This stops the agent from cheating by changing tests to match broken code.

### 4. Implement (TDD green phase)

Write implementation code to make tests pass. The agent can write any non-test file freely on the milestone branch.

If a test genuinely has a bug:
1. Commit implementation changes first
2. Fix the test in a separate commit: `fix(test): correct expected value`

### 5. Verify

Create `milestones/001-user-auth/verification.md` (use the template in `milestones/.templates/verification.md`). Paste actual test, lint, and build output — not summaries.

### 6. Code review

Create `milestones/001-user-auth/code_review.md` (use the template in `milestones/.templates/code_review.md`).

### 7. Merge

```bash
git checkout main
git merge milestone/001-user-auth
```

The merge gate checks that `scope.md`, `code_review.md`, and `verification.md` all exist. If any is missing, the merge is blocked.

After a successful merge, the burndown reminder fires:
> "Milestone merged! Update PROJECT_PLAN.md to mark this milestone complete."

### 8. Repeat

Create the next milestone branch and start again.

## File Structure

```
.claude/
  settings.json              # Hook configuration
  hooks/
    milestone-gate.py        # PreToolUse: branch enforcement
    tdd-lock.py              # PreToolUse: test file protection
    merge-gate.py            # PreToolUse: merge requirements
    skill-reminder.sh        # PreToolUse: skill invocation reminder
    burndown-reminder.py     # PostToolUse: update reminder
    refactor-warn.py         # PostToolUse: file size warning
  rules/
    testing.md               # Testing standards
    typescript.md            # TypeScript standards
  skills/
    react-useeffect/         # React useEffect patterns
    vercel-react-best-practices/  # Vercel React performance rules
    web-design-guidelines/   # Web design standards

milestones/
  .templates/
    scope.md                 # Template for milestone specs
    code_review.md           # Template for code reviews
    verification.md          # Template for verification evidence
  001-feature-name/
    scope.md                 # Your spec
    verification.md          # Your verification evidence
    code_review.md           # Your review

PROJECT_PLAN.md              # Burndown checklist
```

## Configuration

### Hook registration (`.claude/settings.json`)

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Write|Edit", "command": "python3 .claude/hooks/milestone-gate.py" },
      { "matcher": "Write|Edit", "command": "python3 .claude/hooks/tdd-lock.py" },
      { "matcher": "Bash",       "command": "python3 .claude/hooks/merge-gate.py" },
      { "matcher": "Write|Edit", "command": "bash .claude/hooks/skill-reminder.sh" }
    ],
    "PostToolUse": [
      { "matcher": "Bash",       "command": "python3 .claude/hooks/burndown-reminder.py" },
      { "matcher": "Write|Edit", "command": "python3 .claude/hooks/refactor-warn.py" }
    ]
  }
}
```

### Test file patterns

`tdd-lock.py` recognizes these patterns (case-insensitive):

- `tests/`, `test/`, `__tests__/`, `spec/` directories
- `*.test.*`, `*.spec.*` extensions
- `test_*`, `spec_*` prefixes
- `*_test.*`, `*_spec.*` suffixes

Works with any language.

### Refactor threshold

The default file size warning is 500 lines. Edit the `LINE_THRESHOLD` constant in `refactor-warn.py` to change it.

### Allowed paths on main

`milestone-gate.py` allows writes to these paths on any branch:

- `milestones/` (scope docs, reviews)
- `PROJECT_PLAN.md` (burndown tracking)
- `.claude/` (hooks, settings)

## Design Principles

- **Fail open**: All hooks exit 0 on errors (parse failures, git errors). They never block your work due to a hook bug.
- **Fast**: Each hook completes in <100ms. No network calls, no pip dependencies.
- **Language agnostic**: Test patterns cover Python, JS/TS, Go, Ruby, and more.
- **Stdlib only**: Python 3.8+ standard library. Nothing to install.

## Ralphy Integration

Walph includes the full [Ralphy](https://github.com/michaelshimeles/ralphy) autonomous coding loop. You can use Ralphy's features (parallel execution, PRD-driven tasks, multi-engine support) alongside the milestone hooks.

```bash
# Ralphy still works
./ralphy.sh "implement the auth feature"
./ralphy.sh --prd PRD.md --parallel
```

See Ralphy's documentation for the full feature set.

## License

MIT
