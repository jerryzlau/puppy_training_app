"""Biru Cam: spot moments that might be a pee or poop (VISION-PLAN.md, CAM-PLAN.md §4).

The detector finds the dog; this decides when it's worth asking the API
"pee, poop, or neither?". Two kinds of **candidate**:

- **Pad visits**, once the pee pad is marked on the 📷 live tab. A visit runs
  from the dog's paws landing on the pad to them leaving it for
  PAD_VISIT_END_S. When it ends, the pad is photographed again once nothing
  stands in front of it, and compared with a picture taken while it was
  clear before the visit. The API gets the dog during its stillest stretch
  on the pad, plus the pad before and after. A new wet patch or lump is the
  best evidence there is. Walk-overs (no pause, no change) aren't sent.
- **Still spells anywhere else** (accidents off the pad). A puppy squatting
  holds still in one spot, so a dog track that has barely moved for STILL_S
  seconds is sent with 4 crops of the dog, ~1.5 s apart.

Only the cheap stillness filter runs here; the judgement happens server-side.
After a candidate the same still spell is never sent again: the dog has to
move away and settle again first, so a sleeping puppy costs one call.
"""
import base64
import collections
import time

import simplejpeg

STILL_S = 4.5          # still this long → candidate (squats last ~5–30 s)
STRIP_N = 4            # crops sent per candidate
STRIP_GAP_S = 1.5      # seconds between those crops
STILL_MOVE = 0.05      # max centre drift (fraction of frame) that still counts as still
MOVED_AWAY = 0.10      # drift that re-arms a track after a candidate
MAX_PER_HOUR = 30
CROP_PAD = 0.35        # extra context around the dog box
CROP_MIN_PX = 192
HISTORY_S = 12
PAD_MARGIN = 0.15        # the pad zone grows by this share of its size: paws at the edge count
PAD_VISIT_END_S = 3.0    # paws off the pad this long → the visit is over
PAD_MIN_STILL_S = 2.0    # on the pad, a pause this long is worth asking about (a pee can be quick)
PAD_CHANGE_MIN = 0.01    # …and so is the pad looking this different afterwards
PAD_CLEAR_WAIT_S = 10.0  # after a visit, wait up to this long for a clear view of the pad
PAD_REF_EVERY_S = 20.0   # refresh the "before" picture this often while the pad is clear
VISIT_SAMPLE_S = 0.3     # keep visit frames this far apart
VISIT_MAX_S = 120        # a long visit keeps only its last two minutes


class Watcher:
    def __init__(self, send):
        """`send(candidate_dict)` is called (from the detector thread) with a ready candidate."""
        self.send = send
        self.frames = collections.deque()           # (t, jpeg, {track: Box})
        self.armed = {}                              # track id → True once it may fire
        self.anchor = {}                             # track id → (cx, cy) where it last fired
        self.sent = collections.deque()              # timestamps of sent candidates
        self.pad = None                              # (x, y, w, h), 0–1 of the frame
        self.ref = None                              # (t, jpeg) of the pad while nothing covered it
        self.visit = None                            # the pad visit in progress
        self.after = None                            # an ended visit waiting for a clear look at the pad

    def set_pad(self, pad):
        """The marked pee pad ({x, y, w, h} or None), from the API. Call from the detector thread."""
        pad = (pad["x"], pad["y"], pad["w"], pad["h"]) if pad else None
        if pad != self.pad:
            self.pad, self.ref, self.visit, self.after = pad, None, None, None
            print(f"watch: pee pad {'at ' + str(pad) if pad else 'not marked'}", flush=True)

    def update(self, t, jpeg, boxes):
        """Feed every detection pass: the frame it ran on and every tracked box."""
        dogs = [b for b in boxes if b.cls == "dog"]
        self.frames.append((t, jpeg, {b.track: b for b in dogs}))
        while self.frames and t - self.frames[0][0] > HISTORY_S:
            self.frames.popleft()
        on = [b for b in dogs if self.pad and _feet_in(b, self.pad)]
        for b in dogs:
            if b not in on:
                self._check(t, b)  # off the pad: the still-spell rule
        if self.pad:
            self._pad(t, jpeg, boxes, on)

    def _allow(self, t):
        """The hourly cap shared by both kinds of candidate."""
        while self.sent and t - self.sent[0] > 3600:
            self.sent.popleft()
        if len(self.sent) >= MAX_PER_HOUR:
            print("watch: candidate skipped (hourly cap)", flush=True)
            return False
        self.sent.append(t)
        return True

    def _pad(self, t, jpeg, boxes, on):
        blocked = any(_overlaps(b, self.pad) for b in boxes)  # a dog or a person in front of the pad
        if self.after is not None:
            v = self.after
            if on:  # back on the pad: same visit
                self.visit, self.after = v, None
            elif not blocked or t - v["end"] > PAD_CLEAR_WAIT_S:
                self.after = None
                after = _pad_crop(jpeg, self.pad)
                if not blocked:
                    self.ref = (t, after)  # the next visit compares against this
                self._finish(v, t, after)
                return
            else:
                return
        if self.visit is None:
            if not on:
                if not blocked and (self.ref is None or t - self.ref[0] > PAD_REF_EVERY_S):
                    self.ref = (t, _pad_crop(jpeg, self.pad))
                return
            self.visit = {"start": t, "last_on": t, "frames": [], "before": self.ref[1] if self.ref else None}
        v = self.visit
        if on:
            v["last_on"] = t
            if not v["frames"] or t - v["frames"][-1][0] >= VISIT_SAMPLE_S:
                v["frames"].append((t, jpeg, max(on, key=lambda b: b.conf)))
                while t - v["frames"][0][0] > VISIT_MAX_S:
                    v["frames"].pop(0)
        elif t - v["last_on"] > PAD_VISIT_END_S:
            v["end"] = v["last_on"]
            self.visit, self.after = None, v

    def _finish(self, v, now, after):
        frames = v["frames"]
        if not frames:
            return
        visit_s = v["end"] - v["start"]
        run = _stillest(frames)
        still_s = run[-1][0] - run[0][0]
        change = _pad_change(v["before"], after) if v["before"] else None
        summary = f"pad visit {visit_s:.0f}s, still {still_s:.1f}s, pad change {change}"
        if still_s < PAD_MIN_STILL_S and (change is None or change < PAD_CHANGE_MIN):
            print(f"watch: {summary} — walked over, not asking", flush=True)
            return
        if not self._allow(now):
            return
        print(f"watch: {summary} — asking", flush=True)
        cand = self._strip(run if still_s >= 1.0 else frames, now)
        cand.update(onPad=True, visitSeconds=round(visit_s, 1), stillSeconds=round(still_s, 1),
                    padAfter=base64.b64encode(after).decode())
        if v["before"]:
            cand.update(padBefore=base64.b64encode(v["before"]).decode(), padChange=change)
        self.send(cand)

    def _history(self, track, since):
        return [(t, j, boxes[track]) for t, j, boxes in self.frames if t >= since and track in boxes]

    def _check(self, t, box):
        cx, cy = box.x + box.w / 2, box.y + box.h / 2
        if not self.armed.get(box.track, True):
            ax, ay = self.anchor[box.track]
            if max(abs(cx - ax), abs(cy - ay)) > MOVED_AWAY:
                self.armed[box.track] = True     # it moved on — the next still spell counts
            return
        hist = self._history(box.track, t - STILL_S)
        if not hist or t - hist[0][0] < STILL_S * 0.9:
            return                               # not seen for the whole window
        xs = [h[2].x + h[2].w / 2 for h in hist]
        ys = [h[2].y + h[2].h / 2 for h in hist]
        if max(xs) - min(xs) > STILL_MOVE or max(ys) - min(ys) > STILL_MOVE:
            return
        self.armed[box.track] = False
        self.anchor[box.track] = (cx, cy)
        if self._allow(t):
            self.send(self._strip(hist, t))

    def _strip(self, hist, now):
        """`hist` is [(t, jpeg, box)] of one dog; `now` the monotonic time of the newest pass."""
        start, end = hist[0][0], hist[-1][0]
        picks = []
        for k in range(STRIP_N):
            target = start + k * (end - start) / max(STRIP_N - 1, 1)
            picks.append(min(hist, key=lambda h: abs(h[0] - target)))
        # one crop region for the whole strip, so posture changes read clearly
        x1 = min(h[2].x for h in picks)
        y1 = min(h[2].y for h in picks)
        x2 = max(h[2].x + h[2].w for h in picks)
        y2 = max(h[2].y + h[2].h for h in picks)
        crops = [_crop(j, x1, y1, x2, y2) for _, j, _ in picks]
        snapshot = picks[len(picks) // 2][1]
        return {
            # wall-clock time the dog settled — the routine entry's time
            "startedAt": int(time.time() - (now - start)),
            "stillSeconds": round(end - start, 1),
            "crops": [base64.b64encode(c).decode() for c in crops],
            "snapshot": base64.b64encode(snapshot).decode(),
        }


def _crop(jpeg, x1, y1, x2, y2, pad_frac=CROP_PAD):
    rgb = simplejpeg.decode_jpeg(jpeg, colorspace="RGB")
    h, w = rgb.shape[:2]
    padx, pady = (x2 - x1) * pad_frac, (y2 - y1) * pad_frac
    l, r = max(0, int((x1 - padx) * w)), min(w, int((x2 + padx) * w))
    t, b = max(0, int((y1 - pady) * h)), min(h, int((y2 + pady) * h))
    # small dogs far away: grow the crop to a minimum size around its centre
    if r - l < CROP_MIN_PX:
        c = (l + r) // 2
        l, r = max(0, c - CROP_MIN_PX // 2), min(w, c + CROP_MIN_PX // 2)
    if b - t < CROP_MIN_PX:
        c = (t + b) // 2
        t, b = max(0, c - CROP_MIN_PX // 2), min(h, c + CROP_MIN_PX // 2)
    return simplejpeg.encode_jpeg(rgb[t:b, l:r].copy(), quality=85, colorspace="RGB")


def _feet_in(box, pad):
    """The bottom-centre of the dog's box (its paws, roughly) is on the pad, give or take PAD_MARGIN."""
    x, y, w, h = pad
    mx, my = w * PAD_MARGIN, h * PAD_MARGIN
    fx, fy = box.x + box.w / 2, box.y + box.h
    return x - mx <= fx <= x + w + mx and y - my <= fy <= y + h + my


def _overlaps(box, pad):
    x, y, w, h = pad
    return box.x < x + w and x < box.x + box.w and box.y < y + h and y < box.y + box.h


def _stillest(frames):
    """The longest run of visit frames where the dog's centre stayed within STILL_MOVE."""
    best = frames[:1]
    for i in range(len(frames)):
        xs, ys = [], []
        for j in range(i, len(frames)):
            b = frames[j][2]
            xs.append(b.x + b.w / 2)
            ys.append(b.y + b.h / 2)
            if max(xs) - min(xs) > STILL_MOVE or max(ys) - min(ys) > STILL_MOVE:
                break
            if frames[j][0] - frames[i][0] > best[-1][0] - best[0][0]:
                best = frames[i:j + 1]
    return best


def _pad_crop(jpeg, pad):
    x, y, w, h = pad
    return _crop(jpeg, x, y, x + w, y + h, pad_frac=0.1)


def _pad_change(before, after):
    """Share of the pad that looks different: grey, 4×4-block averaged, overall brightness shift removed."""
    import numpy as np

    a = simplejpeg.decode_jpeg(before, colorspace="GRAY")[..., 0].astype(np.float32)
    b = simplejpeg.decode_jpeg(after, colorspace="GRAY")[..., 0].astype(np.float32)
    if a.shape != b.shape:
        return None
    h, w = (a.shape[0] // 4) * 4, (a.shape[1] // 4) * 4
    a = a[:h, :w].reshape(h // 4, 4, w // 4, 4).mean((1, 3))
    b = b[:h, :w].reshape(h // 4, 4, w // 4, 4).mean((1, 3))
    d = b - a
    d = np.abs(d - np.median(d))  # a lamp switching on shifts every block alike; a wet patch doesn't
    return round(float((d > 20).mean()), 4)
