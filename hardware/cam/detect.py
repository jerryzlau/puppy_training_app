"""Biru Cam vision: YOLO11n on the Pi 5's CPU (VISION-PLAN.md).

No Ultralytics or PyTorch on the Pi. The model is exported once on the Mac
(models/export.sh) and run here with the small `ncnn` runtime (or
onnxruntime as a fallback). Pre-processing (letterbox) and post-processing
(decode + NMS) live in this file.

    det = Detector()                     # loads models/yolo11n_ncnn_<size>
    boxes = det(rgb)                     # HxWx3 uint8 → [Box, …], coords 0–1
    tracker = Tracker(); tracked = tracker.update(boxes, now)
"""
import os
import time
from dataclasses import dataclass, field

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
# COCO ids for the classes the camera cares about
COCO = {0: "person", 15: "cat", 16: "dog"}
NAMES = {v: k for k, v in COCO.items()}


@dataclass
class Box:
    cls: str
    conf: float
    x: float  # left, 0–1 of frame width
    y: float  # top, 0–1 of frame height
    w: float
    h: float
    track: int = 0

    def json(self):
        r = lambda v, n=4: round(float(v), n)  # numpy float32 isn't JSON-serialisable
        return {"cls": self.cls, "conf": r(self.conf, 2), "x": r(self.x), "y": r(self.y),
                "w": r(self.w), "h": r(self.h), "track": self.track}


def letterbox(rgb, size):
    """Fit `rgb` into a size×size square (aspect kept, grey padding), as YOLO was trained."""
    h, w = rgb.shape[:2]
    scale = min(size / w, size / h)
    nw, nh = int(round(w * scale)), int(round(h * scale))
    # nearest-neighbour resize in numpy — the lores frame is already small
    ys = (np.arange(nh) / scale).astype(np.int32).clip(0, h - 1)
    xs = (np.arange(nw) / scale).astype(np.int32).clip(0, w - 1)
    resized = rgb[ys][:, xs]
    out = np.full((size, size, 3), 114, np.uint8)
    top, left = (size - nh) // 2, (size - nw) // 2
    out[top:top + nh, left:left + nw] = resized
    return out, scale, left, top


def nms(boxes, scores, iou=0.45):
    """Plain greedy non-max suppression on x1,y1,x2,y2 boxes."""
    order = scores.argsort()[::-1]
    keep = []
    while order.size:
        i = order[0]
        keep.append(i)
        xx1 = np.maximum(boxes[i, 0], boxes[order[1:], 0])
        yy1 = np.maximum(boxes[i, 1], boxes[order[1:], 1])
        xx2 = np.minimum(boxes[i, 2], boxes[order[1:], 2])
        yy2 = np.minimum(boxes[i, 3], boxes[order[1:], 3])
        inter = np.clip(xx2 - xx1, 0, None) * np.clip(yy2 - yy1, 0, None)
        area = lambda b: (b[..., 2] - b[..., 0]) * (b[..., 3] - b[..., 1])
        union = area(boxes[i]) + area(boxes[order[1:]]) - inter
        order = order[1:][inter / np.maximum(union, 1e-6) < iou]
    return keep


class Detector:
    def __init__(self, size=320, classes=("dog", "cat", "person"), min_conf=0.4, backend="ncnn", threads=2):
        self.size = size
        self.class_ids = [NAMES[c] for c in classes]
        self.min_conf = min_conf
        self.backend = backend
        if backend == "ncnn":
            import ncnn

            self.net = ncnn.Net()
            self.net.opt.num_threads = threads
            base = os.path.join(HERE, "models", f"yolo11n_ncnn_{size}")
            self.net.load_param(os.path.join(base, "model.ncnn.param"))
            self.net.load_model(os.path.join(base, "model.ncnn.bin"))
            self.ncnn = ncnn
        else:
            import onnxruntime as ort

            so = ort.SessionOptions()
            so.intra_op_num_threads = threads
            self.sess = ort.InferenceSession(os.path.join(HERE, "models", f"yolo11n_{size}.onnx"), so)
            self.input = self.sess.get_inputs()[0].name

    def _infer(self, chw):
        if self.backend == "ncnn":
            ex = self.net.create_extractor()
            ex.input("in0", self.ncnn.Mat(chw))
            _, out = ex.extract("out0")
            return np.array(out)  # (84, N)
        return self.sess.run(None, {self.input: chw[None]})[0][0]  # (84, N)

    def __call__(self, rgb):
        h, w = rgb.shape[:2]
        img, scale, left, top = letterbox(rgb, self.size)
        chw = np.ascontiguousarray(img.transpose(2, 0, 1), dtype=np.float32) / 255.0
        out = self._infer(chw)
        # rows 0–3: cx, cy, w, h in letterboxed pixels; rows 4+: per-class scores
        scores = out[4:][self.class_ids]  # (k, N)
        best = scores.argmax(0)
        conf = scores[best, np.arange(scores.shape[1])]
        mask = conf >= self.min_conf
        if not mask.any():
            return []
        cx, cy, bw, bh = out[:4, mask]
        conf, best = conf[mask], best[mask]
        xyxy = np.stack([cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2], 1)
        xyxy[:, [0, 2]] = (xyxy[:, [0, 2]] - left) / scale / w
        xyxy[:, [1, 3]] = (xyxy[:, [1, 3]] - top) / scale / h
        xyxy = xyxy.clip(0, 1)
        boxes = []
        for i in nms(xyxy, conf):
            x1, y1, x2, y2 = xyxy[i]
            boxes.append(Box(COCO[self.class_ids[best[i]]], float(conf[i]), x1, y1, x2 - x1, y2 - y1))
        return boxes


def iou(a, b):
    ix = max(0.0, min(a.x + a.w, b.x + b.w) - max(a.x, b.x))
    iy = max(0.0, min(a.y + a.h, b.y + b.h) - max(a.y, b.y))
    inter = ix * iy
    return inter / max(a.w * a.h + b.w * b.h - inter, 1e-6)


@dataclass
class Track:
    id: int
    box: Box
    hits: list = field(default_factory=list)  # recent detection timestamps
    first: float = 0.0
    last: float = 0.0


class Tracker:
    """Greedy IoU tracker: stable ids across frames, plus de-flickering.

    A track shows once it was seen in 2 of the last 3 detection passes, and
    lingers until it's been missing for `linger` seconds.
    """

    def __init__(self, linger=3.0, match_iou=0.3):
        self.linger, self.match_iou = linger, match_iou
        self.tracks: list[Track] = []
        self.next_id = 1
        self.passes: list[float] = []

    def update(self, boxes, now=None):
        now = time.monotonic() if now is None else now
        self.passes = (self.passes + [now])[-3:]
        unmatched = list(boxes)
        for t in sorted(self.tracks, key=lambda t: -t.last):
            cands = [b for b in unmatched if b.cls == t.box.cls]
            if not cands:
                continue
            b = max(cands, key=lambda b: iou(t.box, b))
            if iou(t.box, b) >= self.match_iou:
                unmatched.remove(b)
                b.track = t.id
                t.box, t.last = b, now
                t.hits = (t.hits + [now])[-3:]
        for b in unmatched:
            b.track = self.next_id
            self.tracks.append(Track(self.next_id, b, [now], now, now))
            self.next_id += 1
        self.tracks = [t for t in self.tracks if now - t.last <= self.linger]
        return [t.box for t in self.tracks if len([h for h in t.hits if h >= self.passes[0]]) >= min(2, len(self.passes))]

    def presence(self, now=None):
        """Per class: seconds since the longest-visible current track appeared."""
        now = time.monotonic() if now is None else now
        out = {}
        for t in self.tracks:
            if len(t.hits) >= 2:
                out[t.box.cls] = max(out.get(t.box.cls, 0.0), now - t.first)
        return out
