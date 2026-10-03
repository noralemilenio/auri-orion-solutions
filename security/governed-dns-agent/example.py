#!/usr/bin/env python3
from __future__ import annotations

import ipaddress
import json
import os
import sys
from typing import Any

import httpx

API = "https://api.cloudflare.com/client/v4"
ALLOWED_TYPES = {"A", "AAAA", "CNAME", "TXT"}


class GuardrailError(ValueError):
    pass


def settings() -> tuple[str, str, str]:
    token = os.environ.get("CLOUDFLARE_API_TOKEN", "").strip()
    zone_id = os.environ.get("CLOUDFLARE_ZONE_ID", "").strip()
    allowed_zone = os.environ.get("ALLOWED_ZONE", "").strip().lower().rstrip(".")
    if not token or not zone_id or not allowed_zone:
        raise GuardrailError(
            "Missing CLOUDFLARE_API_TOKEN, CLOUDFLARE_ZONE_ID or ALLOWED_ZONE"
        )
    return token, zone_id, allowed_zone


def validate_name(name: str, allowed_zone: str) -> str:
    clean = name.strip().lower().rstrip(".")
    if clean != allowed_zone and not clean.endswith("." + allowed_zone):
        raise GuardrailError(f"{clean!r} is outside allowed zone {allowed_zone!r}")
    return clean


def validate_record(record_type: str, content: str) -> tuple[str, str]:
    record_type = record_type.upper()
    if record_type not in ALLOWED_TYPES:
        raise GuardrailError(f"record type {record_type!r} is not allowed")

    if record_type == "A":
        ipaddress.IPv4Address(content)
    elif record_type == "AAAA":
        ipaddress.IPv6Address(content)

    return record_type, content.strip()


def client(token: str) -> httpx.Client:
    return httpx.Client(
        base_url=API,
        headers={"Authorization": f"Bearer {token}"},
        timeout=15.0,
    )


def list_records() -> list[dict[str, Any]]:
    token, zone_id, allowed_zone = settings()
    with client(token) as c:
        r = c.get(f"/zones/{zone_id}/dns_records", params={"per_page": 100})
        r.raise_for_status()
        data = r.json()
    if not data.get("success"):
        raise RuntimeError("Cloudflare API returned an unsuccessful response")

    out = []
    for item in data.get("result", []):
        name = item.get("name", "")
        if name == allowed_zone or name.endswith("." + allowed_zone):
            out.append(
                {
                    "id": item.get("id"),
                    "type": item.get("type"),
                    "name": name,
                    "content": item.get("content"),
                    "proxied": item.get("proxied"),
                    "ttl": item.get("ttl"),
                }
            )
    return out


def upsert(name: str, record_type: str, content: str) -> dict[str, Any]:
    token, zone_id, allowed_zone = settings()
    name = validate_name(name, allowed_zone)
    record_type, content = validate_record(record_type, content)

    with client(token) as c:
        existing = c.get(
            f"/zones/{zone_id}/dns_records",
            params={"name": name, "type": record_type},
        )
        existing.raise_for_status()
        result = existing.json().get("result", [])

        payload = {
            "type": record_type,
            "name": name,
            "content": content,
            "ttl": 1,
        }

        if result:
            record_id = result[0]["id"]
            response = c.put(
                f"/zones/{zone_id}/dns_records/{record_id}",
                json=payload,
            )
            action = "updated"
        else:
            response = c.post(f"/zones/{zone_id}/dns_records", json=payload)
            action = "created"

        response.raise_for_status()
        body = response.json()

    if not body.get("success"):
        raise RuntimeError("Cloudflare API returned an unsuccessful response")

    item = body["result"]
    return {
        "action": action,
        "id": item.get("id"),
        "type": item.get("type"),
        "name": item.get("name"),
        "content": item.get("content"),
        "proxied": item.get("proxied"),
        "ttl": item.get("ttl"),
    }


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit("Usage: example.py list | upsert NAME TYPE CONTENT")

    if sys.argv[1] == "list":
        print(json.dumps(list_records(), indent=2, ensure_ascii=False))
        return

    if sys.argv[1] == "upsert" and len(sys.argv) == 5:
        print(
            json.dumps(
                upsert(sys.argv[2], sys.argv[3], sys.argv[4]),
                indent=2,
                ensure_ascii=False,
            )
        )
        return

    raise SystemExit("Usage: example.py list | upsert NAME TYPE CONTENT")


if __name__ == "__main__":
    main()
