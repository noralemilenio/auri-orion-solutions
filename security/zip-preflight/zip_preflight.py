#!/usr/bin/env python3
"""Inspección preventiva de ZIP sin extraer archivos ni ejecutar su contenido."""
from __future__ import annotations

import argparse
import json
import stat
import sys
import zipfile
from pathlib import Path, PureWindowsPath

DEFAULT_MAX_ENTRIES = 2000
DEFAULT_MAX_TOTAL = 1024 * 1024 * 1024
DEFAULT_MAX_FILE = 512 * 1024 * 1024
DEFAULT_MAX_RATIO = 100.0


def inspect_zip(
    path: str | Path,
    *,
    check_crc: bool = False,
    max_entries: int = DEFAULT_MAX_ENTRIES,
    max_total: int = DEFAULT_MAX_TOTAL,
    max_file: int = DEFAULT_MAX_FILE,
    max_ratio: float = DEFAULT_MAX_RATIO,
) -> dict:
    """Devuelve PASS/WARN/ERROR; PASS no significa que el ZIP sea seguro."""
    archive = Path(path)
    result = {
        "archive": str(archive),
        "status": "ERROR",
        "entries": 0,
        "uncompressed_bytes": 0,
        "compressed_bytes": 0,
        "crc": "NOT_REQUESTED",
        "findings": [],
    }
    findings = result["findings"]

    if min(max_entries, max_total, max_file) <= 0 or max_ratio <= 0:
        findings.append({"code": "INVALID_LIMIT", "detail": "Los límites deben ser positivos"})
        return result

    try:
        with zipfile.ZipFile(archive, "r") as zf:
            infos = zf.infolist()
            result["entries"] = len(infos)
            result["uncompressed_bytes"] = sum(i.file_size for i in infos)
            result["compressed_bytes"] = sum(i.compress_size for i in infos)

            def flag(code: str, name: str = "", detail: str = "") -> None:
                findings.append({"code": code, "entry": name, "detail": detail})

            if len(infos) > max_entries:
                flag("TOO_MANY_ENTRIES", detail=f"{len(infos)} > {max_entries}")
            if result["uncompressed_bytes"] > max_total:
                flag("TOTAL_SIZE_LIMIT", detail=f"{result['uncompressed_bytes']} > {max_total}")

            seen: set[str] = set()
            folded: set[str] = set()
            can_crc = len(infos) <= max_entries and result["uncompressed_bytes"] <= max_total

            for info in infos:
                name = info.filename
                normalized = name.casefold()
                if name in seen:
                    flag("DUPLICATE_NAME", name)
                elif normalized in folded:
                    flag("CASE_COLLISION", name)
                seen.add(name)
                folded.add(normalized)

                parts = name.split("/")
                if (not name or name.startswith(("/", "\\")) or PureWindowsPath(name).drive
                        or "\\" in name or any(p in (".", "..") for p in parts)
                        or any(ord(c) < 32 for c in name)):
                    flag("UNSAFE_PATH", name, "Ruta absoluta, ambigua, relativa o con caracteres de control")
                if info.file_size > max_file:
                    flag("FILE_SIZE_LIMIT", name, f"{info.file_size} > {max_file}")
                    can_crc = False
                if info.file_size > 0 and info.file_size / max(1, info.compress_size) > max_ratio:
                    flag("COMPRESSION_RATIO", name, f"ratio > {max_ratio:g}")
                    can_crc = False
                if info.flag_bits & 0x1:
                    flag("ENCRYPTED", name, "No se puede verificar el contenido sin clave")
                    can_crc = False
                mode = (info.external_attr >> 16) & 0o170000
                if info.create_system == 3 and mode == stat.S_IFLNK:
                    flag("SYMLINK", name, "Enlace simbólico: revisar destino antes de extraer")

            if check_crc:
                if not can_crc:
                    result["crc"] = "SKIPPED_LIMIT_OR_ENCRYPTION"
                else:
                    result["crc"] = "CHECKED"
                    for info in infos:
                        if info.is_dir():
                            continue
                        try:
                            # zipfile verifica CRC al llegar al final del flujo.
                            with zf.open(info, "r") as stream:
                                read_bytes = 0
                                while True:
                                    block = stream.read(64 * 1024)
                                    if not block:
                                        break
                                    read_bytes += len(block)
                                    if read_bytes > max_file or read_bytes > info.file_size:
                                        raise ValueError("Límite de lectura excedido")
                        except (zipfile.BadZipFile, RuntimeError, EOFError, ValueError,
                                NotImplementedError, OSError) as exc:
                            flag("CRC_OR_READ_ERROR", info.filename, type(exc).__name__)
                            result["crc"] = "FAILED"
                            break

            result["status"] = "WARN" if findings else "PASS"
    except (FileNotFoundError, PermissionError, IsADirectoryError, zipfile.BadZipFile,
            OSError, ValueError, RuntimeError, EOFError) as exc:
        findings.append({"code": "ARCHIVE_ERROR", "detail": type(exc).__name__})
        result["status"] = "ERROR"
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Inspecciona un ZIP sin extraerlo")
    parser.add_argument("archive", help="Ruta del archivo ZIP")
    parser.add_argument("--json", action="store_true", help="Salida JSON para automatización")
    parser.add_argument("--check-crc", action="store_true", help="Lee los miembros para comprobar CRC, con límites")
    parser.add_argument("--max-entries", type=int, default=DEFAULT_MAX_ENTRIES)
    parser.add_argument("--max-total-mib", type=int, default=1024)
    parser.add_argument("--max-file-mib", type=int, default=512)
    parser.add_argument("--max-ratio", type=float, default=DEFAULT_MAX_RATIO)
    args = parser.parse_args(argv)
    report = inspect_zip(
        args.archive, check_crc=args.check_crc, max_entries=args.max_entries,
        max_total=args.max_total_mib * 1024 * 1024,
        max_file=args.max_file_mib * 1024 * 1024, max_ratio=args.max_ratio,
    )
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print(f"Estado: {report['status']} | Entradas: {report['entries']} | "
              f"Descomprimido declarado: {report['uncompressed_bytes']} bytes | "
              f"CRC: {report['crc']}")
        for item in report["findings"]:
            print(f"- {item['code']}: {item.get('entry', '')} {item.get('detail', '')}")
        print("Nota: PASS solo indica que no se detectaron estas señales; no garantiza seguridad.")
    return {"PASS": 0, "WARN": 2, "ERROR": 1}[report["status"]]


if __name__ == "__main__":
    sys.exit(main())
