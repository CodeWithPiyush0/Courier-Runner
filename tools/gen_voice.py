"""Generate the Dispatch voice-over with Gemini text-to-speech.

Reads every line from src/dispatch.js, speaks each one in Indian English and
writes public/vo/<hash>.mp3 plus public/vo/manifest.json (line text -> file).
Lines that already have a file are skipped, so after editing dispatch.js just
run this again to voice only the new lines.

    python tools/gen_voice.py                 # voice missing lines
    python tools/gen_voice.py --force         # redo everything
    python tools/gen_voice.py --voice Achird  # try another Gemini voice
    python tools/gen_voice.py --limit 1       # quick test
"""
import argparse
import base64
import difflib
import hashlib
import json
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gemini  # noqa: E402

sys.stdout.reconfigure(line_buffering=True)  # show progress live when piped to a log

MODEL = "gemini-3.8-flash-tts"
CHECK_MODEL = "gemini-3.8-flash"
VOICE = "Puck"
# This TTS model reads plain-text directions aloud, and sometimes even reads
# [bracket tags] aloud, so every take is transcribed and checked: the tags must
# not be spoken, the words must roughly match the script, and the accent should
# sound Indian. The match is loose on purpose: the transcriber writes the Indian
# pronunciation of e.g. "courier" as "Koriya", which is the accent working.
LANGUAGE = "en-IN"
STYLE_TAGS = "[cheerful] [Indian English accent]"
MIN_MATCH = 0.7  # transcript vs script word similarity needed to keep a take
TAKES = 4
CONTRACTIONS = {"n't": " not", "'re": " are", "'ll": " will", "'m": " am", "'ve": " have", "'s": " is"}
OUT = gemini.ROOT / "public" / "vo"


def dispatch_lines():
    """Every string exported by src/dispatch.js, via Node so the JS stays the source of truth."""
    script = (
        "const m = await import('./src/dispatch.js');"
        "const out = new Set();"
        "const walk = (v) => typeof v === 'string' ? out.add(v)"
        " : Array.isArray(v) ? v.forEach(walk) : v && typeof v === 'object' ? Object.values(v).forEach(walk) : 0;"
        "Object.values(m).forEach(walk);"
        "console.log(JSON.stringify([...out]));"
    )
    result = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=gemini.ROOT, capture_output=True, text=True, encoding="utf-8", check=True,
    )
    return json.loads(result.stdout)


def file_for(text):
    return f"{hashlib.sha1(text.encode()).hexdigest()[:12]}.mp3"


def speak(text, voice, tags=True):
    response = gemini.request(f"models/{MODEL}:generateContent", {
        "contents": [{"parts": [{"text": f"{STYLE_TAGS} {text}" if tags else text}]}],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {
                "languageCode": LANGUAGE,
                "voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voice}},
            },
        },
    })
    return gemini.inline_data(response)


def words(text):
    text = text.lower().replace("’", "'")
    for short, full in CONTRACTIONS.items():
        text = text.replace(short, full)
    return re.findall(r"[a-z0-9]+", text)


def check(path, text):
    """Transcribe the take with a Gemini text model. Returns (word match 0..1, sounds Indian, transcript)."""
    audio = base64.b64encode(path.read_bytes()).decode()
    response = gemini.request(f"models/{CHECK_MODEL}:generateContent", {
        "contents": [{"parts": [
            {"inlineData": {"mimeType": "audio/mpeg", "data": audio}},
            {"text": "Transcribe this audio exactly, word for word, and say whether the speaker has an "
                     "Indian English accent."},
        ]}],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseSchema": {"type": "OBJECT", "properties": {
                "transcript": {"type": "STRING"}, "indian_accent": {"type": "BOOLEAN"},
            }, "required": ["transcript", "indian_accent"]},
        },
    })
    result = json.loads(response["candidates"][0]["content"]["parts"][0]["text"])
    heard = result["transcript"].strip()
    score = difflib.SequenceMatcher(None, words(text), words(heard)).ratio()
    return score, result["indian_accent"], heard


def spoke_tags(text, heard):
    """Did the take read the style tags out loud?"""
    return bool((set(words(STYLE_TAGS)) - set(words(text))) & set(words(heard)))


def usable(text, score, heard):
    return score >= MIN_MATCH and not spoke_tags(text, heard)


def to_mp3(mime, audio, path):
    """Encode Gemini's audio (a WAV file, or raw 16-bit PCM with the rate in the mime type) to mp3."""
    if "wav" in (mime or ""):
        source = []
    else:
        rate = next((p.split("=")[1] for p in (mime or "").split(";") if p.strip().startswith("rate=")), "24000")
        source = ["-f", "s16le", "-ar", rate, "-ac", "1"]
    with tempfile.NamedTemporaryFile(suffix=".audio", delete=False) as raw:
        raw.write(audio)
    try:
        subprocess.run([
            "ffmpeg", "-y", "-loglevel", "error", *source, "-i", raw.name,
            "-af", "silenceremove=start_periods=1:start_threshold=-50dB,areverse,"
                   "silenceremove=start_periods=1:start_threshold=-50dB,areverse,loudnorm=I=-16:TP=-1.5",
            "-ar", "24000", "-b:a", "64k", str(path),
        ], check=True)
    finally:
        Path(raw.name).unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--voice", default=VOICE)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--recheck", action="store_true", help="re-transcribe existing takes, redo bad ones")
    args = parser.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    lines = dispatch_lines()
    if args.recheck:
        for text in lines:
            path = OUT / file_for(text)
            if not path.exists():
                continue
            score, _, heard = check(path, text)
            if not usable(text, score, heard):
                print(f"bad take, redoing: {heard!r} ({score:.2f})")
                path.unlink()
    todo = [t for t in lines if args.force or not (OUT / file_for(t)).exists()]
    if args.limit:
        todo = todo[:args.limit]
    print(f"{len(lines)} lines, {len(todo)} to voice with {args.voice}")

    failed = []
    for i, text in enumerate(todo, 1):
        print(f"[{i}/{len(todo)}] {text}")
        path = OUT / file_for(text)
        backup = path.with_suffix(".backup.mp3")  # first usable take, in case none sounds Indian
        for take in range(TAKES):
            try:
                # Later takes drop the tags (accent from languageCode only) in case they keep being read out.
                mime, audio = speak(text, args.voice, tags=take < TAKES // 2)
            except RuntimeError as err:  # e.g. the model returned text instead of audio
                print(f"  take {take + 1}: no audio ({err})")
                continue
            to_mp3(mime, audio, path)
            score, indian, heard = check(path, text)
            if usable(text, score, heard) and indian:
                break
            print(f"  take {take + 1}: {score:.2f} match, indian accent: {indian}, heard {heard!r}")
            if usable(text, score, heard) and not backup.exists():
                path.replace(backup)
            time.sleep(1)
        else:
            if backup.exists():
                print("  keeping a take with the right words but an unsure accent")
                backup.replace(path)
            else:
                path.unlink(missing_ok=True)
                failed.append(text)
        backup.unlink(missing_ok=True)
        time.sleep(1)
    if failed:
        print("Could not get a clean take for:", *failed, sep="\n  ")

    manifest = {t: f"vo/{file_for(t)}" for t in lines if (OUT / file_for(t)).exists()}
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"manifest: {len(manifest)}/{len(lines)} lines voiced")


if __name__ == "__main__":
    main()
