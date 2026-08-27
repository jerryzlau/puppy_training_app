// Biru Buttons · door bar — BASE (wall plate)
// Flat plate that screws to the wall (keyholes) or sticks with command
// strips (flat back), then the lid screws onto it from the front with
// M3 into heat-set inserts in the lid bosses. Print flat, no supports.

include <config.scad>

base_t = 2.4;   // plate thickness

module keyhole() {
  // classic keyhole: big circle to pass the screw head, slot to hang on
  linear_extrude(base_t + 2) {
    circle(d = keyhole_screw_d);
    translate([0, keyhole_screw_d/2 + 2]) circle(d = keyhole_slot_d);
    translate([-keyhole_slot_d/2, 0])
      square([keyhole_slot_d, keyhole_screw_d/2 + 2]);
  }
}

module base() {
  difference() {
    linear_extrude(base_t)
      rrect(bar_w - 2*wall - 0.6, bar_h - 2*wall - 0.6, corner_r - wall);

    // wall keyholes, top and bottom (slot points up so the bar hangs)
    for (cy = [bar_h/2 - keyhole_from_end, -(bar_h/2) + keyhole_from_end])
      translate([0, cy, -1]) keyhole();

    // lid screw clearance holes + countersinks (screws enter from the back)
    for (sx = [-1, 1], sy = [-1, 1])
      translate([sx * (bar_w/2 - lid_screw_inset),
                 sy * (bar_h/2 - lid_screw_inset), -1]) {
        cylinder(d = m3_clear_d, h = base_t + 2);
        cylinder(d1 = 6.4, d2 = m3_clear_d, h = 1.8);
      }

    // wire pass-through from the switch column to the electronics bay
    translate([0, -(bar_h/2) + 44, -1])
      linear_extrude(base_t + 2) rrect(10, 6, 2.6);
  }
}

base();
