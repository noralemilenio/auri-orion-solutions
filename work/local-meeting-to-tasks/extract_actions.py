#!/usr/bin/env python3
import argparse
import json
import os
import urllib.request
from pathlib import Path

def query_ollama(text,model):
    prompt=f"""Analiza la transcripción y devuelve SOLO JSON válido:
{{
  "decisions": ["decisiones explícitas"],
  "actions": [
    {{
      "task": "acción concreta",
      "owner": "responsable explícito o null",
      "due_date": "YYYY-MM-DD si se dijo explícitamente o null",
      "evidence": "frase breve de la transcripción que lo justifica",
      "confidence": 0.0
    }}
  ],
  "open_questions": ["dudas o puntos sin resolver"]
}}

No inventes responsables, fechas ni decisiones. Si algo es ambiguo, déjalo como pregunta abierta.

TRANSCRIPCIÓN:
{text[:20000]}
"""
    payload=json.dumps({"model":model,"prompt":prompt,"stream":False}).encode()
    req=urllib.request.Request(
        "http://127.0.0.1:11434/api/generate",
        data=payload,
        headers={"Content-Type":"application/json"}
    )
    with urllib.request.urlopen(req,timeout=120) as r:
        raw=json.loads(r.read().decode())["response"].strip()
    fence=chr(96)*3
    raw=raw.replace(fence+"json","").replace(fence,"").strip()
    return json.loads(raw)

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("transcript",type=Path)
    ap.add_argument("--model",default=os.getenv("OLLAMA_MODEL",""))
    ap.add_argument("--output",type=Path)
    args=ap.parse_args()
    if not args.model:
        raise SystemExit("Define OLLAMA_MODEL o usa --model.")
    data=query_ollama(args.transcript.read_text(encoding="utf-8"),args.model)
    rendered=json.dumps(data,ensure_ascii=False,indent=2)
    print(rendered)
    if args.output:
        args.output.write_text(rendered+"\n",encoding="utf-8")

if __name__=="__main__":
    main()
