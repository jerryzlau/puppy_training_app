// Biru Buttons · door bar — KEYCAP (print three, one per label)
// Square cap with an engraved label and an MX cross stem. Print stem-up
// (cap face on the bed) for a smooth pressing surface. FDM stems usually
// need one test print: tune cross_t in config.scad until snug.

include <config.scad>

// which cap: 0 = POOP, 1 = PEE, 2 = FOOD  (render all three via render.sh)
cap_index = 0;

module keycap(label) {
  difference() {
    // body with a gentle top taper
    hull() {
      linear_extrude(1) rrect(cap_w, cap_h, cap_r);
      translate([0, 0, cap_depth - 1])
        linear_extrude(1) rrect(cap_w - 2, cap_h - 2, cap_r - 0.8);
    }
    // engraved label on the face (top of print = pressing face)
    translate([0, 0, cap_depth - 0.8])
      linear_extrude(1.2)
        text(label, size = 4.6, font = "Arial:style=Bold",
             halign = "center", valign = "center");
  }
  // MX stem boss + cross
  difference() {
    cylinder(d = stem_od, h = stem_len);
    translate([0, 0, -0.5]) linear_extrude(stem_len + 1) {
      square([cross_w, cross_t], center = true);
      square([cross_t, cross_w], center = true);
    }
  }
}

keycap(cap_labels[cap_index]);
