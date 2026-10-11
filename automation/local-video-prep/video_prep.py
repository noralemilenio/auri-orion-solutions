#!/usr/bin/env python3
import argparse
import shutil
import subprocess
from pathlib import Path

def stamp(seconds: float) -> str:
    ms = round(seconds * 1000)
    h, ms = divmod(ms, 3600000)
    m, ms = divmod(ms, 60000)
    s, ms = divmod(ms, 1000)
    return f"{h:02}:{m:02}:{s:02},{ms:03}"

def write_srt(segments, out: Path) -> None:
    with out.open("w", encoding="utf-8") as f:
        for i, seg in enumerate(segments, 1):
            text = seg.text.strip()
            if not text:
                continue
            f.write(f"{i}\n{stamp(seg.start)} --> {stamp(seg.end)}\n{text}\n\n")

def burn(video: Path, srt: Path, output: Path) -> None:
    if not shutil.which("ffmpeg"):
        raise SystemExit("No encuentro ffmpeg en PATH.")
    escaped = str(srt).replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'")
    cmd = [
        "ffmpeg", "-y", "-i", str(video),
        "-vf", f"subtitles='{escaped}'",
        "-c:a", "copy", str(output),
    ]
    subprocess.run(cmd, check=True)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video", type=Path)
    ap.add_argument("output_dir", type=Path)
    ap.add_argument("--model", default="small")
    ap.add_argument("--language")
    ap.add_argument("--burn", action="store_true")
    args = ap.parse_args()

    if not args.video.is_file():
        raise SystemExit(f"No existe: {args.video}")
    args.output_dir.mkdir(parents=True, exist_ok=True)

    from faster_whisper import WhisperModel
    model = WhisperModel(args.model, device="auto", compute_type="auto")
    segments, info = model.transcribe(
        str(args.video),
        language=args.language,
        vad_filter=True,
    )
    segments = list(segments)

    srt = args.output_dir / (args.video.stem + ".srt")
    write_srt(segments, srt)
    print(f"SRT: {srt}")
    print(f"Idioma detectado: {getattr(info, 'language', 'desconocido')}")

    if args.burn:
        out = args.output_dir / (args.video.stem + "-subtitulado.mp4")
        burn(args.video, srt, out)
        print(f"Vídeo: {out}")

if __name__ == "__main__":
    main()
