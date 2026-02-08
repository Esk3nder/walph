#!/usr/bin/env python3
"""
tdd-lock.py - Lock test files after initial commit

PreToolUse hook that enforces TDD discipline:
- New test files can be written freely
- Once a test file is committed, it's locked
- Locked test files can only be modified in a separate commit (no impl files staged)

This prevents the agent from "cheating" by modifying tests to make them pass.
"""

import json
import os
import re
import shlex
import subprocess
import sys


# Patterns that identify test files (language agnostic)
TEST_PATTERNS = [
    r"[/\\]tests?[/\\]",          # tests/ or test/ directory
    r"[/\\]__tests__[/\\]",       # __tests__/ directory
    r"[/\\]spec[/\\]",            # spec/ directory
    r"\.test\.",                   # file.test.ts, file.test.py
    r"\.spec\.",                   # file.spec.ts, file.spec.py
    r"_test\.",                    # file_test.go, file_test.py
    r"_spec\.",                    # file_spec.rb
    r"[/\\]test_[^/\\]+$",        # test_something.py
    r"[/\\]spec_[^/\\]+$",        # spec_something.rb
]


def is_test_file(file_path: str) -> bool:
    """Check if a file path matches any test file pattern."""
    for pattern in TEST_PATTERNS:
        if re.search(pattern, file_path, re.IGNORECASE):
            return True
    return False


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


def file_has_commits(file_path: str) -> bool:
    """Check if a file has been committed to git before."""
    try:
        result = subprocess.run(
            ["git", "log", "--oneline", "-1", "--", file_path],
            capture_output=True,
            text=True,
            timeout=5,
        )
        return bool(result.stdout.strip())
    except Exception:
        # Fail open on error
        return False


def get_staged_files() -> list[str]:
    """Get list of currently staged files."""
    try:
        result = subprocess.run(
            ["git", "diff", "--cached", "--name-only"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        return [f.strip() for f in result.stdout.strip().split("\n") if f.strip()]
    except Exception:
        return []


def get_unstaged_modified_files() -> list[str]:
    """Get list of modified but unstaged files."""
    try:
        result = subprocess.run(
            ["git", "diff", "--name-only"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        return [f.strip() for f in result.stdout.strip().split("\n") if f.strip()]
    except Exception:
        return []


def has_non_test_staged_files() -> bool:
    """Check if there are non-test files in the staging area."""
    staged = get_staged_files()
    for f in staged:
        if not is_test_file(f):
            return True
    return False


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

    # Only care about test files
    if not is_test_file(file_path):
        sys.exit(0)

    # Check if this test file has been committed before
    if not file_has_commits(file_path):
        # New test file - allow freely (TDD red phase)
        sys.exit(0)

    # Test file is locked (has commits).
    # Allow ONLY if this is a separate test-fix commit context:
    # no non-test files currently staged.
    if has_non_test_staged_files():
        basename = os.path.basename(file_path)
        response = {
            "decision": "block",
            "reason": (
                f"Test file '{basename}' is locked (already committed).\n\n"
                f"TDD rule: Test files cannot be modified alongside implementation code.\n\n"
                f"To fix a test bug:\n"
                f"  1. Commit your current implementation changes first\n"
                f"  2. Then modify the test in a separate commit\n"
                f"  3. Use commit message: fix(test): <description>"
            ),
        }
        print(json.dumps(response))
        sys.exit(0)

    # No non-test files staged - this is a dedicated test-fix commit. Allow it.
    sys.exit(0)


if __name__ == "__main__":
    main()
