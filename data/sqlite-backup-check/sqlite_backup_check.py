#!/usr/bin/env python3
"""Verifica una instantánea SQLite mediante la API oficial de backup."""
from __future__ import annotations

import argparse
from contextlib import closing
import json
from pathlib import Path
import sqlite3
import sys
import tempfile
import time


class BackupDeadlineExceeded(Exception):
    """La instantánea ha superado el tiempo máximo permitido."""


def check_database(database: Path, timeout_seconds: float = 15.0) -> dict:
    """Copia una BD a un directorio temporal y comprueba la integridad de la copia."""
    started = time.monotonic()
    database = database.expanduser().resolve()
    result = {
        "database": str(database),
        "status": "ERROR",
        "integrity": None,
        "snapshot_bytes": None,
        "elapsed_seconds": None,
        "detail": None,
    }
    try:
        if timeout_seconds <= 0:
            raise ValueError("El límite de tiempo debe ser positivo")
        if not database.is_file():
            raise FileNotFoundError("No existe un archivo SQLite en esa ruta")
        # mode=ro impide abrir el origen en modo escritura. SQLite puede necesitar
        # ficheros auxiliares -shm en bases WAL; véase README.
        uri = database.as_uri() + "?mode=ro"
        deadline = started + timeout_seconds

        def progress(_status: int, _remaining: int, _total: int) -> None:
            if time.monotonic() > deadline:
                raise BackupDeadlineExceeded("Tiempo máximo superado al crear la copia")

        with tempfile.TemporaryDirectory(prefix="auri-sqlite-check-") as tempdir:
            snapshot = Path(tempdir) / "snapshot.sqlite3"
            with closing(sqlite3.connect(uri, uri=True, timeout=2.0)) as origin:
                with closing(sqlite3.connect(snapshot)) as destination:
                    origin.backup(destination, pages=100, progress=progress, sleep=0.05)
            result["snapshot_bytes"] = snapshot.stat().st_size
            with closing(sqlite3.connect(f"{snapshot.as_uri()}?mode=ro", uri=True)) as copy:
                rows = copy.execute("PRAGMA integrity_check(10)").fetchall()
            messages = [str(row[0]) for row in rows]
            if messages == ["ok"]:
                result["status"] = "VALID"
                result["integrity"] = "ok"
                result["detail"] = "La instantánea pasó PRAGMA integrity_check"
            else:
                result["status"] = "INVALID"
                result["integrity"] = "failed"
                result["detail"] = "; ".join(messages)[:1000] or "La integridad no se pudo confirmar"
    except (OSError, ValueError, sqlite3.Error, BackupDeadlineExceeded) as exc:
        result["detail"] = f"{type(exc).__name__}: {exc}"
    finally:
        result["elapsed_seconds"] = round(time.monotonic() - started, 3)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Verifica una instantánea de una base SQLite sin modificar su contenido"
    )
    parser.add_argument("database", type=Path, help="Ruta a la base SQLite")
    parser.add_argument("--timeout", type=float, default=15.0, help="Límite de backup en segundos (15)")
    parser.add_argument("--json", action="store_true", help="Salida JSON")
    args = parser.parse_args(argv)
    result = check_database(args.database, args.timeout)
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(f"Estado: {result['status']}")
        print(f"Origen: {result['database']}")
        print(f"Integridad: {result['integrity'] or 'no comprobada'}")
        print(f"Detalle: {result['detail']}")
        print(f"Tiempo: {result['elapsed_seconds']} s")
    return {"VALID": 0, "INVALID": 1, "ERROR": 2}[result["status"]]


if __name__ == "__main__":
    sys.exit(main())
