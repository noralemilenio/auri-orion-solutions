#!/usr/bin/env python3
"""Compara una carpeta con un manifiesto SHA-256 sin modificar sus archivos."""
import argparse
import hashlib
import json
from pathlib import Path

def inventory(root):
    entries = {}
    for path in sorted(root.rglob("*")):
        if path.is_symlink() or not path.is_file():
            continue
        relative = path.relative_to(root).as_posix()
        if relative == ".auri-integrity.json":
            continue
        h = hashlib.sha256()
        with path.open("rb") as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                h.update(chunk)
        entries[relative] = h.hexdigest()
    return entries

def main():
    p = argparse.ArgumentParser(description="Detecta archivos añadidos, cambiados o eliminados.")
    p.add_argument("folder", type=Path)
    p.add_argument("--init", action="store_true", help="Crea el manifiesto inicial.")
    args = p.parse_args()
    root = args.folder.resolve()
    if not root.is_dir():
        p.error("La carpeta no existe.")
    manifest = root / ".auri-integrity.json"
    current = inventory(root)
    if args.init:
        if manifest.exists():
            p.error("El manifiesto ya existe: no se sobrescribe.")
        manifest.write_text(json.dumps(current, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"BASELINE_OK archivos={len(current)}")
        return 0
    if not manifest.is_file():
        p.error("Falta el manifiesto. Ejecuta primero --init.")
    old = json.loads(manifest.read_text(encoding="utf-8"))
    added = sorted(current.keys() - old.keys())
    removed = sorted(old.keys() - current.keys())
    changed = sorted(k for k in current.keys() & old.keys() if current[k] != old[k])
    for label, files in (("NUEVO", added), ("CAMBIADO", changed), ("ELIMINADO", removed)):
        for name in files:
            print(f"{label}: {name}")
    print(f"RESUMEN nuevos={len(added)} cambiados={len(changed)} eliminados={len(removed)}")
    return 1 if added or changed or removed else 0

if __name__ == "__main__":
    raise SystemExit(main())
