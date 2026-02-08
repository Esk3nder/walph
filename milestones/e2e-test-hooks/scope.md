# Milestone: E2E Test Hooks

## User Story
As a developer, I want to verify all hooks work end-to-end so that the milestone workflow is reliable.

## Acceptance Criteria
- [ ] milestone-gate blocks writes on main
- [ ] milestone-gate allows writes on milestone branch
- [ ] tdd-lock allows new test files
- [ ] tdd-lock blocks committed test modification with impl staged
- [ ] merge-gate blocks without code_review.md
- [ ] merge-gate allows with all requirements
- [ ] burndown-reminder fires after merge
- [ ] refactor-warn fires on large files

## Technical Spec
Create a simple calculator module with tests to exercise the full workflow.

## Out of Scope
- Real feature development
- CI/CD integration
