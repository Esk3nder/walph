#!/usr/bin/env python3
"""
milestone-gate.py - Block Write/Edit outside milestone/* branches

PreToolUse hook that enforces all code changes happen on milestone branches.
This prevents ad-hoc changes on main and forces structured milestone workflow.
"""

import json
import re
import shlex
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


def normalize_file_path(file_path: str) -> str:
    """Normalize a potentially shell-extracted file path for policy checks."""
    normalized = file_path.strip().strip("'\"")
    if normalized.startswith("./"):
        normalized = normalized[2:]
    return normalized.replace("\\", "/")


def extract_file_write_target(command: str) -> str:
    """Extract likely file-write target from a shell command."""
    redirect_match = re.search(r">>?\s*([^\s;&|]+)", command)
    if redirect_match:
        return normalize_file_path(redirect_match.group(1))

    # Split chained commands so parsing can remain simple and stdlib-only.
    parts = [part.strip() for part in re.split(r"\s*(?:&&|\|\||;|\|)\s*", command) if part.strip()]
    for part in parts:
        try:
            tokens = shlex.split(part)
        except ValueError:
            continue

        if not tokens:
            continue

        cmd = tokens[0]
        args = tokens[1:]
        positional = [arg for arg in args if not arg.startswith("-")]

        if cmd in ("cp", "mv") and len(positional) >= 2:
            return normalize_file_path(positional[-1])

        if cmd == "touch" and positional:
            return normalize_file_path(positional[0])

        if cmd == "tee" and positional:
            return normalize_file_path(positional[0])

        if cmd == "sed" and any(arg == "-i" or arg.startswith("-i") for arg in args):
            sed_targets = []
            skip_next = False
            for arg in args:
                if skip_next:
                    skip_next = False
                    continue
                if arg in ("-e", "-f"):
                    skip_next = True
                    continue
                if arg.startswith("-"):
                    continue
                sed_targets.append(arg)
            if sed_targets:
                return normalize_file_path(sed_targets[-1])

    return ""


def main():
    # Read hook input from stdin
    try:
        hook_input = json.load(sys.stdin)
    except json.JSONDecodeError:
        # Fail open on parse error
        sys.exit(0)

    tool_name = hook_input.get("tool_name", "")

    # Only check Write/Edit or Bash file-write operations.
    if tool_name not in ("Write", "Edit", "Bash"):
        sys.exit(0)

    tool_input = hook_input.get("tool_input", {})
    if tool_name == "Bash":
        command = tool_input.get("command", "")
        file_path = extract_file_write_target(command)
        if not file_path:
            sys.exit(0)
    else:
        file_path = normalize_file_path(tool_input.get("file_path", ""))

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
