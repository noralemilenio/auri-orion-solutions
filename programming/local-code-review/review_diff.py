#!/usr/bin/env python3
import argparse
import json
import os
import subprocess
import urllib.parse
import urllib.request

DEFAULT_URL = "http://127.0.0.1:11434"
MAX_CHARS = 40000

def git_diff(worktree: bool) -> str:
    cmd = ["git", "diff", "--no-ext-diff", "--unified=3"]
    if not worktree:
        cmd.append("--cached")
    proc = subprocess.run(cmd, check=True, capture_output=True, text=True)
    return proc.stdout

def ensure_local(url: str, allow_remote: bool) -> None:
    host = urllib.parse.urlparse(url).hostname
    if not allow_remote and host not in {"127.0.0.1", "localhost", "::1"}:
        raise SystemExit(
            f"Por seguridad se rechaza el endpoint remoto {host!r}. "
            "Usa --allow-remote solo si realmente quieres enviar el diff fuera del equipo."
        )

def review(diff: str, model: str, url: str) -> str:
    prompt = f"""Actúa como revisor técnico. Revisa este git diff y responde en español.

Prioriza:
1. errores o regresiones probables;
2. problemas de seguridad o exposición de secretos;
3. datos que podrían perderse;
4. problemas de concurrencia/idempotencia;
5. mantenibilidad importante.

No inventes contexto fuera del diff. Separa:
- Crítico
- Importante
- Mejora
- Sin hallazgos relevantes

DIFF:
{diff[:MAX_CHARS]}
"""
    payload = json.dumps(
        {"model": model, "prompt": prompt, "stream": False}
    ).encode()
    req = urllib.request.Request(
        url.rstrip("/") + "/api/generate",
        data=payload,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=180) as res:
        return json.loads(res.read().decode())["response"].strip()

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--worktree", action="store_true",
                    help="revisa cambios sin preparar en lugar del staging area")
    ap.add_argument("--dry-run", action="store_true",
                    help="muestra metadatos del diff sin llamar al modelo")
    ap.add_argument("--url", default=os.getenv("OLLAMA_URL", DEFAULT_URL))
    ap.add_argument("--model", default=os.getenv("OLLAMA_MODEL", ""))
    ap.add_argument("--allow-remote", action="store_true")
    args = ap.parse_args()

    ensure_local(args.url, args.allow_remote)
    diff = git_diff(args.worktree)
    if not diff.strip():
        raise SystemExit("No hay cambios que revisar.")

    print(f"Diff: {len(diff)} caracteres; se enviarán como máximo {MAX_CHARS}.")
    if args.dry_run:
        return
    if not args.model:
        raise SystemExit("Define OLLAMA_MODEL o usa --model.")
    print(review(diff, args.model, args.url))

if __name__ == "__main__":
    main()
