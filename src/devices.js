// -----------------------------------------------------------------------------
// The Gladys devices (pure). Read-only features only: nothing is commanded.
//
// External ids (forever):
//   ext:<selector>:cups:<key>      an electricity supply point (CUPS) of the
//                                  account; key = 16 hex digits of an
//                                  HMAC-SHA-256 of the CUPS under the id key
//                                  kept in the Gladys config (the CUPS itself
//                                  is never in an id, a log, a status or /data).
//   ext:<selector>:account:<key>   the Octopus account (balances, last bill);
//                                  key = the same HMAC of the account number.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as C,
  DEVICE_FEATURE_TYPES as T,
  DEVICE_FEATURE_UNITS as U,
} from '@gladysassistant/integration-sdk';
import { MAX_MONEY, MAX_PRICE } from './constants.js';
import { t } from './i18n.js';

export const KIND = Object.freeze({ CUPS: 'cups', ACCOUNT: 'account' });
export const FEATURE = Object.freeze({
  PRICE: 'price',
  NEXT_PRICE: 'next_price',
  PRICE_P1: 'price_p1',
  PRICE_P2: 'price_p2',
  PRICE_P3: 'price_p3',
  SURPLUS: 'surplus_price',
  CONSUMPTION: 'consumption',
  CREDIT: 'credit',
  SOLAR_WALLET: 'solar_wallet',
  LAST_BILL: 'last_bill',
});

export const idsOf = (gladys, kind, key) => gladys.externalIds(kind, key);

/** `{ kind, key }` of one of our device external ids; undefined otherwise. */
export function parseDeviceId(externalId) {
  const match = /:(cups|account):([0-9a-f]{16})$/.exec(String(externalId ?? ''));
  return match ? { kind: match[1], key: match[2] } : undefined;
}

const sensor = (ids, key, name, category, type, extra = {}) => ({
  name,
  external_id: ids.feature(key),
  category,
  type,
  read_only: true,
  has_feedback: false,
  keep_history: true,
  min: 0,
  max: 1,
  ...extra,
});

const money = (ids, key, name, min, max) =>
  sensor(ids, key, name, C.CURRENCY, T.CURRENCY.DECIMAL, { unit: U.EURO, min, max });

/** The device of a supply point: `{ key, suffix }`. */
export function buildCupsDevice(gladys, point, language = 'en') {
  const ids = idsOf(gladys, KIND.CUPS, point.key);
  const price = (key, label) => money(ids, key, t(label, language), -MAX_PRICE, MAX_PRICE);
  return {
    name: t('deviceCups', language, { suffix: point.suffix }),
    external_id: ids.device,
    features: [
      price(FEATURE.PRICE, 'featurePrice'),
      price(FEATURE.NEXT_PRICE, 'featureNextPrice'),
      price(FEATURE.PRICE_P1, 'featureP1'),
      price(FEATURE.PRICE_P2, 'featureP2'),
      price(FEATURE.PRICE_P3, 'featureP3'),
      price(FEATURE.SURPLUS, 'featureSurplus'),
      sensor(
        ids,
        FEATURE.CONSUMPTION,
        t('featureConsumption', language),
        C.ENERGY_SENSOR,
        T.ENERGY_SENSOR.THIRTY_MINUTES_CONSUMPTION,
        { unit: U.KILOWATT_HOUR, max: 1000 },
      ),
    ],
    params: [{ name: 'cups_suffix', value: point.suffix }],
  };
}

/** The device of the account: `{ key }`. */
export function buildAccountDevice(gladys, account, language = 'en') {
  const ids = idsOf(gladys, KIND.ACCOUNT, account.key);
  return {
    name: t('deviceAccount', language),
    external_id: ids.device,
    features: [
      money(ids, FEATURE.CREDIT, t('featureCredit', language), -MAX_MONEY, MAX_MONEY),
      money(ids, FEATURE.SOLAR_WALLET, t('featureWallet', language), -MAX_MONEY, MAX_MONEY),
      money(ids, FEATURE.LAST_BILL, t('featureLastBill', language), 0, MAX_MONEY),
    ],
    params: [],
  };
}

const round = (v) => Math.round(v * 1e6) / 1e6;

/** The states of a device: `{ featureKey: value }`; a value unknown is left out (never 0). */
export function statesOf(ids, values) {
  const out = [];
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      out.push({ device_feature_external_id: ids.feature(key), state: round(value) });
    }
  }
  return out;
}
