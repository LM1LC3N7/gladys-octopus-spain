# Octopus Energy España for Gladys Assistant

Unofficial integration, not affiliated with Octopus Energy, for **Octopus
Energy España** customers. It reads your account through the official Kraken
GraphQL API of Octopus España (`api.oees-kraken.energy`) and gives Gladys:

- one device per electricity supply point (CUPS): the price per kWh now and
  next, the prices of the three 2.0TD periods (taxes included), the surplus
  compensation per kWh, the hourly consumption for the energy monitoring;
- one device for the account: electricity account balance, Solar Wallet,
  last bill amount;
- the energy contract template **Octopus Energy España electricity**.

**Read-only**: nothing is ever changed on your account; the only request that
is not a read is the login. **It has never been tested with a real Octopus España account yet**: built from the published API and the queries of ha-octopus-spain.

## Setup

1. Install the integration from the Gladys store, open its configuration.
2. Enter the e-mail address and the password you use on the Octopus website,
   or an API key of your account if Octopus gave you one (used alone when
   given). Kraken deprecated the e-mail login in 2026: if Octopus removes it,
   the status says so. The password and the API key are kept by Gladys in its
   database, never shown again, sent only to Octopus Energy España.
3. Account number: only when your login has several accounts (empty: the
   first one).
4. Zone of the supply: peninsula and Balearic Islands (the default), Canary
   Islands or Ceuta and Melilla. It sets the hours of the periods.
5. Save, then **Test the connection** (at most once a minute).
6. In Discovery, add the devices you want.

## Devices

**Octopus electricity (CUPS …XXXX)**, the last 4 characters of the CUPS:

| Feature                      | Unit    | Note                                            |
| ---------------------------- | ------- | ----------------------------------------------- |
| Price per kWh now            | EUR/kWh | the price of the current period, taxes included |
| Next price per kWh           | EUR/kWh | the next different price within 2 days          |
| Price per kWh P1 (punta)     | EUR/kWh | taxes included                                  |
| Price per kWh P2 (llano)     | EUR/kWh | taxes included                                  |
| Price per kWh P3 (valle)     | EUR/kWh | taxes included                                  |
| Surplus compensation per kWh | EUR/kWh | the price of the energy you export              |
| Consumption (30 min)         | kWh     | each hour read split in two equal half hours    |

**Octopus España account**: electricity account balance, Solar Wallet, last
bill amount (EUR, as the API gives them). A value the API does not give stays
empty, never 0.

The prices are published again at every quarter of an hour from what is held
(no request), and no longer once they were read more than 6 hours ago.

## The 2.0TD periods

| Days                                              | Peninsula, Balearic and Canary Islands (local time)  | Ceuta and Melilla                                    |
| ------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------- |
| Monday to Friday                                  | P1 10-14 and 18-22, P2 8-10, 14-18 and 22-24, P3 0-8 | P1 11-15 and 19-23, P2 8-11, 15-19 and 23-24, P3 0-8 |
| Saturday, Sunday, national holidays of fixed date | P3 all day                                           | P3 all day                                           |

National holidays of fixed date: 1 and 6 January, 1 May, 15 August,
12 October, 1 November, 6, 8 and 25 December (CNMC Circular 3/2020, as of
2026-11). Moving holidays (Good Friday) and regional ones are ordinary days
in 2.0TD. A product with the same price in the three periods is priced the
same at every hour.

## Pace

- The account (supply points, prices, balances, last bill): every hour.
- The consumption of the created supply point: every 6 hours over the last
  4 days, and over 14 days once a day after 06:00 and for a new device (the
  distributor sends the readings a day or more late).
- One request at a time, 2 seconds apart. The time of each read is kept in
  `/data` before the request: a restart never reads sooner.

## The energy contract

Create a contract from the **Octopus Energy España electricity** template:

- **Last 4 characters of the CUPS**: empty with a single supply point;
  required with several (an empty or ambiguous value leaves the contract
  unpriced, never guessed);
- **Fixed charges per month**: the power term and the meter rental of your
  bill, taxes included (the API does not give them).

Every half hour is priced by the integration at the price of its period,
taxes included. The API gives the prices in force, never their dates: the
integration keeps, at each hourly read, the prices of the next 2 hours (40
days kept). So:

- start the contract on the day the integration is installed: an earlier
  half hour has no price;
- a Gladys stopped more than 2 hours leaves the half hours of the gap without
  a price;
- a price change is seen at the next hourly read.

A half hour without a price is never counted 0: the request fails and Gladys
tries again later.

## Status and errors

| Status                                                     | Meaning                                                                                                                                                     | What happens                                                                                                 |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Octopus refused the login (KT-CT-1138, 1134 or 1135)       | the login refused: wrong e-mail, password or API key (1134 and 1135 are documented for refresh tokens; answered to this login, they are taken as a refusal) | no request until you change the credentials or Test succeeds (another account number alone does not lift it) |
| API access is not enabled (KT-CT-11334)                    | Octopus disabled API access for this user                                                                                                                   | same                                                                                                         |
| Octopus no longer accepts the login by e-mail and password | the schema refuses these fields, or KT-CT-1113                                                                                                              | pause of 1 hour, doubled up to 6 hours; lifted by an API key                                                 |
| Octopus blocks the login for now (KT-CT-1136)              | a temporary block, seen with valid credentials                                                                                                              | pause of 1 hour, doubled up to 6 hours                                                                       |
| Octopus asked to slow down                                 | HTTP 429 or KT-CT-1199                                                                                                                                      | pause of Retry-After or 15 minutes, doubled up to 6 hours                                                    |
| Octopus is having trouble                                  | HTTP 5xx or KT-CT-7899                                                                                                                                      | pause of 5 minutes, doubled up to 6 hours                                                                    |
| Octopus could not be read                                  | network, timeout, unreadable or partial answer, a query refused                                                                                             | tried again after 5, 10, 20, 40 then every 60 minutes                                                        |

A 401 or 403 answered to a query (not to the login) is never taken as a
refused password: one new login, then a passing error. The pauses and the
refusal are kept in `/data` (the refusal as 8 bits of a salted hash of the
credentials, never the credentials).

Other remarks in the status: prices not given with taxes (not published nor
used), several supply points (the consumption is not published), the
balances or the consumption not read (the prices go on).

**Octopus' new sign-in.** If the website accepts your password but the
integration says it is refused, your account may use the new sign-in: an API
key of the account still works (ask Octopus for one).

## What `/data` holds

`/data/octopus-spain.json`: the time of the last reads, the pause, the
refusal (8 bits of a salted hash), the supply points seen (at most 8: keyed
hash, last 4 characters, when last seen), the keyed hash of the account and
the prices of the last 40 days. Never the e-mail address, the password, a
token, the id key, the account number nor a whole CUPS.

## Limits

- Electricity only, consumption only: the export (surplus) readings are not
  read in v1.
- The consumption is published only for an account with a single supply
  point: the readings of the API do not say which supply point they belong
  to.
- Only the prices taxes included (`variableTermWithTaxes`); an indexed
  product without these three prices has no price in Gladys.
- The power term and the contracted power are not read: enter the fixed
  charges in the contract.
- The times of the status are those of Madrid.

## Credits

The GraphQL queries are adapted from
[ha-octopus-spain](https://github.com/MiguelAngelLV/ha-octopus-spain) (MIT,
Miguel Ángel López Vicente). Apache-2.0.
