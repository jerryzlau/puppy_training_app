# Biru Cam vision: live object detection on the Pi

Labelled boxes around **dogs, cats and people** over the 📷 live tab, plus a
"Biru is in view" status, computed on the Pi 5's own CPU.

Builds on [CAM-PLAN.md](CAM-PLAN.md) (the camera + Mac watcher) and
[cam/README.md](cam/README.md) (what's running today).

**Status (2026-10-19):** the detector runs on the Pi (step 1 measured
**25 fps at 416 px on 2 cores**, so 416 px was picked), and the pee/poop path
was built ahead of the overlay. The Pi's still-dog candidates go to the API,
which asks Claude and logs unconfirmed entries with ✓/✗ (cam/README.md).
Steps 3–4 below (boxes on the live tab, presence chip) are still to do.

---

## 1. Why on the Pi, and why these classes

- **The Pi already has every frame** and runs 24/7. Detection there doesn't
  depend on the Mac being awake. It also brings CAM-PLAN §8 step 6 ("move
  the gates onto the Pi") forward and turns it into a feature you can see.
- **Dog / cat / person only.** Stock COCO-trained YOLO already knows them, so
  no training is needed. On a fixed room camera, the other 77 COCO classes
  (couch, chair, bowl…) are noise.
- **This becomes the dog gate.** The same detections later tell the pee/poop
  classifier (CAM-PLAN §4 stage 3) *when* and *where* to look. It gets
  built once and serves both purposes.

## 2. Shape

```
Pi 5 (stream.py)
  picamera2 ── main 768×432 ──▶ MJPEG encoder ──▶ /stream, relay (unchanged)
            └─ lores 320×180 ─▶ detector thread (YOLO11n, ~5 fps)
                                 │  boxes: [{cls, conf, x, y, w, h, track}]
                                 ├─▶ GET /detections        (latest, LAN)
                                 └─▶ attached to each relayed frame
                                       X-Detections: <json>
Railway API ── passes the header through as a part header in the multipart stream
Web CamLive ── draws an SVG overlay on the frame it belongs to + "Biru in view" chip
```

**Key choices:**

- **picamera2 "lores" stream for detection.** The ISP produces a second, small
  YUV image alongside the main one, so detection never decodes JPEGs. It
  shares nothing with the encoder except the camera.
- **Boxes travel with their frame.** The Pi attaches the most recent detection
  to every frame it relays, so the overlay can't drift out of sync with the
  video. The API adds no logic: it copies one header into the multipart part
  headers. The website can turn the overlay off; boxes are not burned into
  the pixels.
- **Coordinates are normalised (0–1).** Resolution changes and the
  `BIRUCAM_ROTATE` flip don't break the overlay.

## 3. The model and runtime

- **YOLO11n**, COCO weights, input **320 px** to start.
- Export it **on the Mac** with Ultralytics, to **NCNN** (fastest on ARM
  CPUs) and to ONNX (fallback). Commit the exported model, about 5 MB.
- The Pi needs only the small runtime, `ncnn` (pip, in a venv with
  `--system-site-packages` so apt's picamera2 stays visible). It does **not**
  need Ultralytics or PyTorch, which would be about 2 GB on a 2 GB board.
  Pre-processing (letterbox) and post-processing (decode + NMS) are about
  60 lines of numpy in `hardware/cam/detect.py`.
- **Expected speed:** published Pi 5 benchmarks for YOLO11n on NCNN suggest
  around 10 fps at 320 px on the CPU. Step 1 below **measures it on this Pi**
  before anything else is built. If it's too slow, drop to 256 px or 3 fps.
  If it's fast, try 416 px for small, far-away puppy shots.
- **Tracking:** a tiny IoU tracker gives each box a stable id across frames.
  That stops label flicker and allows "in view for 3 min".
- **Smoothing:** a class counts as present after 2 of the last 3
  detections, and gone after 3 s without one.

## 4. Where it shows up

- **📷 live tab:**
  - boxes with "dog 87%" labels, colour per class
  - a toggle ("boxes on/off", remembered per browser)
  - a status chip:
    - 🐶 **Biru in view** (2 min)
    - 🧍 person in view
    - nothing in view
- **The Pi's own page** (`birucam.local:8080`) gets the same overlay,
  driven by `/detections`, so tuning works on the LAN without the website.
- **Nothing is recorded.** Boxes exist only in memory and in the live
  stream, the same promise as CAM-PLAN §7. Person boxes in particular are
  never stored or logged.

## 5. CPU, heat and when it runs

- **It always runs**, because presence and the future pee/poop gate need it
  even when nobody watches. Rates:
  - **2 fps** when idle
  - **5 fps** while the live tab is open; the relay already knows when
    someone is watching
- **Expected cost:** about 1–1.5 of the Pi's 4 cores at 5 fps. The fan will
  start spinning, which is what it's for. Step 5 checks a one-hour soak stays
  under about 70 °C with no throttling (`vcgencmd get_throttled` = 0x0).
- **Settings** (`/etc/default/birucam`):
  - `BIRUCAM_DETECT` = `on`/`off`
  - `BIRUCAM_DETECT_FPS_IDLE`
  - `BIRUCAM_DETECT_FPS_LIVE`
  - `BIRUCAM_DETECT_SIZE`
  - `BIRUCAM_DETECT_CLASSES` = `dog,cat,person`
  - `BIRUCAM_DETECT_MIN_CONF` = `0.4`
- **Failure isolation:** if the detector crashes, it restarts itself, and
  the stream and relay keep working without boxes.

## 6. Changes by file

| File | Change |
|---|---|
| `hardware/cam/detect.py` (new) | NCNN model load, letterbox, decode/NMS, class filter, IoU tracker, smoothing |
| `hardware/cam/models/yolo11n_ncnn/` (new) | exported weights + a `export.sh` that regenerates them on the Mac |
| `hardware/cam/stream.py` | lores stream in the camera config; detector thread; `GET /detections`; `X-Detections` header on relayed frames; overlay on the local page |
| `hardware/cam/install.sh` | venv with system site-packages + `ncnn` + `numpy`; new settings |
| `apps/api/src/cam.ts` | accept `X-Detections` (≤4 KB, JSON-validated), copy it into the part header for viewers |
| `packages/shared/src/types.ts` | `CamDetection` / `CamDetections` types |
| `apps/web/src/components/CamLive.tsx` | read the part header, draw an SVG overlay, toggle, presence chip |
| `hardware/cam/README.md`, `CAM-PLAN.md` | document; CAM-PLAN §4 stage 2 points here |

## 7. Build order (each step is usable on its own)

1. **Benchmark spike (on the Pi).**
   - Export YOLO11n → NCNN on the Mac and run it on 100 lores frames.
   - Report ms per frame at 256 / 320 / 416 px and the CPU temperature.
   - Pick the size.
2. **Detector + local overlay.**
   - Detector thread and `/detections`; boxes drawn on `birucam.local:8080`.
   - Walk through the frame with and without the puppy, and tune
     `MIN_CONF` by eye.
3. **Website overlay.**
   - API passthrough and the CamLive SVG overlay plus toggle.
   - Check that boxes stay locked to the video at 10 fps.
4. **Presence.**
   - Smoothing and tracker ids; the "Biru in view (n min)" chip.
5. **Soak.**
   - An hour with the tab open and an hour idle.
   - Temperature, throttling, memory flat, and the relay frame rate unchanged.

## 8. Risks and open questions

- **Top-down wide angle:** COCO dogs are mostly photographed from eye level.
  A high corner view of a curled-up puppy may score low.
  - Mitigations: a lower `MIN_CONF` for `dog` only, a larger input size, or,
    if it's still poor, fine-tune on frames from this camera. The CAM-PLAN §6
    ✓/✗ confirmations are exactly that dataset.
- **"Dog" isn't "Biru":** any dog counts. That's fine for now, since a second
  dog in the pen is rare. Telling dogs apart needs a re-identification model,
  which is out of scope.
- **Dark room:** the standard Camera Module 3 sees little at night, so
  detection fades with the light. The NoIR variant plus an IR light (CAM-PLAN
  §2) fixes it later.
- **CPU contention:** if the relay frame rate drops while detection runs, cap
  the detector at 3 fps first. The encoder takes priority.
