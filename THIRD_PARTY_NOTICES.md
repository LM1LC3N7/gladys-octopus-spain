# Third-party notices

## ha-octopus-spain

The GraphQL queries of `src/kraken/queries.js` (login, accounts, supply
points and prices, balances and last bill, hourly readings) are adapted from
ha-octopus-spain (https://github.com/MiguelAngelLV/ha-octopus-spain, commit
b53d6c9, 2026-10-08), under the MIT License. The rest is written for this
integration (the 2.0TD periods from the CNMC Circular 3/2020; the `tariff-td`
library that ha-octopus-spain uses was not read).

```
MIT License

Copyright (c) 2024 Miguel Ángel López Vicente

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Octopus Energy España API

The data come from the Kraken API of Octopus Energy España
(https://developer.oees-kraken.energy), read with the customer's own account.
This integration is not affiliated with Octopus Energy.
