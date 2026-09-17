'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Drawer } from 'vaul';
import {
  Info,
  Waves,
  Wind,
  RefreshCw,

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
      className="py-5 border-b border-line last:border-0 scroll-mt-3"
      data-testid={testId}
    >
      <h3 className="flex items-center gap-2.5 text-[17px] font-semibold text-ink-0 mb-2.5">
        <span className="text-ink-2 flex items-center shrink-0">
          {icon}
        </span>
        {title}
      </h3>
      <div className="text-[15px] leading-relaxed text-ink-1 space-y-3">{children}</div>
    </section>
  );
}

/** A labelled fact in a rating or safety card: the term stands out, the detail follows. */
function Fact({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-[10px] w-1.5 h-1.5 rounded-full bg-ink-3 shrink-0" />
      <span>
        <span className="text-ink-0 font-medium">{term}.</span> {children}
      </span>
    </li>
  );
}

const TIER_MEANING: Record<string, string> = {
  epic: 'Rare. Go.',
  good: 'Surfable, worth a look',
  poor: 'Flat or blown out',
  danger: 'Beginners: breaking over 1.5 m',
  unrated: 'No forecast here',
};

const QUICK_LINKS = [
  { id: 'conditions', label: 'Scores' },
  { id: 'sources', label: 'Data' },
  { id: 'rating', label: 'Rating' },
  { id: 'safety', label: 'Safety' },
  { id: 'limitations', label: 'Limits' },
];

function ModelRow({ model, now }: { model: ModelStatus; now: number }) {
  const unavailable = model.status !== 'ok';
  return (
    <div
      className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 py-2.5 border-b border-line last:border-0"
      data-testid="model-row"
      data-model={model.id}
    >
      <div className="min-w-0">
        <div className="text-ink-0 font-medium truncate">
          {model.name} <span className="text-ink-2 font-normal">· {model.provider}</span>
        </div>
        <div className="text-[12px] text-ink-2 truncate">
          {model.resolution} · {model.coverage} · {describeInterval(model.updateIntervalSeconds)}
        </div>
      </div>
      <div className="text-right tabular-nums">
        <div
          className={`text-[12px] font-medium ${unavailable ? 'text-ink-3' : 'text-ink-0'}`}
          data-testid="model-next-update"
        >
          {unavailable ? 'Status unavailable' : describeNextUpdate(model.nextExpectedAt, now)}
        </div>
        {!unavailable && (
          <div className="text-[12px] text-ink-2" data-testid="model-last-run">
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
          className="w-11 h-11 shrink-0 rounded-full bg-sheet/90 backdrop-blur-md border border-line text-ink-1 hover:text-white flex items-center justify-center transition-colors"
        >
          <Info size={18} />
        </button>
      </Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/60 z-40" />
        <Drawer.Content
          data-testid="info-panel"
          className="bg-sheet text-ink-0 flex flex-col rounded-t-3xl fixed bottom-0 left-0 right-0 z-50 max-h-[92dvh] border-t border-line outline-none max-w-lg mx-auto"
        >
          <div className="mx-auto w-9 h-1 rounded-full bg-zinc-700 mt-2 shrink-0" />
          <div className="px-5 pt-3.5 pb-3 shrink-0 border-b border-line">
            <Drawer.Title className="text-[22px] font-semibold tracking-tight">How to read the map</Drawer.Title>
            <Drawer.Description className="text-[14px] text-ink-2 mt-1">
              What scores mean, where the data comes from and how it&apos;s rated
            </Drawer.Description>
            <nav
              className="flex gap-1.5 mt-3 overflow-x-auto no-scrollbar"
              aria-label="Sections"
              data-testid="info-quick-links"
            >
              {QUICK_LINKS.map(link => (
                <button
                  key={link.id}
                  type="button"
                  onClick={() => jumpTo(link.id)}
                  data-testid={`info-link-${link.id}`}
                  className="shrink-0 h-9 rounded-full border border-line-strong px-3.5 text-[14px] font-medium text-ink-1 hover:text-white hover:bg-card transition-colors"
                >
                  {link.label}
                </button>
              ))}
            </nav>
          </div>

          <div
            ref={scroller}
            className="flex-1 overflow-y-auto overscroll-contain px-5 min-h-0 flex flex-col"
            style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
            data-testid="info-scroll"
          >
            {/* First thing in the panel: what the map's markers mean. */}
            <section
              id="info-conditions"
              data-section="conditions"
              data-testid="quality-legend"
              className="py-5 border-b border-line scroll-mt-3"
            >
              <h3 className="text-[17px] font-semibold text-ink-0">Scores</h3>
              <p className="text-[15px] leading-relaxed text-ink-1 mt-2 mb-3">
                Every spot gets 0–10 for the surf itself. On this scale a 1 is already worth checking.
              </p>
              <ul className="rounded-2xl border border-line divide-y divide-line">
                {LEGEND_TIERS.map(tier => {
                  const entry = legendEntry(tier);
                  return (
                    <li
                      key={tier}
                      className="flex items-center gap-3 px-3.5 py-3"
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
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] text-ink-0 font-medium leading-tight">
                          {entry.label}
                        </span>
                        <span className="block text-[13px] text-ink-2 leading-tight mt-0.5">
                          {TIER_MEANING[tier]}
                        </span>
                      </span>
                      <span className="text-[14px] tabular-nums text-ink-1">
                        {tier === 'danger' ? 'Alert' : entry.range.replace('-', '–')}
                      </span>
                    </li>
                  );
                })}
              </ul>

              {/* The same scale, as it appears in a spot's timeline. */}
              <div className="mt-3 flex items-center gap-3.5 rounded-2xl bg-card px-3.5 py-3">
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
                <p className="text-[14px] leading-snug text-ink-1">
                  In a spot, each bar is 3 hours: taller with bigger swell (up to 3 m), warmer with a better
                  score.
                </p>
              </div>

              <p className="text-[13px] text-ink-2 mt-3">
                Scores follow the surf-forecast scale. The Mediterranean has its own, tuned to what a good
                day there looks like.
              </p>
            </section>

            <Section id="sources" icon={<Waves size={15} />} title="Forecast data" testId="info-sources">
              <p>
                Waves, swell and sea level come from the{' '}
                <span className="text-ink-0">Open-Meteo Marine API</span>; wind and gusts from the{' '}
                <span className="text-ink-0">Open-Meteo Forecast API</span>. For each spot Open-Meteo
                picks the highest-resolution model available, so a spot may be served by any of these.
              </p>

              {failed && (
                <p
                  className="rounded-lg bg-card px-3 py-2 text-ink-2"
                  data-testid="info-status-failed"
                >
                  Model update status is unavailable right now.
                </p>
              )}
              {!status && !failed && <p className="text-ink-3">Checking model runs…</p>}

              {status && (
                <>
                  <div className="rounded-xl bg-card px-3 pt-2">
                    <div className="flex items-center gap-1.5 text-[12px] uppercase tracking-[0.12em] text-ink-2 font-semibold">
                      <Waves size={12} /> Waves and swell
                    </div>
                    {waves.map(m => (
                      <ModelRow key={m.id} model={m} now={now} />
                    ))}
                  </div>
                  <div className="rounded-xl bg-card px-3 pt-2">
                    <div className="flex items-center gap-1.5 text-[12px] uppercase tracking-[0.12em] text-ink-2 font-semibold">
                      <Wind size={12} /> Wind
                    </div>
                    {wind.map(m => (
                      <ModelRow key={m.id} model={m} now={now} />
                    ))}
                  </div>
                  <p className="text-[12px] text-ink-3">
                    Next update times are expected from each model&apos;s last run and schedule, as
                    published by Open-Meteo.
                  </p>
                </>
              )}

              <div
                className="flex items-start gap-2.5 rounded-xl bg-card px-3 py-2.5"
                data-testid="info-refresh"
              >
                <RefreshCw size={14} className="mt-0.5 shrink-0 text-ink-2" />
                <p className="text-[12px]">
                  The app reuses each forecast for up to{' '}
                  <span className="text-ink-0" data-testid="info-cache-duration">
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
                  className="rounded-xl bg-card px-3 py-2.5"
                  data-testid="info-calibration"
                >
                  <div className="text-[12px] uppercase tracking-[0.12em] text-ink-2 font-semibold mb-1">
                    Atlantic
                  </div>
                  <p className="text-[12px] leading-snug">
                    Calibrated against <span className="text-ink-0">surf-forecast</span>: 206 slots at 10
                    spots, average error <span className="text-ink-0">0.5 stars</span>, 96% within one.
                  </p>
                </div>
                <div
                  className="rounded-xl bg-card px-3 py-2.5"
                  data-testid="info-mediterranean"
                >
                  <div className="text-[12px] uppercase tracking-[0.12em] text-ink-2 font-semibold mb-1">
                    Mediterranean
                  </div>
                  <p className="text-[12px] leading-snug">
                    Its own scale: 1 m at 7 s with clean wind scores 2–3, and 1.5 m at 8 s scores 5–6.
                  </p>
                </div>
              </div>
              <p className="text-[12px] text-ink-2">
                When wind spoils a good swell, the spot detail shows what the swell alone would score.
              </p>
            </Section>

            <Section id="safety" icon={<ShieldAlert size={15} />} title="Safety alert" testId="info-safety">
              <p>
                With the <span className="text-ink-0">beginner</span> level selected, a spot turns red when
                waves are expected to break above <span className="text-ink-0">1.5 m</span>. Breaking
                height uses swell height and period, because long-period swell breaks much bigger than its
                offshore height suggests.
              </p>
            </Section>

            <Section id="catalogue" icon={<MapPin size={15} />} title="Spot catalogue" testId="info-catalogue">
              <p>
                <span className="text-ink-0">{catalogue.total.toLocaleString('en-GB')} spots</span> from
                named beaches in OpenStreetMap, kept only where the coast faces open water.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {catalogue.byCountry.map(([country, n]) => (
                  <span
                    key={country}
                    className="rounded-full bg-card px-2.5 py-0.5 text-[12px]"
                  >
                    {country} <span className="text-ink-0 tabular-nums">{n.toLocaleString('en-GB')}</span>
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
