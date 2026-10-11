#!/usr/bin/env python3
import argparse
import json
import os
from pathlib import Path
from common import cosine, embed, post

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("index", type=Path)
    ap.add_argument("question")
    ap.add_argument("--embed-model", default=os.getenv("OLLAMA_EMBED_MODEL", ""))
    ap.add_argument("--model", default=os.getenv("OLLAMA_MODEL", ""))
    ap.add_argument("--top-k", type=int, default=5)
    args = ap.parse_args()
    if not args.embed_model or not args.model:
        raise SystemExit("Define OLLAMA_EMBED_MODEL y OLLAMA_MODEL.")

    rows = json.loads(args.index.read_text(encoding="utf-8"))
    qv = embed(args.question, args.embed_model)
    ranked = sorted(
        rows, key=lambda r: cosine(qv, r["embedding"]), reverse=True
    )[:args.top_k]

    context = "\n\n".join(
        f"[{r['ref']}]\n{r['text']}" for r in ranked
    )
    prompt = f"""Responde en español usando SOLO el contexto.
Cita cada afirmación relevante con la referencia exacta [archivo.pdf#pN].
Si la respuesta no está suficientemente respaldada, di que no hay evidencia suficiente.

PREGUNTA:
{args.question}

CONTEXTO:
{context}
"""
    data = post("/api/generate", {
        "model": args.model,
        "prompt": prompt,
        "stream": False,
    })
    print(data["response"].strip())

if __name__ == "__main__":
    main()
