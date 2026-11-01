#!/usr/bin/env python3
"""Inspección local y de solo lectura de CSV. No muestra valores de celdas."""
from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

DEFAULT_MAX_BYTES = 50 * 1024 * 1024
DEFAULT_MAX_ROWS = 100_000
MAX_FINDINGS = 100
MAX_FIELD_BYTES = 1024 * 1024


def inspect_csv(
    path: Path,
    *,
    delimiter: str = ",",
    encoding: str = "utf-8-sig",
    required: tuple[str, ...] = (),
    unique: tuple[str, ...] = (),
    max_bytes: int = DEFAULT_MAX_BYTES,
    max_rows: int = DEFAULT_MAX_ROWS,
) -> dict:
    """Analiza estructura, obligatoriedad, duplicados y posibles fórmulas.

    Los hallazgos nunca incluyen datos de celdas; solo filas, columnas y códigos.
    """
    report = {
        "status": "PASS", "file": path.name, "rows": 0, "columns": 0,
        "findings": [], "suppressed_findings": 0,
        "limits": {"max_bytes": max_bytes, "max_rows": max_rows, "max_field_bytes": MAX_FIELD_BYTES},
    }

    def finding(code: str, *, row: int | None = None, column: str | None = None,
                severity: str = "WARN") -> None:
        entry: dict = {"code": code, "severity": severity}
        if row is not None:
            entry["row"] = row
        if column is not None:
            entry["column"] = column
        if len(report["findings"]) < MAX_FINDINGS:
            report["findings"].append(entry)
        else:
            report["suppressed_findings"] += 1
        if severity == "ERROR":
            report["status"] = "ERROR"
        elif report["status"] == "PASS":
            report["status"] = "WARN"

    if len(delimiter) != 1 or delimiter not in (",", ";", "\t", "|"):
        finding("INVALID_DELIMITER", severity="ERROR")
        return report
    if max_bytes < 1 or max_rows < 1:
        finding("INVALID_LIMIT", severity="ERROR")
        return report
    try:
        size = path.stat().st_size
        if not path.is_file():
            finding("NOT_REGULAR_FILE", severity="ERROR")
            return report
        if size > max_bytes:
            finding("FILE_TOO_LARGE", severity="ERROR")
            return report
        csv.field_size_limit(MAX_FIELD_BYTES)
        with path.open("r", encoding=encoding, newline="") as stream:
            reader = csv.reader(stream, delimiter=delimiter, strict=True)
            try:
                headers = next(reader)
            except StopIteration:
                finding("EMPTY_FILE", severity="ERROR")
                return report
            report["columns"] = len(headers)
            if not headers:
                finding("MISSING_HEADER", severity="ERROR")
                return report
            if any(not name.strip() for name in headers):
                finding("BLANK_HEADER", row=1)
            if len(set(headers)) != len(headers):
                finding("DUPLICATE_HEADER", row=1, severity="ERROR")
                return report
            if len({name.casefold() for name in headers}) != len(headers):
                finding("CASE_COLLISION_HEADER", row=1)
            missing = sorted((set(required) | set(unique)) - set(headers))
            if missing:
                for name in missing:
                    finding("CONFIG_COLUMN_NOT_FOUND", column=name, severity="ERROR")
                return report
            positions = {name: index for index, name in enumerate(headers)}
            seen = {name: set() for name in unique}
            for values in reader:
                report["rows"] += 1
                row_num = reader.line_num
                if report["rows"] > max_rows:
                    finding("ROW_LIMIT_EXCEEDED", row=row_num, severity="ERROR")
                    break
                if len(values) != len(headers):
                    finding("COLUMN_COUNT_MISMATCH", row=row_num)
                for index, value in enumerate(values[:len(headers)]):
                    if value.lstrip().startswith(("=", "+", "-", "@")):
                        finding("POTENTIAL_FORMULA", row=row_num, column=headers[index])
                for name in required:
                    index = positions[name]
                    if index >= len(values) or not values[index].strip():
                        finding("REQUIRED_EMPTY", row=row_num, column=name)
                for name in unique:
                    index = positions[name]
                    if index >= len(values) or not values[index].strip():
                        continue
                    value = values[index]
                    if value in seen[name]:
                        finding("DUPLICATE_KEY", row=row_num, column=name)
                    else:
                        seen[name].add(value)
    except (OSError, UnicodeError, csv.Error, LookupError) as exc:
        # No se vuelcan excepciones ni fragmentos del CSV: podrían contener datos privados.
        code = ("ENCODING_ERROR" if isinstance(exc, (UnicodeError, LookupError))
                else "CSV_PARSE_ERROR" if isinstance(exc, csv.Error)
                else "FILE_READ_ERROR")
        finding(code, severity="ERROR")
    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Valida CSV locales sin modificar el origen ni exponer celdas.")
    parser.add_argument("file", type=Path)
    parser.add_argument("--delimiter", default=",", help="Separador: coma, punto y coma, tabulador o |")
    parser.add_argument("--encoding", default="utf-8-sig")
    parser.add_argument("--required", action="append", default=[], metavar="COLUMN")
    parser.add_argument("--unique", action="append", default=[], metavar="COLUMN")
    parser.add_argument("--max-bytes", type=int, default=DEFAULT_MAX_BYTES)
    parser.add_argument("--max-rows", type=int, default=DEFAULT_MAX_ROWS)
    parser.add_argument("--json", action="store_true", help="Salida JSON sin valores de celdas")
    args = parser.parse_args(argv)
    result = inspect_csv(args.file, delimiter=args.delimiter, encoding=args.encoding,
                         required=tuple(args.required), unique=tuple(args.unique),
                         max_bytes=args.max_bytes, max_rows=args.max_rows)
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(f"Estado: {result['status']} | Filas: {result['rows']} | Columnas: {result['columns']}")
        for entry in result["findings"]:
            details = " ".join(f"{key}={value}" for key, value in entry.items() if key not in ("code", "severity"))
            print(f"  {entry['severity']} {entry['code']} {details}".rstrip())
        if result["suppressed_findings"]:
            print(f"  Hallazgos adicionales omitidos: {result['suppressed_findings']}")
        print("Nota: PASS no garantiza que el contenido sea seguro ni correcto.")
    return {"PASS": 0, "WARN": 1, "ERROR": 2}[result["status"]]


if __name__ == "__main__":
    sys.exit(main())
