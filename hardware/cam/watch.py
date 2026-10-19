"""Biru Cam: spot moments that might be a pee or poop (VISION-PLAN.md, CAM-PLAN.md §4).

The detector finds the dog; this decides when it's worth asking the API
"pee, poop, or neither?". A puppy squatting holds still in one spot, so a
moment is a **candidate** when a dog track has barely moved for STILL_S
seconds. The API (which holds the Claude key) gets 4 crops of the dog,
~1.5 s apart, plus one full frame for the routine entry's photo.

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


class Watcher:
    def __init__(self, send):
        """`send(candidate_dict)` is called (from the detector thread) with a ready candidate."""
        self.send = send
        self.frames = collections.deque()           # (t, jpeg, {track: Box})
        self.armed = {}                              # track id → True once it may fire
        self.anchor = {}                             # track id → (cx, cy) where it last fired
        self.sent = collections.deque()              # timestamps of sent candidates

    def update(self, t, jpeg, dogs):
        """Feed every detection pass: the frame it ran on and the visible dog boxes."""
        self.frames.append((t, jpeg, {b.track: b for b in dogs}))
        while self.frames and t - self.frames[0][0] > HISTORY_S:
            self.frames.popleft()
        for b in dogs:
            self._check(t, b)

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
        while self.sent and t - self.sent[0] > 3600:
            self.sent.popleft()
        self.armed[box.track] = False
        self.anchor[box.track] = (cx, cy)
        if len(self.sent) >= MAX_PER_HOUR:
            print("watch: candidate skipped (hourly cap)", flush=True)
            return
        self.sent.append(t)
        self.send(self._candidate(hist, t))

    def _candidate(self, hist, now):
        start = hist[0][0]
        picks = []
        for k in range(STRIP_N):
            target = start + k * (now - start) / max(STRIP_N - 1, 1)
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
            "stillSeconds": round(now - start, 1),
            "crops": [base64.b64encode(c).decode() for c in crops],
            "snapshot": base64.b64encode(snapshot).decode(),
        }


def _crop(jpeg, x1, y1, x2, y2):
    rgb = simplejpeg.decode_jpeg(jpeg, colorspace="RGB")
    h, w = rgb.shape[:2]
    padx, pady = (x2 - x1) * CROP_PAD, (y2 - y1) * CROP_PAD
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
