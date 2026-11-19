"""Optional runtime acceptance. Run in isolated, locked Python 3.11 environment."""

import argparse
import hashlib
from pathlib import Path
import tempfile
import sys
import wave

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts/ecosystem"))
from offline_voice import recognize
from research_graph import run

parser = argparse.ArgumentParser()
parser.add_argument("public_sample", type=Path)
args = parser.parse_args()
raw = args.public_sample.read_bytes()
assert (
    hashlib.sha256(raw).hexdigest()
    == "f15c60ec54059d8b66e410d0064945a0b0a04ea56e1ddca1958e493c0cf70e71"
)
with tempfile.TemporaryDirectory() as folder:
    path = Path(folder) / "public.wav"
    with wave.open(str(path), "wb") as f:
        f.setparams((1, 2, 16000, 0, "NONE", "not compressed"))
        f.writeframes(raw)
    try:
        recognize(path)
    except ValueError as err:
        assert "approval required" in str(err)
    else:
        raise AssertionError("Unapproved transcription")
    assert list(Path(folder).iterdir()) == [path]
    assert recognize(path, True) == "go forward ten meters"
    assert list(Path(folder).iterdir()) == [path]
assert run("ঢাকা শিক্ষা", ["ঢাকা শিক্ষা প্রকাশ্য পাঠ্য", "business hours"]) == {
    "excerpts": ["ঢাকা শিক্ষা প্রকাশ্য পাঠ্য"],
    "decision": "human-review-required",
}
assert run("ঢাকা শিক্ষা", ["business hours"]) == {
    "excerpts": [],
    "decision": "insufficient-evidence",
}
print("Public speech sample decoded; Bangla retrieval and no-evidence branch verified.")
