"""Generate all voice-over with Gemini text-to-speech.

Reads every Dispatch line from src/dispatch.js and every cutscene line from
src/story.js, speaks each one in its character's voice and writes
public/vo/<hash>.mp3 plus public/vo/manifest.json (line text -> file).
Lines that already have a file are skipped, so after editing the scripts just
run this again to voice only the new lines.

    python tools/gen_voice.py                 # voice missing lines
    python tools/gen_voice.py --force         # redo everything
    python tools/gen_voice.py --only bholu     # just one character
    python tools/gen_voice.py --recheck       # re-verify existing takes, redo bad ones
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

sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)  # live progress in a log; transcripts may hold Devanagari

MODEL = "gemini-3.8-flash-tts"
CHECK_MODEL = "gemini-3.8-flash"

# One voice per character. This TTS model reads plain-text directions aloud and
# sometimes even reads [bracket tags] aloud, so every take is transcribed and
# checked: the tags must not be spoken, the words must roughly match the script,
# and (where `indian` is set) the accent should sound Indian. The word match is
# loose on purpose: the transcriber writes the Indian pronunciation of e.g.
# "courier" as "Kobholu", which is the accent working.
SPEAKERS = {
    "dispatch": {"voice": "Puck", "tags": "[cheerful] [Indian English accent]", "language": "en-IN", "indian": True},
    "bholu": {"voice": "Sadachbia", "tags": "[energetic] [young man] [Indian English accent]", "language": "en-IN", "indian": True},
    "nani": {"voice": "Gacrux", "tags": "[warm] [elderly grandmother] [Indian English accent]", "language": "en-IN", "indian": True},
    "mamu": {"voice": "Fenrir", "tags": "[gruff] [loud] [Indian English accent from Bihar]", "language": "en-IN", "indian": True},
}
MIN_MATCH = 0.7  # transcript vs script word similarity needed to keep a take
TAKES = 4
CONTRACTIONS = {"n't": " not", "'re": " are", "'ll": " will", "'m": " am", "'ve": " have", "'s": " is"}
OUT = gemini.ROOT / "public" / "vo"


def script_lines():
    """[(speaker, text)] from src/dispatch.js and src/story.js, via Node so the JS stays the source of truth."""
    script = (
        "const d = await import('./src/dispatch.js');"
        "const s = await import('./src/story.js');"
        "const out = new Map();"
        "const walk = (v) => typeof v === 'string' ? out.set(v, 'dispatch')"
        " : Array.isArray(v) ? v.forEach(walk) : v && typeof v === 'object' ? Object.values(v).forEach(walk) : 0;"
        "Object.values(d).forEach(walk);"
        "for (const level of s.LEVELS) for (const l of [...level.intro, ...level.outro]) out.set(l.text, l.who);"
        "for (const t of d.HIT_LINES) out.set(t, 'mamu');"
        "for (const t of d.LOW_BATTERY_LINES) out.set(t, 'bholu');"
        "for (const l of s.ENDING) out.set(l.text, l.who);"
        "console.log(JSON.stringify([...out].map(([text, who]) => [who, text])));"
    )
    result = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=gemini.ROOT, capture_output=True, text=True, encoding="utf-8", check=True,
    )
    return json.loads(result.stdout)


def file_for(speaker, text):
    key = text if speaker == "dispatch" else f"{speaker}:{text}"  # Dispatch's original files keep their names
    return f"{hashlib.sha1(key.encode()).hexdigest()[:12]}.mp3"


def speak(speaker, text, tags=True):
    who = SPEAKERS[speaker]
    response = gemini.request(f"models/{MODEL}:generateContent", {
        "contents": [{"parts": [{"text": f"{who['tags']} {text}" if tags and who["tags"] else text}]}],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {
                "languageCode": who["language"],
                "voiceConfig": {"prebuiltVoiceConfig": {"voiceName": who["voice"]}},
            },
        },
    })
    return gemini.inline_data(response)


ONES = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split()
TENS = "_ _ twenty thirty forty fifty sixty seventy eighty ninety".split()
UNITS = {"km": "kilometres", "kms": "kilometres", "rs": "rupees"}


def spell(n):
    """A number in words, the way the scripts write them (transcripts use digits)."""
    if n < 20:
        return ONES[n]
    if n < 100:
        return TENS[n // 10] + ("" if n % 10 == 0 else " " + ONES[n % 10])
    if n < 1000:
        return ONES[n // 100] + " hundred" + ("" if n % 100 == 0 else " " + spell(n % 100))
    return spell(n // 1000) + " thousand" + ("" if n % 1000 == 0 else " " + spell(n % 1000))


def words(text):
    text = text.lower().replace("’", "'")
    text = re.sub(r"\d[\d,]*", lambda m: " " + spell(int(m.group().replace(",", ""))) + " ", text)
    for short, full in CONTRACTIONS.items():
        text = text.replace(short, full)
    return [UNITS.get(w, w) for w in re.findall(r"[a-z0-9]+", text)]


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


def spoke_tags(speaker, text, heard):
    """Did the take read the style tags out loud?"""
    return bool((set(words(SPEAKERS[speaker]["tags"])) - set(words(text))) & set(words(heard)))


def usable(speaker, text, score, heard):
    return score >= MIN_MATCH and not spoke_tags(speaker, text, heard)


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


def record(speaker, text):
    """Record one line, retrying until a take passes the checks. Returns False if none did."""
    path = OUT / file_for(speaker, text)
    backup = path.with_suffix(".backup.mp3")  # first usable take, in case none sounds Indian
    for take in range(TAKES):
        try:
            # Later takes drop the tags (accent from languageCode only) in case they keep being read out.
            mime, audio = speak(speaker, text, tags=take < TAKES // 2)
        except RuntimeError as err:  # e.g. the model returned text instead of audio
            print(f"  take {take + 1}: no audio ({err})")
            continue
        to_mp3(mime, audio, path)
        score, indian, heard = check(path, text)
        accent_ok = indian or not SPEAKERS[speaker]["indian"]
        if usable(speaker, text, score, heard) and accent_ok:
            backup.unlink(missing_ok=True)
            return True
        print(f"  take {take + 1}: {score:.2f} match, indian accent: {indian}, heard {heard!r}")
        if usable(speaker, text, score, heard) and not backup.exists():
            path.replace(backup)
        time.sleep(1)
    if backup.exists():
        print("  keeping a take with the right words but an unsure accent")
        backup.replace(path)
        return True
    path.unlink(missing_ok=True)
    return False


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--only", choices=list(SPEAKERS))
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--recheck", action="store_true", help="re-transcribe existing takes, redo bad ones")
    args = parser.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    lines = script_lines()
    chosen = [(s, t) for s, t in lines if not args.only or s == args.only]
    if args.recheck:
        for speaker, text in chosen:
            path = OUT / file_for(speaker, text)
            if not path.exists():
                continue
            score, _, heard = check(path, text)
            if not usable(speaker, text, score, heard):
                print(f"bad take, redoing: {heard!r} ({score:.2f})")
                path.unlink()
    local_list = OUT / "local.json"  # stand-in takes from gen_voice_local.py, to be replaced
    local = set(json.loads(local_list.read_text())) if local_list.exists() else set()
    todo = [(s, t) for s, t in chosen
            if args.force or file_for(s, t) in local or not (OUT / file_for(s, t)).exists()]
    if args.limit:
        todo = todo[:args.limit]
    print(f"{len(lines)} lines, {len(todo)} to voice")

    failed = []
    for i, (speaker, text) in enumerate(todo, 1):
        print(f"[{i}/{len(todo)}] {speaker}: {text}")
        if record(speaker, text):
            local.discard(file_for(speaker, text))
            local_list.write_text(json.dumps(sorted(local), indent=1))  # progress survives a crash
        else:
            failed.append(f"{speaker}: {text}")
        time.sleep(1)
    if failed:
        print("Could not get a clean take for:", *failed, sep="\n  ")

    manifest = {t: f"vo/{file_for(s, t)}" for s, t in lines if (OUT / file_for(s, t)).exists()}
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"manifest: {len(manifest)}/{len(lines)} lines voiced")
    local_list.write_text(json.dumps(sorted(local), indent=1))

    # Recordings of lines that were edited or removed from the scripts.
    used = {Path(f).name for f in manifest.values()}
    for old in OUT.glob("*.mp3"):
        if old.name not in used:
            old.unlink()
            print(f"removed unused {old.name}")


if __name__ == "__main__":
    main()
