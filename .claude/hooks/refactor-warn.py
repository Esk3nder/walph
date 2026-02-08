#!/usr/bin/env python3
"""
refactor-warn.py - Warn when files exceed line threshold

PostToolUse hook that checks file size after Write/Edit and injects a
warning when files get too large, encouraging refactoring into smaller modules.
"""

import json
import os
import sys

LINE_THRESHOLD = 500


def count_lines(file_path: str) -> int:
    """Count lines in a file."""
    try:
        with open(file_path, "r", errors="replace") as f:
            return sum(1 for _ in f)
    except (OSError, IOError):
        return 0


def main():
    try:
        hook_input = json.load(sys.stdin)
    except json.JSONDecodeError:
        sys.exit(0)

    tool_name = hook_input.get("tool_name", "")

    # Only check Write and Edit tools
    if tool_name not in ("Write", "Edit"):
        sys.exit(0)

    tool_input = hook_input.get("tool_input", {})
    file_path = tool_input.get("file_path", "")

    if not file_path or not os.path.isfile(file_path):
        sys.exit(0)

    line_count = count_lines(file_path)

    if line_count <= LINE_THRESHOLD:
        sys.exit(0)

    basename = os.path.basename(file_path)
    response = {
        "hookSpecificOutput": {
            "additionalContext": (
                f"Warning: '{basename}' is {line_count} lines "
                f"(threshold: {LINE_THRESHOLD}).\n"
                f"Consider refactoring into smaller modules to improve maintainability."
            )
        }
    }
    print(json.dumps(response))
    sys.exit(0)


if __name__ == "__main__":
    main()
