# Biru Buttons — firmware

PlatformIO + Arduino-ESP32. Design in [../PLAN.md](../PLAN.md).

```
pio run -t upload        # compile + flash (default env: wroom32, mock server)
pio device monitor       # serial log, Ctrl+C to exit (close it before uploading)
```

## Boards

| env | board | when |
|---|---|---|
| `wroom32` (default) | ESP-WROOM-32 devkit, CP2102, USB-C | breadboard stage — what we have now |
| `c3` | ESP32-C3 SuperMini | the enclosure build |
| `wroom32-live` | as `wroom32`, real API on Railway | production — presses land in the book |

Breadboard pins (30-pin ESP32 devkit): **pee = D18, poop = D19** (C3 SuperMini:
GPIO3 / GPIO4), each button between its GPIO and GND (internal pull-ups, no
resistors). Both pins are on the 3V3/GND side of the board — the side that
leaves a free breadboard column beside the pins. One press = one event; the LED blinks once for pee, twice for poop.
Illuminated buttons: LED pair to VIN (5 V) + GND. Onboard blue LED = GPIO 2.

Optional screen — 0.96" SSD1306 OLED, I2C address 0x3C: **GND → GND rail,
VCC → 3V3, SCL → D22, SDA → D21** (C3: SDA 5 / SCL 6). Shows today's 💦 / 💩
tally: `GET /ingest/today` on boot and every 5 min, plus the tally that comes
back with every press. Boots fine with no screen attached.

## Never touch the live database while testing hardware

`apps/api/.env` points at the **hosted** Supabase, so a local `pnpm dev:api`
writes to the real book. The firmware therefore never talks to the API by
default — it talks to a mock that has no database at all:

```
python3 tools/mock_ingest.py        # prints the URL to put in BIRU_API_URL
```

It implements `POST /devices/claim` and `POST /ingest/routine` with the same
status codes the real server will use (201 / 200-duplicate / 401 / 400) and
just prints every press. `GET /presses` lists what it has received.

Presses reach the real book **only** when you build `-e wroom32-live`.

## Going live: pairing a board

The live build needs a device token, minted by the server and stored in the
board's flash (NVS). It never lives in a file.

1. App → Family page → **🔘 buttons & gadgets → add a button pad**. You get a
   6-character pairing code, good for 15 minutes.
2. `pio run -e wroom32-live -t upload`, then `pio device monitor`.
3. The board says `UNPAIRED`. Type `claim K7F3QM` (your code) + Enter. It POSTs
   `/devices/claim`, saves the token, and the LED goes solid for a second.
   (Alternative: `#define BIRU_CLAIM_CODE "K7F3QM"` in `secrets.h` and it pairs
   itself on boot — remove the line afterwards, codes are single-use.)
4. Press a button — 💦 on D18 logs Pee, 💩 on D19 logs Poop — each POSTed
   with the unix time of the press; the Routine tab shows it as `🔘 Jerry's button`.
   Pressing the same thing again within a minute is debounced server-side:
   the board still gets a 200 (one long blink) but no second row is written.

Un-pair: hold either button 10 s, or type `reset`. Revoke from the server side
with ✕ on the Family page — the token dies immediately.

Serial commands: `1` (pee), `2` (poop) simulate a press, `claim <code>`, `reset`.

### TLS

The live build pins Let's Encrypt's roots (`include/certs.h`: ISRG Root X2,
which `*.up.railway.app` chains to today, plus X1). No `setInsecure()`. If the
API moves to a domain with a different CA, regenerate the bundle from
<https://letsencrypt.org/certs/> (or the new CA's root).
