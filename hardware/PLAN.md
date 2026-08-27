# Biru Buttons — hardware plan

Three physical buttons — **💩 poop · 💛 pee · 🍚 food** — that log a routine
event to the household's book the moment they're pressed. One press = one
`routine_items` row with the real timestamp, no phone needed.

This is the plan only. No web/app code changes yet.

---

## 1. The shape of the thing

**v1: one 3-button pad** (recommended start)
A single palm-sized 3D-printed puck by the door / food area with three labelled
buttons. One microcontroller, one WiFi connection, one pairing, USB-C powered.
Cheapest and simplest to build and to pair.

**v2 option: three single-button pucks**
Same firmware, `BUTTON_COUNT=1`, three separate pairings — lets the food button
live at the bowl and the potty buttons at the door. Battery-powered (see §6).
Nothing in the server design below cares which shape the client is.

## 2. Bill of materials (v1, ~US$15)

| Part | Qty | ~Cost | Notes |
|---|---|---|---|
| ESP32-C3 SuperMini | 1 | $4 | WiFi + TLS, tiny (22×18mm), USB-C onboard |
| 24mm arcade buttons | 3 | $5 | satisfying to press; or Cherry MX + printed keycaps |
| WS2812 RGB LED (or 3 plain LEDs) | 1–3 | $1 | press feedback |
| USB-C cable + any 5V brick | 1 | — | v1 power |
| M3 heat-set inserts + screws | 4 | $1 | lid fastening |
| hookup wire, protoboard scrap | — | $1 | buttons → GPIO, common ground |

Wiring: each button between a GPIO and GND, internal pull-ups, firmware
debounce. LED on one data pin. No PCB needed for v1 — direct wire is fine.

## 3. How a button gets tied to YOUR account — pairing

The core problem: the device must write to *your household* without ever
holding your password or a short-lived Supabase JWT (those expire hourly and
refreshing them on a microcontroller is fragile). The answer is a **device
token**, provisioned once through a claim flow that mirrors the app's existing
invite-token pattern:

```
 Phone (app, signed in)            Server (Railway API)              Button (ESP32)
 ──────────────────────            ────────────────────              ──────────────
 Family page →
 "add a button pad"  ──────────►  POST /devices
                                   creates device row for YOUR
                                   household + one-time
                                   6-char claim code (15 min TTL)
                     ◄──────────  { claimCode: "K7F3QM" }
 shows "K7F3QM"

                     (first boot: button has no token → SETUP MODE:
                      it broadcasts WiFi AP "BiruButtons-XXXX")

 phone joins that AP →
 captive portal page:
   • home WiFi name + password
   • claim code  ──────────────────────────────────────────────►  stores WiFi creds,
                                                                  joins home WiFi
                                  POST /devices/claim  ◄────────  { claimCode }
                                   code valid + unused?
                                   → mint device_token
                                     (32 random bytes),
                                     store only its hash,
                                     mark code used
                                  ──────────────────────────────► token saved to
                                                                  flash (NVS). Done —
                                                                  LED green, AP off.
```

- The claim code is **single-use and expiring** — exactly the semantics of
  `friend_invites` tokens, so the server implementation is a copy of a pattern
  the codebase already has.
- The device token is scoped: it can do exactly one thing (log pee/poop/food
  to that one household). If it leaks, worst case someone logs fake poops —
  and you revoke it from the Family page.
- Stored server-side as a hash (like a password), shown in full exactly once
  to the claiming device.
- Re-pairing / new WiFi: hold any button 10 s → wipe NVS → setup mode again.

## 4. What a press does — the ingest path

```
 press 💩 ──► debounce ──► LED pulses ──► POST https://api…/ingest/routine
                                           Authorization: Device <token>
                                           { kind: "poop",
                                             pressId: "<uuid>",        ← dedupe key
                                             pressedAt: 1793212345 }   ← unix, from SNTP
                                          ◄─ 201 → LED solid green 1 s
                                          ◄─ fail → LED red, press queued in
                                             flash, retried on next press/hour
```

Server side (`POST /ingest/routine`, device auth — **not** `requireMember`):

1. Hash the presented token, look up the device → household; reject revoked.
2. Validate `kind ∈ {pee, poop, food}` (server-controlled allowlist).
3. Dedupe on `pressId` — retries after a timeout can't double-log.
4. Compute `day` server-side with the existing `localDay()` helper (the
   device never does timezone math).
5. Insert `routine_items` with `kind` = "Pee"/"Poop"/"Food" (matching the
   kind_keys the app's chips, bell, and forecast already recognize),
   `created_by` = the user who paired the device, `device_id` set for
   provenance.
6. Touch `last_seen_at` (Family page shows "last seen 2 h ago" per device).
7. Rate-limit ~100 presses/day/device (a stuck button can't flood the book).

Because the row is an ordinary `routine_items` row, **everything downstream
lights up for free**: the day timeline, the history calendar, the pattern
strip, the 🔮 forecast, and friends' 🔔 bathroom bulletins.

Timestamps: firmware syncs SNTP after each WiFi connect. If a press happens
before first sync (rare), it's sent with `pressedAt: null` and the server
stamps receipt time.

## 5. Server & app work (the software half, ~a day)

- **Migration 0009**: `devices` table — `id, household_id (cascade), name,
  token_hash unique, claim_code, claim_expires_at, claimed_at, created_by,
  last_seen_at, revoked_at, created_at`. Plus nullable
  `routine_items.device_id` for provenance. Additive only.
- **API** (`apps/api/src/routes/devices.ts`):
  - `POST /devices` (requireMember) → device row + claim code
  - `GET /devices` (requireMember) → list with last-seen
  - `DELETE /devices/:id` (requireMember) → revoke (token dead immediately)
  - `POST /devices/claim` (public, code-gated) → one-time token mint
  - `POST /ingest/routine` (device token auth) → the press path above
- **Family page**: a "🔘 buttons & gadgets" dashed box — add device (shows
  claim code big and friendly), list with last-seen, revoke ✕. Same visual
  pattern as friend books.

## 6. Firmware (`hardware/firmware/`, PlatformIO + Arduino-ESP32)

State machine:

- **SETUP** (no token in NVS): WiFi AP + captive portal (WiFiManager-style)
  asking for home WiFi + claim code → claim → reboot to NORMAL.
- **NORMAL**: deep sleep, wake on any button GPIO. On wake: identify button,
  debounce, connect WiFi (stored creds), SNTP if stale, flush any queued
  presses then send this one, LED feedback, back to deep sleep.
  Wake→POST→sleep is ~3–5 s; the LED covers the wait.
- **Queue**: NVS ring buffer (32 presses) for offline periods.
- **Reset**: any button held 10 s → wipe → SETUP.
- TLS: pinned ISRG Root X1 (Let's Encrypt root, covers the Railway domain);
  clock from SNTP before first TLS handshake.

v2 battery notes: ESP32-C3 deep sleep ≈ 10 µA; a 1000 mAh LiPo + TP4056
charge board gives months per charge at ~20 presses/day. USB-C v1 first —
battery adds charging, a fuel gauge question, and enclosure volume.

## 7. Enclosure (`hardware/case/`, OpenSCAD → STL)

Parametric OpenSCAD source committed (code-diffable CAD), exported STLs
alongside:

- `base.scad` — tray with ESP32 pocket, USB-C port cutout, M3 inserts
- `lid.scad` — 3 × 24 mm button holes, **embossed 💩/💧/🍚 glyphs** (or
  POOP/PEE/FOOD text — emoji embossing depends on printer resolution),
  light pipe hole for the LED
- ~90×45×28 mm, PETG or PLA, no supports, 0.2 mm layers
- Non-slip: recessed pads for adhesive rubber feet

## 8. Build order

1. Server: migration 0009 + `devices.ts` routes + curl-verified claim/ingest
   (testable with plain curl *before any hardware exists* — a "virtual
   button" is just a curl loop with a device token)
2. Family page device management
3. Firmware on a bare ESP32 devkit + 3 loose buttons on a breadboard
4. End-to-end: breadboard press → row appears in Routine tab → forecast
   updates → friend's bell rings
5. Enclosure print + final assembly
6. (later) v2: battery variant, per-location single buttons

## 9. Risks & open questions

- **Food kind**: "Food" isn't a special kind anywhere today (pee/poop feed
  the bell + forecast). It logs fine as a routine item; if you want food in
  the forecast tab later, that's a small extension.
- **Multi-pet future**: buttons log to the *household*; if a second pet ever
  arrives, buttons would need a pet selector or per-pet pads.
- **WiFi only**: no BLE/phone-relay path in v1 — the button is useless away
  from home WiFi, which for a door-mounted potty button is fine.
- **Undo**: mis-presses are deleted in the app (the ✕ already exists on
  routine rows). No undo button on the device — simpler is better.
