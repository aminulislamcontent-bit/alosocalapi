"""Decode short, consented, mono 16 kHz PCM WAV files locally; no microphone/network."""

import argparse
import hashlib
from importlib.metadata import version
import json
from pathlib import Path
import wave

PROFILE = Path(__file__).resolve().parents[2] / "ecosystem/pocketsphinx-en-us.json"


def recognize(wav, approved=False):
    if not approved:
        raise ValueError("Explicit local audio processing approval required")
    from pocketsphinx import Decoder, get_model_path

    profile = json.loads(PROFILE.read_text())
    base = Path(get_model_path()) / "en-us"
    if version("pocketsphinx") != profile["version"]:
        raise ValueError("Decoder version mismatch")
    if {p.relative_to(base).as_posix() for p in base.rglob("*") if p.is_file()} != set(
        profile["files"]
    ):
        raise ValueError("Unexpected model files")
    for path, pin in profile["files"].items():
        with (base / path).open("rb") as f:
            if hashlib.file_digest(f, "sha256").hexdigest() != pin:
                raise ValueError("Model checksum mismatch")
    with wave.open(str(wav), "rb") as f:
        if (f.getnchannels(), f.getsampwidth(), f.getframerate(), f.getcomptype()) != (
            1,
            2,
            16000,
            "NONE",
        ) or not 0 < f.getnframes() <= 16000 * 30:
            raise ValueError("Expected up to 30s of mono 16-bit 16kHz PCM")
        audio = f.readframes(f.getnframes())
        if len(audio) != 2 * f.getnframes():
            raise ValueError("Truncated recording")
    decoder = Decoder(
        hmm=str(base / "en-us"),
        lm=str(base / "en-us.lm.bin"),
        dict=str(base / "cmudict-en-us.dict"),
        samprate=16000,
        loglevel="ERROR",
    )
    decoder.start_utt()
    decoder.process_raw(audio, False, True)
    decoder.end_utt()
    hyp = decoder.hyp()
    return hyp.hypstr if hyp else ""


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("wav", type=Path)
    p.add_argument("--approve-local-processing", action="store_true")
    args = p.parse_args()
    print(recognize(args.wav, args.approve_local_processing))
