#!/usr/bin/env python3
"""Biru Cam — the Pi side: a dumb eye that serves an MJPEG stream on the LAN.

No detection (CAM-PLAN.md §3): the Mac's watcher pulls the LAN stream and
everything clever happens there.

    GET /              a bare page showing the live view
    GET /stream        multipart/x-mixed-replace MJPEG
    GET /snapshot.jpg  the latest frame

    python3 stream.py                  # 0.0.0.0:8080, 768x432 @ 10 fps
    BIRUCAM_ROTATE=180 python3 stream.py
    python3 stream.py claim K7F3QM     # pair with the household (code from the Family page)

Live view on the website: once paired, a relay thread long-polls the API and
POSTs frames to it only while a household member has the 📷 live tab open
(CAM-PLAN.md §7). Outbound connections only.

Settings come from the environment (the service reads /etc/default/birucam):
BIRUCAM_PORT, BIRUCAM_WIDTH, BIRUCAM_HEIGHT, BIRUCAM_FPS, BIRUCAM_ROTATE (0|180),
BIRUCAM_API_URL, BIRUCAM_RELAY_FPS, BIRUCAM_RELAY_IN_FLIGHT, BIRUCAM_TOKEN_FILE.
The default size is 16:9 so the Wide module keeps its full 120° view —
a 4:3 size would crop the sides.
"""
import http.client
import io
import json
import os
import queue
import socket
import sys
import threading
import time
from http import server
from socketserver import ThreadingMixIn
from urllib.parse import urlparse

# The service gets these via EnvironmentFile; `stream.py claim` from a shell
# reads the same file so both see one config.
if os.path.exists("/etc/default/birucam"):
    with open("/etc/default/birucam") as f:
        for line in f:
            key, sep, value = line.strip().partition("=")
            if sep and not key.startswith("#"):
                os.environ.setdefault(key, value)

PORT = int(os.environ.get("BIRUCAM_PORT", 8080))
WIDTH = int(os.environ.get("BIRUCAM_WIDTH", 768))
HEIGHT = int(os.environ.get("BIRUCAM_HEIGHT", 432))
FPS = int(os.environ.get("BIRUCAM_FPS", 10))
ROTATE = int(os.environ.get("BIRUCAM_ROTATE", 0))  # the ISP flips only; 90° isn't possible here
API_URL = os.environ.get("BIRUCAM_API_URL", "")  # empty: LAN stream only, no relay
RELAY_FPS = float(os.environ.get("BIRUCAM_RELAY_FPS", 10))
RELAY_IN_FLIGHT = int(os.environ.get("BIRUCAM_RELAY_IN_FLIGHT", 3))  # parallel frame uploads
# Vision (VISION-PLAN.md): YOLO11n on the CPU finds the dog; watch.py sends
# still spells to the API, which asks Claude "pee, poop, or neither?".
DETECT = os.environ.get("BIRUCAM_DETECT", "on") == "on"
DETECT_FPS = float(os.environ.get("BIRUCAM_DETECT_FPS", 5))
DETECT_SIZE = int(os.environ.get("BIRUCAM_DETECT_SIZE", 416))
DETECT_MIN_CONF = float(os.environ.get("BIRUCAM_DETECT_MIN_CONF", 0.35))
DETECT_CLASSES = tuple(os.environ.get("BIRUCAM_DETECT_CLASSES", "dog,cat,person").split(","))

detections = {"t": 0, "boxes": [], "presence": {}}  # latest pass, served at /detections
TOKEN_FILE = os.environ.get("BIRUCAM_TOKEN_FILE", "/var/lib/birucam/device_token")

PAGE = f"""<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Biru Cam</title>
<style>body{{margin:0;background:#111;color:#ddd;font:14px -apple-system,sans-serif;text-align:center}}
img{{max-width:100%;height:auto;display:block;margin:0 auto}}p{{margin:8px}}</style></head>
<body><img src="/stream" alt="live"><p>birucam · {WIDTH}×{HEIGHT} @ {FPS} fps ·
<a style="color:#8cf" href="/snapshot.jpg">snapshot</a></p></body></html>""".encode()


class FrameBuffer(io.BufferedIOBase):
    """Holds the newest JPEG and wakes every client waiting for the next one."""

    def __init__(self):
        self.frame = None
        self.cond = threading.Condition()

    def write(self, buf):
        with self.cond:
            self.frame = buf
            self.cond.notify_all()


frames = FrameBuffer()


class Handler(server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/":
            self._send(200, "text/html; charset=utf-8", PAGE)
        elif self.path == "/snapshot.jpg":
            with frames.cond:
                frames.cond.wait_for(lambda: frames.frame is not None, timeout=5)
                frame = frames.frame
            if frame is None:
                self._send(503, "text/plain", b"camera not ready\n")
            else:
                self._send(200, "image/jpeg", frame)
        elif self.path == "/detections":
            self._send(200, "application/json", json.dumps(detections).encode())
        elif self.path == "/stream":
            self.send_response(200)
            self.send_header("Cache-Control", "no-cache, private")
            self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=FRAME")
            self.end_headers()
            try:
                while True:
                    with frames.cond:
                        frames.cond.wait()
                        frame = frames.frame
                    self.wfile.write(b"--FRAME\r\nContent-Type: image/jpeg\r\n")
                    self.wfile.write(f"Content-Length: {len(frame)}\r\n\r\n".encode())
                    self.wfile.write(frame)
                    self.wfile.write(b"\r\n")
            except (BrokenPipeError, ConnectionResetError):
                pass  # viewer went away
        else:
            self._send(404, "text/plain", b"not found\n")

    def _send(self, code, ctype, body):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        pass  # a 10 fps stream would flood the journal


class StreamServer(ThreadingMixIn, server.HTTPServer):
    allow_reuse_address = True
    daemon_threads = True


class Api:
    """One keep-alive connection to the Biru API; reconnects after any error."""

    def __init__(self, url, token=None):
        u = urlparse(url)
        self.cls = http.client.HTTPSConnection if u.scheme == "https" else http.client.HTTPConnection
        self.host, self.port = u.hostname, u.port
        self.token = token
        self.conn = None

    def call(self, method, path, body=None, ctype="application/json", extra=None):
        if self.conn is None:
            self.conn = self.cls(self.host, self.port, timeout=40)  # > the API's 25 s long-poll
        headers = {"Content-Type": ctype} if body is not None else {}
        headers.update(extra or {})
        if self.token:
            headers["Authorization"] = f"Device {self.token}"
        try:
            self.conn.request(method, path, body=body, headers=headers)
            res = self.conn.getresponse()
            data = res.read()
        except (OSError, http.client.HTTPException):
            self.conn.close()
            self.conn = None
            raise
        try:
            return res.status, json.loads(data or b"{}")
        except ValueError:
            return res.status, {}


def send_frames(apis):
    """POST the newest frame at RELAY_FPS until nobody watches.

    One request at a time caps the rate at 1 / round-trip (≈4 fps to a far
    region), so each connection in `apis` keeps a frame in flight. Frames are
    numbered per session; the API drops one that arrives after a newer one.
    """
    lock = threading.Lock()
    stop = threading.Event()
    state = {"next": time.monotonic(), "seq": 0, "last": None}
    session = os.urandom(6).hex()

    def sender(api):
        try:
            while not stop.is_set():
                with lock:  # hand out evenly spaced send slots across the senders
                    slot = max(time.monotonic(), state["next"])
                    state["next"] = slot + 1 / RELAY_FPS
                time.sleep(max(0.0, slot - time.monotonic()))
                with frames.cond:
                    frames.cond.wait_for(lambda: frames.frame is not None, timeout=5)
                    frame = frames.frame
                with lock:
                    if frame is None or frame is state["last"]:
                        continue  # the camera hasn't produced a new frame yet
                    state["last"] = frame
                    state["seq"] += 1
                    seq = state["seq"]
                status, body = api.call("POST", "/ingest/cam/frame", frame, "image/jpeg",
                                        {"X-Frame-Session": session, "X-Frame-Seq": str(seq)})
                if status != 200 or not body.get("watching"):
                    stop.set()
        except (OSError, http.client.HTTPException) as e:
            print(f"relay: {e!r}", flush=True)
            stop.set()

    threads = [threading.Thread(target=sender, args=(a,), daemon=True) for a in apis]
    for t in threads:
        t.start()
    for t in threads:
        t.join()


def relay():
    """Long-poll the API; while someone watches, POST the newest frame at RELAY_FPS."""
    while not os.path.exists(TOKEN_FILE):
        time.sleep(10)  # not paired yet — `stream.py claim <code>` writes the token
    with open(TOKEN_FILE) as f:
        token = f.read().strip()
    api = Api(API_URL, token)
    senders = [Api(API_URL, token) for _ in range(RELAY_IN_FLIGHT)]
    print(f"relay: paired, waiting for viewers on {API_URL}", flush=True)
    backoff = 2
    while True:
        try:
            status, body = api.call("GET", "/ingest/cam/wait")
            if status == 401:
                print("relay: device token rejected (forgotten on the Family page?) — re-pair to resume", flush=True)
                time.sleep(300)
                continue
            backoff = 2
            if not body.get("watching"):
                continue
            print("relay: someone's watching — sending", flush=True)
            send_frames(senders)
            print("relay: nobody watching — idle", flush=True)
        except (OSError, http.client.HTTPException) as e:
            print(f"relay: {e!r} — retrying in {backoff}s", flush=True)
            time.sleep(backoff)
            backoff = min(backoff * 2, 60)


def detect_loop(candidates):
    """Run YOLO on the newest frame DETECT_FPS times a second; feed dogs to the watcher."""
    import simplejpeg
    from detect import Detector, Tracker
    from watch import Watcher

    det = Detector(size=DETECT_SIZE, classes=DETECT_CLASSES, min_conf=DETECT_MIN_CONF)
    tracker = Tracker()
    watcher = Watcher(candidates.put)
    print(f"detect: YOLO11n {DETECT_SIZE}px, {DETECT_FPS} fps, classes {','.join(DETECT_CLASSES)}", flush=True)
    while True:
        started = time.monotonic()
        jpeg = frames.frame
        if jpeg is not None:
            # DCT-scaled decode: half size straight out of the JPEG, nearly free
            rgb = simplejpeg.decode_jpeg(jpeg, colorspace="RGB", min_width=WIDTH // 2, min_height=HEIGHT // 2)
            tracked = tracker.update(det(rgb), started)
            detections.update(t=time.time(), boxes=[b.json() for b in tracked],
                              presence={k: round(v) for k, v in tracker.presence(started).items()})
            watcher.update(started, jpeg, [b for b in tracked if b.cls == "dog"])
        time.sleep(max(0.0, 1 / DETECT_FPS - (time.monotonic() - started)))


def detector(candidates):
    """Keep the detector alive: a crash costs boxes for a few seconds, never the stream."""
    while True:
        try:
            detect_loop(candidates)
        except Exception as e:  # noqa: BLE001 — anything from the model/runtime
            print(f"detect: crashed ({e!r}) — restarting in 5s", flush=True)
            time.sleep(5)


def send_candidates(candidates):
    """POST each pee/poop candidate to the API; it asks Claude and logs the verdict."""
    api = None
    while True:
        cand = candidates.get()
        if api is None:
            if not (API_URL and os.path.exists(TOKEN_FILE)):
                print("watch: candidate dropped — camera not paired", flush=True)
                continue
            with open(TOKEN_FILE) as f:
                api = Api(API_URL, f.read().strip())
        try:
            status, body = api.call("POST", "/ingest/cam/candidate", json.dumps(cand).encode())
            print(f"watch: still {cand['stillSeconds']}s → {status} {body.get('label', body.get('error', ''))}"
                  f" {body.get('confidence', '')} {'(logged)' if body.get('logged') else ''}", flush=True)
            if status == 401:
                api = None  # re-read the token next time (re-paired?)
        except (OSError, http.client.HTTPException) as e:
            print(f"watch: candidate failed ({e!r})", flush=True)


def claim(code):
    """Trade a Family-page pairing code for this camera's device token."""
    if not API_URL:
        sys.exit("set BIRUCAM_API_URL first (it's in /etc/default/birucam)")
    status, body = Api(API_URL).call("POST", "/devices/claim", json.dumps({"claimCode": code}).encode())
    if status != 201:
        sys.exit(f"claim failed ({status}): {body.get('error', body)}")
    fd = os.open(TOKEN_FILE, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        f.write(body["deviceToken"])
    print(f"paired as \"{body.get('name')}\" — the live tab works within ~10 s (the service picks the token up by itself)")


def main():
    if sys.argv[1:2] == ["claim"] and len(sys.argv) == 3:
        return claim(sys.argv[2])
    # picamera2 is only needed for streaming, so `claim` works without a camera
    from libcamera import Transform, controls
    from picamera2 import Picamera2
    from picamera2.encoders import MJPEGEncoder, Quality
    from picamera2.outputs import FileOutput

    cam = Picamera2()
    cam.configure(cam.create_video_configuration(
        main={"size": (WIDTH, HEIGHT)},
        transform=Transform(hflip=ROTATE == 180, vflip=ROTATE == 180),
        controls={"FrameRate": FPS},
    ))
    cam.start_recording(MJPEGEncoder(), FileOutput(frames), quality=Quality.MEDIUM)
    # The scene is static: focus once, then hold. Continuous AF would hunt.
    if "AfMode" in cam.camera_controls:
        cam.set_controls({"AfMode": controls.AfModeEnum.Auto})
        print("autofocus:", "locked" if cam.autofocus_cycle() else "failed — holding last position", flush=True)
    print(f"birucam: http://{socket.gethostname()}.local:{PORT}/  ({WIDTH}x{HEIGHT} @ {FPS} fps)", flush=True)
    if API_URL:
        threading.Thread(target=relay, daemon=True).start()
    if DETECT:
        candidates = queue.Queue()  # ≤ watch.MAX_PER_HOUR an hour, so unbounded is fine
        threading.Thread(target=detector, args=(candidates,), daemon=True).start()
        threading.Thread(target=send_candidates, args=(candidates,), daemon=True).start()
    try:
        StreamServer(("", PORT), Handler).serve_forever()
    finally:
        cam.stop_recording()


if __name__ == "__main__":
    main()
