# Biru Cam — Pi side

The camera half of [../CAM-PLAN.md](../CAM-PLAN.md) §3: a Raspberry Pi 5 +
Camera Module 3 Wide that serves an MJPEG stream on the LAN and nothing else.

| URL | what |
|---|---|
| `http://birucam.local:8080/` | live view in a browser |
| `http://birucam.local:8080/stream` | MJPEG stream (what the Mac watcher pulls) |
| `http://birucam.local:8080/snapshot.jpg` | latest frame |

## Pi setup (once)

Raspberry Pi Imager → Pi 5 → Raspberry Pi OS Lite (64-bit), with customisation:
hostname `birucam`, user `jerry`, home WiFi, SSH on. Camera ribbon (the 500 mm
Pi 5 cable) in **CAM/DISP 0**. Metal contacts face the connector's pins at both
ends. Check it with `rpicam-hello --list-cameras` → `imx708_wide`.

From the Mac: `ssh-copy-id jerry@birucam.local` for key login.

## Install / update

```
scp stream.py birucam.service install.sh jerry@birucam.local:birucam/
ssh jerry@birucam.local 'cd birucam && ./install.sh'
```

`install.sh` puts `stream.py` in `/opt/birucam/`, installs the `birucam`
systemd unit (starts on boot, restarts on crash) and writes settings to
`/etc/default/birucam`:

- `BIRUCAM_WIDTH` / `BIRUCAM_HEIGHT` / `BIRUCAM_FPS` — default 768×432 @ 10 fps.
  16:9 keeps the Wide lens's full 120° view; 4:3 crops the sides.
- `BIRUCAM_ROTATE` — `0` or `180` for an upside-down mount. The image
  pipeline only flips, so mount the camera upright, not on its side.

## Live view on the website

The Routine page's **📷 live** tab shows this camera to logged-in household
members, from anywhere. The Pi relays frames through the Biru API on
Railway, outbound only. It long-polls `GET /ingest/cam/wait` and POSTs JPEGs to
`/ingest/cam/frame` at `BIRUCAM_RELAY_FPS` (default 5), **only while
someone has the tab open**. Nothing is recorded.

Pair it once:

1. App → Family → 🔘 buttons & gadgets → **add a camera** to get a 6-character
   code, valid for 15 min.
2. On the Pi: `python3 /opt/birucam/stream.py claim K7F3QM`. The token goes
   to `/var/lib/birucam/device_token`, and the running service picks it up
   within 10 s.

To unpair, use ✕ on the Family page; the relay then logs "token rejected".
Relay messages show up in `journalctl -u birucam` ("someone's watching —
sending" / "nobody watching — idle").

`journalctl -u birucam -f` for logs. Autofocus runs once at start and then
holds, because the scene is static.

The fan is temperature-controlled. It stays off below about 50 °C, which is
most of the time at this load.
