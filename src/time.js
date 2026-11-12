// -----------------------------------------------------------------------------
// Local time of Spain (Europe/Madrid), through the time zone database of
// Node (Intl): the changes of time are the real ones. The API instants carry
// their offset; the bill dates are local dates. Pure functions. (The tariff
// periods, Canary Islands included, are in tariff.js.)
// -----------------------------------------------------------------------------

import { DAY, HOUR, TIME_ZONE } from './constants.js';

const parts = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** The local date and time of Spain at `ms`: { y, mo, d, h, mi, s }. */
export function madrid(ms) {
  const out = {};
  for (const { type, value } of parts.formatToParts(new Date(ms))) {
    out[type] = Number(value);
  }
  return { y: out.year, mo: out.month, d: out.day, h: out.hour, mi: out.minute, s: out.second };
}

const pad = (v) => String(v).padStart(2, '0');

/** "2026-11-11", the local date of Spain at `ms`. */
export function localDate(ms) {
  const t = madrid(ms);
  return `${t.y}-${pad(t.mo)}-${pad(t.d)}`;
}

/** "14:05", local time of Spain. */
export function clock(ms) {
  const t = madrid(ms);
  return `${pad(t.h)}:${pad(t.mi)}`;
}

/** The instant of a local time of Spain (the first one of an hour seen twice). */
export function fromMadrid(y, mo, d, h = 0, mi = 0) {
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  for (const offset of [2, 1]) {
    const candidate = asUtc - offset * HOUR;
    const t = madrid(candidate);
    if (t.y === y && t.mo === mo && t.d === d && t.h === h && t.mi === mi) {
      return candidate;
    }
  }
  // A local time skipped by the spring change (02:xx): read as winter time.
  return asUtc - HOUR;
}

/** The local midnight of Spain that starts the day of `ms`. */
export function startOfDay(ms) {
  const t = madrid(ms);
  return fromMadrid(t.y, t.mo, t.d);
}

/** The local midnight `days` days before (negative) or after the day of `ms`. */
export function addDays(ms, days) {
  const t = madrid(ms);
  // Noon of the day, moved by whole days, never lands on a change of time.
  const noon = Date.UTC(t.y, t.mo - 1, t.d, 12) + days * DAY;
  const n = new Date(noon);
  return fromMadrid(n.getUTCFullYear(), n.getUTCMonth() + 1, n.getUTCDate());
}

/** An ISO instant WITH its offset (or Z) -> ms; undefined otherwise (never a guessed zone). */
export function parseInstant(value) {
  if (typeof value !== 'string' || value.length > 40) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/.test(value)) {
    return undefined;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : undefined;
}

/** A local date "YYYY-MM-DD" -> its local midnight in Spain; undefined when malformed. */
export function parseLocalDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof value === 'string' ? value : '');
  if (!match) return undefined;
  const [y, mo, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return undefined;
  return fromMadrid(y, mo, d);
}
