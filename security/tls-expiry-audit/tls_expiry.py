#!/usr/bin/env python3
"""Auditoría de fechas de caducidad TLS; no valida confianza ni hostname."""
from __future__ import annotations

import argparse
import json
import math
import re
import shutil
import socket
import ssl
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit


def parse_target(value: str) -> tuple[str, int]:
    value = value.strip()
    if not value or any(ch.isspace() for ch in value) or "://" in value:
        raise ValueError("Indica un host o host:puerto, sin esquema ni espacios")
    if any(ch in value for ch in "/?#@\\"):
        raise ValueError("El destino no puede contener ruta, usuario ni parámetros")
    parts = urlsplit("//" + value)
    if not parts.hostname or parts.username or parts.password:
        raise ValueError("Host inválido")
    try:
        port = parts.port or 443
    except ValueError as exc:
        raise ValueError("Puerto inválido (1-65535)") from exc
    host = parts.hostname
    try:
        host_ascii = host.encode("idna").decode("ascii")
    except UnicodeError as exc:
        raise ValueError("Nombre IDNA inválido") from exc
    if not (1 <= len(host_ascii) <= 253):
        raise ValueError("Longitud de host inválida")
    if not (re.fullmatch(r"[a-zA-Z0-9.-]+", host_ascii) or ":" in host_ascii):
        raise ValueError("Caracteres no permitidos en el host")
    if not 1 <= port <= 65535:
        raise ValueError("Puerto fuera de rango")
    return host_ascii, port


def read_targets(path: Path) -> list[str]:
    lines = path.read_text(encoding="utf-8").splitlines()
    targets = []
    seen = set()
    for line in lines:
        item = line.strip()
        if not item or item.startswith("#"):
            continue
        if item not in seen:
            seen.add(item)
            targets.append(item)
    if not targets:
        raise ValueError("El archivo no contiene destinos")
    if len(targets) > 200:
        raise ValueError("Máximo 200 destinos por ejecución")
    return targets


def certificate_expiry(host: str, port: int, timeout: float, openssl_bin: str) -> datetime:
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE  # Recupera también certificados caducados/autofirmados.
    with socket.create_connection((host, port), timeout=timeout) as raw:
        with context.wrap_socket(raw, server_hostname=host) as conn:
            conn.settimeout(timeout)
            der = conn.getpeercert(binary_form=True)
    if not der:
        raise ValueError("El servidor no ha presentado certificado")
    pem = ssl.DER_cert_to_PEM_cert(der)
    result = subprocess.run(
        [openssl_bin, "x509", "-noout", "-enddate"],
        input=pem, text=True, capture_output=True, timeout=timeout, check=True,
    )
    match = re.fullmatch(r"notAfter=(.+)", result.stdout.strip())
    if not match:
        raise ValueError("OpenSSL no ha devuelto notAfter")
    return datetime.strptime(match.group(1), "%b %d %H:%M:%S %Y GMT").replace(tzinfo=timezone.utc)


def inspect(target: str, warn_days: int, timeout: float, openssl_bin: str,
            now: datetime | None = None) -> dict:
    try:
        host, port = parse_target(target)
        expiry = certificate_expiry(host, port, timeout, openssl_bin)
        now = now or datetime.now(timezone.utc)
        remaining = (expiry - now).total_seconds()
        if remaining < 0:
            status = "CADUCADO"
        elif remaining <= warn_days * 86400:
            status = "CADUCA_PRONTO"
        else:
            status = "VIGENTE"
        return {"destino": target, "estado": status, "vence_utc": expiry.isoformat(),
                "dias_restantes": math.floor(remaining / 86400) if remaining < 0 else math.ceil(remaining / 86400)}
    except (OSError, ValueError, ssl.SSLError, subprocess.SubprocessError) as exc:
        return {"destino": target, "estado": "ERROR", "detalle": f"{type(exc).__name__}: {exc}"}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Consulta caducidad de certificados TLS, sin validar confianza.")
    parser.add_argument("--file", type=Path, required=True, help="Archivo de hosts, uno por línea")
    parser.add_argument("--warn-days", type=int, default=30, help="Avisar cuando queden <= N días (30)")
    parser.add_argument("--timeout", type=float, default=5.0, help="Timeout por conexión en segundos (5)")
    parser.add_argument("--json", action="store_true", help="Salida JSON estructurada")
    args = parser.parse_args(argv)
    if args.warn_days < 0 or not 0 < args.timeout <= 60:
        parser.error("--warn-days debe ser >= 0 y --timeout entre 0 y 60")
    openssl_bin = shutil.which("openssl")
    if not openssl_bin:
        print("ERROR: falta el ejecutable openssl en PATH", file=sys.stderr)
        return 2
    try:
        targets = read_targets(args.file)
    except (OSError, UnicodeError, ValueError) as exc:
        print(f"ERROR: no se puede leer el listado: {exc}", file=sys.stderr)
        return 2
    results = [inspect(t, args.warn_days, args.timeout, openssl_bin) for t in targets]
    if args.json:
        print(json.dumps(results, ensure_ascii=False, indent=2))
    else:
        for r in results:
            print(f"{r['estado']:14} {r['destino']:40} "
                  f"{r.get('vence_utc', r.get('detalle', ''))}")
        print(f"RESUMEN total={len(results)} vigentes={sum(r['estado']=='VIGENTE' for r in results)} "
              f"avisos={sum(r['estado']=='CADUCA_PRONTO' for r in results)} "
              f"caducados={sum(r['estado']=='CADUCADO' for r in results)} "
              f"errores={sum(r['estado']=='ERROR' for r in results)}")
    return 2 if any(r["estado"] == "ERROR" for r in results) else (
        1 if any(r["estado"] != "VIGENTE" for r in results) else 0
    )


if __name__ == "__main__":
    raise SystemExit(main())
