// Biru Buttons · switch plate (design 03) — shared parameters
// Two big square caps (💦 pee / 💩 poop) on a wall plate beside the door,
// with a 0.96" SSD1306 OLED above them.
// All mm. Every part includes this file.
//
// Coordinates: face.scad has the FRONT face at z=0 and grows toward the wall
// (+z). back.scad / cap.scad / inlay.scad have their bed-side face at z=0.
// Everything prints exactly as modelled — flat side down, no supports.

/* ── plate ───────────────────────────────────────────────────── */
plate_w = 70;
plate_h = 160;         // 125 before the OLED went on top
plate_d = 22;          // wall to front face
wall    = 2.4;
corner_r = 8;
back_t  = 2.4;         // back plate (nests inside the shell)

/* ── caps ────────────────────────────────────────────────────── */
cap_size  = 47;        // square cap
cap_r     = 6;         // cap corner radius
cap_pitch = 56;        // cap centre to cap centre (stacked vertically)
cap_proud = 6;         // how far the cap face stands off the plate at rest
cap_top   = 2.6;       // cap face thickness
cap_chamfer = 1.5;     // edge chamfer on the cap face
cap_travel = 4;        // MX travel
skirt_t   = 1.6;       // cap skirt wall
skirt_h   = 14;        // skirt height incl. the face (anti-wobble guide)
well_clear = 1.0;      // gap between cap and well per side
well_r    = cap_r + well_clear;
guide_t   = 1.6;       // guide tube wall behind the front skin
guide_depth = 12;      // guide tube depth from the front face
cap_shift = -17.5;     // caps sit low; the OLED takes the top of the plate
cap_centres = [cap_pitch/2 + cap_shift, -cap_pitch/2 + cap_shift];   // pee (top), poop (bottom)

/* ── emoji inlays ────────────────────────────────────────────── */
emoji_scale = 1.0;     // 1.0 ≈ 32 mm tall emoji on a 47 mm cap
recess_d    = 1.0;     // recess in the cap face
inlay_t     = 2.0;     // inlay thickness → stands (inlay_t - recess_d) proud
inlay_clear = 0.12;    // recess is offset by this per side

/* ── switches (Cherry-MX style, plate mount on a tower) ─────── */
mx_cut   = 14.0;
mx_plate = 1.5;
mx_body  = 15.6;       // clearance for the switch body below the plate
stem_top = 6.6;        // MX stem tip above the plate top at rest
tower_w  = 20;         // square tower, walls = (tower_w - mx_cut)/2
stem_od  = 5.5;        // cap stem boss
boss_h   = 5.0;        // boss below the cap face
stem_len = 3.8;        // cross pocket depth
cross_w  = 4.15;
cross_t  = 1.35;       // 1.27 nominal + FDM slack — test-fit and adjust
wire_slot_w = 5;       // wire exits in the tower sides
wire_slot_h = 10;

// tower height so the cap face rests cap_proud off the plate
tower_h = (plate_d - back_t) - stem_top
          - (-cap_proud + cap_top + boss_h - stem_len);

/* ── OLED: 0.96" SSD1306 128×64 I2C module (generic 4-pin) ──── */
// Upright, header (GND VCC SCL SDA) along the TOP edge, pins out the back.
// The glass nests in a ledge behind the front skin; four posts on the back
// plate clamp the PCB against it. Sellers vary by a few tenths — caliper
// yours. The two *_top values are measured down from the PCB's top edge
// (light the screen up to see where the pixels start).
oled_pcb     = [27.3, 27.8];  // PCB w × h (some clones are 27 × 27)
oled_pcb_t   = 1.2;
oled_clr     = 0.4;           // PCB pocket clearance per side
oled_glass   = [26.7, 19.3];  // glass panel w × h
oled_glass_t = 1.5;           // glass proud of the PCB = ledge thickness
oled_glass_top = 4.5;         // PCB top edge → glass top edge
glass_clr    = 0.3;           // glass cut-out clearance per side
ribbon_clr   = 1.0;           // extra room below the glass for its flex ribbon
oled_aa      = [21.74, 10.86];// active area (128 × 64 px)
oled_aa_top  = 6.5;           // PCB top edge → top pixel row
oled_win_margin = 0.7;        // window border around the active area, per side
oled_frame_t = 1.6;           // PCB frame wall
oled_frame_d = 4;             // frame depth behind the skin
oled_hole_in = 2.3;           // M2 hole centres from the PCB edges
oled_post_d  = 3.5;           // clamp posts on the back plate
oled_pin_d   = 1.6;           // locating pin into the M2 hole
oled_pin_h   = 1.0;
// centred between the top guide tube and the top inner wall
oled_y = ((cap_centres[0] + (cap_size + 2*well_clear)/2 + guide_t) + (plate_h/2 - wall)) / 2;
// PCB-centre-relative y of the glass, active area/window, and hole rows
oled_glass_y = oled_pcb[1]/2 - oled_glass_top - oled_glass[1]/2;
oled_win_y   = oled_pcb[1]/2 - oled_aa_top - oled_aa[1]/2;
oled_win     = [oled_aa[0] + 2*oled_win_margin, oled_aa[1] + 2*oled_win_margin];
oled_holes   = [for (sx = [-1, 1], sy = [-1, 1])
                 [sx * (oled_pcb[0]/2 - oled_hole_in), sy * (oled_pcb[1]/2 - oled_hole_in)]];

/* ── electronics ─────────────────────────────────────────────── */
// board = "devkit32": 30-pin ESP-WROOM-32 devkit (CP2102, USB-C), lying flat
//         between the two switches with its header pins cut short; USB out
//         the SIDE of the plate.
// board = "c3": ESP32-C3 SuperMini in a rail beside the lower switch, USB-C
//         out the BOTTOM.
board = "devkit32";
rail_t = 1.2;
rail_h = 3.5;
rail_clr = 0.3;

// devkit32 — measure yours: 30-pin clones are ~52 × 28.5 mm
dk_l = 52;             // along x (USB on one short end)
dk_w = 28.5;           // along y
dk_y = cap_shift;      // board centre, midway between the two towers
dk_stub = 1.0;         // header pin stubs left after cutting → board sits this high
dk_t = 1.6;
usb_side = 1;          // +1: cable exits on your LEFT as you face the plate, -1: right
dk_usb_w = 12;         // USB-C plug overmould clearance (across y)
dk_usb_h = 8;          // (across z)
dk_usb_z = (plate_d - back_t) - dk_stub - dk_t - 1.4;   // plug centre from the front face

// c3 — ESP32-C3 SuperMini
esp_w = 18.5;          // across (x)
esp_l = 23.5;          // along the plate (y), USB-C at the bottom end
esp_t = 5;
esp_x = -20.5;         // board centre x — beside the lower tower, 1.25 mm off it
esp_gap = 0.6;         // board bottom edge from the inner wall
usb_w = 9.4;
usb_h = 3.6;
usb_z = 17;            // plug centre from the front face (face coords)

/* ── mounting ────────────────────────────────────────────────── */
m3_insert_d = 4.0;
m3_clear_d  = 3.4;
boss_d = m3_insert_d + 2*wall;
// top pair beside the OLED; the devkit lies between the caps, so its lower
// pair moves down beside the bottom cap
boss_pos = board == "devkit32"
  ? [[29.5, oled_y], [-29.5, oled_y], [29.5, cap_centres[1] - 20], [-29.5, cap_centres[1] - 20]]
  : [[29.5, oled_y], [-29.5, oled_y], [29.5, cap_shift], [-29.5, cap_shift]];
keyhole_screw_d = 4.2;
keyhole_slot_d  = 2.4;
keyhole_slot_l  = 5;
keyhole_pos = [[0, cap_centres[0] + 16], [0, cap_centres[1] - 18]];   // big hole; slot runs upward (hidden under the caps)

$fn = 48;

module rrect(w, h, r) {
  offset(r = r) square([w - 2*r, h - 2*r], center = true);
}
