/**
 * Time selection for the forecast.
 *
 * The store keeps an integer hour offset; every label is rendered in the
 * *spot's* local time, derived from the `utc_offset_seconds` Open-Meteo returns
 * for the queried coordinates. The browser's own timezone is never used.
 */

export const MAX_FORECAST_HOURS = 168; // 7 days

/** A wall-clock instant in some fixed UTC offset, with no ambiguity. */
export interface LocalInstant {
  /** `YYYY-MM-DDTHH:00`, matching Open-Meteo's `timezone=auto` series keys. */
  key: string;
  /** `YYYY-MM-DD` of that instant in the spot's local time. */
  day: string;
  /** Hour of day, 0-23. */
  hour: number;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Shifts a UTC instant by an offset and reads its fields as wall-clock time.
 * Using the UTC getters after shifting avoids the host timezone leaking in.
 */
function wallClock(utcMillis: number, utcOffsetSeconds: number): LocalInstant {
  const shifted = new Date(utcMillis + utcOffsetSeconds * 1000);
  const day = `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
  return {
    key: `${day}T${pad(shifted.getUTCHours())}:00`,
    day,
    hour: shifted.getUTCHours(),
  };
}

/**
 * The anchor of the timeline: the current time in the spot's timezone rounded
 * UP to the next whole hour. At 14:20 local this is 15:00; at 17:00 sharp it
 * stays 17:00.
 */
export function anchorInstant(utcOffsetSeconds: number, now: Date = new Date()): LocalInstant {
  const shifted = new Date(now.getTime() + utcOffsetSeconds * 1000);
  const isOnTheHour = shifted.getUTCMinutes() === 0 && shifted.getUTCSeconds() === 0 && shifted.getUTCMilliseconds() === 0;

  // Truncate to the hour, then step forward unless we were already exact.
  const truncated = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
    shifted.getUTCHours()
  );
  const anchoredUtc = isOnTheHour ? truncated : truncated + 3600_000;

  // `anchoredUtc` is already shifted, so read it back with a zero offset.
  return wallClock(anchoredUtc, 0);
}

/** The instant `hourOffset` whole hours after the anchor. */
export function instantAt(
  utcOffsetSeconds: number,
  hourOffset: number,
  now: Date = new Date()
): LocalInstant {
  const anchor = anchorInstant(utcOffsetSeconds, now);
  const anchorUtc = Date.parse(`${anchor.key}:00Z`);
  return wallClock(anchorUtc + hourOffset * 3600_000, 0);
}

export interface DayLabel {
  /** `Today` / `Tomorrow` / `Thu 18 Sep` */
  label: string;
  /** True when this instant is the first hour of its day within the timeline. */
  isDayBoundary: boolean;
}

/**
 * Human label for the day an instant falls on, relative to the spot's today.
 * Days beyond tomorrow get an explicit weekday + date so a 5-day-out forecast
 * is never mistaken for a nearby one.
 */
export function dayLabel(
  instant: LocalInstant,
  utcOffsetSeconds: number,
  now: Date = new Date()
): DayLabel {
  const today = wallClock(now.getTime(), utcOffsetSeconds).day;
  const dayDelta = Math.round(
    (Date.parse(`${instant.day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000
  );

  let label: string;
  if (dayDelta === 0) {
    label = 'Today';
  } else if (dayDelta === 1) {
    label = 'Tomorrow';
  } else {
    const d = new Date(`${instant.day}T00:00:00Z`);
    const weekday = d.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
    const month = d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
    label = `${weekday} ${d.getUTCDate()} ${month}`;
  }

  return { label, isDayBoundary: instant.hour === 0 };
}

/** `Today, 15:00` — the full label shown next to the slider. */
export function formatInstant(
  instant: LocalInstant,
  utcOffsetSeconds: number,
  now: Date = new Date()
): string {
  return `${dayLabel(instant, utcOffsetSeconds, now).label}, ${pad(instant.hour)}:00`;
}
