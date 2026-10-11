#!/usr/bin/env python3
import argparse
import json
import os
from pathlib import Path
import fitz
from common import embed

def chunks(text, size=1600, overlap=250):
    text = " ".join(text.split())
    if not text:
        return
    pos = 0
    while pos < len(text):
        yield text[pos:pos+size]
        if pos + size >= len(text):
            break
        pos += size - overlap

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf_dir", type=Path)
    ap.add_argument("output", type=Path)
    ap.add_argument("--embed-model", default=os.getenv("OLLAMA_EMBED_MODEL", ""))
    args = ap.parse_args()
    if not args.embed_model:
        raise SystemExit("Define OLLAMA_EMBED_MODEL o usa --embed-model.")

    rows = []
    for pdf in sorted(args.pdf_dir.glob("*.pdf")):
        doc = fitz.open(pdf)
        for page_no, page in enumerate(doc, 1):
            for n, chunk in enumerate(chunks(page.get_text()), 1):
                ref = f"{pdf.name}#p{page_no}"
                rows.append({
                    "ref": ref,
                    "chunk": n,
                    "text": chunk,
                    "embedding": embed(chunk, args.embed_model),
                })
                print(f"Indexado {ref} chunk {n}")
    args.output.write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
    print(f"Índice: {args.output} ({len(rows)} fragmentos)")

if __name__ == "__main__":
    main()
