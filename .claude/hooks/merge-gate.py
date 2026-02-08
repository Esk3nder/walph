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


def is_merge_or_push_to_main(command: str, current_branch: str) -> bool:
    """Check if command is merging or pushing to main/master."""
    if current_branch in ("main", "master") and re.search(r"\bgit\s+merge\b", command, re.IGNORECASE):
        return True

    # Patterns that indicate merge to main
    merge_patterns = [
        r"\bgit\s+merge\s+.*\bmain\b",
        r"\bgit\s+merge\s+.*\bmaster\b",
        r"\bgit\s+push\s+.*\bmain\b",
        r"\bgit\s+push\s+.*\bmaster\b",
        r"\bgit\s+push\s+origin\s+HEAD:main\b",
        r"\bgit\s+push\s+origin\s+HEAD:master\b",
        r"\bgit\s+(?:checkout|switch)\s+main\b\s*(?:&&|;)\s*.*\bgit\s+merge\b",
        r"\bgit\s+(?:checkout|switch)\s+master\b\s*(?:&&|;)\s*.*\bgit\s+merge\b",
        r"\bgh\s+pr\s+merge\b",
        r"\bgit\s+pull\s+origin\s+main\b",
        r"\bgit\s+pull\s+origin\s+master\b",
        r"\bgit\s+rebase\s+origin/main\b",
        r"\bgit\s+rebase\s+origin/master\b",
    ]

    for pattern in merge_patterns:
        if re.search(pattern, command, re.IGNORECASE):
            return True
    return False


def check_file_exists(milestone_name: str, filename: str) -> tuple[bool, str]:
    """Validate required milestone file existence and minimum content quality."""
    path = os.path.join("milestones", milestone_name, filename)
    display_path = f"milestones/{milestone_name}/{filename}"

    if not os.path.isfile(path):
        return (False, f"{display_path} is missing")

    try:
        with open(path, "r", encoding="utf-8") as handle:
            content = handle.read()
    except Exception as error:
        return (False, f"{display_path} could not be read: {error}")

    if len(content.strip().encode("utf-8")) < 100:
        return (False, f"{display_path} is too short (needs at least 100 bytes of non-whitespace content)")

    if filename == "verification.md":
        required_headers = ["## Test Results", "## Lint Results", "## Verdict"]
        missing_headers = [header for header in required_headers if header not in content]
        if missing_headers:
            return (
                False,
                f"{display_path} is missing required sections: {', '.join(missing_headers)}",
            )

    return (True, "")


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

    branch = get_current_branch()

    # Only check merge/push/rebase flows touching main
    if not is_merge_or_push_to_main(command, branch):
        sys.exit(0)

    # Get current milestone
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
    for filename in ("scope.md", "code_review.md", "verification.md"):
        is_valid, error_message = check_file_exists(milestone_name, filename)
        if not is_valid:
            missing.append(f"  - {error_message}")

    if missing:
        response = {
            "decision": "block",
            "reason": (
                f"Cannot merge milestone '{milestone_name}' - required docs are incomplete:\n\n"
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
