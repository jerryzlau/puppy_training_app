// Back plate: nests inside the shell, screws into the four insert bosses,
// hangs on two keyholes. Each switch clips into a square tower so the cap
// face sits cap_proud off the front. z=0 is the wall side (on the bed).
include <config.scad>

fit = 0.3;                                   // per side, plate inside shell
pw = plate_w - 2*wall - 2*fit;
ph = plate_h - 2*wall - 2*fit;
pr = corner_r - wall - fit;

module keyhole() {
  circle(d = keyhole_screw_d);
  hull() { circle(d = keyhole_slot_d); translate([0, keyhole_slot_l]) circle(d = keyhole_slot_d); }
}

module tower() {
  difference() {
    translate([0, 0, back_t - 0.01]) linear_extrude(tower_h + 0.01) square(tower_w, center = true);
    // MX cutout in the top plate, wider body pocket below it
    translate([0, 0, back_t + tower_h - mx_plate - 0.01]) linear_extrude(mx_plate + 1) square(mx_cut, center = true);
    translate([0, 0, back_t]) linear_extrude(tower_h - mx_plate) square(mx_body, center = true);
    // wire exits, both sides
    for (s = [-1, 1]) translate([s * tower_w/2, 0, back_t + wire_slot_h/2])
      cube([tower_w, wire_slot_w, wire_slot_h], center = true);
  }
}

// low rail around the board. x is negated throughout: this part is seen
// from the other side than face.scad.
esp_y = -plate_h/2 + wall + esp_gap + esp_l/2;
module rail(w, l) {
  linear_extrude(rail_h + 0.01) difference() {
    square([w + 2*(rail_clr + rail_t), l + 2*(rail_clr + rail_t)], center = true);
    square([w + 2*rail_clr, l + 2*rail_clr], center = true);
  }
}
module esp_rail() {
  if (board == "c3")
    translate([-esp_x, esp_y, back_t - 0.01]) rail(esp_w, esp_l);
  else translate([0, 0, back_t - 0.01]) difference() {
    rail(dk_l, dk_w);
    // open on the USB end so the plug can reach the connector
    translate([-usb_side * (dk_l/2 + rail_t), 0, -1]) cube([2*rail_t + 2, dk_usb_w + 2, rail_h + 3], center = true);
  }
}

module back_part() difference() {
  intersection() {
    linear_extrude(back_t + tower_h + 1) rrect(pw, ph, pr);   // clip rails to the outline
    union() {
      linear_extrude(back_t) rrect(pw, ph, pr);
      for (y = cap_centres) translate([0, y, 0]) tower();
      esp_rail();
    }
  }
  // countersunk M3 into the bosses
  for (p = boss_pos) translate([p[0], p[1], -1]) {
    cylinder(d = m3_clear_d, h = back_t + 2);
    translate([0, 0, 1 - 0.01]) cylinder(d1 = 6.4, d2 = m3_clear_d, h = 1.8);
  }
  for (p = keyhole_pos) translate([p[0], p[1], -1]) linear_extrude(back_t + 2) keyhole();
}
back_part();
