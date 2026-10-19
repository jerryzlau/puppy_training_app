#!/usr/bin/env bash
# Export printable STLs + preview PNGs for the switch plate.
# STL names start with the filament colour each part should be printed in.
# Needs openscad on PATH (macOS: brew install --cask openscad@snapshot).
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p stl preview
openscad -o stl/cream-face.stl face.scad
openscad -o stl/cream-back.stl back.scad
for k in sweat poop; do
  openscad -D "kind=\"$k\"" -D 'part="cap"' -o "stl/cream-cap-$k.stl" cap.scad
  openscad -D "kind=\"$k\"" -D 'part="onepiece"' -o "stl/multicolor-cap-$k-onepiece.stl" cap.scad
done
openscad -D 'kind="poop"'  -D 'part="inlay"' -D piece=0 -o stl/brown-inlay-poop.stl cap.scad
for i in 0 1 2; do
  openscad -D 'kind="sweat"' -D 'part="inlay"' -D "piece=$i" -o "stl/blue-inlay-sweat-$i.stl" cap.scad
done
# previews (assembly is preview-only, colours need --preview)
openscad --preview --imgsize=800,900 --camera=0,0,0,180,0,180,400 --projection=o -o preview/assembly-front.png assembly.scad
openscad --preview --imgsize=900,1000 --camera=0,0,0,215,0,200,400 -o preview/assembly-angle.png assembly.scad
openscad --preview -D show_face=false -D show_caps=false -D show_boards=true --imgsize=900,800 --camera=0,0,8,215,0,200,300 -o preview/inside.png assembly.scad
openscad --render --imgsize=800,700 --camera=0,0,11,30,0,30,400 -o preview/face.png face.scad
openscad --render --imgsize=800,700 --camera=0,0,8,35,0,30,400 -o preview/back.png back.scad
openscad --render -D 'kind="poop"' --imgsize=600,500 --camera=0,0,0,160,0,20,150 -o preview/cap-poop.png cap.scad
openscad --render -D 'kind="sweat"' --imgsize=600,500 --camera=0,0,0,160,0,20,150 -o preview/cap-sweat.png cap.scad
echo "done → stl/ and preview/"
