"""Boundary tests: offline artifact management and committed catalog evidence."""

import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts/ecosystem"))
import refresh
from unittest.mock import patch
from weights import manage


class Catalog(unittest.TestCase):
    def test_snapshot(self):
        data = json.loads((ROOT / "reports/open-source-ai-catalog.json").read_text())
        rows = data["entries"]
        ids = [e["id"] for e in rows]
        self.assertFalse(data["unavailable"])
        self.assertEqual(len(ids), len(set(ids)))
        self.assertEqual(len(set(e["category"] for e in rows)), 10)
        for row in rows:
            self.assertRegex(row["revision"], r"^[a-f0-9]{40}$")
            self.assertTrue(
                row["docs"].startswith(row["source"] + "/tree/" + row["revision"])
            )
            self.assertEqual(row["id"].startswith("model:"), row["category"] == "model")
            if row["codeClass"] == "verified-root-license":
                self.assertTrue(row["licenseUrl"])
                self.assertNotIn(row["codeLicense"], (None, "NOASSERTION"))
            if row["category"] == "model":
                self.assertIn(
                    row["weightTermsStatus"],
                    ("upstream-readme-evidence", "checkpoint-review-required"),
                )

    def test_unavailable_source_preserves_trusted_catalog(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            out = root / "reports/candidate"
            (root / "ecosystem").mkdir()
            (root / "reports").mkdir()
            (root / "ecosystem/sources.json").write_text(
                json.dumps([{"repo": "owner/missing", "category": "voice"}])
            )
            old = root / "reports/open-source-ai-catalog.json"
            old.write_text('{"entries":[{"id":"github:12"}]}')
            before = old.read_bytes()
            with patch.object(refresh, "ROOT", root), patch.object(
                refresh, "OUT", out
            ), patch.object(
                refresh, "inspect", side_effect=RuntimeError("unavailable")
            ), patch.object(
                refresh, "api", return_value={"items": []}
            ):
                with self.assertRaises(SystemExit):
                    refresh.main()
            self.assertEqual(old.read_bytes(), before)
            review = json.loads((out / "review.json").read_text())
            self.assertEqual(review["unavailable"], ["owner/missing"])
            self.assertEqual(review["removed"], ["github:12"])

    def test_install_boundary(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder) / "private"
            a = Path(folder) / "a"
            b = Path(folder) / "b"
            a.write_bytes(b"GGUF fixture 1")
            b.write_bytes(b"GGUF fixture 2")
            pa = hashlib.sha256(a.read_bytes()).hexdigest()
            pb = hashlib.sha256(b.read_bytes()).hexdigest()
            self.assertFalse(manage(root, "inspect")["verified"])
            self.assertFalse(root.exists())
            with self.assertRaises(ValueError):
                manage(root, "activate", pa, a)
            self.assertFalse(root.exists())
            with self.assertRaises(ValueError):
                manage(root, "activate", pb, a, True)
            self.assertFalse((root / pb).exists())
            self.assertFalse((root / "state.json").exists())
            self.assertEqual([p.name for p in root.iterdir()], ["lock"])
            manage(root, "activate", pa, a, True)
            before = (root / "state.json").read_bytes()
            with self.assertRaises(ValueError):
                manage(root, "rollback", pb, approved=True)
            self.assertEqual((root / "state.json").read_bytes(), before)
            self.assertFalse((root / pb).exists())
            manage(root, "activate", pb, b, True)
            manage(root, "rollback", pa, approved=True)
            state = manage(root, "inspect")
            self.assertTrue(state["verified"])
            self.assertEqual(state["active"], pa)
            self.assertEqual(
                [e["action"] for e in state["history"]],
                ["activate", "activate", "rollback"],
            )


if __name__ == "__main__":
    unittest.main()
