# Biru Cam — puppy watcher plan

A camera over the pen that notices when the puppy pees or poops and logs it to
the book by itself — the same `routine_items` row a button press makes, plus a
snapshot, marked **unconfirmed** until someone taps ✓ in the app.

Companion to [PLAN.md](PLAN.md) (the buttons). Plan only; nothing built yet.

---

## 1. Shape

```
Raspberry Pi Zero 2 W + Camera Module 3           your Mac (same WiFi)                 Railway
┌──────────────────────────────┐   MJPEG over LAN   ┌────────────────────────────┐   HTTPS   ┌──────────┐
│ picamera2 → HTTP MJPEG server│ ─────────────────▶ │ tools/watcher/ (Python)     │ ────────▶ │ /ingest  │
│ 640×480 @ 10 fps, ~3 Mbit/s  │  pull, not push    │ 1 motion gate (frame diff)  │  device   │ /routine │
│ mDNS: birucam.local          │                    │ 2 dog gate (YOLO, local)    │  token    └──────────┘
└──────────────────────────────┘                    │ 3 classify strip of frames  │                │
                                                    │   pee / poop / neither      │           app: 🐕 2:14pm
                                                    │ 4 open/close event, post it │           "peed?" [✓] [✗]
                                                    └────────────────────────────┘
```

- **The camera is a dumb eye.** It serves a stream and nothing else. All
  judgement happens on the Mac, so the Pi never needs re-flashing as the
  detection improves.
- **The Mac pulls the stream.** The Pi has a stable name (`birucam.local`);
  the Mac's IP can change freely. Nothing is exposed beyond the LAN.
- **The watcher is just another device** to the API — claimed from the Family
  page like a button pad, holding its own device token.

## 2. Bill of materials (~US$70)

| Part | ~Cost | Notes |
|---|---|---|
| Raspberry Pi Zero 2 W | $15 | quad-core, 512 MB, 2.4 GHz WiFi, BLE. Enough to encode 640×480 MJPEG all day |
| Camera Module 3 **Wide** | $35 | 120° field of view covers a pen/room from one corner; standard (75°) only if it looks straight down at a pad. **NoIR** variant + an IR illuminator if the room is dark at night |
| Pi Zero camera cable (15-pin → 22-pin, ~15 cm) | $3 | **Camera Module 3 ships with the full-size cable, which does not fit the Zero.** The official Zero case includes this cable + a camera lid — the easiest route |
| Official Pi Zero case (camera lid) | $6 | or any printed mount; the lens needs a rigid, repeatable view |
| microSD 16–32 GB (A1) | $8 | Raspberry Pi OS Lite (64-bit, Bookworm) |
| 5 V ⎓ 2.5 A micro-USB supply | $8 | the camera + WiFi under load browns out weaker phone chargers |
| (optional) 850 nm IR illuminator | $10 | only with NoIR; 940 nm is invisible but the sensor is half as sensitive |

Mounting: high in a corner, looking down across the pen/pad area, fixed. A
static background makes motion gating trivial and the classifier's job easier.

## 3. Pi side (`hardware/cam/`)

Raspberry Pi OS Lite, headless: WiFi + SSH set in Imager, hostname `birucam`.

- `stream.py` — picamera2 → `multipart/x-mixed-replace` MJPEG on `:8080/stream`
  (the standard picamera2 example, ~60 lines), plus `/snapshot.jpg` and a bare
  `/` page for checking the view in a browser. 640×480 @ 10 fps: the Zero 2 W
  does this at ~15 % CPU and ~3 Mbit/s. Autofocus locked once at boot
  (continuous AF hunts on a static scene).
- `birucam.service` — systemd unit so it comes up on power.
- `install.sh` — apt packages (`python3-picamera2`), copies the two files,
  enables the unit.

That's the whole Pi. No detection, no credentials, no outbound calls.

## 4. Watcher (`hardware/firmware/tools/watcher/` → maybe `tools/watcher/`), on the Mac

Python 3.12, `uv`-managed; OpenCV pulls the MJPEG stream.

**Stage 1 — motion gate.** Frame differencing against a slow-moving background
model; below threshold, frames are dropped. Cost: nothing.

**Stage 2 — dog gate.** Ultralytics YOLO (stock COCO weights, class `dog`) on
motion frames only; runs at 20+ fps on Apple Silicon. Also tells us *where* the
puppy is, so the classifier gets a crop, not the whole room. Cost: nothing.

**Stage 3 — classify.** A strip of 4 consecutive dog-crops (~1.5 s apart) goes
to a vision model with one question: *pee, poop, or neither* — with a short
description of the posture, which becomes the note on the entry. Sequences beat
single frames: a squat that lasts 3 frames is a pee; 10+ frames is a poop; one
frame is the puppy sitting down.

- Start: **Claude vision** (Haiku). No training, works day one. With the two
  gates in front, the volume is a few hundred strips a day at most — cents.
- Swap-in: any local VLM via Ollama for a zero-cost, lower-accuracy variant;
  the classifier is one function behind an interface.
- Later: a small fine-tuned classifier on the confirmed snapshots (§6) that
  runs locally and retires the LLM.

**Stage 4 — events.** A classification opens an event; consecutive same-kind
results extend it; it closes after 20 s of "neither" or the dog leaving. On
close: `POST /ingest/routine` with `kind`, `pressedAt` = event start, the best
snapshot, and `confidence`. The server's 60 s same-kind debounce already
prevents double logging if the buttons are pressed too.

A debug window (`--show`) draws the gates' decisions live so tuning is by eye,
not by log. `--source 0` uses the Mac webcam (or iPhone Continuity Camera) so
the whole pipeline can be built before the Pi arrives.

## 5. Server & app (the software half)

- **`devices.kind`**: `button_pad | camera`. Cameras claim the same way.
- **`routine_items`**: `confirmed boolean default true`, `photo_path text null`,
  `confidence real null`. Button and human entries are born confirmed; camera
  entries are not.
- **`POST /ingest/routine`**: accepts an optional multipart/base64 snapshot →
  Supabase storage (the entry-photos bucket, `routine/<household>/<id>.jpg`).
- **`PATCH /routine/:id/confirm`** (✓) and the existing delete (✗).
- **App, Routine tab**: unconfirmed rows render as a card — snapshot, "🐕 looks
  like a pee at 2:14pm", ✓ / ✗. Unconfirmed events are excluded from the
  forecast and the friends' bulletin until confirmed (a false positive that
  rings a friend's bell is worse than a 2-minute delay).
- **OLED**: `GET /ingest/today` counts confirmed only; a `?` suffix when
  something is pending would be a nice touch (`pee 4?`).

## 6. Confirmations are the dataset

Every ✓ / ✗ stores the strip + label under `storage/cam-labels/`. After a few
weeks that's a few hundred labelled examples *of this puppy in this room* —
enough to train a small posture classifier that runs locally and for free, and
to grade any classifier change against real history.

## 7. Privacy

Video never leaves the LAN. What leaves the Mac: cropped, gated strips to the
vision API (a few hundred small images a day of a dog), and one snapshot per
logged event to your own Supabase bucket. The Ollama variant sends nothing
anywhere. No recording is kept beyond the rolling in-memory window unless a
strip is part of an event.

## 8. Build order

1. Watcher skeleton on the Mac against the **webcam**: stream in → motion gate
   → dog gate → debug window. No server changes needed.
2. Classifier stage + event logic, still webcam. Log to the **mock** ingest.
3. Server + app: schema, snapshot upload, unconfirmed cards, ✓/✗.
4. Pi arrives: `install.sh`, mount it, point the watcher at `birucam.local`.
5. Live: claim the camera on the Family page; watch a day; tune thresholds.
6. Later: local classifier from the confirmations; run the watcher on the Pi
   itself (Zero 2 W can manage the gates; the classifier needs a Pi 5 or the
   Mac) so the Mac doesn't have to stay awake.

## 9. Risks & open questions

- **Accuracy** is the whole game. Expect false positives from sitting and
  sniffing at first — that's what the ✓/✗ flow is for. Pee is the harder call
  (short, subtle); poop's long hunched squat is distinctive.
- **The Mac must be on** and on the same WiFi. Sleep = no watching. Step 6
  fixes that; until then, `caffeinate` while the watcher runs.
- **Night**: the standard module is useless in the dark. Decide NoIR + IR now
  if the puppy sleeps where it pees.
- **Two dogs / a cat** in frame: YOLO finds "a dog", not *this* dog. Fine for
  one puppy; a second animal needs an ID step.
- **Pi Zero 2 W WiFi** is 2.4 GHz only and modest; keep the Pi within a room
  or two of the router. If the stream stutters, drop to 8 fps before dropping
  resolution — the classifier wants pixels more than frames.
