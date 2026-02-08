#!/usr/bin/env python3
"""
milestone-gate.py - Block Write/Edit outside milestone/* branches

PreToolUse hook that enforces all code changes happen on milestone branches.
This prevents ad-hoc changes on main and forces structured milestone workflow.
"""

import json
import subprocess
import sys


def get_current_branch() -> str:
    """Get the current git branch name."""
    try:
        result = subprocess.run(
            ["git", "branch", "--show-current"],
            capture_output=True,
            text=True,
            timeout=5
        )
        return result.stdout.strip()
    except Exception:
        return ""


def main():
    # Read hook input from stdin
    try:
        hook_input = json.load(sys.stdin)
    except json.JSONDecodeError:
        # Fail open on parse error
        sys.exit(0)

    tool_name = hook_input.get("tool_name", "")

    # Only check Write and Edit tools
    if tool_name not in ("Write", "Edit"):
        sys.exit(0)

    # Get file path being written
    tool_input = hook_input.get("tool_input", {})
    file_path = tool_input.get("file_path", "")

    # Allow writes to milestones/ directory (scope.md, code_review.md, etc.)
    if "/milestones/" in file_path or file_path.startswith("milestones/"):
        sys.exit(0)

    # Allow writes to PROJECT_PLAN.md
    if file_path.endswith("PROJECT_PLAN.md"):
        sys.exit(0)

    # Allow writes to .claude/ directory (hooks, settings)
    if "/.claude/" in file_path or file_path.startswith(".claude/"):
        sys.exit(0)

    # Check current branch
    branch = get_current_branch()

    # Allow if on a milestone branch
    if branch.startswith("milestone/"):
        sys.exit(0)

    # Block with helpful message
    response = {
        "decision": "block",
        "reason": (
            f"Cannot write code outside a milestone branch.\n\n"
            f"Current branch: {branch or '(unknown)'}\n\n"
            f"To start a new milestone:\n"
            f"  git checkout -b milestone/001-feature-name\n\n"
            f"Then create your scope document:\n"
            f"  milestones/001-feature-name/scope.md"
        )
    }
    print(json.dumps(response))
    sys.exit(0)


if __name__ == "__main__":
    main()
