// Biru Buttons · switch plate (design 03) — shared parameters
// Two big square caps (💦 pee / 💩 poop) on a wall plate beside the door.
// All mm. Every part includes this file.
//
// Coordinates: face.scad has the FRONT face at z=0 and grows toward the wall
// (+z). back.scad / cap.scad / inlay.scad have their bed-side face at z=0.
// Everything prints exactly as modelled — flat side down, no supports.

/* ── plate ───────────────────────────────────────────────────── */
plate_w = 70;
plate_h = 125;
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
cap_centres = [cap_pitch/2, -cap_pitch/2];   // pee (top), poop (bottom)

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

/* ── LED light pipe (front skin, bottom right) ───────────────── */
led_slot_w = 16;
led_slot_h = 3;
led_pos = [20, -(plate_h/2 - 5.5)];

/* ── electronics (ESP32-C3 SuperMini on the back plate) ──────── */
esp_w = 18.5;          // across (x)
esp_l = 23.5;          // along the plate (y), USB-C at the bottom end
esp_t = 5;
esp_x = -20.5;         // board centre x — beside the lower tower, 1.25 mm off it
esp_gap = 0.6;         // board bottom edge from the inner wall
usb_w = 9.4;
usb_h = 3.6;
usb_z = 17;            // plug centre from the front face (face coords)
rail_t = 1.2;
rail_h = 2.5;

/* ── mounting ────────────────────────────────────────────────── */
m3_insert_d = 4.0;
m3_clear_d  = 3.4;
boss_d = m3_insert_d + 2*wall;
boss_pos = [[29.5, 0], [-29.5, 0], [0, 58], [0, -58]];
keyhole_screw_d = 4.2;
keyhole_slot_d  = 2.4;
keyhole_slot_l  = 5;
keyhole_pos = [[0, 44], [0, -46]];   // big hole; slot runs upward (hidden under the caps)

$fn = 48;

module rrect(w, h, r) {
  offset(r = r) square([w - 2*r, h - 2*r], center = true);
}
