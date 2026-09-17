'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Drawer } from 'vaul';
import { Info, Waves, Wind, RefreshCw, Star, MapPin, AlertTriangle, Sparkles } from 'lucide-react';
import spots from '@/data/spots.index.json';
import { LEGEND_TIERS, legendEntry } from '@/services/conditions';
import {
  ModelStatus,
  describeAgo,
  describeInterval,
  describeNextUpdate,
} from '@/services/data-status';

interface DataStatus {
  generatedAt: number;
  forecastCacheSeconds: number;
  models: ModelStatus[];
}

function Section({
  icon,
  title,
  children,
  testId,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <section className="py-5 border-b border-zinc-900 last:border-0" data-testid={testId}>
      <h3 className="flex items-center gap-2 text-[13px] font-semibold text-zinc-100 mb-3">
        <span className="text-zinc-500">{icon}</span>
        {title}
      </h3>
      <div className="text-[13px] leading-relaxed text-zinc-400 space-y-2">{children}</div>
    </section>
  );
}

function ModelRow({ model, now }: { model: ModelStatus; now: number }) {
  const unavailable = model.status !== 'ok';
  return (
    <div
      className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 py-2.5 border-b border-zinc-900/80 last:border-0"
      data-testid="model-row"
      data-model={model.id}
    >
      <div className="min-w-0">
        <div className="text-zinc-100 font-medium truncate">
          {model.name} <span className="text-zinc-500 font-normal">· {model.provider}</span>
        </div>
        <div className="text-[11px] text-zinc-500 truncate">
          {model.resolution} · {model.coverage} · {describeInterval(model.updateIntervalSeconds)}
        </div>
      </div>
      <div className="text-right tabular-nums">
        <div
          className={`text-[12px] font-medium ${unavailable ? 'text-zinc-600' : 'text-zinc-200'}`}
          data-testid="model-next-update"
        >
          {unavailable ? 'Status unavailable' : describeNextUpdate(model.nextExpectedAt, now)}
        </div>
        {!unavailable && (
          <div className="text-[11px] text-zinc-500" data-testid="model-last-run">
            ran {describeAgo(model.lastRunAvailableAt, now)}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Where the data comes from, how fresh it is, and how the rating is built.
 * Every time shown comes from the provider's model metadata; nothing is guessed.
 */
export function DataInfoPanel() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<DataStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    fetch('/api/data-status')
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: DataStatus) => {
        if (!cancelled) {
          setStatus(data);
          setFailed(false);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    // Countdowns tick while the panel is open, and only then.
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [open]);

  const catalogue = useMemo(() => {
    const byCountry = new Map<string, number>();
    for (const spot of spots as Array<{ country?: string }>) {
      const country = spot.country ?? 'Spain';
      byCountry.set(country, (byCountry.get(country) ?? 0) + 1);
    }
    return { total: spots.length, byCountry: [...byCountry.entries()].sort((a, b) => b[1] - a[1]) };
  }, []);

  const waves = status?.models.filter(m => m.role === 'waves') ?? [];
  const wind = status?.models.filter(m => m.role === 'wind') ?? [];

  return (
    <Drawer.Root open={open} onOpenChange={setOpen}>
      <Drawer.Trigger asChild>
        <button
          aria-label="About the data"
          data-testid="info-button"
          onClick={() => setNow(Date.now())}
          className="w-8 h-8 rounded-full bg-zinc-950/90 backdrop-blur-xl border border-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center shadow-xl transition-colors"
        >
          <Info size={15} />
        </button>
      </Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/60 z-40" />
        <Drawer.Content
          data-testid="info-panel"
          className="bg-zinc-950 text-white flex flex-col rounded-t-3xl fixed bottom-0 left-0 right-0 z-50 max-h-[88dvh] border-t border-zinc-800 outline-none"
        >
          <div className="mx-auto w-9 h-1 rounded-full bg-zinc-700 mt-3 mb-1 shrink-0" />
          <div className="px-5 pt-3 pb-3 shrink-0 border-b border-zinc-900">
            <Drawer.Title className="text-[20px] font-semibold">About the data</Drawer.Title>
            <Drawer.Description className="text-[13px] text-zinc-500 mt-0.5">
              Sources, freshness and how the rating is calculated
            </Drawer.Description>
          </div>

          <div
            className="flex-1 overflow-y-auto overscroll-contain px-5 min-h-0"
            style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
          >
            {/* First thing in the panel: what the map's markers mean. */}
            <Section icon={<Star size={15} />} title="Conditions" testId="quality-legend">
              <ul className="flex flex-col gap-2">
                {LEGEND_TIERS.map(tier => {
                  const entry = legendEntry(tier);
                  return (
                    <li
                      key={tier}
                      className="flex items-center gap-3"
                      data-testid={`legend-${tier}`}
                    >
                      <span className="w-8 flex justify-center shrink-0">
                        <span
                          className="rounded-full flex items-center justify-center font-bold"
                          style={{
                            width: entry.size,
                            height: entry.size,
                            backgroundColor: entry.background,
                            border: entry.border,
                            boxShadow: entry.boxShadow,
                            color: entry.foreground,
                            fontSize: Math.round(entry.size * 0.45),
                          }}
                        >
                          {entry.showScore && tier !== 'danger' ? entry.range.split('-')[0] : ''}
                        </span>
                      </span>
                      <span className="text-zinc-200 font-medium">{entry.label}</span>
                      <span className="ml-auto tabular-nums text-zinc-500">{entry.range}</span>
                    </li>
                  );
                })}
              </ul>
              <p className="text-[12px] text-zinc-500">
                Bigger and brighter markers mean better surf. Scores use the surf-forecast scale; in the
                Mediterranean they are adjusted to what counts as a good day there.
              </p>
            </Section>

            <Section icon={<Waves size={15} />} title="Forecast data" testId="info-sources">
              <p>
                Waves, swell and sea level come from the{' '}
                <span className="text-zinc-200">Open-Meteo Marine API</span>; wind and gusts from the{' '}
                <span className="text-zinc-200">Open-Meteo Forecast API</span>. For each spot Open-Meteo
                automatically picks the highest-resolution model available, so a spot may be served by
                any of the models below.
              </p>

              {failed && (
                <p className="text-zinc-500" data-testid="info-status-failed">
                  Model update status is unavailable right now.
                </p>
              )}
              {!status && !failed && <p className="text-zinc-600">Checking model runs…</p>}

              {status && (
                <>
                  <div className="pt-2">
                    <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] text-zinc-500 font-semibold mb-1">
                      <Waves size={12} /> Waves and swell
                    </div>
                    {waves.map(m => (
                      <ModelRow key={m.id} model={m} now={now} />
                    ))}
                  </div>
                  <div className="pt-3">
                    <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] text-zinc-500 font-semibold mb-1">
                      <Wind size={12} /> Wind
                    </div>
                    {wind.map(m => (
                      <ModelRow key={m.id} model={m} now={now} />
                    ))}
                  </div>
                  <p className="text-[11px] text-zinc-600 pt-1">
                    Next update times are expected from each model&apos;s last run and schedule, as
                    published by Open-Meteo.
                  </p>
                </>
              )}
            </Section>

            <Section icon={<RefreshCw size={15} />} title="How often the app refreshes" testId="info-refresh">
              <p>
                Forecasts for each spot are reused for up to{' '}
                <span className="text-zinc-200" data-testid="info-cache-duration">
                  {Math.round((status?.forecastCacheSeconds ?? 3600) / 60)} minutes
                </span>{' '}
                before being fetched again, so a new model run can take up to that long to appear here.
              </p>
            </Section>

            <Section icon={<Star size={15} />} title="How the rating works" testId="info-rating">
              <p>
                The 0–10 rating measures the surf itself, not how well it suits your level. It follows
                the principles surf-forecast, Magicseaweed and Surfline publish:
              </p>
              <ul className="list-disc pl-4 space-y-1">
                <li>
                  <span className="text-zinc-200">Wave energy</span> (height² × period²) summed over the
                  primary swell, secondary swell and wind waves. Under about 50 kJ the sea is flat.
                </li>
                <li>
                  <span className="text-zinc-200">Period</span>: short-period wind swell scores lower than
                  groundswell of the same energy.
                </li>
                <li>
                  <span className="text-zinc-200">Swell direction</span>: energy arriving from outside the
                  spot&apos;s open-water window counts for less.
                </li>
                <li>
                  <span className="text-zinc-200">Wind</span>: onshore and cross-shore wind take stars away,
                  unusually strong gusts count against it, and very strong wind from any direction scores 0.
                  Light and offshore wind cost nothing.
                </li>
              </ul>
              <p data-testid="info-calibration">
                None of these services publishes a formula, so the scale is calibrated against{' '}
                <span className="text-zinc-200">surf-forecast</span>&apos;s real ratings: 206 forecast slots
                at 10 spots, with an average error of{' '}
                <span className="text-zinc-200">0.5 stars</span> and 96% of slots within one star.
              </p>
              <p data-testid="info-mediterranean">
                The Mediterranean rarely sees the long swells that score well on that scale, so it has its
                own: 1 m at 7 s with clean wind is a 2–3 there, and 1.5 m at 8 s a 5–6.
              </p>
              <p>
                When wind spoils a good swell, the spot detail shows what the swell alone would score.
              </p>
            </Section>

            <Section icon={<AlertTriangle size={15} />} title="Safety alert" testId="info-safety">
              <p>
                With the beginner level selected, a spot turns red when the waves are expected to break
                above 1.5 m. Breaking height is estimated from swell height and period, because a long
                period swell breaks much bigger than its offshore height suggests.
              </p>
            </Section>

            <Section icon={<MapPin size={15} />} title="Spot catalogue" testId="info-catalogue">
              <p>
                <span className="text-zinc-200">{catalogue.total.toLocaleString('en-GB')} spots</span> built
                from named beaches in OpenStreetMap, kept only where the coast faces open water.
              </p>
              <p className="text-zinc-500">
                {catalogue.byCountry
                  .map(([country, n]) => `${country} ${n.toLocaleString('en-GB')}`)
                  .join(' · ')}
              </p>
            </Section>

            <Section icon={<AlertTriangle size={15} />} title="Known limitations" testId="info-limitations">
              <ul className="list-disc pl-4 space-y-1">
                <li>
                  Tide times come from modelled sea level. Open-Meteo notes its accuracy on the coast is
                  limited; do not use it for navigation.
                </li>
                <li>The rating does not yet account for tide or the type of seabed at each spot.</li>
                <li>Models run on grids of 1.5–25 km, so local shelter and banks are not resolved.</li>
              </ul>
            </Section>

            <Section icon={<Sparkles size={15} />} title="Coming next" testId="info-next">
              <p>
                Comparing several wave and wind models side by side, so you can see where they agree and
                how confident the forecast is.
              </p>
            </Section>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
