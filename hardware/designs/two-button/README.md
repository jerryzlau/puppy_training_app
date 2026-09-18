# Two-button enclosure — design concepts

Four directions for a 💧 / 💩 two-button logger, drawn before any CAD.
Same electronics as the door bar (ESP32-C3 SuperMini, USB-C, one LED);
the buttons are off-the-shelf **arcade dome buttons** (60 mm or 45 mm,
microswitch inside, ~$3 each) so no keycap stems to tune — the emoji is a
printed disc under the clear dome, or an inlay on a printed cap.

| # | Design | One-liner | Placement | Print |
|---|--------|-----------|-----------|-------|
| 01 | [the pill](01-pill.png) | two 60 mm domes in a stadium puck | floor / shelf | easy |
| 02 | [the bone](02-bone.png) | dog bone, a 45 mm button in each end | floor / bed | medium |
| 03 | [the switch plate](03-switch-plate.png) | two-gang wall plate, big square caps | wall by the door | easiest |
| 04 | [the seesaw](04-seesaw.png) | one rocking bar, tip either end | floor / desk | medium (moving part) |

Sheets are generated from `_sheet.py` (SVG → PNG via headless Chrome, so
the emoji render). Edit and re-run `python3 _sheet.py`.

Design 3 was picked → parametric OpenSCAD + STLs in `../../case/switch-plate/`.
