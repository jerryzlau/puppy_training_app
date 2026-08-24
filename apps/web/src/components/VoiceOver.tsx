"use client";

// Lesson read-aloud via the Web Speech API (device's built-in text-to-speech).
// Free, offline, zero setup. Designed so generated-MP3 narration can swap in
// later behind the same play/pause UI.

import { useCallback, useEffect, useRef, useState } from "react";

type VoState = "idle" | "playing" | "paused";

/** Markdown → speakable plain text. */
export function speakableText(md: string): string {
  return md
    .replace(/⚠️/g, "")
    .replace(/[🎓🐾🐶🐱⭐✂️📔🏠🏅😊😴😆😤]/gu, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^#+\s*/gm, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/\b(biewer|cat|dog) tip:/gi, "tip: ")
    .replace(/\n{2,}/g, ". ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Prefer a higher-quality local English voice when the device offers one. */
function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const en = voices.filter((v) => v.lang.startsWith("en"));
  const pool = en.length ? en : voices;
  const preferred = ["Samantha", "Karen", "Daniel", "Google US English", "Microsoft Aria"];
  for (const name of preferred) {
    const hit = pool.find((v) => v.name.includes(name));
    if (hit) return hit;
  }
  return pool.find((v) => v.localService) ?? pool[0];
}

export function VoiceOver({ title, body, tasks }: { title: string; body: string; tasks: string[] }) {
  const [state, setState] = useState<VoState>("idle");
  const [supported, setSupported] = useState(true);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setSupported(false);
      return;
    }
    // warm the voice list (loads async on some browsers)
    window.speechSynthesis.getVoices();
    const stop = () => window.speechSynthesis.cancel();
    window.addEventListener("pagehide", stop);
    return () => {
      window.removeEventListener("pagehide", stop);
      stop(); // stop on navigation/unmount
    };
  }, []);

  const play = useCallback(() => {
    const synth = window.speechSynthesis;
    if (state === "playing") {
      synth.pause();
      setState("paused");
      return;
    }
    if (state === "paused") {
      synth.resume();
      setState("playing");
      return;
    }
    synth.cancel();
    const text = [
      `${title}.`,
      speakableText(body),
      tasks.length ? `Your checklist: ${tasks.map((t, i) => `${i + 1}. ${t}`).join(". ")}.` : "",
    ]
      .filter(Boolean)
      .join(" ");
    const u = new SpeechSynthesisUtterance(text);
    const voice = pickVoice();
    if (voice) u.voice = voice;
    u.rate = 0.95;
    u.pitch = 1.0;
    u.onend = () => setState("idle");
    u.onerror = () => setState("idle");
    utteranceRef.current = u; // keep a ref so it isn't GC'd mid-speech (Chrome quirk)
    synth.speak(u);
    setState("playing");
  }, [state, title, body, tasks]);

  const stop = useCallback(() => {
    window.speechSynthesis.cancel();
    setState("idle");
  }, []);

  if (!supported) return null;

  return (
    <div className="flex items-center gap-2.5 my-3">
      <button
        type="button"
        onClick={play}
        aria-label={state === "playing" ? "pause reading" : "read this lesson aloud"}
        className="flex items-center gap-2 bg-white border-2 border-ink rounded-full pl-3 pr-4 py-1.5 shadow-sketchSoft text-sm font-bold active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
      >
        <span className="text-base" aria-hidden>
          {state === "playing" ? "⏸" : "🔊"}
        </span>
        {state === "playing" ? "pause" : state === "paused" ? "resume" : "read to me"}
      </button>
      {state !== "idle" && (
        <button
          type="button"
          onClick={stop}
          aria-label="stop reading"
          className="text-sm font-bold text-inkFaint underline"
        >
          stop
        </button>
      )}
      {state === "playing" && (
        <span className="font-hand text-lg text-wood animate-pulse" aria-hidden>
          reading aloud…
        </span>
      )}
    </div>
  );
}
