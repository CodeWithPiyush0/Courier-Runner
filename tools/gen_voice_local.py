"""Voice every line with Microsoft's free neural voices (edge-tts) instead of Gemini.

A stand-in for gen_voice.py while the Gemini project is over its spend cap: same
script lines, same file names and manifest, so the game can't tell the
difference. Files made here are listed in public/vo/local.json, and gen_voice.py
treats them as missing, so a later Gemini run replaces them.

    pip install edge-tts
    python tools/gen_voice_local.py               # voice every line not yet voiced by Gemini
    python tools/gen_voice_local.py --only mamu
"""
import argparse
import asyncio
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import edge_tts

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gen_voice import OUT, file_for, script_lines, words  # noqa: E402

sys.stdout.reconfigure(line_buffering=True)

# Four distinct Indian voices; pitch and rate nudge them towards each character.
VOICES = {
    "riya": {"voice": "en-IN-NeerjaExpressiveNeural", "rate": "+6%", "pitch": "+8Hz"},
    "dispatch": {"voice": "en-IN-PrabhatNeural", "rate": "+8%", "pitch": "+0Hz"},
    "nani": {"voice": "hi-IN-SwaraNeural", "rate": "-12%", "pitch": "-14Hz"},
    "mamu": {"voice": "hi-IN-MadhurNeural", "rate": "+0%", "pitch": "-8Hz"},
}
LOCAL = OUT / "local.json"


async def speak(speaker, text, path):
    """Record one line; returns the words the voice reported speaking."""
    who = VOICES[speaker]
    talk = edge_tts.Communicate(text, who["voice"], rate=who["rate"], pitch=who["pitch"], boundary="WordBoundary")
    audio, spoken = bytearray(), []
    async for chunk in talk.stream():
        if chunk["type"] == "audio":
            audio += chunk["data"]
        elif chunk["type"] == "WordBoundary":
            spoken.append(chunk["text"])
    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as raw:
        raw.write(audio)
    try:
        # Same trim and loudness as the Gemini takes.
        subprocess.run([
            "ffmpeg", "-y", "-loglevel", "error", "-i", raw.name,
            "-af", "silenceremove=start_periods=1:start_threshold=-50dB,areverse,"
                   "silenceremove=start_periods=1:start_threshold=-50dB,areverse,loudnorm=I=-16:TP=-1.5",
            "-ar", "24000", "-b:a", "64k", str(path),
        ], check=True)
    finally:
        Path(raw.name).unlink(missing_ok=True)
    return spoken


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", choices=list(VOICES))
    parser.add_argument("--keep-gemini", action="store_true", help="leave lines Gemini already voiced alone")
    args = parser.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    local = set(json.loads(LOCAL.read_text())) if LOCAL.exists() else set()
    lines = script_lines()
    todo = [(s, t) for s, t in lines if not args.only or s == args.only]
    if args.keep_gemini:
        todo = [(s, t) for s, t in todo if file_for(s, t) in local or not (OUT / file_for(s, t)).exists()]
    print(f"{len(lines)} lines, {len(todo)} to voice")

    for i, (speaker, text) in enumerate(todo, 1):
        name = file_for(speaker, text)
        spoken = await speak(speaker, text, OUT / name)
        missing = set(words(text)) - set(words(" ".join(spoken)))
        print(f"[{i}/{len(todo)}] {speaker}: {text}" + (f"  (skipped words: {missing})" if missing else ""))
        local.add(name)

    manifest = {t: f"vo/{file_for(s, t)}" for s, t in lines if (OUT / file_for(s, t)).exists()}
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=1, ensure_ascii=False), encoding="utf-8")
    used = {Path(f).name for f in manifest.values()}
    LOCAL.write_text(json.dumps(sorted(local & used), indent=1))
    for old in OUT.glob("*.mp3"):
        if old.name not in used:
            old.unlink()
    print(f"manifest: {len(manifest)}/{len(lines)} lines voiced")


if __name__ == "__main__":
    asyncio.run(main())
