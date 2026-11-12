# TODO

## Before announcing

- [ ] Test on a real Gladys 5.2+ with a real Octopus España account: login,
      Discovery, the 14-day consumption backfill, the price features over a
      day, a contract priced, the balances and the last bill.
- [ ] Turn on "Private vulnerability reporting" (SECURITY.md points there).
- [ ] Add the `gladys-assistant-integration` topic to publish in the store
      (after the first release: the store validator needs the GHCR image).
- [ ] Store fields left out of the manifest on purpose (Louis' rule):
      `countries: ["ES"]`, keywords `octopus`, `kraken`, `2.0TD`, `CUPS`,
      `Solar Wallet`.

## To confirm on a real account (built without one)

- [ ] The login by e-mail and password: Kraken marked those inputs of
      `obtainKrakenToken` deprecated on 2026-03-18 (as for Germany);
      ha-octopus-spain still used them on 2026-10-08. Whether Octopus España
      hands out API keys is unknown.
- [ ] `variableTermWithTaxes`: three prices in EUR/kWh in the order P1, P2,
      P3 (as ha-octopus-spain reads them), and which taxes are in (VAT and
      the electricity tax?). Products with one price only: three equal
      values, or another shape (then the prices are unknown, never guessed).
- [ ] An indexed (market) product: what `prices` gives then. Today such a
      product has no price in Gladys (unknown, said in the status).
- [ ] `supplyPoints.readings`: hourly nodes with an offset, `units`
      `KILOWATT_HOURS`, pages of 100, how many days back; on an account with
      several supply points, which field tells them apart (none is read
      today: the consumption is not published then).
- [ ] The ledger balances and `grossAmount` in cents (as ha-octopus-spain
      divides them by 100); the sign of the electricity balance.
- [ ] The refusal codes of the login (KT-CT-1138, 1134, 1135 on the other
      Kraken suppliers).

## Decisions

- **Version 0.1.0** set by hand (package, lock, manifest, image tag) when
  leaving the template; the Release workflow owns it from now on.
- **`gladys_version: ">=5.2.0"`**, not 5.1.0: `publishEnergyConsumption`
  and the energy contracts arrived in Gladys 5.2.0.
- **Base**: the code of gladys-octopus-germany (same Kraken platform, same
  author): client, login, refusal, pauses, id key, /data, test button. The
  Spanish queries come from ha-octopus-spain (MIT, notice kept); its
  `tariff-td` dependency was not read: the 2.0TD periods are written from
  the CNMC Circular 3/2020.
- **Read-only (v1)**: no meter reading, no preference changed. The only
  mutation is the login.
- **2.0TD periods** (`src/tariff.js`): weekdays P1 10-14 and 18-22, P2 8-10,
  14-18, 22-24, P3 0-8 (Ceuta and Melilla an hour later), in the local time
  of the zone chosen in the form (peninsula and Balearic Islands, Canary
  Islands, Ceuta and Melilla); Saturdays, Sundays and the national holidays
  of fixed date (1/1, 6/1, 1/5, 15/8, 12/10, 1/11, 6/12, 8/12, 25/12) P3 all
  day. Moving and regional holidays are not P3 in 2.0TD (CNMC). An unknown
  zone value in the form is refused (nothing sent), never taken as the
  peninsula. The status times are those of Madrid.
- **One delegated template, no calendar.** The prices are the customer's
  own (they change with the product and its updates): no rule could carry
  them. The fixed charges (power term, meter rental) are a `fixed` component
  fed by a template input in EUR per month: the API gives neither the power
  term nor the contracted power (ha-octopus-spain reads none).
- **Prices**: `variableTermWithTaxes` only (taxes included), never the
  prices without taxes in their place: missing, the prices are unknown and
  the status says it. The API gives the prices in force, never their dates:
  at each read (hourly), the quarters from the current one to 2 hours ahead
  are kept in `/data` (40 days); a quarter already started keeps its price.
  The past is priced from what was kept only, never from today's prices: a
  contract starting before the installation, or a Gladys stopped longer
  than 2 hours, leaves intervals unpriced (the request fails, the core
  retries; never a silent zero). A price change is seen at the next hourly
  read. A negative cost is 0. The label of a priced interval is its period
  (`P1`, `P2`, `P3`), none for a single-price product.
- **Consumption**: the hourly readings (`timeGranularity: HOUR`), each hour
  published as two equal half hours (the hour total is exact; the 2.0TD
  period never changes inside an hour, so its cost is exact too). Read
  every 6 hours over 4 days, and once a day after 06:00 and for a new device
  over 14 days (the distributor sends the readings a day or more late). Only
  with a single supply point: the readings do not name their CUPS.
  Import only (the export is not read in v1).
- **Account device**: balances (`SPAIN_ELECTRICITY_LEDGER`,
  `SOLAR_WALLET_LEDGER`) and the last bill (`grossAmount`), in EUR. A ledger
  missing or seen twice, a bill without amount: unknown, never 0. Read with
  the account (hourly) by a second query: its failure never hides the prices.
- **External ids**: `cups:<16 hex of an HMAC-SHA-256 of the CUPS>` and
  `account:<same of the account number>`, under a random 32-byte key made at
  the first start and stored with `setConfig` as `id_key` (outside the form:
  never shown, kept by Gladys, never in `/data`). `/data` keeps the account
  key (an HMAC) to offer the account device before a read.
- **Contract supply point**: the template input is the last 1-4 characters
  of the CUPS, among every CUPS seen (this read and the 8 kept in /data);
  empty is accepted with a single supply point only; empty or ambiguous with
  several is refused (the contract stays unpriced), never guessed.
- **Refusal, pauses, token, pace**: as gladys-octopus-germany: only the
  login's KT-CT-1138/1134/1135 (and 11334) refuse, persisted as 8 bits of a
  salted hash; 429 / KT-CT-1199 (Retry-After or 15 min), 5xx (5 min),
  KT-CT-1136 (1 h) pause every request, doubled to 6 h, persisted. A 401/403
  of a query is passing. 2 s between requests, one in flight.
- **CI**: `.github/workflows/ci.yml` carries `timeout-minutes: 20` on its jobs
  (taken from gladys-octopus-germany): a hung test never holds a runner.

## Ideas

- The export (surplus) readings (`exportReadings`) on an
  `energy-production-sensor`, and the Solar Wallet compensation.
- The power term from the account, if the API exposes it.
- Telling the readings of several supply points apart, once the field is
  known on a real account.
