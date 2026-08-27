// Biru Buttons · door bar — shared parameters
// All dimensions in mm. Tweak here; base/lid/keycap all include this file.

/* ── overall bar ─────────────────────────────────────────────── */
bar_w = 44;        // width
bar_h = 150;       // height (vertical on the wall)
bar_d = 18;        // depth off the wall
wall  = 2.4;       // shell wall thickness
corner_r = 7;      // outer corner radius

/* ── switches (Cherry-MX style, plate mount) ─────────────────── */
mx_cut   = 14.0;   // square plate cutout per MX spec
mx_plate = 1.5;    // plate thickness at the cutout (front face is the plate)
key_pitch = 34;    // vertical distance between key centers
key1_from_top = 32;             // center of the top key from the bar top
key_centers = [key1_from_top,
               key1_from_top + key_pitch,
               key1_from_top + 2*key_pitch];

/* ── keycaps (printed) ───────────────────────────────────────── */
cap_w = 20;        // square cap
cap_h = 20;
cap_depth = 7;     // total cap height
cap_r = 4;         // cap corner radius
cap_labels = ["POOP", "PEE", "FOOD"];
// MX stem receptacle (cross) — sized for FDM, test-fit and adjust
stem_od   = 5.5;   // outer boss diameter
stem_len  = 3.8;   // how deep the stem goes
cross_w   = 4.15;  // cross arm length
cross_t   = 1.35;  // cross arm thickness (1.27 nominal + FDM slack)

/* ── LED light pipe ──────────────────────────────────────────── */
led_slot_w = 24;
led_slot_h = 3;
led_from_bottom = 22;   // slot center from bar bottom

/* ── electronics bay (bottom of the bar) ─────────────────────── */
esp_w = 18.5;      // ESP32-C3 SuperMini + clearance
esp_l = 23.5;
esp_t = 5;
usb_w = 9.4;       // USB-C plug cutout in the bottom face
usb_h = 3.6;

/* ── mounting ────────────────────────────────────────────────── */
keyhole_screw_d  = 4.2;   // screw head slips through
keyhole_slot_d   = 2.4;   // shaft rides the slot
keyhole_from_end = 18;    // keyhole centers from top/bottom
m3_insert_d = 4.0;        // heat-set insert pocket
m3_clear_d  = 3.4;
lid_screw_inset = 6;      // lid screws from each corner

$fn = 48;

/* helper: rounded rectangle */
module rrect(w, h, r) {
  offset(r = r) square([w - 2*r, h - 2*r], center = true);
}
