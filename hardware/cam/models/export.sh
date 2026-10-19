#!/usr/bin/env bash
# Export YOLO11n (COCO) for the Pi — run on the Mac, not the Pi (it needs
# Ultralytics + PyTorch, ~2 GB). The Pi only gets the small exported files.
#   python3 -m venv /tmp/yolo && /tmp/yolo/bin/pip install ultralytics
#   PYTHON=/tmp/yolo/bin/python ./export.sh            # sizes 256 320 416
#   PYTHON=/tmp/yolo/bin/python ./export.sh 320        # just one
# Outputs yolo11n_ncnn_<size>/model.ncnn.{param,bin} and yolo11n_<size>.onnx here.
set -euo pipefail
cd "$(dirname "$0")"
PY="${PYTHON:-python3}"
sizes=("${@:-256 320 416}")
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
for size in ${sizes[@]}; do
  (cd "$work" && "$PY" - "$size" <<'PYEOF'
import sys
from ultralytics import YOLO
size = int(sys.argv[1])
YOLO("yolo11n.pt").export(format="ncnn", imgsz=size)
YOLO("yolo11n.pt").export(format="onnx", imgsz=size, opset=17, simplify=True)
PYEOF
  )
  rm -rf "yolo11n_ncnn_$size"
  mkdir "yolo11n_ncnn_$size"
  cp "$work/yolo11n_ncnn_model/model.ncnn.param" "$work/yolo11n_ncnn_model/model.ncnn.bin" "yolo11n_ncnn_$size/"
  cp "$work/yolo11n.onnx" "yolo11n_$size.onnx"
  rm -rf "$work/yolo11n_ncnn_model" "$work/yolo11n.onnx"
  echo "exported $size"
done
