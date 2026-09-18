// Front shell: front face at z=0, grows toward the wall. Prints as-is,
// face down, no supports (every wall is vertical, every hole goes straight up).
include <config.scad>

inner_w = plate_w - 2*wall;
inner_h = plate_h - 2*wall;
inner_r = corner_r - wall;
well = cap_size + 2*well_clear;

module shell() {
  difference() {
    linear_extrude(plate_d) rrect(plate_w, plate_h, corner_r);
    // hollow, open at the back
    translate([0, 0, wall]) linear_extrude(plate_d) rrect(inner_w, inner_h, inner_r);
  }
}

module guide_tube() {
  difference() {
    linear_extrude(guide_depth) rrect(well + 2*guide_t, well + 2*guide_t, well_r + guide_t);
    translate([0, 0, -1]) linear_extrude(guide_depth + 2) rrect(well, well, well_r);
  }
}

module bosses() {
  for (p = boss_pos) translate([p[0], p[1], wall - 0.01])
    difference() {
      cylinder(d = boss_d, h = plate_d - back_t - wall + 0.01);
      translate([0, 0, plate_d - back_t - wall - 7]) cylinder(d = m3_insert_d, h = 8);
    }
}

module face_part() difference() {
  union() {
    // keep bosses/tubes inside the outer outline
    intersection() {
      linear_extrude(plate_d) rrect(plate_w, plate_h, corner_r);
      union() {
        shell();
        for (y = cap_centres) translate([0, y, 0]) guide_tube();
        bosses();
      }
    }
  }
  // cap wells through the front skin
  for (y = cap_centres) translate([0, y, -1]) linear_extrude(wall + 2) rrect(well, well, well_r);
  // LED light pipe
  translate([led_pos[0], led_pos[1], -1]) linear_extrude(wall + 2) square([led_slot_w, led_slot_h], center = true);
  // USB-C through the bottom wall
  translate([esp_x, -plate_h/2 + wall/2, usb_z]) cube([usb_w, wall + 2, usb_h], center = true);
}
face_part();
