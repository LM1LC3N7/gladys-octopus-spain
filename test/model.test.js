// -----------------------------------------------------------------------------
// The pure parts: the 2.0TD periods (zones, weekends, holidays, changes of
// time), the account, billing and readings answers.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  brokenParts,
  eurOfCents,
  halfHours,
  keyOf,
  parseAccount,
  parseAccounts,
  parseBilling,
  parseReadings,
  strictNumber,
  threePrices,
} from '../src/kraken/model.js';
import { ZONES, isFlat, periodAt, periodPrice } from '../src/tariff.js';
import { fromMadrid } from '../src/time.js';
import * as K from './fixtures/kraken.js';

const HOUR = 3600_000;
const periodsOfDay = (y, mo, d, zone = ZONES.PENINSULA) => {
  const out = [];
  const start = fromMadrid(y, mo, d);
  const end = fromMadrid(...(d === 31 ? [y, mo + 1, 1] : [y, mo, d + 1]));
  for (let t = start; t < end; t += HOUR) out.push(periodAt(t, zone));
  return out.join('');
};

test('2.0TD peninsula: the hours of a weekday', () => {
  // Wednesday 2026-11-04.
  assert.equal(periodsOfDay(2026, 11, 4), '333333332211112222111122');
});

test('2.0TD Ceuta and Melilla: an hour later', () => {
  assert.equal(periodsOfDay(2026, 11, 4, ZONES.CEUTA_MELILLA), '333333332221111222211112');
});

test('2.0TD Canary Islands: the same hours in the local time of the islands (an hour behind)', () => {
  // 10:00 in Madrid is 09:00 in the Canary Islands: llano, not punta.
  assert.equal(periodAt(fromMadrid(2026, 11, 4, 10), ZONES.CANARIAS), 2);
  assert.equal(periodAt(fromMadrid(2026, 11, 4, 11), ZONES.CANARIAS), 1);
  // 00:30 in Madrid on Thursday is still Wednesday 23:30 in the islands: llano.
  assert.equal(periodAt(fromMadrid(2026, 11, 5, 0, 30), ZONES.CANARIAS), 2);
});

test('2.0TD: weekends and national holidays of fixed date are valle all day', () => {
  assert.equal(periodsOfDay(2026, 11, 7), '3'.repeat(24), 'Saturday');
  assert.equal(periodsOfDay(2026, 11, 8), '3'.repeat(24), 'Sunday');
  for (const [mo, d] of [
    [1, 1],
    [1, 6],
    [5, 1],
    [8, 15],
    [10, 12],
    [12, 8],
    [12, 25],
  ]) {
    const day = periodsOfDay(2026, mo, d);
    assert.ok(/^3+$/.test(day), `${mo}-${d}: ${day}`);
  }
  // Good Friday 2026 (moving) and a regional holiday are ordinary weekdays in 2.0TD.
  assert.equal(periodsOfDay(2026, 4, 3), '333333332211112222111122');
  // Holidays in the islands: their own local date.
  assert.equal(periodAt(fromMadrid(2026, 12, 26, 0, 30), ZONES.CANARIAS), 3);
  assert.equal(periodAt(fromMadrid(2026, 12, 7, 0, 30), ZONES.CANARIAS), 3, 'Sunday 23:30 there');
});

test('2.0TD: the days of the changes of time (23 and 25 hours) keep their local hours', () => {
  // The changes of time fall on a Sunday (all valle): 23 and 25 hours.
  assert.equal(periodsOfDay(2026, 3, 29), '3'.repeat(23));
  assert.equal(periodsOfDay(2026, 10, 25), '3'.repeat(25));
  // The Monday after each change: the usual pattern, local hours.
  assert.equal(periodsOfDay(2026, 3, 30), '333333332211112222111122');
  assert.equal(periodsOfDay(2026, 10, 26), '333333332211112222111122');
  // 10:00 local on that Monday is 08:00 UTC in summer, 09:00 UTC in winter.
  assert.equal(periodAt(Date.UTC(2026, 2, 30, 8), ZONES.PENINSULA), 1);
  assert.equal(periodAt(Date.UTC(2026, 9, 26, 9), ZONES.PENINSULA), 1);
  assert.equal(periodAt(Date.UTC(2026, 9, 26, 8, 59), ZONES.PENINSULA), 2);
});

test('period prices: an unknown zone, period or price is unknown, never 0', () => {
  const prices = [0.2, 0.15, 0.09];
  assert.equal(periodPrice(prices, fromMadrid(2026, 11, 4, 12), ZONES.PENINSULA), 0.2);
  assert.equal(periodPrice(prices, fromMadrid(2026, 11, 4, 12), 'mars'), undefined);
  assert.equal(periodPrice(undefined, fromMadrid(2026, 11, 4, 12), ZONES.PENINSULA), undefined);
  assert.equal(periodPrice([0.2, null, 0.09], fromMadrid(2026, 11, 4, 9), 'peninsula'), undefined);
  assert.equal(periodPrice(prices, NaN, ZONES.PENINSULA), undefined);
  assert.equal(isFlat([0.1, 0.1, 0.1]), true);
  assert.equal(isFlat(prices), false);
});

test('numbers are strict: empty, null, text, out of bounds are unknown', () => {
  assert.equal(strictNumber(''), undefined);
  assert.equal(strictNumber(null), undefined);
  assert.equal(strictNumber('1e3'), undefined);
  assert.equal(strictNumber(' 0.12 '), 0.12);
  assert.deepEqual(threePrices(['0.2', '0.1', '0.05']), [0.2, 0.1, 0.05]);
  assert.equal(threePrices(['0.2', '', '0.05']), undefined);
  assert.equal(threePrices(['0.2', '0.1']), undefined);
  assert.equal(threePrices(['0.2', '0.1', '11']), undefined, 'beyond 10 EUR/kWh');
  assert.equal(threePrices(null), undefined);
  assert.equal(eurOfCents('1250'), 12.5);
  assert.equal(eurOfCents('-300'), -3);
  assert.equal(eurOfCents(''), undefined);
});

test('accounts and supply points: valid ids only, the CUPS kept in memory, keyed by HMAC', () => {
  assert.deepEqual(parseAccounts(K.accounts(['a-1b2c3d4e', 'bad', null]).data), ['A-1B2C3D4E']);
  const points = parseAccount(
    K.account({
      points: [
        K.point(),
        K.point(), // the same CUPS twice: once
        K.point({ cups: 'ES12' }),
        K.point({ cups: K.CUPS2, withTaxes: null, surplus: '' }),
      ],
    }).data,
    K.ID_KEY,
  );
  assert.equal(points.length, 2);
  const a = points.find((p) => p.cups === K.CUPS);
  assert.equal(a.key, keyOf(K.ID_KEY, 'cups', K.CUPS));
  assert.equal(a.suffix, 'JN0F');
  assert.deepEqual(a.prices, [0.201234, 0.151234, 0.091234]);
  assert.equal(a.surplus, 0.06);
  const b = points.find((p) => p.cups === K.CUPS2);
  assert.equal(b.prices, undefined, 'without taxes only: unknown');
  assert.equal(b.surplus, undefined);
  assert.equal(parseAccount({ account: null }, K.ID_KEY), undefined);
});

test('errors: one pointing at a supply point spoils it only; elsewhere, the whole answer', () => {
  const one = brokenParts([{ path: ['account', 'properties', 0, 'electricitySupplyPoints', 1] }]);
  assert.equal(one.whole, false);
  assert.deepEqual([...one.points], ['0/1']);
  assert.equal(brokenParts([{ path: ['account'] }]).whole, true);
  assert.equal(brokenParts([{ message: 'no path' }]).whole, true);
  const points = parseAccount(
    K.account({ points: [K.point(), K.point({ cups: K.CUPS2 })] }).data,
    K.ID_KEY,
    one,
  );
  assert.equal(points.find((p) => p.cups === K.CUPS2).broken, true);
  assert.equal(points.find((p) => p.cups === K.CUPS).broken, false);
});

test('billing: balances and the last bill in EUR; missing ones stay unknown, never 0', () => {
  assert.deepEqual(parseBilling(K.billing().data), {
    credit: 12.5,
    wallet: 8.3,
    bill: { amount: 65.43, issued: '2026-10-05', from: '2026-09-01', to: '2026-09-30' },
  });
  const none = parseBilling(
    K.billing({ ledgers: [{ ledgerType: 'SPAIN_ELECTRICITY_LEDGER', balance: null }], bills: [] })
      .data,
  );
  assert.deepEqual(none, { credit: undefined, wallet: undefined, bill: undefined });
  const twice = parseBilling(
    K.billing({
      ledgers: [
        { ledgerType: 'SOLAR_WALLET_LEDGER', balance: '1' },
        { ledgerType: 'SOLAR_WALLET_LEDGER', balance: '2' },
      ],
    }).data,
  );
  assert.equal(twice.wallet, undefined, 'two wallets: never a guess');
  const noAmount = parseBilling(
    K.billing({ bills: [{ node: { issuedDate: '2026-10-05', grossAmount: null } }] }).data,
  );
  assert.equal(noAmount.bill, undefined);
  const negative = parseBilling(K.billing({ amount: '-500' }).data);
  assert.equal(negative.bill, undefined, 'a negative bill is not a bill');
  assert.deepEqual(parseBilling(null), { credit: undefined, wallet: undefined, bill: undefined });
});

test('readings: whole aligned hours in kWh only; conflicts dropped; several supply points taken as none', () => {
  const from = Date.UTC(2026, 10, 3, 0);
  const data = K.readings({
    from,
    to: from + 6 * HOUR,
    kwh: (t) => (t === from + HOUR ? '' : 0.5),
    extra: (t) =>
      t === from + 2 * HOUR
        ? { intervalEnd: new Date(t + 30 * 60_000).toISOString() }
        : t === from + 3 * HOUR
          ? { units: 'WATT_HOURS' }
          : t === from + 4 * HOUR
            ? { intervalStart: '2026-11-03T04:00:00' }
            : {},
  }).data;
  const into = parseReadings(data);
  assert.deepEqual([...into.hours.keys()], [from, from + 5 * HOUR]);
  // The same hour again with another value: neither is kept.
  const again = K.readings({ from, to: from + HOUR, kwh: () => 0.7 }).data;
  parseReadings(again, into);
  assert.deepEqual([...into.hours.keys()], [from + 5 * HOUR]);
  const several = parseReadings(K.readings({ from, to: from + HOUR, points: 2 }).data);
  assert.equal(several.several, true);
  assert.equal(several.hours.size, 0);
  assert.equal(parseReadings({ supplyPoints: null }), undefined);
  assert.equal(parseReadings({ supplyPoints: { edges: [{ node: {} }] } }), undefined);
  assert.equal(parseReadings({ supplyPoints: { edges: [] } }).hours.size, 0);
  const negative = parseReadings(K.readings({ from, to: from + HOUR, kwh: () => -1 }).data);
  assert.equal(negative.hours.size, 0);
});

test('half-hours: each elapsed hour in two equal halves', () => {
  const from = Date.UTC(2026, 10, 3, 0);
  const hours = new Map([
    [from, 1],
    [from + HOUR, 0.3],
  ]);
  assert.deepEqual(halfHours(hours, from + HOUR + 59 * 60_000), [
    { starts_at: '2026-11-03T00:00:00.000Z', kwh: 0.5 },
    { starts_at: '2026-11-03T00:30:00.000Z', kwh: 0.5 },
  ]);
  assert.equal(halfHours(hours, from + 2 * HOUR).length, 4);
});
