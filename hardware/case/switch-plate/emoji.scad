// Hand-modelled 💦 and 💩 as 2D outlines (no emoji font needed).
// emoji2d(kind) is the filled silhouette used for the recess and the inlay
// body; emoji_holes2d(kind) are the through-holes in the inlay (eyes, smile,
// droplet highlight) that let the cap colour show through.
// Both are in "viewer" orientation: +y up on the wall, seen from the front.
include <config.scad>

/* ── 💩 ─────────────────────────────────────────────────────── */
module poop_lobe(dx, y, r, spread) {
  hull() {
    translate([dx - spread, y]) circle(r);
    translate([dx + spread, y]) circle(r);
  }
}
module poop2d() {
  scale(emoji_scale) union() {
    poop_lobe( 0,  -9.5, 7.0, 9.0);   // base pile, 32 wide
    poop_lobe(-0.8, -1.0, 5.6, 6.0);  // middle
    poop_lobe( 0.8,  5.8, 4.2, 3.2);  // top
    // curl tip leaning up-right
    hull() {
      translate([1.5, 9.5]) circle(3.2);
      translate([4.8, 14.0]) circle(1.3);
    }
  }
}
module poop_holes2d() {
  scale(emoji_scale) {
    // eyes: white = hole, pupil = brown left standing. The pupil sits low
    // enough to overlap the eye's rim so it stays joined to the body
    // (no floating islands in the inlay).
    for (s = [-1, 1]) translate([s * 5.4, -4.2]) difference() {
      circle(2.9);
      translate([0, -1.7]) circle(1.6);
    }
    // smile: crescent under the eyes
    intersection() {
      difference() {
        translate([0, -9.2]) circle(6.4);
        translate([0, -6.6]) circle(6.4);
      }
      translate([-8, -16.5]) square([16, 6.2]);
    }
  }
}

/* ── 💦 ─────────────────────────────────────────────────────── */
module droplet2d(r) {          // teardrop, tip up, base circle r
  hull() {
    circle(r);
    translate([0, 1.85 * r]) circle(0.16 * r);
  }
}
drops = [                       // [x, y, r, tilt°]
  [ 5.0, -6.5, 7.6, -14],       // big, leaning right
  [-8.5,  5.0, 5.0,  16],       // medium, leaning left
  [-9.0, -9.5, 3.2,   8],       // small
];
module sweat_drop(i) {
  d = drops[i];
  translate([d[0], d[1]]) rotate(d[3]) droplet2d(d[2]);
}
module sweat2d() {
  scale(emoji_scale) for (i = [0 : len(drops) - 1]) sweat_drop(i);
}
module sweat_holes2d() {        // one shine on the big drop
  scale(emoji_scale) translate([5.0, -6.5]) rotate(-14)
    translate([-2.6, -1.4]) rotate(-14) scale([0.7, 1]) circle(1.6);
}

/* ── dispatch ────────────────────────────────────────────────── */
module emoji2d(kind) {
  if (kind == "poop") poop2d(); else sweat2d();
}
module emoji_holes2d(kind) {
  if (kind == "poop") poop_holes2d(); else sweat_holes2d();
}
// separate pieces (💦 is three drops) — used to export inlays one per file
function emoji_pieces(kind) = kind == "poop" ? 1 : len(drops);
module emoji_piece2d(kind, i) {
  if (kind == "poop") poop2d();
  else scale(emoji_scale) sweat_drop(i);
}

// preview when opened directly
translate([-22, 0]) emoji2d("sweat");
translate([ 22, 0]) difference() { poop2d(); poop_holes2d(); }
