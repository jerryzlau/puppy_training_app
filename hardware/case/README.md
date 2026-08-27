# Door bar — printable case (design 03)

Parametric OpenSCAD for the chosen design. Everything derives from
`config.scad`; regenerate STLs and previews with `./render.sh`.

## Parts & print settings

| File | Print | Notes |
|---|---|---|
| `stl/lid.stl` | face down, no supports | front face is the MX switch plate (1.5 mm at cutouts) |
| `stl/base.stl` | flat, no supports | wall plate: keyholes for screws, flat back for command strips |
| `stl/keycap-{poop,pee,food}.stl` | face down ×3 | engraved labels; print in 3 colors if you have them |

PETG or PLA · 0.2 mm layers · 3 walls on the lid (screw bosses).

## Assembly

1. Melt four M3 heat-set inserts into the lid's corner bosses.
2. Clip three MX switches into the face cutouts; press keycaps on.
3. Seat the ESP32-C3 between the corner posts in the bottom bay; wire
   each switch to a GPIO + common ground, LED behind the slot.
4. Screw the base onto the lid from the back (4× M3 countersunk).
5. Wall: two screws through the keyholes, or command strips on the flat
   back. USB-C exits the bottom edge.

## First-print checks (FDM tolerances vary)

- **Keycap stem**: `cross_t = 1.35` — print ONE cap first; loose → 1.30,
  tight → 1.40.
- **MX cutouts**: 14.0 mm nominal; if switches won't clip, add 0.1.
- The bottom ESP corner posts intentionally fuse with the nearby screw
  bosses — cosmetic, not a defect.
