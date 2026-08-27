"use client";

// Forecast tab: when the pet will next pee/poop, estimated from the last two
// weeks of routine logs, plus a two-series line chart of daily counts.
// Palette validated (dataviz six checks) against the paper surface:
//   pee #8F6400 (deep amber) · poop #2568A8 (blue)

import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { dailyCounts, forecastNext, formatMinutes, minutesPastMidnight } from "@biru/shared";
import { Loading, ErrorNote, NoteCard } from "@/components/scrapbook";

const SERIES = [
  { key: "pee" as const, label: "pee", emoji: "💛", color: "#8F6400" },
  { key: "poop" as const, label: "poop", emoji: "💩", color: "#2568A8" },
];

interface Bathroom {
  windowDays: number;
  pee: string[];
  poop: string[];
}

function ago(mins: number): string {
  if (mins < 60) return `${Math.max(1, Math.round(mins))} min`;
  const h = mins / 60;
  return h < 24 ? `${h.toFixed(h < 10 ? 1 : 0)} h` : `${(h / 24).toFixed(1)} d`;
}

function ForecastCard({
  label,
  emoji,
  color,
  times,
  windowDays,
}: {
  label: string;
  emoji: string;
  color: string;
  times: string[];
  windowDays: number;
}) {
  const f = forecastNext(times, windowDays);
  const overdue = f.nextAt !== null && new Date(f.nextAt).getTime() < Date.now();
  return (
    <div className="flex-1 bg-white border-2 border-ink rounded-lg px-3.5 py-3 shadow-sketchSoft">
      <div className="text-sm font-bold flex items-center gap-1.5">
        <span aria-hidden>{emoji}</span> next {label}
        <span className="w-2.5 h-2.5 rounded-full ml-auto" style={{ background: color }} aria-hidden />
      </div>
      {f.nextAt ? (
        <>
          <div className="font-hand text-3xl leading-tight mt-1">
            {overdue ? "any time now" : `~${formatMinutes(minutesPastMidnight(f.nextAt))}`}
          </div>
          <div className="text-xs text-inkSoft mt-0.5">
            every ~{ago(f.medianIntervalMinutes ?? 0)} · {f.avgPerDay.toFixed(1)}×/day
          </div>
        </>
      ) : (
        <div className="text-xs text-inkSoft mt-1.5">
          log a few more {label}s and the crystal ball turns on ({f.count}/3)
        </div>
      )}
    </div>
  );
}

export function RoutineForecast() {
  const [data, setData] = useState<Bathroom | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    let cancelled = false;
    api<Bathroom>("/routine/bathroom")
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setState("ready");
      })
      .catch(() => !cancelled && setState("error"));
    return () => {
      cancelled = true;
    };
  }, []);

  const chart = useMemo(() => {
    if (!data) return null;
    const days = 14;
    const series = SERIES.map((s) => ({
      ...s,
      points: dailyCounts(data[s.key], days),
    }));
    const maxY = Math.max(1, ...series.flatMap((s) => s.points.map((p) => p.count)));
    return { days, series, maxY };
  }, [data]);

  if (state === "loading") return <Loading label="consulting the crystal ball…" />;
  if (state === "error") return <ErrorNote message="couldn't load the forecast" />;
  if (!data || !chart) return null;

  const noData = data.pee.length + data.poop.length === 0;
  if (noData) {
    return (
      <NoteCard className="mt-4 text-center">
        <div className="font-hand text-3xl">nothing to forecast yet 🔮</div>
        <p className="text-sm text-inkSoft mt-2">
          log pee &amp; poop in the day view and predictions appear here.
        </p>
      </NoteCard>
    );
  }

  // chart geometry
  const W = 560;
  const H = 200;
  const PAD = { l: 26, r: 54, t: 10, b: 22 };
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const x = (i: number) => PAD.l + (i / (chart.days - 1)) * iw;
  const y = (v: number) => PAD.t + ih - (v / chart.maxY) * ih;
  const path = (pts: { count: number }[]) =>
    pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.count).toFixed(1)}`).join(" ");
  const dayLabel = (d: string) =>
    new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "numeric", day: "numeric" });

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - PAD.l) / iw) * (chart!.days - 1));
    setHover(i >= 0 && i < chart!.days ? i : null);
  }

  return (
    <div className="mt-3">
      {/* the headline: when's the next one */}
      <div className="flex gap-3">
        {SERIES.map((s) => (
          <ForecastCard
            key={s.key}
            label={s.label}
            emoji={s.emoji}
            color={s.color}
            times={data[s.key]}
            windowDays={data.windowDays}
          />
        ))}
      </div>
      <p className="text-xs text-inkFaint mt-2 px-1">
        an estimate from the last {data.windowDays} days of logs — not a promise 🐾
      </p>

      {/* daily counts, two series */}
      <div className="bg-white border border-[#E2D5B8] px-3 py-3 shadow-sketchSoft mt-4">
        <div className="flex items-baseline justify-between px-1 mb-1">
          <span className="font-hand text-xl">times per day · last {chart.days} days</span>
          {/* legend (2 series) */}
          <span className="flex gap-3 text-xs font-bold">
            {chart.series.map((s) => (
              <span key={s.key} className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} aria-hidden />
                {s.label}
              </span>
            ))}
          </span>
        </div>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full touch-none"
          role="img"
          aria-label="daily pee and poop counts, last 14 days"
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        >
          {/* recessive grid: one line per integer count */}
          {Array.from({ length: chart.maxY + 1 }, (_, v) => (
            <g key={v}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="#E8DFC9" strokeWidth="1" />
              <text x={PAD.l - 6} y={y(v) + 3.5} textAnchor="end" fontSize="10" fill="#A99B85">
                {v}
              </text>
            </g>
          ))}
          {/* crosshair */}
          {hover !== null && (
            <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} stroke="#8B6F52" strokeWidth="1" strokeDasharray="3 3" />
          )}
          {/* series lines + end labels */}
          {chart.series.map((s) => (
            <g key={s.key}>
              <path d={path(s.points)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" />
              {hover !== null && (
                <circle cx={x(hover)} cy={y(s.points[hover].count)} r="4" fill={s.color} stroke="#fff" strokeWidth="2" />
              )}
              <text
                x={W - PAD.r + 6}
                y={y(s.points[chart.days - 1].count) + 3.5}
                fontSize="11"
                fontWeight="bold"
                fill="#5B4A33"
              >
                {s.emoji} {s.label}
              </text>
            </g>
          ))}
          {/* x labels: first, middle, last */}
          {[0, Math.floor((chart.days - 1) / 2), chart.days - 1].map((i) => (
            <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize="10" fill="#A99B85">
              {dayLabel(chart.series[0].points[i].day)}
            </text>
          ))}
        </svg>
        {/* tooltip */}
        {hover !== null && (
          <div className="text-xs text-inkSoft px-1 pt-1">
            <b>{dayLabel(chart.series[0].points[hover].day)}</b>
            {chart.series.map((s) => (
              <span key={s.key}>
                {" "}
                · {s.label} {s.points[hover].count}×
              </span>
            ))}
          </div>
        )}
        {/* table view for accessibility */}
        <details className="px-1 pt-2">
          <summary className="text-xs text-inkFaint cursor-pointer">view as table</summary>
          <table className="text-xs mt-1 w-full">
            <thead>
              <tr className="text-left text-inkSoft">
                <th className="pr-3 font-bold">day</th>
                <th className="pr-3 font-bold">pee</th>
                <th className="font-bold">poop</th>
              </tr>
            </thead>
            <tbody>
              {chart.series[0].points.map((p, i) => (
                <tr key={p.day}>
                  <td className="pr-3">{p.day}</td>
                  <td className="pr-3">{p.count}</td>
                  <td>{chart.series[1].points[i].count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </div>
    </div>
  );
}
