/**
 * The spot detail's pill timeline: one pill per 3-hour slot across the horizon,
 * tall with the swell and warm with the rating, so "grey today, yellow on
 * Saturday" reads at a glance without stepping through hours.
 */

import type { MarineForecast } from './marine-api';
import type { StarRatingResult } from './star-engine';
import { compactDayLabel, LocalInstant } from './timeline';

export interface SeriesHour extends StarRatingResult {
  forecast: MarineForecast;
}

export interface TimelineSlot {
  /** Hour offset from the anchor that the pill opens: its first available hour. */
  hourOffset: number;
  /** Local hour of day the slot nominally starts at: 0, 3, ... 21. */
  slotHour: number;
  swellHeight: number | null;
  stars: number;
  unrated: boolean;
  isDangerous: boolean;
}

export interface TimelineDay {
  day: string;
  label: string;
  /** Hour offset of the day's first available hour. */
  startHour: number;
  slots: TimelineSlot[];
}

export const SLOT_HOURS = 3;
/** Heights above this keep the tallest pill: past 3 m the detail is in the number. */
export const PILL_MAX_HEIGHT_M = 3;
export const PILL_MIN_PX = 4;
export const PILL_MAX_PX = 44;
/** Stars at which a pill reaches full yellow: the map's epic threshold. */
export const PILL_FULL_COLOUR_STARS = 5;

// The map's own ends of the scale, a step lighter at the grey end so a flat day
// still reads against the drawer's near-black background.
const GREY: [number, number, number] = [0x52, 0x52, 0x5b]; // zinc-600
const YELLOW: [number, number, number] = [0xfb, 0xbf, 0x24]; // epic marker
export const PILL_DANGER = '#EF4444';

function instantFromKey(key: string): LocalInstant {
  return { key, day: key.slice(0, 10), hour: Number.parseInt(key.slice(11, 13), 10) };
}

export function buildTimeline(
  hours: SeriesHour[],
  utcOffsetSeconds: number,
  now: Date = new Date()
): TimelineDay[] {
  const days: TimelineDay[] = [];

  hours.forEach((entry, offset) => {
    const instant = instantFromKey(entry.forecast.timestamp);
    const slotHour = Math.floor(instant.hour / SLOT_HOURS) * SLOT_HOURS;

    let day = days[days.length - 1];
    if (day?.day !== instant.day) {
      day = {
        day: instant.day,
        label: compactDayLabel(instant, utcOffsetSeconds, now),
        startHour: offset,
        slots: [],
      };
      days.push(day);
    }

    // A slot is represented by its first available hour, which is also the
    // hour a tap opens: what the pill shows is what the detail then shows.
    if (day.slots[day.slots.length - 1]?.slotHour === slotHour) return;
    day.slots.push({
      hourOffset: offset,
      slotHour,
      swellHeight: entry.forecast.swellHeight,
      stars: entry.stars,
      unrated: entry.unrated,
      isDangerous: entry.safety.isDangerous,
    });
  });

  return days;
}

export function pillHeightPx(heightM: number | null): number {
  if (heightM === null || !Number.isFinite(heightM)) return PILL_MIN_PX;
  const clamped = Math.min(Math.max(heightM, 0), PILL_MAX_HEIGHT_M);
  return Math.round(PILL_MIN_PX + (clamped / PILL_MAX_HEIGHT_M) * (PILL_MAX_PX - PILL_MIN_PX));
}

/** Continuous grey-to-yellow by rating; red when above the viewer's level. */
export function pillColour(stars: number, options?: { isDangerous?: boolean }): string {
  if (options?.isDangerous) return PILL_DANGER;
  const t = Math.min(Math.max(stars, 0), PILL_FULL_COLOUR_STARS) / PILL_FULL_COLOUR_STARS;
  const channel = (i: number) => Math.round(GREY[i] + (YELLOW[i] - GREY[i]) * t);
  return `rgb(${channel(0)}, ${channel(1)}, ${channel(2)})`;
}

/** The slot a given hour offset falls in, for marking the selected pill. */
export function slotContaining(days: TimelineDay[], hourOffset: number): TimelineSlot | null {
  let found: TimelineSlot | null = null;
  for (const day of days) {
    for (const slot of day.slots) {
      if (slot.hourOffset > hourOffset) return found;
      found = slot;
    }
  }
  return found;
}
