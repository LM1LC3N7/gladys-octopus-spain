// -----------------------------------------------------------------------------
// The GraphQL documents sent to the Kraken API of Octopus Energy España
// (api.oees-kraken.energy). Field names taken from the queries of
// ha-octopus-spain (MIT, Miguel Ángel López Vicente), which runs them daily
// against this API, and from the Kraken schema (developer.oees-kraken.energy).
// Read-only: the only mutation is the login (obtainKrakenToken); nothing is
// ever changed on the account or the supply points.
// -----------------------------------------------------------------------------

export const TOKEN = `mutation ObtainKrakenToken($input: ObtainJSONWebTokenInput!) {
  obtainKrakenToken(input: $input) { token payload refreshToken refreshExpiresIn }
}`;

export const ACCOUNTS = `query Accounts {
  viewer { accounts { number } }
}`;

/** The supply points (CUPS) and the prices of their contract in force. */
export const ACCOUNT = `query Account($accountNumber: String!) {
  account(accountNumber: $accountNumber) {
    properties {
      electricitySupplyPoints {
        cups
        activeAgreement {
          product {
            prices(decimalPlaces: 6) { variableTerm variableTermWithTaxes surplusRate }
          }
        }
      }
    }
  }
}`;

/** Kept apart: a failure here (balances, last bill) never hides the prices. */
export const BILLING = `query Billing($accountNumber: String!) {
  accountBillingInfo(accountNumber: $accountNumber) { ledgers { ledgerType balance } }
  account(accountNumber: $accountNumber) {
    bills(first: 1) {
      edges { node { issuedDate fromDate toDate ... on InvoiceType { grossAmount } } }
    }
  }
}`;

/** The hourly consumption (kWh, imported) of the supply points of the account. */
export const READINGS = `query Readings(
  $accountNumber: String!
  $startAt: DateTime!
  $endAt: DateTime!
  $first: Int!
  $after: String
) {
  supplyPoints(accountNumber: $accountNumber) {
    edges {
      node {
        readings(
          startAt: $startAt
          endAt: $endAt
          readingType: INTERVAL
          timeGranularity: HOUR
          timezone: "Europe/Madrid"
          units: [KILOWATT_HOURS]
        ) {
          importReadings(first: $first, after: $after) {
            pageInfo { hasNextPage endCursor }
            edges { node { value units intervalStart intervalEnd } }
          }
        }
      }
    }
  }
}`;
