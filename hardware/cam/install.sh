#!/usr/bin/env bash
# Install Biru Cam on the Pi: python3-picamera2, /opt/birucam/stream.py, and a
# systemd unit so the stream comes up on power. Run ON THE PI, from this folder:
#   ./install.sh
# Re-run it after changing stream.py. Settings live in /etc/default/birucam.
set -euo pipefail
cd "$(dirname "$0")"
user="${SUDO_USER:-$USER}"

sudo apt-get install -y python3-picamera2
sudo install -D -m 755 stream.py /opt/birucam/stream.py
sudo install -m 644 detect.py watch.py /opt/birucam/
size=$(grep -oP '^BIRUCAM_DETECT_SIZE=\K\d+' /etc/default/birucam 2>/dev/null || echo 416)
sudo install -D -m 644 -t "/opt/birucam/models/yolo11n_ncnn_$size" models/yolo11n_ncnn_$size/model.ncnn.*
# the detector's runtime: ncnn from pip, beside apt's picamera2 and numpy
[ -x /opt/birucam/venv/bin/python ] || sudo python3 -m venv --system-site-packages /opt/birucam/venv
sudo /opt/birucam/venv/bin/pip install -q ncnn
sudo install -d -o "$user" -m 700 /var/lib/birucam   # the device token lives here
sed "s/@USER@/$user/" birucam.service | sudo tee /etc/systemd/system/birucam.service >/dev/null
if [ ! -f /etc/default/birucam ]; then
  sudo tee /etc/default/birucam >/dev/null <<'EOF'
# Biru Cam settings — `sudo systemctl restart birucam` after editing.
BIRUCAM_PORT=8080
BIRUCAM_WIDTH=768
BIRUCAM_HEIGHT=432
BIRUCAM_FPS=10
BIRUCAM_ROTATE=0
EOF
fi
# relay settings for the website's live view (appended once; edits are kept)
grep -q '^BIRUCAM_API_URL=' /etc/default/birucam ||
  echo 'BIRUCAM_API_URL=https://api-production-3d76.up.railway.app' | sudo tee -a /etc/default/birucam >/dev/null
grep -q '^BIRUCAM_RELAY_FPS=' /etc/default/birucam ||
  echo 'BIRUCAM_RELAY_FPS=10' | sudo tee -a /etc/default/birucam >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable --now birucam
sudo systemctl restart birucam
echo "birucam: http://$(hostname).local:8080/"
