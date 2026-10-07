#!/usr/bin/env python3
import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile
import urllib.request
from pathlib import Path

SUPPORTED={".pdf",".png",".jpg",".jpeg",".tif",".tiff"}

def run(cmd):
    return subprocess.run(cmd, check=True, capture_output=True, text=True).stdout

def sha256(path):
    h=hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda:f.read(1024*1024), b""):
            h.update(chunk)
    return h.hexdigest()

def extract_text(path):
    if path.suffix.lower()==".pdf":
        with tempfile.TemporaryDirectory() as td:
            ocr=Path(td)/"ocr.pdf"
            subprocess.run(
                ["ocrmypdf","--skip-text","--deskew",str(path),str(ocr)],
                check=True, capture_output=True
            )
            return run(["pdftotext",str(ocr),"-"])
    return run(["tesseract",str(path),"stdout","-l","spa+eng"])

def classify(text, model):
    prompt=f"""Devuelve SOLO JSON válido con estas claves:
type: tipo breve del documento en español,
date: fecha ISO YYYY-MM-DD o null si no está explícita,
entity: entidad/persona/empresa principal o null,
confidence: número 0..1.

No inventes datos. Texto:
{text[:12000]}
"""
    body=json.dumps({"model":model,"prompt":prompt,"stream":False}).encode()
    req=urllib.request.Request(
        "http://127.0.0.1:11434/api/generate",
        data=body,
        headers={"Content-Type":"application/json"}
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        response=json.loads(r.read().decode())["response"].strip()
    fence=chr(96)*3
    response=response.replace(fence+"json","").replace(fence,"").strip()
    return json.loads(response)

def slug(value, fallback):
    if not value:
        return fallback
    s=value.lower().strip()
    s=re.sub(r"[^a-z0-9áéíóúüñ]+","-",s,flags=re.I)
    return s.strip("-")[:60] or fallback

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("inbox",type=Path)
    ap.add_argument("archive",type=Path)
    ap.add_argument("--apply",action="store_true")
    ap.add_argument("--model",default=os.getenv("OLLAMA_MODEL",""))
    ap.add_argument("--log",type=Path,default=Path("decisions.jsonl"))
    args=ap.parse_args()
    if not args.model:
        raise SystemExit("Define OLLAMA_MODEL o usa --model.")

    args.archive.mkdir(parents=True,exist_ok=True)
    for path in sorted(args.inbox.iterdir()):
        if not path.is_file() or path.suffix.lower() not in SUPPORTED:
            continue
        try:
            text=extract_text(path)
            meta=classify(text,args.model)
            date=meta.get("date") or "sin-fecha"
            kind=slug(meta.get("type"),"documento")
            entity=slug(meta.get("entity"),"sin-entidad")
            new_name=f"{date}__{kind}__{entity}{path.suffix.lower()}"
            dest=args.archive/new_name
            event={
                "source":str(path),
                "sha256":sha256(path),
                "proposal":str(dest),
                "classification":meta,
                "applied":False,
            }
            if args.apply:
                if dest.exists():
                    raise FileExistsError(f"Destino ya existe: {dest}")
                shutil.copy2(path,dest)
                event["applied"]=True
            print(json.dumps(event,ensure_ascii=False))
            with args.log.open("a",encoding="utf-8") as f:
                f.write(json.dumps(event,ensure_ascii=False)+"\n")
        except Exception as exc:
            print(json.dumps({"source":str(path),"error":str(exc)},ensure_ascii=False))

if __name__=="__main__":
    main()
