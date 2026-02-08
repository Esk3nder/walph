#!/usr/bin/env python3
"""
merge-gate.py - Block merge/push to main without required files

PreToolUse hook that enforces:
1. scope.md exists for the current milestone
2. code_review.md exists for the current milestone
3. verification.md exists for the current milestone

This ensures every merge is properly scoped, reviewed, and verified.
"""

import json
import os
import re
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


def extract_milestone_name(branch: str) -> str:
    """Extract milestone name from branch like 'milestone/001-feature'."""
    if branch.startswith("milestone/"):
        return branch[len("milestone/"):]
    return ""


def is_merge_or_push_to_main(command: str) -> bool:
    """Check if command is merging or pushing to main/master."""
    # Patterns that indicate merge to main
    merge_patterns = [
        r"git\s+merge\s+.*main",
        r"git\s+merge\s+.*master",
        r"git\s+push\s+.*main",
        r"git\s+push\s+.*master",
        r"git\s+checkout\s+main\s*&&.*merge",
        r"git\s+checkout\s+master\s*&&.*merge",
    ]

    for pattern in merge_patterns:
        if re.search(pattern, command, re.IGNORECASE):
            return True
    return False


def check_file_exists(milestone_name: str, filename: str) -> bool:
    """Check if a file exists in the milestone directory."""
    path = os.path.join("milestones", milestone_name, filename)
    return os.path.isfile(path)


def main():
    # Read hook input from stdin
    try:
        hook_input = json.load(sys.stdin)
    except json.JSONDecodeError:
        sys.exit(0)

    tool_name = hook_input.get("tool_name", "")

    # Only check Bash tool
    if tool_name != "Bash":
        sys.exit(0)

    tool_input = hook_input.get("tool_input", {})
    command = tool_input.get("command", "")

    # Only check merge/push to main
    if not is_merge_or_push_to_main(command):
        sys.exit(0)

    # Get current milestone
    branch = get_current_branch()
    milestone_name = extract_milestone_name(branch)

    if not milestone_name:
        # Not on a milestone branch - still block but different message
        response = {
            "decision": "block",
            "reason": (
                "Cannot merge to main from a non-milestone branch.\n\n"
                "Create a milestone branch first:\n"
                "  git checkout -b milestone/001-feature-name"
            )
        }
        print(json.dumps(response))
        sys.exit(0)

    # Check required files
    missing = []

    if not check_file_exists(milestone_name, "scope.md"):
        missing.append(f"  - milestones/{milestone_name}/scope.md")

    if not check_file_exists(milestone_name, "code_review.md"):
        missing.append(f"  - milestones/{milestone_name}/code_review.md")

    if not check_file_exists(milestone_name, "verification.md"):
        missing.append(f"  - milestones/{milestone_name}/verification.md")

    if missing:
        response = {
            "decision": "block",
            "reason": (
                f"Cannot merge milestone '{milestone_name}' - missing required files:\n\n"
                + "\n".join(missing) + "\n\n"
                "Create these files before merging:\n"
                f"1. scope.md - Copy from milestones/.templates/scope.md\n"
                f"2. code_review.md - Document the code review findings\n"
                f"3. verification.md - Paste actual test/lint/build output"
            )
        }
        print(json.dumps(response))
        sys.exit(0)

    # All checks passed
    sys.exit(0)


if __name__ == "__main__":
    main()
