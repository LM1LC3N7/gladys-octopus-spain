# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [0.1.1] - 2026-11-12

### Added

- `countries: ["ES"]` in the manifest (Gladys 5.3.0 or later).
- First version: the Octopus Energy España account read through the official
  Kraken GraphQL API (e-mail and password, or an API key of the account),
  read-only.
- One device per electricity supply point (CUPS): price per kWh now and next,
  the prices of the 2.0TD periods P1, P2, P3 (taxes included), the surplus
  compensation, the hourly consumption published by half hour
  (`publishEnergyConsumption`).
- One device for the account: electricity account balance, Solar Wallet,
  last bill amount.
- The delegated energy contract template "Octopus Energy España electricity":
  the 2.0TD periods of the peninsula and Balearic Islands, the Canary Islands
  or Ceuta and Melilla, weekends and national holidays of fixed date in
  valle; the prices seen kept 40 days to price the past.
- Refused login, pauses (429, 5xx, KT-CT-1136) and the pace kept in `/data`;
  the test button.
- Device ids are an HMAC of the CUPS under a key kept in the Gladys config.

[Unreleased]: https://github.com/LM1LC3N7/gladys-octopus-spain/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/LM1LC3N7/gladys-octopus-spain/releases/tag/v0.1.1
