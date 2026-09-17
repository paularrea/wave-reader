'use client';

import React, { useEffect, useRef } from 'react';
import {
  PILL_MAX_PX,
  TimelineDay,
  pillColour,
  pillHeightPx,
  slotContaining,
} from '@/services/forecast-series';

interface ForecastTimelineProps {
  days: TimelineDay[];
  currentHour: number;
  /** Local day currently shown, to mark its label. */
  activeDay: string;
  onSelectHour: (hourOffset: number) => void;
  onSelectDay: (day: TimelineDay) => void;
}

/** Shown while the forecast loads: the shape of three days, without values. */
export function ForecastTimelineSkeleton() {
  return (
    <div className="flex gap-2 overflow-hidden" data-testid="timeline-skeleton" aria-hidden>
      {Array.from({ length: 4 }, (_, d) => (
        <div key={d} className="flex flex-col gap-1.5 shrink-0">
          <div className="flex items-end" style={{ height: PILL_MAX_PX }}>
            {Array.from({ length: 8 }, (_, s) => (
              <span key={s} className="w-3 flex justify-center">
                <span
                  className="w-2 rounded-full bg-card animate-pulse"
                  style={{ height: 8 + ((d * 8 + s) % 5) * 5 }}
                />
              </span>
            ))}
          </div>
          <span className="h-3 w-10 rounded bg-card" />
        </div>
      ))}
    </div>
  );
}

/**
 * One vertical pill per 3-hour slot: height is the swell (0-3 m, capped),
 * colour the rating from grey to yellow. Days sit side by side and scroll
 * horizontally; on a phone at least three fit on screen.
 */
export function ForecastTimeline({
  days,
  currentHour,
  activeDay,
  onSelectHour,
  onSelectDay,
}: ForecastTimelineProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const selected = slotContaining(days, currentHour);

  // Keep the selected pill in view without scrolling the drawer vertically,
  // which scrollIntoView would also do.
  useEffect(() => {
    const container = scroller.current;
    if (!container || !selected) return;
    const pill = container.querySelector<HTMLElement>(`[data-hour-offset="${selected.hourOffset}"]`);
    if (!pill) return;
    const left = pill.offsetLeft - container.offsetLeft;
    const visibleFrom = container.scrollLeft;
    const visibleTo = visibleFrom + container.clientWidth;
    if (left < visibleFrom + 8 || left + pill.offsetWidth > visibleTo - 8) {
      container.scrollTo({ left: Math.max(0, left - container.clientWidth / 3), behavior: 'smooth' });
    }
  }, [selected]);

  return (
    <div
      ref={scroller}
      className="overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden -mx-1 px-1"
      data-testid="forecast-timeline"
    >
      <div className="flex w-max">
        {days.map((day, index) => {
          const isActiveDay = day.day === activeDay;
          return (
            <div
              key={day.day}
              className={`flex flex-col gap-1.5 shrink-0 ${index > 0 ? 'pl-2 ml-2 border-l border-line' : ''}`}
              data-testid="timeline-day"
              data-day={day.day}
            >
              <div className="flex items-end" style={{ height: PILL_MAX_PX }}>
                {day.slots.map(slot => {
                  const isSelected = selected?.hourOffset === slot.hourOffset;
                  const label = `${day.label} ${String(slot.slotHour).padStart(2, '0')}:00, ${
                    slot.unrated || slot.swellHeight === null
                      ? 'no data'
                      : `${slot.swellHeight.toFixed(1)} m, ${slot.stars} of 10`
                  }`;
                  return (
                    <button
                      key={slot.hourOffset}
                      type="button"
                      onClick={() => onSelectHour(slot.hourOffset)}
                      aria-label={label}
                      aria-pressed={isSelected}
                      title={label}
                      data-testid="timeline-pill"
                      data-hour-offset={slot.hourOffset}
                      data-stars={slot.unrated ? '' : slot.stars}
                      data-selected={isSelected}
                      className="w-3 h-full flex items-end justify-center outline-none group"
                    >
                      <span
                        className={`w-2 rounded-full transition-[box-shadow] ${
                          isSelected ? 'ring-2 ring-white ring-offset-1 ring-offset-sheet' : ''
                        }`}
                        style={
                          slot.unrated
                            ? {
                                height: pillHeightPx(null),
                                border: '1px dashed rgba(161,161,170,0.7)',
                              }
                            : {
                                height: pillHeightPx(slot.swellHeight),
                                backgroundColor: pillColour(slot.stars, {
                                  isDangerous: slot.isDangerous,
                                }),
                              }
                        }
                      />
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => onSelectDay(day)}
                data-testid="drawer-day-tab"
                data-active={isActiveDay}
                className={`text-left text-[12px] font-medium leading-none transition-colors ${
                  isActiveDay ? 'text-white' : 'text-ink-2 hover:text-ink-0'
                }`}
              >
                {day.label}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
