import json
import math
import os
import urllib.parse
import urllib.request

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434")

def ensure_local(url=OLLAMA_URL):
    host = urllib.parse.urlparse(url).hostname
    if host not in {"127.0.0.1", "localhost", "::1"}:
        raise SystemExit("Este ejemplo exige Ollama en localhost.")

def post(path, payload, timeout=180):
    ensure_local()
    req = urllib.request.Request(
        OLLAMA_URL.rstrip("/") + path,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())

def embed(text, model):
    data = post("/api/embed", {"model": model, "input": text})
    return data["embeddings"][0]

def cosine(a, b):
    dot = sum(x*y for x, y in zip(a, b))
    na = math.sqrt(sum(x*x for x in a))
    nb = math.sqrt(sum(y*y for y in b))
    return dot / (na*nb) if na and nb else 0.0
