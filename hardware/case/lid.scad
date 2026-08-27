// Biru Buttons · door bar — LID (front shell)
// The face the buttons live in: front plate acts as the MX switch plate,
// with side walls running back toward the wall plate. Print face-down,
// no supports.

include <config.scad>

module lid() {
  difference() {
    // outer shell: face + walls
    linear_extrude(bar_d - mx_plate)
      rrect(bar_w, bar_h, corner_r);

    // hollow the inside, leaving the face (front mx_plate) and walls
    translate([0, 0, mx_plate])
      linear_extrude(bar_d)
        rrect(bar_w - 2*wall, bar_h - 2*wall, corner_r - wall);

    // MX cutouts through the face
    for (cy = key_centers)
      translate([0, bar_h/2 - cy, -1])
        linear_extrude(mx_plate + 2)
          square([mx_cut, mx_cut], center = true);

    // LED slot near the bottom
    translate([0, -(bar_h/2) + led_from_bottom, -1])
      linear_extrude(mx_plate + 2)
        rrect(led_slot_w, led_slot_h + 2, 1.4);

    // USB-C exit through the bottom edge wall
    translate([0, -(bar_h/2) + wall/2, mx_plate + 3 + usb_h/2])
      cube([usb_w, wall + 2, usb_h], center = true);
  }

  // lid screw bosses (take M3 heat-set inserts), inside the four corners
  for (sx = [-1, 1], sy = [-1, 1])
    translate([sx * (bar_w/2 - lid_screw_inset),
               sy * (bar_h/2 - lid_screw_inset), mx_plate])
      difference() {
        cylinder(d = m3_insert_d + 2*wall, h = bar_d - mx_plate - 2);
        translate([0, 0, bar_d - mx_plate - 2 - 6])
          cylinder(d = m3_insert_d, h = 7);
      }

  // ESP32 corner posts in the bottom bay (friction cradle, no screws)
  esp_cy = -(bar_h/2) + wall + esp_l/2 + 6;
  for (sx = [-1, 1], sy = [-1, 1])
    translate([sx * (esp_w/2 + 1.2), esp_cy + sy * (esp_l/2 + 1.2), mx_plate])
      cylinder(d = 3.4, h = esp_t + 2);
}

lid();
