#!/usr/bin/env python3
"""Mock of the Biru Buttons server endpoints — for hardware testing only.

Speaks the same protocol as PLAN.md §3/§4 (POST /devices/claim, POST /ingest/routine,
GET /ingest/today)
but touches NO database: it just prints every request. Point the firmware at
http://<this laptop's LAN ip>:8081 and every press lands here instead of the book.

    python3 tools/mock_ingest.py            # listens on 0.0.0.0:8081
    python3 tools/mock_ingest.py 9000       # custom port
"""
import json
import secrets
import socket
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from socketserver import TCPServer

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8081
KINDS = {"pee", "poop", "food"}
seen_press_ids: set[str] = set()
presses: list[dict] = []


def lan_ip() -> str:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))  # no traffic is sent; just picks the outbound interface
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


def today() -> dict:
    """Today's tally (laptop-local day) — same shape as GET /ingest/today on the real API."""
    day = time.strftime("%Y-%m-%d")
    out = {"day": day, "pee": 0, "poop": 0, "food": 0}
    for p in presses:
        at = p["pressedAt"] or p["receivedAt"]
        if time.strftime("%Y-%m-%d", time.localtime(at)) == day:
            out[p["kind"]] += 1
    return out


class Handler(BaseHTTPRequestHandler):
    def _json(self, code: int, body: dict) -> None:
        raw = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def _body(self) -> dict:
        n = int(self.headers.get("Content-Length") or 0)
        try:
            return json.loads(self.rfile.read(n) or b"{}")
        except json.JSONDecodeError:
            return {}

    def do_GET(self):  # noqa: N802
        if self.path == "/ingest/today":
            if not self.headers.get("Authorization", "").startswith("Device "):
                return self._json(401, {"error": "missing device token"})
            return self._json(200, today())
        if self.path == "/health":
            return self._json(200, {"ok": True, "mock": True, "presses": len(presses)})
        if self.path == "/presses":
            return self._json(200, {"presses": presses})
        self._json(404, {"error": "not found"})

    def do_POST(self):  # noqa: N802
        body = self._body()
        if self.path == "/devices/claim":
            token = "mock_" + secrets.token_hex(16)
            print(f"  claim  code={body.get('claimCode')!r} -> token={token}")
            return self._json(200, {"deviceToken": token})

        if self.path == "/ingest/routine":
            auth = self.headers.get("Authorization", "")
            if not auth.startswith("Device "):
                print("  REJECT missing 'Authorization: Device <token>'")
                return self._json(401, {"error": "missing device token"})
            kind = body.get("kind")
            if kind not in KINDS:
                print(f"  REJECT bad kind {kind!r}")
                return self._json(400, {"error": f"kind must be one of {sorted(KINDS)}"})
            pid = body.get("pressId")
            if pid in seen_press_ids:
                print(f"  DUPE   {kind}  pressId={pid} (already logged, 200 not 201)")
                return self._json(200, {"ok": True, "duplicate": True, "today": today()})
            if pid:
                seen_press_ids.add(pid)
            at = body.get("pressedAt")
            when = time.strftime("%H:%M:%S", time.localtime(at)) if at else "server-time"
            presses.append({"kind": kind, "pressId": pid, "pressedAt": at, "receivedAt": time.time()})
            print(f"  PRESS  {kind:<5} at {when}  pressId={pid}")
            return self._json(201, {"ok": True, "today": today()})

        self._json(404, {"error": "not found"})

    def log_message(self, fmt, *args):  # one line per request, no noise
        print(f"[{time.strftime('%H:%M:%S')}] {self.command} {self.path}")


class Server(ThreadingHTTPServer):
    def server_bind(self):
        # HTTPServer.server_bind calls socket.getfqdn(), a reverse-DNS lookup that
        # can hang for a long time on macOS. Bind without it.
        TCPServer.server_bind(self)
        self.server_name = "biru-mock"
        self.server_port = self.server_address[1]


if __name__ == "__main__":
    ip = lan_ip()
    print("Biru mock ingest server — NO database, nothing is persisted.")
    print(f"  firmware BIRU_API_URL -> http://{ip}:{PORT}")
    print(f"  curl test: curl -s -X POST http://{ip}:{PORT}/ingest/routine "
          f"-H 'Authorization: Device x' -H 'Content-Type: application/json' "
          f"-d '{{\"kind\":\"poop\",\"pressId\":\"t1\"}}'")
    print()
    Server(("0.0.0.0", PORT), Handler).serve_forever()
