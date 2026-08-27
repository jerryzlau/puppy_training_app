# Biru Buttons — enclosure design concepts

Four directions to choose from before any CAD happens. Each sheet shows a
front/top view, a side profile with rough dimensions, and honest tradeoffs.
All four share the same electronics (ESP32-C3, three switches, one LED,
USB-C) and the same pairing/ingest design from ../PLAN.md — this choice is
purely about form, placement, and printability.

| # | Design | One-liner | Placement | Print difficulty |
|---|--------|-----------|-----------|------------------|
| 01 | polaroid pad | a pressable polaroid, straight out of the app | desk / floor | easy |
| 02 | the paw | toe beans are the buttons | floor / shelf | hard (curves) |
| 03 | door bar | slim light-switch bar beside the door | wall | easiest |
| 04 | bone wedge | angled dog-bone console | desk / shelf | medium |

Pick one (or ask for a mashup — e.g. the door bar with paw-shaped caps) and
the next step is parametric OpenSCAD in ../case/ for that direction.
