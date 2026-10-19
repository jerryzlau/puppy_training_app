# Biru Buttons — breadboard wiring (as built)

The current prototype on the breadboard. Cached from the wiring guide artifact
<https://claude.ai/artifact/1GGDkgy1BNpkcU3g7hc9gX> (visual version saved
alongside as [`breadboard-wiring.html`](breadboard-wiring.html)). Firmware pin
constants live in `firmware/src/main.cpp`; this file is the physical layout.

## Layout

- Full-size breadboard, 30 rows, columns `a–e` | centre gap | `f–j`, a `+`/`−`
  rail pair on each side. Only the **left `−` rail** (next to the blue line) is
  used — it is the common ground. The right-hand rails are not connected to
  anything.
- **ESP32**: 30-pin ESP-WROOM-32 devkit (CP2102, USB-C), USB pointing off the
  top, straddling the gap with its pins in columns `b` and `j`, rows 1–15.
  The only free hole beside any pin is column `a` on the 3V3 side — that's why
  every signal uses a left-side pin.
- **Buttons**: two 4-leg tactile pushbuttons (not MX switches), legs in
  columns `e`/`f` across the gap:
  - 💦 pee (blue) — legs in rows 18 and 20
  - 💩 poop (red) — legs in rows 23 and 25
  - Same-side legs are joined inside the switch; a **diagonal** pair is the
    switch, so it works whichever way round the button sits. Wiring uses the
    upper-right leg (signal) and lower-left leg (ground).
- **OLED**: 0.96" SSD1306, I²C 0x3C, 4-pin header upright in column `e`,
  rows 27–30 (typically `GND VCC SCL SDA` — some modules swap the first two;
  read the silkscreen).

ESP32 left-side pins (3V3 side), rows 1–15:
`3V3 GND D15 D2 D4 RX2 TX2 D5 D18 D19 D21 RX0 TX0 D22 D23`
Right side: `VIN GND D13 D12 D14 D27 D26 D25 D33 D32 D35 D34 VN VP EN`

## Wires

| # | Colour | From | To |
|---|---|---|---|
| 1 | green | `a9` beside **D18** | pee button upper-right leg row (`h18`) |
| 2 | orange | `a10` beside **D19** | poop button upper-right leg row (`h23`) |
| 3 | black | `a2` beside **GND** (2nd pin, not 3V3) | left `−` rail |
| 4 | black | pee button lower-left leg row (`c20`) | left `−` rail |
| 5 | black | poop button lower-left leg row (`c25`) | left `−` rail |
| 6 | black | OLED GND row (`c27`) | left `−` rail |
| 7 | red | OLED VCC row (`b28`) | `a1` beside **3V3** |
| 8 | yellow | OLED SCL row (`c29`) | `a14` beside **D22** |
| 9 | blue | OLED SDA row (`d30`) | `a11` beside **D21** |

No resistors: buttons use the ESP32's internal pull-ups (pressed = LOW).

## Differences from the printed enclosure

`case/switch-plate/` now has the OLED pocket (above the caps) and a bay for
this 30-pin USB-C board. What's left:

- Buttons here are 4-leg tactile switches; the case uses Cherry-MX-style
  switches clipped into its towers. Swap them at build time (same wiring:
  one pin to the GPIO, one to GND).
- The board's header pins must be cut down to ~1 mm stubs to fit, so wires
  get soldered on instead of using breadboard jumpers.
