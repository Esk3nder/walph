# Project Plan: Walph - Milestone Workflow Hooks

## Overview
TDD-enforced milestone workflow for Claude Code with hard gates.

## Completed

### Phase 1: Core Enforcement
- [x] 001-milestone-gate - Block code outside milestone branches
- [x] 002-merge-gate - Block merge without code review

### Phase 2: TDD Protection
- [x] 003-tdd-lock - Lock test files after commit

### Phase 3: Quality & Polish
- [x] 004-burndown-reminder - Remind to update burndown
- [x] 005-refactor-warn - Warn on large files

### Phase 4: Integration Testing
- [x] E2E test of full milestone workflow

### Phase 5: Superpowers Absorption
- [x] 006-superpowers - Absorb debugging, verification, orchestration, and planning disciplines
  - Extended merge-gate.py to require verification.md
  - Added verification.md template
  - Added Decomposition section to scope.md template
  - Added Debugging History section to code_review.md template
  - Added Debugging Protocol, Verification, Task Orchestration, and Planning Discipline to CLAUDE.md

## Backlog
- [ ] 007-scope-validation - Require scope.md before first write
- [ ] 008-code-review-generator - Auto-generate reviews
- [ ] 009-progress-dashboard - Display milestone status on session start
