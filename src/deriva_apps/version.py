"""Version bumping entry point.

Wraps bump-my-version to provide the `bump-version` CLI command,
matching the pattern used by deriva-ml.
"""

from __future__ import annotations

import subprocess
import sys


def bump() -> None:
    """Bump the project version using bump-my-version."""
    args = sys.argv[1:]
    if not args:
        print("Usage: bump-version <patch|minor|major>")
        sys.exit(1)

    component = args[0]
    if component not in ("patch", "minor", "major"):
        print(f"Unknown component: {component}. Use patch, minor, or major.")
        sys.exit(1)

    cmd = ["uv", "run", "bump-my-version", "bump", component, "--verbose"]
    result = subprocess.run(cmd)

    if result.returncode == 0:
        print(f"\nPushing changes to remote repository...")
        subprocess.run(["git", "push", "--follow-tags"])
    else:
        sys.exit(result.returncode)
