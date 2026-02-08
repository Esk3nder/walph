#!/usr/bin/env python3
"""Unit tests for hook enforcement scripts."""

import json
import subprocess
import tempfile
import unittest
from pathlib import Path


TESTS_DIR = Path(__file__).resolve().parent
HOOKS_DIR = TESTS_DIR.parent


def run_checked(cwd: Path, *args: str) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(
        list(args),
        cwd=cwd,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise AssertionError(
            f"Command failed: {' '.join(args)}\nstdout:\n{result.stdout}\nstderr:\n{result.stderr}"
        )
    return result


def write_file(repo: Path, relative_path: str, content: str) -> None:
    path = repo / relative_path
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def init_git_repo(repo: Path, branch: str = "main") -> None:
    run_checked(repo, "git", "init")
    run_checked(repo, "git", "config", "user.email", "hooks@test.local")
    run_checked(repo, "git", "config", "user.name", "Hook Tests")
    current_branch = run_checked(repo, "git", "branch", "--show-current").stdout.strip()
    if current_branch != branch:
        run_checked(repo, "git", "checkout", "-b", branch)

    write_file(repo, "README.md", "seed\n")
    run_checked(repo, "git", "add", "README.md")
    run_checked(repo, "git", "commit", "-m", "chore: seed")


def run_hook(cwd: Path, script_name: str, payload: dict) -> subprocess.CompletedProcess[str]:
    script_path = HOOKS_DIR / script_name
    return subprocess.run(
        ["python3", str(script_path)],
        cwd=cwd,
        input=json.dumps(payload),
        capture_output=True,
        text=True,
    )


def bash_payload(command: str) -> dict:
    return {"tool_name": "Bash", "tool_input": {"command": command}}


def parse_output_json(result: subprocess.CompletedProcess[str]) -> dict:
    output = result.stdout.strip()
    return json.loads(output) if output else {}


class HookTests(unittest.TestCase):
    def test_milestone_gate_blocks_bash_redirect(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            repo = Path(temp_dir)
            init_git_repo(repo, branch="main")
            result = run_hook(repo, "milestone-gate.py", bash_payload("echo test > cli/src/file.ts"))
            self.assertEqual(result.returncode, 0)
            response = parse_output_json(result)
            self.assertEqual(response.get("decision"), "block")

    def test_milestone_gate_allows_bash_nonwrite(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            repo = Path(temp_dir)
            init_git_repo(repo, branch="main")
            result = run_hook(repo, "milestone-gate.py", bash_payload("git status"))
            self.assertEqual(result.returncode, 0)
            self.assertEqual(result.stdout.strip(), "")

    def test_milestone_gate_allows_milestone_branch(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            repo = Path(temp_dir)
            init_git_repo(repo, branch="main")
            run_checked(repo, "git", "checkout", "-b", "milestone/001-feature")
            result = run_hook(repo, "milestone-gate.py", bash_payload("echo test > cli/src/file.ts"))
            self.assertEqual(result.returncode, 0)
            self.assertEqual(result.stdout.strip(), "")

    def test_tdd_lock_blocks_bash_test_write(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            repo = Path(temp_dir)
            init_git_repo(repo, branch="main")

            write_file(repo, "src/app.ts", "export const value = 1;\n")
            run_checked(repo, "git", "add", "src/app.ts")
            run_checked(repo, "git", "commit", "-m", "feat: add impl")

            write_file(repo, "tests/app.test.ts", "it('works', () => expect(true).toBe(true));\n")
            run_checked(repo, "git", "add", "tests/app.test.ts")
            run_checked(repo, "git", "commit", "-m", "test: add app test")

            write_file(repo, "src/app.ts", "export const value = 2;\n")
            run_checked(repo, "git", "add", "src/app.ts")

            result = run_hook(repo, "tdd-lock.py", bash_payload("echo update > tests/app.test.ts"))
            self.assertEqual(result.returncode, 0)
            response = parse_output_json(result)
            self.assertEqual(response.get("decision"), "block")

    def test_merge_gate_blocks_merge_on_main(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            repo = Path(temp_dir)
            init_git_repo(repo, branch="main")
            result = run_hook(repo, "merge-gate.py", bash_payload("git merge milestone/001-foo"))
            self.assertEqual(result.returncode, 0)
            response = parse_output_json(result)
            self.assertEqual(response.get("decision"), "block")

    def test_merge_gate_blocks_gh_pr_merge(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            repo = Path(temp_dir)
            init_git_repo(repo, branch="main")
            run_checked(repo, "git", "checkout", "-b", "milestone/001-gh-merge")
            result = run_hook(repo, "merge-gate.py", bash_payload("gh pr merge"))
            self.assertEqual(result.returncode, 0)
            response = parse_output_json(result)
            self.assertEqual(response.get("decision"), "block")

    def test_merge_gate_allows_non_merge(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            repo = Path(temp_dir)
            init_git_repo(repo, branch="main")
            result = run_hook(repo, "merge-gate.py", bash_payload("git status"))
            self.assertEqual(result.returncode, 0)
            self.assertEqual(result.stdout.strip(), "")

    def test_merge_gate_rejects_empty_docs(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            repo = Path(temp_dir)
            init_git_repo(repo, branch="main")
            run_checked(repo, "git", "checkout", "-b", "milestone/001-validation")

            long_md = "# Notes\n\n" + ("content " * 20)
            write_file(repo, "milestones/001-validation/scope.md", long_md)
            write_file(repo, "milestones/001-validation/code_review.md", long_md)
            write_file(repo, "milestones/001-validation/verification.md", " \n")

            result = run_hook(repo, "merge-gate.py", bash_payload("git push origin main"))
            self.assertEqual(result.returncode, 0)
            response = parse_output_json(result)
            self.assertEqual(response.get("decision"), "block")
            self.assertIn("too short", response.get("reason", ""))


if __name__ == "__main__":
    unittest.main()
