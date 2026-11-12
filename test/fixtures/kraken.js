// -----------------------------------------------------------------------------
// Kraken answers of Octopus Energy España shaped after the queries of
// ha-octopus-spain (no real account was available: every value is made up;
// the CUPS is a fake one).
// -----------------------------------------------------------------------------

export const EMAIL = 'cliente@example.com';
export const PASSWORD = 'S3cret-Pass word!';
export const ACCOUNT_NUMBER = 'A-1B2C3D4E';
export const CUPS = 'ES0031405123456789JN0F';
export const CUPS2 = 'ES0021000098765432AB';
/** The id key of the installation (Gladys config, outside the form). */
export const ID_KEY = 'ab'.repeat(32);
/** Wednesday 2026-11-04 10:07 in Madrid (UTC+1): P1 punta. In the past (the fake Gladys checks elapsed intervals on the real clock). */
export const NOW = Date.UTC(2026, 10, 4, 9, 7);
/** P1, P2, P3 prices with taxes (EUR/kWh). */
export const PRICES = ['0.201234', '0.151234', '0.091234'];

export const ok = (data) => ({ data });
export const ktError = (code, data = null) => ({
  data,
  errors: [{ message: 'Something about cliente@example.com', extensions: { errorCode: code } }],
});

let serial = 0;
export function token({ life = 3600, refresh = true } = {}) {
  serial += 1;
  const iat = 1_800_000_000 + serial;
  return ok({
    obtainKrakenToken: {
      token: `tok-${String(serial).padStart(4, '0')}-AAAAAAAAAAAAAAAAAAAA`,
      payload: { exp: iat + life, iat, email: EMAIL },
      refreshToken: refresh ? `ref-${String(serial).padStart(4, '0')}-BBBBBBBBBBBBBBBB` : null,
      refreshExpiresIn: refresh ? iat + 7 * 86400 : null,
    },
  });
}

export const accounts = (numbers = [ACCOUNT_NUMBER]) =>
  ok({ viewer: { accounts: numbers.map((number) => ({ number })) } });

export const point = ({ cups = CUPS, withTaxes = PRICES, surplus = '0.06' } = {}) => ({
  cups,
  activeAgreement: {
    product: {
      prices: {
        variableTerm: ['0.16', '0.12', '0.07'],
        variableTermWithTaxes: withTaxes,
        surplusRate: surplus,
      },
    },
  },
});

export const account = ({ points = [point()] } = {}) =>
  ok({ account: { properties: [{ electricitySupplyPoints: points }] } });

export const billing = ({
  credit = '1250',
  wallet = '830',
  amount = '6543',
  ledgers,
  bills,
} = {}) =>
  ok({
    accountBillingInfo: {
      ledgers: ledgers ?? [
        { ledgerType: 'SPAIN_ELECTRICITY_LEDGER', balance: credit },
        { ledgerType: 'SOLAR_WALLET_LEDGER', balance: wallet },
      ],
    },
    account: {
      bills: {
        edges: bills ?? [
          {
            node: {
              issuedDate: '2026-10-05',
              fromDate: '2026-09-01',
              toDate: '2026-09-30',
              grossAmount: amount,
            },
          },
        ],
      },
    },
  });

/** Hours from `from` to `to` (ms), `kwh(t)`; `extra(t)` overrides a node; `points` edges. */
export function readings({ from, to, kwh = () => 0.4, extra = () => ({}), next, points = 1 } = {}) {
  const edges = [];
  for (let t = from; t < to; t += 3600_000) {
    edges.push({
      node: {
        value: String(kwh(t)),
        units: 'KILOWATT_HOURS',
        intervalStart: new Date(t).toISOString(),
        intervalEnd: new Date(t + 3600_000).toISOString(),
        ...extra(t),
      },
    });
  }
  const node = {
    readings: {
      importReadings: { pageInfo: { hasNextPage: Boolean(next), endCursor: next ?? null }, edges },
    },
  };
  return ok({ supplyPoints: { edges: Array.from({ length: points }, () => ({ node })) } });
}
