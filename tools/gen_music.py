"""Generate the soundtrack with Gemini's Lyria music model.

Writes public/music/<name>.mp3. Each track is checked by a Gemini text model
(must be instrumental and fit its brief) and regenerated if it has vocals. Existing tracks are
skipped unless named or --force is given:

    python tools/gen_music.py            # everything missing
    python tools/gen_music.py space      # just this one (always redone)
"""
import argparse
import base64
import json
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gemini  # noqa: E402

sys.stdout.reconfigure(line_buffering=True)

MODEL = "lyria-3.5"
CHECK_MODEL = "gemini-3.8-flash"
OUT = gemini.ROOT / "public" / "music"
TRIES = 3

COMMON = "Instrumental only, absolutely no vocals or singing. Loops well, no long intro, no fade-out ending."
TRACKS = {
    "menu": f"""Chill, slightly mysterious lo-fi synth groove for the main menu of a sci-fi delivery video game,
92 BPM, warm analog pads, soft tabla groove, playful plucked sitar-like synth melody, a little funny swagger.
{COMMON}""",
    "space": f"""Driving synthwave chase music for a sci-fi endless runner set in a neon space station, 120 BPM,
pumping bassline, bright arpeggiated synths, punchy electronic drums layered with fast tabla rolls, a sitar-like
synth lead hook, energetic and playful. {COMMON}""",
    "water": f"""Electronic underwater chase soundtrack for a sci-fi video game set deep in a glowing coral ocean,
108 BPM. Deep pulsing synth bass, watery bubbly synth plucks and santoor-like arpeggios drenched in reverb, dreamy
aquatic pads, filtered electronic drums with muffled tabla. Tense, mysterious and slightly playful. No guitars, no
folk instruments. {COMMON}""",
}


def generate(prompt):
    response = gemini.request(f"models/{MODEL}:generateContent", {"contents": [{"parts": [{"text": prompt}]}]})
    return gemini.inline_data(response)


def check(path, brief):
    """Ask a text model to listen: returns (has_vocals, fits the brief, short description)."""
    audio = base64.b64encode(path.read_bytes()).decode()
    response = gemini.request(f"models/{CHECK_MODEL}:generateContent", {
        "contents": [{"parts": [
            {"inlineData": {"mimeType": "audio/mpeg", "data": audio}},
            {"text": "Listen to this music. Does it contain any human vocals, singing or spoken words? "
                     f"Does it clearly fit this brief: {brief!r}? "
                     "Also describe it in one short sentence (genre, instruments, mood)."},
        ]}],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseSchema": {"type": "OBJECT", "properties": {
                "has_vocals": {"type": "BOOLEAN"}, "fits_brief": {"type": "BOOLEAN"},
                "description": {"type": "STRING"},
            }, "required": ["has_vocals", "fits_brief", "description"]},
        },
    })
    result = json.loads(response["candidates"][0]["content"]["parts"][0]["text"])
    return result["has_vocals"], result["fits_brief"], result["description"]


def encode(data, path):
    """Re-encode to a web-friendly mp3 with a short fade at each end, so the loop seam is soft."""
    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as raw:
        raw.write(data)
    try:
        duration = float(subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", raw.name],
            capture_output=True, text=True, check=True).stdout)
        subprocess.run([
            "ffmpeg", "-y", "-loglevel", "error", "-i", raw.name,
            "-af", f"afade=t=in:d=0.5,afade=t=out:st={duration - 2.5:.2f}:d=2.5,loudnorm=I=-18:TP=-2",
            "-ar", "44100", "-b:a", "96k", str(path),
        ], check=True)
    finally:
        Path(raw.name).unlink(missing_ok=True)
    return duration


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("names", nargs="*")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)

    for name in args.names or TRACKS:
        path = OUT / f"{name}.mp3"
        if not (args.names or args.force) and path.exists():
            continue
        prompt = " ".join(TRACKS[name].split())
        for attempt in range(TRIES):
            print(f"{name}: generating (try {attempt + 1})")
            _, data = generate(prompt)
            duration = encode(data, path)
            vocals, fits, description = check(path, prompt)
            print(f"  {duration:.0f}s, vocals: {vocals}, fits brief: {fits} — {description}")
            if not vocals and fits:
                break
        else:
            print(f"  WARNING: no clean take of {name} after {TRIES} tries; kept the last one")
    print("done:", sorted(p.name for p in OUT.glob("*.mp3")))


if __name__ == "__main__":
    main()
