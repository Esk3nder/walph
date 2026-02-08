#!/usr/bin/env python3
"""
burndown-reminder.py - Remind to update PROJECT_PLAN.md after merge

PostToolUse hook that detects successful merges to main/master and injects
a reminder to update the project burndown checklist.
"""

import json
import re
import sys


def main():
    try:
        hook_input = json.load(sys.stdin)
    except json.JSONDecodeError:
        sys.exit(0)

    tool_name = hook_input.get("tool_name", "")

    # Only check Bash tool results
    if tool_name != "Bash":
        sys.exit(0)

    tool_input = hook_input.get("tool_input", {})
    command = tool_input.get("command", "")

    # Check if this was a merge or push to main/master
    merge_patterns = [
        r"git\s+merge",
        r"git\s+push\s+.*main",
        r"git\s+push\s+.*master",
    ]

    is_merge = any(re.search(p, command, re.IGNORECASE) for p in merge_patterns)
    if not is_merge:
        sys.exit(0)

    # Check if the command succeeded (tool_response contains exit code info)
    tool_response = hook_input.get("tool_response", {})
    # PostToolUse gets stdout/stderr; if there's an error indicator, skip
    stdout = tool_response.get("stdout", "")
    stderr = tool_response.get("stderr", "")

    # If merge/push failed, don't remind
    if "error" in stderr.lower() or "fatal" in stderr.lower() or "rejected" in stderr.lower():
        sys.exit(0)

    # Inject reminder
    response = {
        "hookSpecificOutput": {
            "additionalContext": (
                "Milestone merged! Remember to update PROJECT_PLAN.md:\n"
                "  1. Mark the completed milestone checkbox as [x]\n"
                "  2. Move it to the 'Completed' section\n"
                "  3. Note any follow-up items discovered during implementation"
            )
        }
    }
    print(json.dumps(response))
    sys.exit(0)


if __name__ == "__main__":
    main()
