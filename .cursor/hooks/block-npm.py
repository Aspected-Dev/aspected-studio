#!/usr/bin/env python3
"""Deny bare npm/npx/yarn/pnpm; allow Deno tasks and deno run … npm:…"""

from __future__ import annotations

import json
import re
import sys


def main() -> None:
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError:
        print(json.dumps({"permission": "allow"}))
        return

    command = str(payload.get("command") or "")
    stripped = command.strip()

    # Deno invoking an npm package is allowed.
    if re.search(r"\bdeno\b", stripped) and "npm:" in stripped:
        print(json.dumps({"permission": "allow"}))
        return

    if re.match(r"^(npm|npx|yarn|pnpm)\b", stripped):
        print(
            json.dumps(
                {
                    "permission": "deny",
                    "user_message": (
                        "Blocked package-manager CLI. Use Deno instead "
                        "(deno task, deno add, deno install, or "
                        "deno run -A npm:shadcn@latest …)."
                    ),
                    "agent_message": (
                        "Do not use npm/npx/yarn/pnpm. Use Deno tasks or "
                        "`deno run -A npm:<pkg>` for one-off CLIs like shadcn."
                    ),
                }
            )
        )
        return

    print(json.dumps({"permission": "allow"}))


if __name__ == "__main__":
    main()
