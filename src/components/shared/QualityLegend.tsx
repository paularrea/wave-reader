'use client';

import React from 'react';
import { LEGEND_TIERS, legendEntry } from '@/services/conditions';

/**
 * Without this the tier system is a private convention: the map differentiates
 * spots correctly but nobody is told what the sizes and the glow mean.
 */
export function QualityLegend() {
  return (
    <div
      data-testid="quality-legend"
      className="absolute top-6 right-4 z-10 bg-zinc-900/85 backdrop-blur-md border border-zinc-800 rounded-2xl px-3 py-2.5 shadow-xl"
    >
      <h2 className="text-[9px] uppercase tracking-widest text-zinc-500 font-bold mb-2">
        Conditions
      </h2>
      <ul className="flex flex-col gap-1.5">
        {LEGEND_TIERS.map(tier => {
          const entry = legendEntry(tier);
          return (
            <li key={tier} className="flex items-center gap-2" data-testid={`legend-${tier}`}>
              <span
                className="shrink-0 rounded-full flex items-center justify-center"
                style={{
                  // Scaled down so the legend stays compact while keeping the
                  // relative sizing that carries the meaning on the map.
                  width: Math.round(entry.size * 0.62),
                  height: Math.round(entry.size * 0.62),
                  backgroundColor: entry.background,
                  border: entry.border,
                  boxShadow: entry.boxShadow,
                }}
              />
              <span className="text-[10px] text-zinc-300 font-medium leading-none">
                {entry.label}
              </span>
              <span className="text-[10px] text-zinc-600 font-mono leading-none ml-auto pl-2">
                {entry.range}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
