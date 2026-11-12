// -----------------------------------------------------------------------------
// The periods of the Spanish 2.0TD access tariff (households and small
// businesses up to 15 kW), as set by the CNMC (Circular 3/2020, BOE-A-2020-1066,
// in force since 2021-06-01), pure functions:
//
//   Peninsula, Balearic and Canary Islands (local time of each):
//     weekdays  00-08 P3 valle, 08-10 P2 llano, 10-14 P1 punta,
//               14-18 P2 llano, 18-22 P1 punta, 22-24 P2 llano
//   Ceuta and Melilla: the same an hour later
//     weekdays  00-08 P3, 08-11 P2, 11-15 P1, 15-19 P2, 19-23 P1, 23-24 P2
//   Saturdays, Sundays and the national holidays of fixed date (below):
//     P3 valle all day, everywhere.
//
// The national holidays counted are the fixed-date ones the CNMC lists for
// 2.0TD (moving ones such as Good Friday and the regional ones are not
// counted: they are not valle days of 2.0TD). The regulation may change: the
// list is dated here and in the docs.
// -----------------------------------------------------------------------------

export const ZONES = Object.freeze({
  PENINSULA: 'peninsula',
  CANARIAS: 'canarias',
  CEUTA_MELILLA: 'ceuta_melilla',
});

/** The IANA time zone of each zone (the periods follow the local time). */
export const ZONE_TIME_ZONE = Object.freeze({
  [ZONES.PENINSULA]: 'Europe/Madrid',
  [ZONES.CANARIAS]: 'Atlantic/Canary',
  [ZONES.CEUTA_MELILLA]: 'Europe/Madrid',
});

/** 1 January, 6 January, 1 May, 15 August, 12 October, 1 November, 6, 8 and 25 December. */
export const NATIONAL_HOLIDAYS = Object.freeze([
  '01-01',
  '01-06',
  '05-01',
  '08-15',
  '10-12',
  '11-01',
  '12-06',
  '12-08',
  '12-25',
]);

const P1 = 1;
const P2 = 2;
const P3 = 3;
// The period of each hour of a weekday.
const WEEKDAY = {
  [ZONES.PENINSULA]: [3, 3, 3, 3, 3, 3, 3, 3, 2, 2, 1, 1, 1, 1, 2, 2, 2, 2, 1, 1, 1, 1, 2, 2],
  [ZONES.CEUTA_MELILLA]: [3, 3, 3, 3, 3, 3, 3, 3, 2, 2, 2, 1, 1, 1, 1, 2, 2, 2, 2, 1, 1, 1, 1, 2],
};
WEEKDAY[ZONES.CANARIAS] = WEEKDAY[ZONES.PENINSULA];

const formatters = new Map();
function formatter(timeZone) {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hourCycle: 'h23',
      weekday: 'short',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** The local month-day, weekday and hour of `ms` in a zone. */
export function localOf(ms, zone) {
  const out = {};
  for (const { type, value } of formatter(ZONE_TIME_ZONE[zone]).formatToParts(new Date(ms))) {
    out[type] = value;
  }
  return { md: `${out.month}-${out.day}`, weekday: out.weekday, hour: Number(out.hour) };
}

/** The 2.0TD period (1, 2 or 3) at `ms` in a zone; undefined for an unknown zone. */
export function periodAt(ms, zone) {
  if (!WEEKDAY[zone] || !Number.isFinite(ms)) return undefined;
  const { md, weekday, hour } = localOf(ms, zone);
  if (weekday === 'Sat' || weekday === 'Sun' || NATIONAL_HOLIDAYS.includes(md)) return P3;
  return WEEKDAY[zone][hour] ?? undefined;
}

export const PERIODS = Object.freeze({ P1, P2, P3 });

/**
 * The price (EUR/kWh) at `ms` from `prices` = [p1, p2, p3]; undefined when
 * the period or its price is unknown (never a guess).
 */
export function periodPrice(prices, ms, zone) {
  const p = periodAt(ms, zone);
  if (!p || !Array.isArray(prices)) return undefined;
  const price = prices[p - 1];
  return typeof price === 'number' && Number.isFinite(price) ? price : undefined;
}

/** Whether the three periods have the same price (a single-price product). */
export const isFlat = (prices) =>
  Array.isArray(prices) && prices.length === 3 && prices.every((p) => p === prices[0]);
