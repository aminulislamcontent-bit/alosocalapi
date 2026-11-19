"""Operator-only, offline Qwen3-8B GGUF staging, verification and rollback on POSIX."""

import argparse
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import tempfile


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def manage(root, action, pin=None, artifact=None, approved=False):
    if action not in ("inspect", "activate", "rollback"):
        raise ValueError("Unsupported action")
    if action != "inspect" and (
        not approved or not re.fullmatch("[0-9a-f]{64}", pin or "")
    ):
        raise ValueError(
            "Operator approval and independently verified SHA-256 required"
        )
    if action == "inspect" and not root.is_dir():
        return {"active": None, "verified": False}
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    if (
        root.is_symlink()
        or root.stat().st_mode & 0o077
        or root.stat().st_uid != os.geteuid()
    ):
        raise ValueError("Use a private directory owned by the current operator")
    with (root / "lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        manifest = root / "state.json"
        state = (
            json.loads(manifest.read_text())
            if manifest.exists()
            else {"active": None, "history": []}
        )
        if action == "inspect":
            active = state["active"]
            return {
                **state,
                "verified": bool(active and digest(root / active) == active),
            }
        target = root / pin
        if action == "rollback" and not any(
            event["to"] == pin for event in state["history"]
        ):
            raise ValueError("Digest was not previously activated")
        if action == "activate" and not target.exists():
            if not artifact or not artifact.is_file():
                raise ValueError("A local GGUF file is required")
            if shutil.disk_usage(root).free < artifact.stat().st_size:
                raise ValueError("Insufficient storage")
            with tempfile.NamedTemporaryFile(dir=root, delete=False) as tmp:
                tmpfile = Path(tmp.name)
            try:
                with artifact.open("rb") as src, tmpfile.open("wb") as dst:
                    if src.read(4) != b"GGUF":
                        raise ValueError("Not a GGUF artifact")
                    src.seek(0)
                    shutil.copyfileobj(src, dst)
                    dst.flush()
                    os.fsync(dst.fileno())
                if digest(tmpfile) != pin:
                    raise ValueError("Digest mismatch; activation refused")
                tmpfile.chmod(0o400)
                tmpfile.rename(target)
            finally:
                tmpfile.unlink(missing_ok=True)
        elif not target.is_file() or digest(target) != pin:
            raise ValueError("Missing or corrupt local artifact")
        state["history"].append(
            dict(
                action=action,
                at=dt.datetime.now(dt.timezone.utc).isoformat(),
                previous=state["active"],
                to=pin,
                operatorUid=os.geteuid(),
            )
        )
        state["active"] = pin
        with tempfile.NamedTemporaryFile(mode="w", dir=root, delete=False) as out:
            json.dump(state, out)
            out.flush()
            os.fsync(out.fileno())
            Path(out.name).replace(manifest)
        return state


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["inspect", "activate", "rollback"])
    parser.add_argument("--store", type=Path, required=True)
    parser.add_argument("--gguf", type=Path)
    parser.add_argument("--sha256")
    parser.add_argument("--approve-qwen3-8b", action="store_true")
    args = parser.parse_args()
    print(
        json.dumps(
            manage(
                args.store, args.action, args.sha256, args.gguf, args.approve_qwen3_8b
            ),
            indent=2,
        )
    )
