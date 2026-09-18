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

color(cream) face_part();
// back plate lives at the wall end, towers pointing forward (this flip also
// mirrors x, which is why back.scad puts the ESP rail at -esp_x)
color([0.85, 0.85, 0.85]) translate([0, 0, plate_d]) rotate([0, 180, 0]) back_part();
for (i = [0, 1]) cap_in_place(i);
