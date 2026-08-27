#!/usr/bin/env bash
# Export printable STLs + preview PNGs for the door bar.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p stl preview
openscad -o stl/lid.stl lid.scad
openscad -o stl/base.stl base.scad
for i in 0 1 2; do
  name=$(echo "poop pee food" | cut -d' ' -f$((i+1)))
  openscad -D "cap_index=$i" -o "stl/keycap-$name.stl" keycap.scad
done
openscad --render --imgsize=900,700 --camera=0,0,0,55,0,25,320 -o preview/lid.png lid.scad
openscad --render --imgsize=900,700 --camera=0,0,0,55,0,25,320 -o preview/base.png base.scad
openscad --render --imgsize=600,500 --camera=0,0,0,55,0,25,80 -o preview/keycap.png keycap.scad
echo "done → stl/ and preview/"
