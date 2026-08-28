"use client";

import * as React from "react";
import { useStore } from "@/lib/store";
import { VisuallyHidden } from "@/components/ui/form";
import { compassPoint, compassPointName, distanceToKaabaKm, polar, qiblaBearing } from "./qibla";

const SIZE = 176;
const C = SIZE / 2;
const R = 76;
const CARDINALS = [
  { label: "N", deg: 0 },
  { label: "E", deg: 90 },
  { label: "S", deg: 180 },
  { label: "W", deg: 270 },
];

/**
 * A rose rather than a live compass: the app cannot read the phone's
 * magnetometer, so it draws the bearing honestly and says what to do with it.
 */
export function QiblaCompass() {
  const profile = useStore((s) => s.profile);
  if (!profile) return null;

  const bearing = qiblaBearing(profile.latitude, profile.longitude);
  const distance = distanceToKaabaKm(profile.latitude, profile.longitude);
  const point = compassPoint(bearing);
  const tip = polar(C, C, R - 6, bearing);
  const tail = polar(C, C, 22, bearing + 180);
  const left = polar(C, C, 13, bearing + 118);
  const right = polar(C, C, 13, bearing - 118);
  const summaryId = "salah-qibla-summary";

  return (
    <section className="surface p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[13px] font-semibold text-ink">Qibla</h2>
        <p className="tnum text-[11.5px] text-ink-3">{profile.city}</p>
      </div>

      <div className="mt-3 flex justify-center">
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          role="img"
          aria-describedby={summaryId}
          className="max-w-full"
        >
          <title>
            Qibla bearing {Math.round(bearing)} degrees from true north, roughly {compassPointName(bearing)}
          </title>

          <circle cx={C} cy={C} r={R} fill="none" stroke="var(--line)" strokeWidth={1} />
          <circle cx={C} cy={C} r={R - 12} fill="none" stroke="var(--line)" strokeWidth={1} />

          {Array.from({ length: 24 }, (_, i) => {
            const deg = i * 15;
            const major = deg % 90 === 0;
            const outer = polar(C, C, R, deg);
            const inner = polar(C, C, R - (major ? 12 : 6), deg);
            return (
              <line
                key={deg}
                x1={outer.x} y1={outer.y} x2={inner.x} y2={inner.y}
                stroke={major ? "var(--line-strong)" : "var(--line)"}
                strokeWidth={major ? 1.5 : 1}
              />
            );
          })}

          {CARDINALS.map((c) => {
            const at = polar(C, C, R - 24, c.deg);
            return (
              <text
                key={c.label}
                x={at.x}
                y={at.y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={11}
                fontWeight={600}
                fill={c.deg === 0 ? "var(--ink-2)" : "var(--ink-4)"}
              >
                {c.label}
              </text>
            );
          })}

          {/* The needle: a long point towards Makkah, a short tail behind. */}
          <polygon
            points={`${tip.x},${tip.y} ${left.x},${left.y} ${tail.x},${tail.y} ${right.x},${right.y}`}
            fill="var(--accent)"
          />
          <circle cx={C} cy={C} r={4} fill="var(--raised)" stroke="var(--accent)" strokeWidth={2} />
          <circle cx={tip.x} cy={tip.y} r={3.5} fill="var(--accent)" />
        </svg>
      </div>

      <VisuallyHidden id={summaryId}>
        From {profile.city}, the Kaaba lies {Math.round(bearing)} degrees clockwise from true north —
        roughly {compassPointName(bearing)} — and about {distance.toLocaleString()} kilometres away.
      </VisuallyHidden>

      <div className="mt-3 flex items-baseline justify-between gap-3">
        <p className="display-serif tnum text-[22px] leading-none text-ink">{Math.round(bearing)}°</p>
        <p className="text-[12px] text-ink-3">
          <span className="font-medium text-ink-2">{point}</span> ·{" "}
          <span className="tnum">{distance.toLocaleString()}</span> km
        </p>
      </div>

      <p className="mt-2.5 text-[11.5px] leading-relaxed text-ink-4">
        Measured clockwise from <span className="text-ink-3">true</span> north. A phone compass points at
        magnetic north, which is a few degrees off in most places — worth allowing for before you draw a
        line on the floor.
      </p>
    </section>
  );
}
