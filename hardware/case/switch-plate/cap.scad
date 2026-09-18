// One big square cap. Face-down on the bed (z=0 is the cap face).
//   kind = "sweat" | "poop"      which emoji
//   part = "cap"                 cap with a 1 mm recess for the inlay
//          "inlay"               the emoji piece(s) that glue into the recess
//          "onepiece"            cap + raised emoji, for multi-material printers
//   piece = n                    which inlay piece (💦 has 3 drops)
include <config.scad>
use <emoji.scad>
kind = "sweat";
part = "cap";
piece = 0;

// the bed side is what you see on the wall, so mirror the artwork
module art2d(kind)   { mirror([1, 0, 0]) emoji2d(kind); }
module holes2d(kind) { mirror([1, 0, 0]) emoji_holes2d(kind); }

module cap_body() {
  difference() {
    union() {
      // chamfered face
      hull() {
        linear_extrude(0.01) rrect(cap_size - 2*cap_chamfer, cap_size - 2*cap_chamfer, cap_r - cap_chamfer);
        translate([0, 0, cap_chamfer]) linear_extrude(cap_top - cap_chamfer) rrect(cap_size, cap_size, cap_r);
      }
      // skirt
      linear_extrude(skirt_h) rrect(cap_size, cap_size, cap_r);
      // stem boss
      translate([0, 0, cap_top - 0.01]) cylinder(d = stem_od, h = boss_h + 0.01);
    }
    // hollow inside the skirt
    translate([0, 0, cap_top]) linear_extrude(skirt_h)
      rrect(cap_size - 2*skirt_t, cap_size - 2*skirt_t, cap_r - skirt_t);
    // MX cross pocket
    translate([0, 0, cap_top + boss_h - stem_len]) linear_extrude(stem_len + 1) {
      square([cross_w, cross_t], center = true);
      square([cross_t, cross_w], center = true);
    }
  }
}

module cap_recessed(kind) {
  difference() {
    cap_body();
    translate([0, 0, -1]) linear_extrude(recess_d + 1) offset(r = inlay_clear) art2d(kind);
  }
}

module inlay(kind, i) {
  difference() {
    linear_extrude(inlay_t) mirror([1, 0, 0]) emoji_piece2d(kind, i);
    translate([0, 0, -1]) linear_extrude(inlay_t + 2) holes2d(kind);
  }
}

module onepiece(kind) {
  union() {
    difference() {
      cap_body();
      translate([0, 0, -1]) linear_extrude(1.01) holes2d(kind);  // eyes read as 1 mm engraving
    }
    translate([0, 0, -(inlay_t - recess_d)])
      linear_extrude(inlay_t - recess_d + 0.01)
        difference() { art2d(kind); holes2d(kind); }
  }
}

module cap_part(kind, part, piece = 0) {
  if (part == "cap") cap_recessed(kind);
  else if (part == "inlay") inlay(kind, piece);
  else onepiece(kind);
}
function pieces(kind) = emoji_pieces(kind);
cap_part(kind, part, piece);
