# Octopus Energy España for Gladys Assistant

Unofficial [Gladys Assistant](https://gladysassistant.com) integration for
**Octopus Energy España** customers, not affiliated with Octopus Energy. It
reads your account through the official Kraken GraphQL API of Octopus España
(`api.oees-kraken.energy`) with the e-mail address and password of the
Octopus website, or an API key of your account:

- one device per electricity supply point (CUPS): price per kWh now and next,
  the prices of the three 2.0TD periods (punta, llano, valle, taxes
  included), the surplus compensation, the hourly consumption (published by
  half hour) for the energy monitoring;
- one device for the account: electricity account balance, Solar Wallet,
  last bill amount;
- the energy contract template **Octopus Energy España electricity**, priced
  by the integration: every half hour at the price of its 2.0TD period
  (peninsula and Balearic Islands, Canary Islands, Ceuta and Melilla).

**Read-only**: the only mutation ever sent is the login. Never tested with a
real Octopus España account yet.

Documentation: [English](docs/en.md) · [Français](docs/fr.md).

## Development

```bash
npm install
npm test            # node --test
npm run lint
npm run format:check
npm run mutants     # mutation check of the guards (scripts/mutants.json)
npm run cover       # regenerates cover.png
```

Rules for contributors and coding assistants: [CLAUDE.md](CLAUDE.md).
Open points and decisions: [TODO.md](TODO.md).

## Credits and license

Apache-2.0 ([LICENSE](LICENSE)). The GraphQL queries are adapted from
[ha-octopus-spain](https://github.com/MiguelAngelLV/ha-octopus-spain) (MIT):
see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
