"""Tiny Gemini REST helper shared by the asset generators (stdlib only).

The API key comes from the environment (GEMINI_KEY, GEMINI_API_KEY or GKEY),
falling back to the project's .env file. It is never printed.
"""
import base64
import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path

API = "https://generativelanguage.googleapis.com/v1beta"
ROOT = Path(__file__).resolve().parent.parent
KEY_NAMES = ("GEMINI_KEY", "GEMINI_API_KEY", "GKEY")


def api_key():
    for name in KEY_NAMES:
        if os.environ.get(name):
            return os.environ[name]
    env = ROOT / ".env"
    if env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            name, _, value = line.partition("=")
            if name.strip() in KEY_NAMES and value.strip():
                return value.strip()
    raise SystemExit("No Gemini key: set GEMINI_KEY (or GKEY) or add it to .env")


def request(path, body=None, retries=6):
    """GET (body=None) or POST JSON to the Gemini API, retrying rate limits."""
    url = f"{API}/{path}"
    data = None if body is None else json.dumps(body).encode()
    for attempt in range(retries):
        req = urllib.request.Request(url, data=data, headers={
            "Content-Type": "application/json", "x-goog-api-key": api_key(),
        })
        try:
            with urllib.request.urlopen(req, timeout=300) as res:
                return json.load(res)
        except urllib.error.HTTPError as err:
            detail = err.read().decode(errors="replace")[:300]
            if err.code in (429, 500, 503) and attempt < retries - 1:
                wait = 20 * (attempt + 1)
                print(f"  {err.code}, retrying in {wait}s: {detail[:120]}")
                time.sleep(wait)
                continue
            raise SystemExit(f"Gemini API error {err.code}: {detail}")
        except (urllib.error.URLError, ConnectionError, TimeoutError) as err:  # dropped connection, timeout
            if attempt == retries - 1:
                raise SystemExit(f"Gemini API unreachable: {err}")
            print(f"  connection problem ({err}), retrying in 10s")
            time.sleep(10)


def inline_data(response):
    """First inline (base64) payload of a generateContent response, as (mime, bytes)."""
    for candidate in response.get("candidates", []):
        for part in candidate.get("content", {}).get("parts", []):
            blob = part.get("inlineData") or part.get("inline_data")
            if blob:
                return blob.get("mimeType") or blob.get("mime_type"), base64.b64decode(blob["data"])
    raise RuntimeError(f"No inline data in response: {json.dumps(response)[:400]}")
