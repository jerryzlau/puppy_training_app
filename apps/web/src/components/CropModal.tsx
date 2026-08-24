"use client";

// Square crop for the pet's profile photo: drag to reposition, slide to zoom,
// canvas-render the visible square, hand back a JPEG. Pointer events so the
// same code serves touch and mouse.

import { useCallback, useEffect, useRef, useState } from "react";
import { SketchButton, HandLabel } from "@/components/scrapbook";

const VIEW = 280; // on-screen viewport, px
const OUT = 1024; // output square, px

export function CropModal({
  file,
  onCancel,
  onConfirm,
}: {
  file: File;
  onCancel: () => void;
  onConfirm: (cropped: File) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 }); // image top-left in viewport px
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    const probe = new Image();
    probe.onload = () => setNat({ w: probe.naturalWidth, h: probe.naturalHeight });
    probe.src = u;
    return () => URL.revokeObjectURL(u);
  }, [file]);

  // Scale that makes the image exactly cover the viewport at zoom 1.
  const base = nat ? VIEW / Math.min(nat.w, nat.h) : 1;
  const dispW = nat ? nat.w * base * zoom : VIEW;
  const dispH = nat ? nat.h * base * zoom : VIEW;

  const clamp = useCallback(
    (x: number, y: number) => ({
      x: Math.min(0, Math.max(VIEW - dispW, x)),
      y: Math.min(0, Math.max(VIEW - dispH, y)),
    }),
    [dispW, dispH]
  );

  // Recenter whenever zoom changes so the crop never shows past the edges.
  useEffect(() => {
    setOffset((o) => clamp(o.x, o.y));
  }, [zoom, clamp]);

  // Center the image when it first loads.
  useEffect(() => {
    if (nat) setOffset({ x: (VIEW - nat.w * base) / 2, y: (VIEW - nat.h * base) / 2 });
  }, [nat, base]);

  function onPointerDown(e: React.PointerEvent) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, ox: offset.x, oy: offset.y };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const { px, py, ox, oy } = drag.current;
    setOffset(clamp(ox + (e.clientX - px), oy + (e.clientY - py)));
  }
  function onPointerUp() {
    drag.current = null;
  }

  async function confirm() {
    const img = imgRef.current;
    if (!img || !nat) return;
    setBusy(true);
    const scale = base * zoom;
    // viewport (0,0) in image coordinates:
    const sx = -offset.x / scale;
    const sy = -offset.y / scale;
    const sw = VIEW / scale;
    const canvas = document.createElement("canvas");
    canvas.width = OUT;
    canvas.height = OUT;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setBusy(false);
      return;
    }
    ctx.drawImage(img, sx, sy, sw, sw, 0, 0, OUT, OUT);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setBusy(false);
          return;
        }
        onConfirm(new File([blob], "profile.jpg", { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.92
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-6"
      role="dialog"
      aria-label="crop photo"
    >
      <div className="bg-paper border-2 border-ink rounded-lg shadow-sketchSoft p-5 w-full max-w-[360px]">
        <h2 className="font-hand text-3xl leading-none mb-3">frame the photo ✂️</h2>

        <div
          className="relative mx-auto overflow-hidden border-2 border-ink bg-white touch-none cursor-grab active:cursor-grabbing select-none"
          style={{ width: VIEW, height: VIEW }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              ref={imgRef}
              src={url}
              alt=""
              draggable={false}
              className="absolute max-w-none pointer-events-none"
              style={{ width: dispW, height: dispH, left: offset.x, top: offset.y }}
            />
          )}
        </div>

        <HandLabel>zoom</HandLabel>
        <input
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="w-full accent-[#C0533E]"
          aria-label="zoom"
        />
        <p className="text-xs text-inkSoft mt-1">drag the photo to reposition</p>

        <div className="flex gap-2 mt-4">
          <SketchButton variant="ghost" onClick={onCancel} disabled={busy} className="flex-1">
            never mind
          </SketchButton>
          <SketchButton onClick={confirm} disabled={busy || !nat} className="flex-1">
            {busy ? "framing…" : "use this crop"}
          </SketchButton>
        </div>
      </div>
    </div>
  );
}
