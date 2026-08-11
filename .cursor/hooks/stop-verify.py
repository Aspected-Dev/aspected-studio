#!/usr/bin/env python3
"""On agent stop, run test + check when the working tree has relevant changes."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RELEVANT_PREFIXES = (
    "src/",
    "package.json",
    "deno.json",
    "deno.lock",
    "vite.config.",
    "tsconfig",
    "components.json",
    "index.html",
)


def relevant_changes() -> bool:
    result = subprocess.run(
        ["git", "status", "--porcelain"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        return True

    for line in result.stdout.splitlines():
        path = line[3:].strip()
        if " -> " in path:
            path = path.split(" -> ", 1)[1]
        if any(path.startswith(prefix) for prefix in RELEVANT_PREFIXES):
            return True
    return False


def run(cmd: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        cmd,
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )


def main() -> None:
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError:
        print("{}")
        return

    status = str(payload.get("status") or "")
    loop_count = int(payload.get("loop_count") or 0)

    if status != "completed" or loop_count >= 2:
        print("{}")
        return

    if not relevant_changes():
        print("{}")
        return

    failures: list[str] = []
    for label, cmd in (
        ("test", ["deno", "task", "test"]),
        ("check", ["deno", "task", "check"]),
    ):
        result = run(cmd)
        if result.returncode != 0:
            output = (result.stdout or "") + (result.stderr or "")
            failures.append(f"## deno task {label}\n```\n{output[-4000:]}\n```")

    if not failures:
        print("{}")
        return

    message = (
        "Definition of Done verification failed. Fix the issues below, "
        "then stop again.\n\n" + "\n\n".join(failures)
    )
    print(json.dumps({"followup_message": message}))


if __name__ == "__main__":
    main()
