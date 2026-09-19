// Preview only: everything in place, seen from the front (not for printing).
// Face coords: front face z=0, wall at z=plate_d. Caps sit cap_proud in front.
include <config.scad>
use <cap.scad>
use <face.scad>
use <back.scad>

cream = [0.96, 0.93, 0.85];
blue  = [0.37, 0.66, 0.83];
brown = [0.49, 0.32, 0.18];
kinds = ["sweat", "poop"];
inks  = [blue, brown];

// cap.scad is modelled face-down (z=0 face, +z into the cap), which is
// already the face-coords orientation — just push it forward. The inlay is
// lifted 0.05 so the preview doesn't z-fight on the glue face.
module cap_in_place(i) {
  translate([0, cap_centres[i], -cap_proud]) {
    color(cream) cap_part(kinds[i], "cap");
    color(inks[i]) translate([0, 0, -(inlay_t - recess_d) - 0.05])
      for (p = [0 : pieces(kinds[i]) - 1]) cap_part(kinds[i], "inlay", p);
  }
}

show_face = true;      // -D show_face=false for the "inside" preview
show_boards = false;   // placeholder ESP32-C3 SuperMini + MX switches

if (show_face) color(cream) face_part();
// back plate lives at the wall end, towers pointing forward (this flip also
// mirrors x, which is why back.scad puts the ESP rail at -esp_x)
color([0.85, 0.85, 0.85]) translate([0, 0, plate_d]) rotate([0, 180, 0]) back_part();
show_caps = true;
if (show_caps) for (i = [0, 1]) cap_in_place(i);

// --- placeholders, preview only ---
module mx_switch() {                     // body below the plate + stem above
  color([0.2, 0.2, 0.2]) translate([0, 0, -mx_body/2 + mx_plate]) cube([15.6, 15.6, mx_body - 0.1], center = true);
  color([0.2, 0.2, 0.2]) translate([0, 0, mx_plate]) linear_extrude(stem_top) square(4, center = true);
}
if (show_boards) {
  esp_y = -plate_h/2 + wall + esp_gap + esp_l/2;
  // board: face coords, sits on the back plate (z = plate_d - back_t), USB-C at the bottom edge
  translate([esp_x, esp_y, plate_d - back_t - 1]) {
    color([0.1, 0.35, 0.2]) translate([0, 0, 0.5]) cube([esp_w - 0.6, esp_l - 0.6, 1], center = true);
    color([0.75, 0.75, 0.78]) translate([0, -esp_l/2 + 3.5, -1.6]) cube([8.9, 7.3, 3.2], center = true);  // USB-C
    color([0.85, 0.85, 0.85]) translate([0, 1, -1.5]) cube([13, 15, 3], center = true);              // ESP32-C3 can
  }
  // switches on the towers: plate top is at z = plate_d - back_t - tower_h
  for (y = cap_centres) translate([0, y, plate_d - back_t - tower_h]) mirror([0, 0, 1]) mx_switch();
}
