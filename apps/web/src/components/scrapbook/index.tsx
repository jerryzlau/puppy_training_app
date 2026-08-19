"use client";

import Link from "next/link";
import { jitter } from "@/lib/rotate";

/* ─────────── WashiTape ─────────── */
export function WashiTape({
  className = "",
  variant = "center",
}: {
  className?: string;
  variant?: "center" | "left" | "right";
}) {
  const pos =
    variant === "left"
      ? "left-[18%] -rotate-[8deg]"
      : variant === "right"
        ? "right-[-6%] rotate-6"
        : "left-1/2 -translate-x-1/2 -rotate-3";
  return (
    <div
      aria-hidden
      className={`absolute -top-3 h-6 w-20 bg-tape/85 shadow-sm ${pos} ${className}`}
    />
  );
}

/* ─────────── Polaroid ─────────── */
export function Polaroid({
  children,
  caption,
  seed,
  tape = true,
  className = "",
}: {
  children: React.ReactNode;
  caption?: string;
  seed?: string;
  tape?: boolean;
  className?: string;
}) {
  const rot = seed ? jitter(seed) : 0;
  return (
    <div
      className={`relative bg-white p-2.5 pb-9 shadow-polaroid ${className}`}
      style={{ transform: `rotate(${rot}deg)` }}
    >
      {tape && <WashiTape />}
      {children}
      {caption && (
        <div className="absolute bottom-1.5 left-0 right-0 text-center font-hand text-lg text-[#5c5142] truncate px-2">
          {caption}
        </div>
      )}
    </div>
  );
}

/* ─────────── Stamp ─────────── */
const stampColors = {
  green: "border-leaf text-leaf",
  red: "border-accent text-accent",
  blue: "border-sky text-sky",
  gray: "border-inkFaint text-inkFaint",
} as const;

export function Stamp({
  children,
  color = "green",
  className = "",
}: {
  children: React.ReactNode;
  color?: keyof typeof stampColors;
  className?: string;
}) {
  return (
    <span
      className={`inline-block border-2 ${stampColors[color]} text-[11px] font-bold px-2 py-0.5 rounded -rotate-2 tracking-wider uppercase ${className}`}
    >
      {children}
    </span>
  );
}

/* ─────────── NoteCard ─────────── */
export function NoteCard({
  children,
  seed,
  tape = true,
  className = "",
}: {
  children: React.ReactNode;
  seed?: string;
  tape?: boolean;
  className?: string;
}) {
  const rot = seed ? jitter(seed, 1) : 0;
  return (
    <div
      className={`relative bg-cream border border-[#E2D5B8] px-4 py-4 shadow-sketchSoft ${className}`}
      style={{ transform: `rotate(${rot}deg)` }}
    >
      {tape && <WashiTape className="w-16" />}
      {children}
    </div>
  );
}

/* ─────────── SketchButton ─────────── */
export function SketchButton({
  children,
  onClick,
  href,
  variant = "primary",
  disabled,
  type = "button",
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  variant?: "primary" | "ghost" | "green";
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
}) {
  const styles =
    variant === "primary"
      ? "bg-accent text-white"
      : variant === "green"
        ? "bg-leaf text-white"
        : "bg-paper text-ink";
  const cls = `block w-full text-center px-4 py-3.5 border-[2.5px] border-ink rounded-lg font-bold text-[17px] shadow-sketch active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all disabled:opacity-50 ${styles} ${className}`;
  if (href) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={cls}>
      {children}
    </button>
  );
}

/* ─────────── HandLabel ─────────── */
export function HandLabel({ children }: { children: React.ReactNode }) {
  return <label className="block font-hand text-xl text-wood mt-4 mb-1">{children}</label>;
}

/* ─────────── DashedRow ─────────── */
export function DashedRow({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-3 py-3 border-b-[1.5px] border-dashed border-ruled ${className}`}>
      {children}
    </div>
  );
}

/* ─────────── PhotoPlaceholder (for entries with no photo yet) ─────────── */
export function PawPlaceholder({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex items-center justify-center bg-gradient-to-br from-[#E8D5A8] to-[#C89B6B] text-4xl ${className}`}
      aria-hidden
    >
      🐾
    </div>
  );
}

/* ─────────── Spinner / loading ─────────── */
export function Loading({ label = "flipping pages…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-2 text-inkSoft">
      <div className="text-3xl animate-bounce">🐾</div>
      <div className="font-hand text-2xl">{label}</div>
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <NoteCard tape={false} className="my-4 border-accent">
      <div className="font-hand text-xl text-accent">oh no, a smudge…</div>
      <p className="text-sm text-ink">{message}</p>
    </NoteCard>
  );
}
