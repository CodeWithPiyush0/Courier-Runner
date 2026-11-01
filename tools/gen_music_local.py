"""Compose the soundtrack locally: synthesized Bihar folk-pop loops, no API needed.

A stand-in for gen_music.py (Lyria) while the Gemini project is over its spend
cap. Every instrument is synthesized with numpy (dhol, dholak, chimta, a plucked
tumbi, harmonium, brass, shehnai, bansuri) and the arrangement is written out
below as patterns, so a track can be tweaked and re-rendered in seconds.
Each track wraps its echo tail onto its start, so it loops without a seam.

    python tools/gen_music_local.py            # menu, road and tunnel
    python tools/gen_music_local.py road       # just one
"""
import argparse
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "music"
SR = 44100
rng = np.random.default_rng(7)

NOTES = {"C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5, "F#": 6, "Gb": 6,
         "G": 7, "G#": 8, "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11}


def hz(name):
    """'F#4' -> frequency."""
    return 440.0 * 2 ** ((NOTES[name[:-1]] + 12 * (int(name[-1]) + 1) - 69) / 12)


def env(n, attack, decay):
    t = np.arange(n) / SR
    return np.minimum(1, t / max(attack, 1e-4)) * np.exp(-t / decay)


def glide_sine(n, f0, f1, glide):
    t = np.arange(n) / SR
    f = f1 + (f0 - f1) * np.exp(-t / glide)
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


def noise(n):
    return rng.standard_normal(n)


def highpass(x, amount=0.95):
    """Crude one-pole high-pass (removes the low end of noise)."""
    y = np.empty_like(x)
    prev_x = prev_y = 0.0
    for i, v in enumerate(x):
        prev_y = amount * (prev_y + v - prev_x)
        prev_x = v
        y[i] = prev_y
    return y


def lowpass(x, k):
    """One-pole low-pass via an exponential kernel (k: 0..1, higher = darker)."""
    kernel = (1 - k) * k ** np.arange(int(np.log(0.001) / np.log(k)) + 1)
    return np.convolve(x, kernel)[:len(x)]


# --- instruments: each returns a mono buffer --------------------------------------------------------

def dhol_bass(vel=1.0):
    n = int(0.45 * SR)
    body = glide_sine(n, 120, 58, 0.03) * env(n, 0.002, 0.18)
    thump = lowpass(noise(n), 0.9) * env(n, 0.001, 0.02) * 2
    return vel * (body + thump * 0.5)


def dhol_tilli(vel=1.0):
    n = int(0.12 * SR)
    crack = highpass(noise(n), 0.8) * env(n, 0.0005, 0.018)
    ring = glide_sine(n, 720, 560, 0.01) * env(n, 0.001, 0.04)
    return vel * (crack * 0.6 + ring * 0.5)


def dholak_ge(vel=1.0):
    n = int(0.35 * SR)
    return vel * glide_sine(n, 150, 95, 0.06) * env(n, 0.002, 0.14)


def dholak_na(vel=1.0):
    n = int(0.15 * SR)
    return vel * (np.sin(2 * np.pi * 540 * np.arange(n) / SR) * env(n, 0.001, 0.05)
                  + highpass(noise(n), 0.85) * env(n, 0.0005, 0.012) * 0.4)


def chimta(vel=1.0):
    n = int(0.16 * SR)
    t = np.arange(n) / SR
    bells = sum(np.sin(2 * np.pi * f * t + p) for f, p in ((3150, 0), (4730, 1), (6280, 2), (7910, 3)))
    return vel * 0.18 * (bells * env(n, 0.0005, 0.05) + highpass(noise(n), 0.7) * env(n, 0.0005, 0.02))


def drip(vel=1.0):
    n = int(0.18 * SR)
    return vel * 0.35 * glide_sine(n, 1900, 700, 0.02) * env(n, 0.001, 0.05)


def pluck(freq, length, bright=0.5, vel=1.0):
    """Karplus-Strong string (tumbi / banjo-ish), computed a period at a time."""
    n = int(length * SR)
    p = max(2, int(SR / freq))
    y = np.zeros(n + p + 1)
    burst = noise(p)
    y[:p] = burst - burst.mean()
    decay = 0.996 - (1 - bright) * 0.01
    for start in range(p, n + 1, p):
        prev = y[start - p:start + 1]
        y[start:start + p] = decay * (bright * prev[1:] + (1 - bright) * 0.5 * (prev[1:] + prev[:-1]))[:len(y[start:start + p])]
    return vel * 0.6 * y[p:p + n] * env(n, 0.002, length)


def reed(freq, length, harmonics, vib=0.0, attack=0.05, release=0.1, slide_from=None, vel=1.0):
    """Additive reed/horn tone. harmonics: amplitude per partial."""
    n = int(length * SR)
    t = np.arange(n) / SR
    f = np.full(n, freq)
    if slide_from:  # meend: slide up/down into the note
        f = freq + (slide_from - freq) * np.exp(-t / 0.05)
    f = f * (1 + vib * np.sin(2 * np.pi * 5.5 * t) * np.minimum(1, t / 0.25))
    phase = 2 * np.pi * np.cumsum(f) / SR
    tone = sum(a * np.sin(k * phase) for k, a in enumerate(harmonics, 1))
    shape = np.minimum(1, t / attack) * np.minimum(1, (length - t) / release).clip(0)
    return vel * tone * shape


def harmonium(freqs, length, vel=1.0):
    parts = [0.6, 0.5, 0.35, 0.3, 0.2, 0.15, 0.1, 0.08]
    return vel * 0.22 * sum(reed(f, length, parts, attack=0.06, release=0.12) + reed(f * 1.003, length, parts, attack=0.06, release=0.12)
                            for f in freqs)


def shehnai(freq, length, slide_from=None, vel=1.0):
    return vel * 0.28 * reed(freq, length, [0.4, 0.8, 0.7, 0.5, 0.45, 0.3, 0.2, 0.15, 0.1],
                             vib=0.012, attack=0.03, release=0.05, slide_from=slide_from)


def bansuri(freq, length, slide_from=None, vel=1.0):
    n = int(length * SR)
    tone = reed(freq, length, [1, 0.15, 0.05], vib=0.008, attack=0.08, release=0.15, slide_from=slide_from)
    breath = lowpass(noise(n), 0.6) * 0.05 * np.minimum(1, np.arange(n) / SR / 0.08)
    return vel * 0.4 * (tone + breath)


def brass(freqs, length, vel=1.0):
    parts = [1, 0.8, 0.6, 0.45, 0.3, 0.2, 0.12]
    return vel * 0.14 * sum(reed(f, length, parts, attack=0.015, release=0.06, vib=0.004) for f in freqs)


def bass(freq, length, slide_from=None, vel=1.0):
    n = int(length * SR)
    t = np.arange(n) / SR
    tone = np.sin(2 * np.pi * freq * t) + 0.3 * np.sin(4 * np.pi * freq * t)
    return vel * 0.5 * tone * env(n, 0.005, length * 0.7) * np.minimum(1, (length - t) / 0.03).clip(0)


def drone(freqs, length):
    n = int(length * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for f in freqs:
        for k, a in enumerate([1, 0.5, 0.35, 0.25, 0.15], 1):
            out += a * np.sin(2 * np.pi * f * k * t + rng.random() * 6) * (0.75 + 0.25 * np.sin(2 * np.pi * 0.11 * k * t))
    return 0.05 * out


# --- arranging ---------------------------------------------------------------------------------------

class Track:
    def __init__(self, bpm, bars):
        self.step = 60 / bpm / 4  # one 16th note, seconds
        self.length = bars * 16 * self.step
        n = int(self.length * SR) + 6 * SR  # room for tails, wrapped later
        self.dry = np.zeros((n, 2))
        self.wet = np.zeros(n)  # reverb send (mono)

    def put(self, sound, step, pan=0.0, send=0.15, gain=1.0):
        start = int(step * self.step * SR)
        sound = sound * gain
        end = min(len(self.dry), start + len(sound))
        sound = sound[:end - start]
        self.dry[start:end, 0] += sound * np.cos((pan + 1) * np.pi / 4)
        self.dry[start:end, 1] += sound * np.sin((pan + 1) * np.pi / 4)
        self.wet[start:end] += sound * send

    def rhythm(self, pattern, make, bar, pan=0.0, send=0.1, gain=1.0, swing=0.0):
        """pattern: 16 chars per bar; X = accent, x = soft, . = rest."""
        for i, c in enumerate(pattern.replace(" ", "")):
            if c in "Xx":
                self.put(make(1.0 if c == "X" else 0.55), bar * 16 + i + (swing if i % 2 else 0), pan, send, gain)

    def melody(self, line, play, bar, steps_per_token=2, pan=0.0, send=0.25, gain=1.0):
        """line: space-separated notes, one per token (an 8th by default); '-' holds, '.' rests.
        A note written 'A4~' slides into its pitch from a step below (meend)."""
        tokens = line.split()
        i = 0
        while i < len(tokens):
            tok = tokens[i]
            hold = 1
            while i + hold < len(tokens) and tokens[i + hold] == "-":
                hold += 1
            if tok not in ".-":
                slide = tok.endswith("~")
                f = hz(tok.rstrip("~"))
                self.put(play(f, hold * steps_per_token * self.step * 0.95, f * 0.89 if slide else None),
                         bar * 16 + i * steps_per_token, pan, send, gain)
            i += hold

    def render(self, reverb=1.6, wet_gain=0.35):
        n = len(self.wet)
        ir_n = int(reverb * SR)
        ir = noise(ir_n) * np.exp(-np.arange(ir_n) / SR / (reverb / 5))
        size = 1 << int(np.ceil(np.log2(n + ir_n)))
        tail = np.fft.irfft(np.fft.rfft(self.wet, size) * np.fft.rfft(ir, size), size)[:n]
        tail = lowpass(tail, 0.5) / np.abs(ir).sum() * 40
        mix = self.dry + wet_gain * np.stack([tail, np.roll(tail, 900)], axis=1)
        loop = int(self.length * SR)
        out = mix[:loop].copy()
        rest = mix[loop:]
        out[:len(rest)] += rest[:loop]  # wrap tails so the loop is seamless
        out /= np.percentile(np.abs(out), 99.9) * 1.1
        return np.tanh(out * 1.3) * 0.9


def chord(names):
    return [hz(n) for n in names.split()]


def road():
    """Upbeat chase: dhol chaal, tumbi riff, wedding-band brass, shehnai hook. D major, 124 BPM."""
    tr = Track(124, 32)
    prog = ["D3 F#3 A3", "D3 F#3 A3", "G3 B3 D4", "A3 C#4 E4", "D3 F#3 A3", "B2 D3 F#3", "G3 B3 D4", "A3 C#4 E4"]
    roots = ["D2", "D2", "G2", "A2", "D2", "B1", "G2", "A2"]
    riff = ["D5 . F#5 A5 B5 A5 F#5 E5", "D5 . F#5 A5 D6 B5 A5 F#5", "G5 . B5 D6 B5 A5 G5 E5", "A5 . C#6 E6 C#6 B5 A5 E5"]
    hook = ["A4~ - B4 A4 F#4 - E4 -", "D4 - E4 F#4 A4 - - -", "B4~ - D5 B4 A4 - G4 -", "E4 F#4 E4 D4 C#4 - . ."]
    for bar in range(32):
        part = "intro" if bar < 2 else "A" if bar < 10 else "B" if bar < 18 else "A" if bar < 26 else "break" if bar < 28 else "build"
        c = bar % 8
        if part != "break":
            tr.rhythm("X..x..X.X..x..X.", dhol_bass, bar, gain=0.9, send=0.05)
        tr.rhythm("..X..X.x..X..XxX" if part in ("A", "B") else "..X...X...X...X.", dhol_tilli, bar, pan=0.2, gain=0.5, swing=0.12)
        if part != "intro":
            tr.rhythm("xxXxxxXxxxXxxxXx", chimta, bar, pan=-0.4, gain=0.6, swing=0.12)
        if part in ("A", "B", "build"):
            tr.melody(f"{roots[c]} . {roots[c]} - . {roots[c]} . -", bass, bar, gain=0.8, send=0.0)
        if part == "A":
            tr.melody(riff[c % 4], lambda f, l, s: pluck(f, 0.35, 0.6), bar, pan=0.3, gain=0.7)
            if c in (3, 7):
                tr.put(brass(chord(prog[c]), 0.18), bar * 16 + 12, gain=0.9)
                tr.put(brass(chord(prog[c]), 0.18), bar * 16 + 14, gain=0.9)
        if part == "B":
            tr.melody(hook[c % 4], shehnai, bar, pan=-0.1, send=0.3, gain=0.8)
            tr.put(harmonium(chord(prog[c]), 16 * tr.step), bar * 16, pan=0.3, gain=0.5)
            for s in (2, 6, 10, 14):
                tr.put(brass(chord(prog[c]), 0.12), bar * 16 + s, pan=0.25, gain=0.45)
        if part == "break":
            tr.rhythm("X...X...X...X...", dholak_ge, bar, gain=0.8)
            tr.melody(riff[c % 4], lambda f, l, s: pluck(f, 0.45, 0.6), bar, pan=0.3, gain=0.6, send=0.4)
        if part == "build":
            tr.rhythm("X.X.X.X.XXXXXXXX", dhol_tilli, bar, gain=0.5)
            tr.put(brass(chord(prog[c]), 0.6), bar * 16 + 12, gain=0.8)
    return tr.render(reverb=1.2, wet_gain=0.25)


def tunnel():
    """Dark drain tunnel: drone, dub bass, echoing tabla, drips, sneaky bansuri. A phrygian, 104 BPM."""
    tr = Track(104, 24)
    sneak = ["A3 . C4 . Bb3 . A3 .", "A3 . C4 D4 E4 . D4 .", "F3 . A3 . G3 . F3 .", "E3 . G3 Bb3 A3 . . ."]
    flute = ["E5~ - - - F5 E5 D5 -", "C5 - Bb4 - A4 - - -", "D5~ - - - E5 F5 E5 D5", "C5 Bb4 A4 - - - . ."]
    for bar in range(24):
        c = bar % 4
        if bar % 4 == 0:
            tr.put(drone(chord("A1 E2"), 64 * tr.step + 1.0), bar * 16, send=0.2, gain=0.8)
        tr.rhythm("X......x..X.....", dholak_ge, bar, gain=0.9, send=0.3)
        tr.rhythm("....X.......X..x", dholak_na, bar, pan=0.3, gain=0.5, send=0.45)
        tr.rhythm("..x...x...x...xx" if bar >= 4 else "................", dhol_tilli, bar, pan=-0.3, gain=0.25, send=0.4, swing=0.1)
        for _ in range(2):
            tr.put(drip(0.5 + rng.random() * 0.5), bar * 16 + rng.integers(0, 16), pan=rng.uniform(-0.8, 0.8), send=0.7, gain=0.6)
        tr.melody(["A1 - - - . . A1 . . . A1 - . . G1 .", "A1 - - - . . A1 . . . C2 - . . Bb1 .",
                   "F1 - - - . . F1 . . . A1 - . . G1 .", "E1 - - - . . E1 . . . G1 - Bb1 - A1 ."][c],
                  bass, bar, steps_per_token=1, gain=1.0, send=0.05)
        if bar >= 4:
            tr.melody(sneak[c], lambda f, l, s: pluck(f, 0.3, 0.3), bar, pan=0.35, gain=0.6, send=0.5)
        if 8 <= bar < 16 or bar >= 20:
            tr.melody(flute[c], bansuri, bar, pan=-0.2, gain=0.8, send=0.6)
    return tr.render(reverb=2.6, wet_gain=0.6)


def menu():
    """Title screen: relaxed dholak groove, harmonium, playful shehnai. G major, 96 BPM."""
    tr = Track(96, 16)
    prog = ["G3 B3 D4", "C4 E4 G4", "D4 F#4 A4", "G3 B3 D4", "E3 G3 B3", "C4 E4 G4", "D4 F#4 A4", "D4 F#4 A4"]
    roots = ["G2", "C3", "D3", "G2", "E2", "C3", "D2", "D2"]
    tune = ["D5~ - B4 D5 E5 D5 B4 -", "C5 - E5 - D5 C5 B4 -", "A4 B4 C5 A4 D5 - - -", "B4 A4 G4 - . . G4 A4",
            "B4~ - G4 B4 D5 - E5 -", "E5 D5 C5 - G5 - E5 -", "D5 - F#5~ - E5 D5 C5 A4", "G4 - - - . . . ."]
    for bar in range(16):
        c = bar % 8
        tr.rhythm("X..x..X.x.X..x..", dholak_ge, bar, gain=0.8, send=0.1, swing=0.1)
        tr.rhythm("..X.X..X..X.X..X", dholak_na, bar, pan=0.25, gain=0.45, swing=0.1)
        tr.rhythm("x.x.x.x.x.x.x.x.", chimta, bar, pan=-0.35, gain=0.35, swing=0.1)
        tr.put(harmonium(chord(prog[c]), 16 * tr.step), bar * 16, pan=0.2, gain=0.55, send=0.2)
        tr.melody(f"{roots[c]} - . {roots[c]} . . {roots[c]} .", bass, bar, gain=0.7, send=0.0)
        if bar >= 2:
            tr.melody(tune[c], shehnai if bar < 10 else lambda f, l, s: pluck(f, 0.4, 0.55),
                      bar, pan=-0.1, gain=0.75 if bar < 10 else 0.7, send=0.3)
    return tr.render(reverb=1.5, wet_gain=0.3)


TRACKS = {"menu": menu, "road": road, "tunnel": tunnel}


def save(name, audio):
    pcm = (audio * 32767).astype(np.int16)
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        with wave.open(tmp.name, "wb") as w:
            w.setnchannels(2)
            w.setsampwidth(2)
            w.setframerate(SR)
            w.writeframes(pcm.tobytes())
    try:
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", tmp.name, "-af", "loudnorm=I=-15:TP=-1.5", "-ar", str(SR), "-b:a", "160k",
                        str(OUT / f"{name}.mp3")], check=True)
    finally:
        Path(tmp.name).unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("names", nargs="*", choices=[[], *TRACKS], default=[])
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    for name in args.names or TRACKS:
        audio = TRACKS[name]()
        save(name, audio)
        print(f"{name}: {len(audio) / SR:.0f} s")


if __name__ == "__main__":
    main()
