"""Renders the brief's demo script to 16 kHz mono WAV files with macOS `say`.
Used by the "Demo voice" setting to stream a recorded script instead of the mic.
    python3 scripts/make-demo-audio.py
"""
import os, struct, subprocess, tempfile, wave

ROUNDS = {
    "round1": ["I arrived at 11am.", "No, scrap that.", "It was 10am.",
               "Used twelve meters of cable and forty screws.",
               "Actually, make the cable fifteen meters.", "Forget the screws."],
    "round2": ["Set priority to high.", "Tag this as warranty and follow up.", "Remove the follow up tag."],
}
RATE, GAP = 16000, 2.2

for name, lines in ROUNDS.items():
    pcm = b"\0\0" * int(RATE * 0.5)
    with tempfile.TemporaryDirectory() as tmp:
        for i, text in enumerate(lines):
            path = os.path.join(tmp, f"{i}.wav")
            subprocess.run(["say", "-v", "Samantha", "-r", "170", "-o", path,
                            "--file-format=WAVE", f"--data-format=LEI16@{RATE}", text], check=True)
            with wave.open(path) as w:
                pcm += w.readframes(w.getnframes())
            pcm += b"\0\0" * int(RATE * GAP)
    out = os.path.join(os.path.dirname(__file__), "..", "assets", "demo", f"{name}.wav")
    with wave.open(out, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE); w.writeframes(pcm)
    print(out, round(len(pcm) / 2 / RATE, 1), "s")
