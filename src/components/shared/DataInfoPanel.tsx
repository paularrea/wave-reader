'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Drawer } from 'vaul';
import {
  Info,
  Waves,
  Wind,
  RefreshCw,
  Star,
  MapPin,
  AlertTriangle,
  Sparkles,
  ShieldAlert,
  Gauge,
} from 'lucide-react';
import { pillColour, pillHeightPx } from '@/services/forecast-series';
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
  id,
  icon,
  title,
  children,
  testId,
}: {
  id: string;
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <section
      id={`info-${id}`}
      data-section={id}
      className="rounded-2xl bg-zinc-900/60 border border-zinc-800/70 p-4 scroll-mt-3"
      data-testid={testId}
    >
      <h3 className="flex items-center gap-2.5 text-[14px] font-semibold text-zinc-100 mb-3">
        <span className="w-7 h-7 rounded-lg bg-zinc-800/80 text-zinc-300 flex items-center justify-center shrink-0">
          {icon}
        </span>
        {title}
      </h3>
      <div className="text-[13px] leading-relaxed text-zinc-400 space-y-2.5">{children}</div>
    </section>
  );
}

/** A labelled fact in a rating or safety card: the term stands out, the detail follows. */
function Fact({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-amber-400/80 shrink-0" />
      <span>
        <span className="text-zinc-100 font-medium">{term}.</span> {children}
      </span>
    </li>
  );
}

const QUICK_LINKS = [
  { id: 'conditions', label: 'Conditions' },
  { id: 'sources', label: 'Data' },
  { id: 'rating', label: 'Rating' },
  { id: 'safety', label: 'Safety' },
  { id: 'limitations', label: 'Limits' },
];

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

  const scroller = useRef<HTMLDivElement>(null);
  /** Scrolls the panel itself, never the page behind it. */
  const jumpTo = (id: string) => {
    const container = scroller.current;
    const target = container?.querySelector<HTMLElement>(`[data-section="${id}"]`);
    if (!container || !target) return;
    container.scrollTo({ top: target.offsetTop - container.offsetTop - 12, behavior: 'smooth' });
  };

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
              What the colours mean, where forecasts come from and how spots are rated
            </Drawer.Description>
            <nav
              className="flex gap-1.5 mt-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              aria-label="Sections"
              data-testid="info-quick-links"
            >
              {QUICK_LINKS.map(link => (
                <button
                  key={link.id}
                  type="button"
                  onClick={() => jumpTo(link.id)}
                  data-testid={`info-link-${link.id}`}
                  className="shrink-0 rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-[12px] font-medium text-zinc-300 hover:text-white hover:border-zinc-700 transition-colors"
                >
                  {link.label}
                </button>
              ))}
            </nav>
          </div>

          <div
            ref={scroller}
            className="flex-1 overflow-y-auto overscroll-contain px-4 pt-4 min-h-0 flex flex-col gap-3"
            style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
            data-testid="info-scroll"
          >
            {/* First thing in the panel: what the map's markers mean. */}
            <section
              id="info-conditions"
              data-section="conditions"
              data-testid="quality-legend"
              className="rounded-2xl border border-amber-400/25 bg-gradient-to-b from-amber-400/[0.07] to-zinc-900/60 p-4 scroll-mt-3"
            >
              <h3 className="flex items-center gap-2.5 text-[14px] font-semibold text-zinc-100">
                <span className="w-7 h-7 rounded-lg bg-amber-400/15 text-amber-300 flex items-center justify-center shrink-0">
                  <Star size={15} />
                </span>
                Conditions
              </h3>
              <p className="text-[12px] text-zinc-400 mt-2 mb-3">
                Every spot is scored from 0 to 10. Bigger, brighter markers mean better surf.
              </p>
              <ul className="grid grid-cols-2 gap-2">
                {LEGEND_TIERS.map(tier => {
                  const entry = legendEntry(tier);
                  return (
                    <li
                      key={tier}
                      className="flex items-center gap-2.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 px-2.5 py-2"
                      data-testid={`legend-${tier}`}
                    >
                      <span className="w-8 h-8 flex items-center justify-center shrink-0">
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
                      <span className="min-w-0">
                        <span className="block text-[13px] text-zinc-100 font-medium leading-tight truncate">
                          {entry.label}
                        </span>
                        <span className="block text-[11px] tabular-nums text-zinc-500 leading-tight">
                          {tier === 'danger' ? 'Beginner alert' : `Score ${entry.range}`}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>

              {/* The same scale, as it appears in a spot's timeline. */}
              <div className="mt-3 flex items-center gap-3 rounded-xl bg-zinc-950/60 border border-zinc-800/80 px-3 py-2.5">
                <div className="flex items-end gap-1 h-11 shrink-0" aria-hidden>
                  {[
                    [0.3, 0],
                    [0.7, 1],
                    [1.2, 2],
                    [1.6, 4],
                    [2.4, 5],
                    [3.5, 7],
                  ].map(([height, stars]) => (
                    <span
                      key={height}
                      className="w-2 rounded-full"
                      style={{ height: pillHeightPx(height), backgroundColor: pillColour(stars) }}
                    />
                  ))}
                </div>
                <p className="text-[12px] leading-snug text-zinc-400">
                  In a spot&apos;s timeline each pill is 3 hours: taller with bigger swell (up to 3 m),
                  from grey to yellow as the score rises.
                </p>
              </div>

              <p className="text-[11px] text-zinc-500 mt-3">
                Scores follow the surf-forecast scale. The Mediterranean has its own, tuned to what a good
                day there looks like.
              </p>
            </section>

            <Section id="sources" icon={<Waves size={15} />} title="Forecast data" testId="info-sources">
              <p>
                Waves, swell and sea level come from the{' '}
                <span className="text-zinc-200">Open-Meteo Marine API</span>; wind and gusts from the{' '}
                <span className="text-zinc-200">Open-Meteo Forecast API</span>. For each spot Open-Meteo
                picks the highest-resolution model available, so a spot may be served by any of these.
              </p>

              {failed && (
                <p
                  className="rounded-lg bg-zinc-950/60 border border-zinc-800 px-3 py-2 text-zinc-500"
                  data-testid="info-status-failed"
                >
                  Model update status is unavailable right now.
                </p>
              )}
              {!status && !failed && <p className="text-zinc-600">Checking model runs…</p>}

              {status && (
                <>
                  <div className="rounded-xl bg-zinc-950/60 border border-zinc-800/80 px-3 pt-2">
                    <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] text-zinc-500 font-semibold">
                      <Waves size={12} /> Waves and swell
                    </div>
                    {waves.map(m => (
                      <ModelRow key={m.id} model={m} now={now} />
                    ))}
                  </div>
                  <div className="rounded-xl bg-zinc-950/60 border border-zinc-800/80 px-3 pt-2">
                    <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] text-zinc-500 font-semibold">
                      <Wind size={12} /> Wind
                    </div>
                    {wind.map(m => (
                      <ModelRow key={m.id} model={m} now={now} />
                    ))}
                  </div>
                  <p className="text-[11px] text-zinc-600">
                    Next update times are expected from each model&apos;s last run and schedule, as
                    published by Open-Meteo.
                  </p>
                </>
              )}

              <div
                className="flex items-start gap-2.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 px-3 py-2.5"
                data-testid="info-refresh"
              >
                <RefreshCw size={14} className="mt-0.5 shrink-0 text-zinc-500" />
                <p className="text-[12px]">
                  The app reuses each forecast for up to{' '}
                  <span className="text-zinc-200" data-testid="info-cache-duration">
                    {Math.round((status?.forecastCacheSeconds ?? 3600) / 60)} minutes
                  </span>
                  , so a new model run can take that long to appear.
                </p>
              </div>
            </Section>

            <Section id="rating" icon={<Gauge size={15} />} title="How the rating works" testId="info-rating">
              <p>
                The score measures the surf itself, not how well it suits your level. It combines four
                things:
              </p>
              <ul className="space-y-2">
                <Fact term="Wave energy">
                  Height² × period², summed over primary swell, secondary swell and wind waves. Under about
                  50 kJ the sea is flat.
                </Fact>
                <Fact term="Period">Short wind swell scores lower than groundswell of the same energy.</Fact>
                <Fact term="Swell direction">
                  Energy arriving from outside the spot&apos;s open-water window counts for less.
                </Fact>
                <Fact term="Wind">
                  Onshore and cross-shore wind take points away, strong gusts count against it and very
                  strong wind from any direction scores 0. Light and offshore wind cost nothing.
                </Fact>
              </ul>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div
                  className="rounded-xl bg-zinc-950/60 border border-zinc-800/80 px-3 py-2.5"
                  data-testid="info-calibration"
                >
                  <div className="text-[11px] uppercase tracking-[0.12em] text-zinc-500 font-semibold mb-1">
                    Atlantic
                  </div>
                  <p className="text-[12px] leading-snug">
                    Calibrated against <span className="text-zinc-200">surf-forecast</span>: 206 slots at 10
                    spots, average error <span className="text-zinc-200">0.5 stars</span>, 96% within one.
                  </p>
                </div>
                <div
                  className="rounded-xl bg-zinc-950/60 border border-zinc-800/80 px-3 py-2.5"
                  data-testid="info-mediterranean"
                >
                  <div className="text-[11px] uppercase tracking-[0.12em] text-zinc-500 font-semibold mb-1">
                    Mediterranean
                  </div>
                  <p className="text-[12px] leading-snug">
                    Its own scale: 1 m at 7 s with clean wind scores 2–3, and 1.5 m at 8 s scores 5–6.
                  </p>
                </div>
              </div>
              <p className="text-[12px] text-zinc-500">
                When wind spoils a good swell, the spot detail shows what the swell alone would score.
              </p>
            </Section>

            <Section id="safety" icon={<ShieldAlert size={15} />} title="Safety alert" testId="info-safety">
              <p>
                With the <span className="text-zinc-200">beginner</span> level selected, a spot turns red when
                waves are expected to break above <span className="text-zinc-200">1.5 m</span>. Breaking
                height uses swell height and period, because long-period swell breaks much bigger than its
                offshore height suggests.
              </p>
            </Section>

            <Section id="catalogue" icon={<MapPin size={15} />} title="Spot catalogue" testId="info-catalogue">
              <p>
                <span className="text-zinc-200">{catalogue.total.toLocaleString('en-GB')} spots</span> from
                named beaches in OpenStreetMap, kept only where the coast faces open water.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {catalogue.byCountry.map(([country, n]) => (
                  <span
                    key={country}
                    className="rounded-full bg-zinc-950/60 border border-zinc-800 px-2.5 py-0.5 text-[12px]"
                  >
                    {country} <span className="text-zinc-200 tabular-nums">{n.toLocaleString('en-GB')}</span>
                  </span>
                ))}
              </div>
            </Section>

            <Section
              id="limitations"
              icon={<AlertTriangle size={15} />}
              title="Known limitations"
              testId="info-limitations"
            >
              <ul className="space-y-2">
                <Fact term="Tides">
                  Times come from modelled sea level, which is less accurate on the coast. Not for
                  navigation.
                </Fact>
                <Fact term="Local detail">
                  The rating doesn&apos;t yet account for tide or seabed, and models run on 1.5–25 km grids,
                  so local shelter and banks aren&apos;t resolved.
                </Fact>
              </ul>
            </Section>

            <Section id="next" icon={<Sparkles size={15} />} title="Coming next" testId="info-next">
              <p>
                Comparing several wave and wind models side by side, to show where they agree and how
                confident the forecast is.
              </p>
            </Section>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
