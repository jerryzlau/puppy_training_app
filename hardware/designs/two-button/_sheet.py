"""Generate the two-button concept sheets (HTML → PNG via headless Chrome)."""
import subprocess, pathlib, time, tempfile
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
W, H = 840, 650
STYLE = """
<style>
  body{margin:0;background:#F7F1E3;font-family:Georgia,serif;color:#3E3428}
  svg{display:block}
  .t{font-size:30px;font-weight:bold}.s{font-size:15px;fill:#8B6F52}
  .lab{font-size:13px;fill:#A99B85;letter-spacing:2px}
  .dim{font-size:12px;fill:#8B6F52}.note{font-size:13px}
  .ink{stroke:#3E3428;stroke-width:4;fill:none}
  .e{font-size:44px;text-anchor:middle;dominant-baseline:central}
</style>"""

def dim(x1,y1,x2,y2,label,vert=False,left=False,below=False):
    # dimension line with ticks and a label
    if vert:
        return f'<line x1="{x1}" y1="{y1}" x2="{x1}" y2="{y2}" stroke="#8B6F52"/><line x1="{x1-5}" y1="{y1}" x2="{x1+5}" y2="{y1}" stroke="#8B6F52"/><line x1="{x1-5}" y1="{y2}" x2="{x1+5}" y2="{y2}" stroke="#8B6F52"/><text class="dim" x="{x1 if below else x1-9 if left else x1+9}" y="{y2+16 if below else (y1+y2)/2+4}" text-anchor="{'middle' if below else 'end' if left else 'start'}">{label}</text>'
    return f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y1}" stroke="#8B6F52"/><line x1="{x1}" y1="{y1-5}" x2="{x1}" y2="{y1+5}" stroke="#8B6F52"/><line x1="{x2}" y1="{y1-5}" x2="{x2}" y2="{y1+5}" stroke="#8B6F52"/><text class="dim" x="{(x1+x2)/2}" y="{y1+16}" text-anchor="middle">{label}</text>'

def notes(x,y,title,lines):
    out=f'<text class="lab" x="{x}" y="{y}">{title}</text>'
    for i,l in enumerate(lines):
        out+=f'<text class="note" x="{x}" y="{y+22+i*19}">{l}</text>'
    return out

def sheet(name,title,sub,body):
    html=f'<!doctype html><meta charset="utf-8">{STYLE}<svg width="{W}" height="{H}" viewBox="0 0 {W} {H}"><text class="t" x="40" y="52">{title}</text><text class="s" x="40" y="78">{sub}</text>{body}</svg>'
    p=pathlib.Path(f"{name}.html"); p.write_text(html)
    # fresh profile + cache-buster: Chrome happily serves a stale file:// render otherwise
    subprocess.run([CHROME,"--headless=new","--hide-scrollbars","--force-device-scale-factor=2",
        "--incognito","--disable-gpu","--timeout=20000",
        f"--window-size={W},{H}",f"--screenshot={name}.png",p.resolve().as_uri()+f"?v={time.time_ns()}"],
        check=True,capture_output=True)
    print("wrote",f"{name}.png")

# shared: big arcade buttons. 💧 blue, 💩 brown.
def btn(cx,cy,r,emoji,fill,dark):
    return f'''<circle cx="{cx}" cy="{cy}" r="{r}" fill="{dark}" stroke="#3E3428" stroke-width="4"/>
<circle cx="{cx}" cy="{cy-4}" r="{r-7}" fill="{fill}"/>
<ellipse cx="{cx-r*0.3}" cy="{cy-r*0.45}" rx="{r*0.3}" ry="{r*0.14}" fill="#fff" opacity=".45"/>
<text class="e" x="{cx}" y="{cy-2}">{emoji}</text>'''
WATER=("#5FA8D3","#3B7EA6"); POOP=("#B07A4A","#7E5230")

# ── 01 · the pill ──────────────────────────────────────────────────────
b=f'''<text class="lab" x="40" y="130">TOP</text>
<g transform="translate(60,150)">
  <rect x="0" y="0" width="330" height="190" rx="95" fill="#FFF8EA" class="ink" style="fill:#FFF8EA"/>
  {btn(95,95,62,"💧",*WATER)}{btn(235,95,62,"💩",*POOP)}
  <rect x="150" y="150" width="30" height="8" rx="4" fill="#3E3428"/>
</g>
{dim(60,360,390,360,"150 mm")}{dim(410,150,410,340,"85 mm",True)}
<text class="lab" x="480" y="130">SIDE</text>
<g transform="translate(470,190)">
  <path d="M0,110 L0,40 Q0,20 20,20 L280,20 Q300,20 300,40 L300,110 Z" fill="#FFF8EA" class="ink" style="fill:#FFF8EA"/>
  <path d="M40,20 Q95,-32 150,20" fill="{WATER[0]}" stroke="#3E3428" stroke-width="4"/>
  <path d="M155,20 Q210,-32 265,20" fill="{POOP[0]}" stroke="#3E3428" stroke-width="4"/>
  <rect x="300" y="80" width="10" height="16" fill="#3E3428"/><text class="dim" x="240" y="140">USB-C at the back</text>
  <line x1="-20" y1="110" x2="330" y2="110" stroke="#A99B85" stroke-dasharray="6 4"/>
</g>
{dim(470,320,770,320,"150 mm")}{dim(790,210,790,300,"32 mm",True,True)}
{notes(40,400,"WHY",["two 60 mm arcade dome buttons (LED-lit, microswitch inside) in a stadium puck",
 "sits on the floor by the door or on a shelf; rubber feet; press with a foot or a paw",
 "printed emoji cap disc under the clear dome — swap the art without reprinting"])}
{notes(40,492,"PRINT · easy",["2 parts: shell (upside down, no supports) + bottom plate",
 "60 mm holes are the only tolerance to check", "ESP32-C3 + LED strip inside the ring gap"])}'''
sheet("01-pill","design 01 · the pill","two big arcade buttons in a floor puck · floor / shelf · USB-C · 150 × 85 × 32 mm",b)

# ── 02 · the bone ──────────────────────────────────────────────────────
b=f'''<text class="lab" x="40" y="130">TOP</text>
<g transform="translate(50,150)">
  <!-- bone outline as one path: lobes r48 at (60|320, 70|120), shank y 75..115 -->
  <path d="M60,22 A48,48 0 0 1 107.7,75 L272.3,75 A48,48 0 0 1 320,22 A48,48 0 0 1 361,95 A48,48 0 0 1 320,168 A48,48 0 0 1 272.3,115 L107.7,115 A48,48 0 0 1 60,168 A48,48 0 0 1 19,95 A48,48 0 0 1 60,22 Z" fill="#FFF8EA" stroke="#3E3428" stroke-width="4" stroke-linejoin="round"/>
  {btn(60,95,40,"💧",*WATER)}{btn(320,95,40,"💩",*POOP)}
  <text class="dim" x="190" y="100" text-anchor="middle">BIRU</text>
</g>
{dim(62,345,418,345,"190 mm")}{dim(440,172,440,318,"80 mm",True,True)}
<text class="lab" x="500" y="130">SIDE</text>
<g transform="translate(480,200)">
  <path d="M0,90 L0,30 Q0,12 18,12 L282,12 Q300,12 300,30 L300,90 Z" fill="#FFF8EA" stroke="#3E3428" stroke-width="4"/>
  <path d="M12,12 Q52,-30 92,12" fill="{WATER[0]}" stroke="#3E3428" stroke-width="4"/>
  <path d="M208,12 Q248,-30 288,12" fill="{POOP[0]}" stroke="#3E3428" stroke-width="4"/>
  <line x1="-20" y1="90" x2="330" y2="90" stroke="#A99B85" stroke-dasharray="6 4"/>
  <rect x="140" y="60" width="20" height="30" fill="#E8DCC4" stroke="#3E3428" stroke-width="2"/><text class="dim" x="150" y="112" text-anchor="middle">USB-C under</text>
</g>
{dim(480,320,780,320,"190 mm")}{dim(795,212,795,290,"30 mm",True,True)}
{notes(40,420,"WHY",["a dog bone: one button per knuckle, the app's brand on the shank",
 "reads as a toy, not a gadget — fits by a pet bed; the waist is a carry handle",
 "45 mm arcade buttons (60 mm makes the bone 250 mm long); ESP32 + LED in the shank"])}
{notes(40,512,"PRINT · medium",["shell prints upside down; four lobes need 15° chamfer or brim",
 "190 mm long — check your bed (fits 220 mm diagonally)","2 parts + printed emoji discs"])}'''
sheet("02-bone","design 02 · the bone","dog-bone console, a button in each end · floor / bed · USB-C · 190 × 80 × 30 mm",b)

# ── 03 · the switch plate ──────────────────────────────────────────────
b=f'''<text class="lab" x="40" y="130">FRONT (on the wall)</text>
<g transform="translate(120,140)">
  <rect x="0" y="0" width="150" height="270" rx="16" fill="#FFF8EA" stroke="#3E3428" stroke-width="4"/>
  <rect x="24" y="24" width="102" height="102" rx="14" fill="{WATER[1]}" stroke="#3E3428" stroke-width="4"/>
  <rect x="30" y="28" width="90" height="90" rx="12" fill="{WATER[0]}"/>
  <text class="e" x="75" y="76" style="font-size:60px">💧</text>
  <rect x="24" y="144" width="102" height="102" rx="14" fill="{POOP[1]}" stroke="#3E3428" stroke-width="4"/>
  <rect x="30" y="148" width="90" height="90" rx="12" fill="{POOP[0]}"/>
  <text class="e" x="75" y="196" style="font-size:60px">💩</text>
  <rect x="60" y="256" width="30" height="5" rx="2" fill="#3E3428"/>
</g>
{dim(120,430,270,430,"70 mm")}{dim(290,140,290,410,"125 mm",True)}
<text class="lab" x="420" y="130">SIDE</text>
<g transform="translate(470,140)">
  <rect x="0" y="0" width="14" height="270" fill="#D8CBB2"/>
  <rect x="14" y="0" width="40" height="270" rx="6" fill="#FFF8EA" stroke="#3E3428" stroke-width="4"/>
  <rect x="54" y="24" width="14" height="102" rx="4" fill="{WATER[0]}" stroke="#3E3428" stroke-width="3"/>
  <rect x="54" y="144" width="14" height="102" rx="4" fill="{POOP[0]}" stroke="#3E3428" stroke-width="3"/>
  <text class="dim" x="-4" y="290" text-anchor="middle">wall</text>
  <path d="M34,275 L34,300" stroke="#3E3428" stroke-width="3"/><text class="dim" x="34" y="316" text-anchor="middle">USB-C</text>
</g>
{dim(484,425,538,425,"22 + 6")}
{notes(40,470,"WHY",["a two-gang light switch by the door: muscle memory on the way out",
 "big 47 mm square caps on 4 keyboard switches each (or one 50 mm tact + guide) — satisfying, silent",
 "keyholes for screws or command strips; no floor space, no paws"])}
{notes(40,562,"PRINT · easiest",["3 flat parts: face, back plate, 2 caps — all face-down, zero supports",
 "cap wobble is the one thing to tune (stabilised by a printed skirt)"])}'''
sheet("03-switch-plate","design 03 · the switch plate","two-gang wall plate beside the door · wall · USB-C · 70 × 125 × 22 mm",b)

# ── 04 · the seesaw ────────────────────────────────────────────────────
b=f'''<text class="lab" x="40" y="130">TOP</text>
<g transform="translate(60,150)">
  <rect x="0" y="40" width="340" height="120" rx="30" fill="#FFF8EA" stroke="#3E3428" stroke-width="4"/>
  <rect x="20" y="20" width="300" height="130" rx="65" fill="#EFE6D0" stroke="#3E3428" stroke-width="4"/>
  <circle cx="85" cy="85" r="48" fill="{WATER[0]}"/><text class="e" x="85" y="85" style="font-size:44px">💧</text>
  <circle cx="255" cy="85" r="48" fill="{POOP[0]}"/><text class="e" x="255" y="85" style="font-size:44px">💩</text>
  <line x1="170" y1="30" x2="170" y2="140" stroke="#3E3428" stroke-width="2" stroke-dasharray="5 4"/>
</g>
{dim(60,340,400,340,"170 mm")}{dim(420,190,420,310,"60 mm",True)}
<text class="lab" x="480" y="130">SIDE · press one end, it tips</text>
<g transform="translate(500,210)">
  <path d="M0,90 L0,50 Q0,40 10,40 L290,40 Q300,40 300,50 L300,90 Z" fill="#FFF8EA" stroke="#3E3428" stroke-width="4"/>
  <g transform="rotate(6 150 40)"><rect x="10" y="10" width="280" height="30" rx="14" fill="#EFE6D0" stroke="#3E3428" stroke-width="4"/></g>
  <circle cx="150" cy="40" r="7" fill="#3E3428"/>
  <rect x="35" y="55" width="16" height="12" fill="#8B6F52"/><rect x="249" y="55" width="16" height="12" fill="#8B6F52"/>
  <text class="dim" x="43" y="82" text-anchor="middle">switch</text><text class="dim" x="257" y="82" text-anchor="middle">switch</text>
  <text class="dim" x="150" y="30" text-anchor="middle">pivot</text>
  <path d="M40,-42 L40,-20" stroke="#3E3428" stroke-width="3" marker-end="url(#a)"/>
  <defs><marker id="a" markerWidth="8" markerHeight="8" refX="4" refY="6" orient="auto"><path d="M0,0 L8,0 L4,7 Z" fill="#3E3428"/></marker></defs>
  <line x1="-20" y1="90" x2="320" y2="90" stroke="#A99B85" stroke-dasharray="6 4"/>
</g>
{dim(500,320,800,320,"170 mm")}{dim(812,222,812,300,"40 mm",True,below=True)}
{notes(40,400,"WHY",["one rocking bar on a central pin; tip the 💧 end or the 💩 end",
 "the whole top is the button — impossible to miss, works with a foot",
 "two microswitches under the ends, foam bumpers re-centre it; ESP32 in the base"])}
{notes(40,492,"PRINT · medium",["3 parts: base, rocker, 2 mm pin (or an M3 bolt as the axle)",
 "rocker prints flat; emoji as 2-colour inlay or a sticker in a recess",
 "the fun one — but a paw can rest on it and hold a switch down (debounce covers it)"])}'''
sheet("04-seesaw","design 04 · the seesaw","one rocking bar, tip either end · floor / desk · USB-C · 170 × 60 × 40 mm",b)
