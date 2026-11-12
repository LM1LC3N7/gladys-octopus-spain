// -----------------------------------------------------------------------------
// What the Kraken answers of Octopus Energy España mean, as pure functions:
// the supply points (CUPS) of the account with the prices of their contract in
// force, the balances and the last bill, the hourly readings and their
// half-hours.
//
// Prices: EUR per kWh, taxes included (`variableTermWithTaxes`), one per 2.0TD
// period [P1 punta, P2 llano, P3 valle]. The API gives the prices of the
// contract in force only, never their dates: the app keeps what it saw to
// price the past. A price missing or unreadable stays unknown (never 0).
// -----------------------------------------------------------------------------

import { createHmac } from 'node:crypto';
import { HALF_HOUR, HOUR, MAX_HOUR_KWH, MAX_METERS, MAX_MONEY, MAX_PRICE } from '../constants.js';
import { parseInstant, parseLocalDate } from '../time.js';

/** A CUPS: ES, 16 digits, 2 check letters, an optional 2-character border point. */
const CUPS = /^ES[0-9]{16}[A-Z]{2}([0-9][A-Z])?$/;
const ACCOUNT = /^[A-Za-z]-[A-Za-z0-9]{4,16}$/;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g;

const list = (value, max) => (Array.isArray(value) ? value.slice(0, max) : []);

/** A text of the API, printable and bounded; '' otherwise. */
export function clean(value, max = 60) {
  if (typeof value !== 'string') return '';
  const text = value.replace(CONTROL, ' ').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** A strict number: a finite number, or a decimal string ("0.12"); never '' nor null. */
export function strictNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string' && /^-?\d{1,12}(\.\d{1,12})?$/.test(value.trim())) {
    return Number(value.trim());
  }
  return undefined;
}

/** A price in EUR/kWh within ± MAX_PRICE; undefined otherwise. */
export function eurPerKwh(value) {
  const n = strictNumber(value);
  return n !== undefined && Math.abs(n) <= MAX_PRICE ? Math.round(n * 1e6) / 1e6 : undefined;
}

/** An amount in cents -> EUR within ± MAX_MONEY; undefined otherwise. */
export function eurOfCents(value) {
  const n = strictNumber(value);
  if (n === undefined) return undefined;
  const eur = n / 100;
  return Math.abs(eur) <= MAX_MONEY ? Math.round(eur * 100) / 100 : undefined;
}

/**
 * The stable key of an id (16 hex digits): an HMAC-SHA-256 under the secret
 * `idKey` of this installation (kept in the Gladys config, outside the form,
 * never in /data): neither /data nor a device id gives the CUPS back, even
 * with its last 4 characters.
 */
export const keyOf = (idKey, kind, id) =>
  createHmac('sha256', idKey).update(`${kind}:${id}`, 'utf8').digest('hex').slice(0, 16);

/** The account numbers of `viewer.accounts`, valid ones only. */
export function parseAccounts(data) {
  return list(data?.viewer?.accounts, 50)
    .map((a) => (typeof a?.number === 'string' ? a.number.trim().toUpperCase() : ''))
    .filter((n) => ACCOUNT.test(n));
}

/** [p1, p2, p3] of a list of three prices; undefined unless all three are readable. */
export function threePrices(value) {
  if (!Array.isArray(value) || value.length !== 3) return undefined;
  const out = value.map(eurPerKwh);
  return out.every((p) => p !== undefined) ? out : undefined;
}

/**
 * The parts of an account answer its GraphQL errors point at (`path`):
 * `{ whole, points: Set('p/s') }`. An error without a path inside a supply
 * point makes the whole answer unusable.
 */
export function brokenParts(errors) {
  const out = { whole: false, points: new Set() };
  for (const e of list(errors, 50)) {
    const path = Array.isArray(e?.path) ? e.path : [];
    const at = (name) => {
      const i = path.indexOf(name);
      return i >= 0 && Number.isInteger(path[i + 1]) ? path[i + 1] : undefined;
    };
    const [p, s] = [at('properties'), at('electricitySupplyPoints')];
    if (p === undefined || s === undefined) out.whole = true;
    else out.points.add(`${p}/${s}`);
  }
  return out;
}

/**
 * The supply points of an account answer: [{ key, suffix, cups, prices,
 * surplus, broken }], sorted by key. `cups` (the full number) stays in
 * memory only. `prices` = [p1, p2, p3] taxes included, or undefined.
 */
export function parseAccount(data, idKey, broken = { points: new Set() }) {
  const properties = data?.account?.properties;
  if (!Array.isArray(properties)) return undefined;
  const points = [];
  for (const [pi, p] of properties.slice(0, MAX_METERS).entries()) {
    for (const [si, s] of list(p?.electricitySupplyPoints, MAX_METERS).entries()) {
      const cups = typeof s?.cups === 'string' ? s.cups.trim().toUpperCase() : '';
      if (!CUPS.test(cups) || points.some((x) => x.cups === cups)) continue;
      const prices = s?.activeAgreement?.product?.prices;
      points.push({
        // A supply point an error points at: the app keeps what it read before.
        broken: broken.points.has(`${pi}/${si}`),
        key: keyOf(idKey, 'cups', cups),
        suffix: cups.slice(-4),
        cups,
        prices: threePrices(prices?.variableTermWithTaxes),
        surplus: eurPerKwh(prices?.surplusRate),
      });
    }
  }
  return points.slice(0, MAX_METERS).sort((a, b) => a.key.localeCompare(b.key));
}

export const LEDGERS = Object.freeze({
  ELECTRICITY: 'SPAIN_ELECTRICITY_LEDGER',
  SOLAR_WALLET: 'SOLAR_WALLET_LEDGER',
});

/**
 * The balances and the last bill: `{ credit, wallet, bill }`, each undefined
 * when absent or unreadable (never 0). `bill` = { amount, issued, from, to }.
 */
export function parseBilling(data) {
  const ledgers = list(data?.accountBillingInfo?.ledgers, 20);
  const balance = (type) => {
    const hits = ledgers.filter((l) => l?.ledgerType === type);
    return hits.length === 1 ? eurOfCents(hits[0].balance) : undefined;
  };
  const edges = data?.account?.bills?.edges;
  let bill;
  if (Array.isArray(edges) && edges.length) {
    const n = edges[0]?.node;
    const issued = parseLocalDate(n?.issuedDate);
    const amount = eurOfCents(n?.grossAmount);
    if (issued !== undefined && amount !== undefined && amount >= 0) {
      bill = {
        amount,
        issued: n.issuedDate,
        from: parseLocalDate(n?.fromDate) !== undefined ? n.fromDate : null,
        to: parseLocalDate(n?.toDate) !== undefined ? n.toDate : null,
      };
    }
  }
  return {
    credit: balance(LEDGERS.ELECTRICITY),
    wallet: balance(LEDGERS.SOLAR_WALLET),
    bill,
  };
}

/**
 * The hours of a page of readings: `{ hours: Map(start -> kWh), conflicts:
 * Set(start), next, several }`. `several`: the account has more than one
 * supply point (the readings say not which): nothing is taken. An hour that
 * is not exactly one hour, not aligned, in another unit, negative or out of
 * bounds is not a reading: skipped. Two different values for one hour:
 * neither is kept. undefined when the answer is unreadable.
 */
export function parseReadings(data, into = { hours: new Map(), conflicts: new Set() }) {
  const edges = data?.supplyPoints?.edges;
  if (!Array.isArray(edges)) return undefined;
  into.next = undefined;
  if (edges.length === 0) return into;
  if (edges.length > 1) {
    into.several = true;
    return into;
  }
  const connection = edges[0]?.node?.readings?.importReadings;
  if (!connection || typeof connection !== 'object' || !Array.isArray(connection.edges)) {
    return undefined;
  }
  for (const edge of connection.edges.slice(0, 200)) {
    const n = edge?.node;
    const start = parseInstant(n?.intervalStart);
    const end = parseInstant(n?.intervalEnd);
    if (start === undefined || end === undefined || end - start !== HOUR || start % HOUR) continue;
    if (n.units !== undefined && n.units !== null && n.units !== 'KILOWATT_HOURS') continue;
    const kwh = strictNumber(n.value);
    if (kwh === undefined || kwh < 0 || kwh > MAX_HOUR_KWH) continue;
    const known = into.hours.get(start);
    if (known !== undefined && Math.abs(known - kwh) > 1e-9) into.conflicts.add(start);
    else into.hours.set(start, kwh);
  }
  for (const c of into.conflicts) into.hours.delete(c);
  const info = connection.pageInfo ?? {};
  into.next =
    info.hasNextPage === true && typeof info.endCursor === 'string' && info.endCursor.length <= 200
      ? info.endCursor
      : undefined;
  return into;
}

/**
 * The 30-minute intervals for publishEnergyConsumption: each hour that ended
 * before `now` split in two equal halves (the hour total is exact; the 2.0TD
 * period never changes inside an hour, so its cost is exact too).
 */
export function halfHours(hours, now) {
  const out = [];
  for (const t of [...hours.keys()].sort((a, b) => a - b)) {
    if (t + HOUR > now) continue;
    const half = Math.round((hours.get(t) / 2) * 1e6) / 1e6;
    out.push({ starts_at: new Date(t).toISOString(), kwh: half });
    out.push({ starts_at: new Date(t + HALF_HOUR).toISOString(), kwh: half });
  }
  return out;
}
