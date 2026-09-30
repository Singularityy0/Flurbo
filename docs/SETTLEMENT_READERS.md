# General settlement readers

Four readers cover most markets Flurbo can settle automatically. A market's rule names one reader and configures it in `source.reader`. That configuration is part of the rule hash committed on-chain, so it cannot change after deployment, and no new code is needed for a new market that fits a reader. Readers run in the settlement bot, off-chain; no contract changes are involved.

Our job for each market is to choose the reader and fill in its settings, then prove the rule with the rule check before preparing the market.

## Choosing a reader

| Market type | Reader | Examples |
|---|---|---|
| On-chain activity on any EVM chain | `evm-rpc.v1` | Monad transactions in a time range, a contract's logs, a token supply or pool price at a time, a wallet balance |
| Crypto prices | `evm-rpc.v1` on an on-chain price feed contract | A price feed's value at the first block after a time |
| Macro and official statistics | `stat-table.v1` (CSV, SDMX-JSON, JSON-stat), or `json-api.v1` | FRED series, ECB and other SDMX providers, Eurostat, central bank FX rates |
| Earthquakes, disasters, weather | `json-api.v1` | USGS or EMSC counts with a magnitude filter, GDACS alerts, public weather APIs |
| Software and GitHub activity | `json-api.v1` | A public repository's release record |
| Official pages with no data version | `html-text.v1` (last resort) | A press release sentence with the headline figure |
| Sports, elections | `json-api.v1` only if a free official public API exists | Many need paid keys; decide case by case |

Not automatable, so the operator proposes: sources that need a login or a secret API key (nobody else could check the evidence), pages built only by JavaScript, PDFs, and anything subjective.

## What every reader shares

- **Timing.** `first-observed-snapshot`: the first capture retained between `scheduledAt` and `publicationCutoff` decides; its capture time is the publication time. `initial`: the source's own publication time (configured in `publishedAt`) must fall inside the window. `initial-with-corrections` is not available for general readers.
- **Prediction guard.** Trading closes before every observation window. A general reader's release published before the window never settles the market (`RELEASED_BEFORE_OBSERVATION_WINDOW`), and the rule check refuses a value that is already public.
- **Missing is not an answer.** A value that is not there yet (a row not published, a block not produced, a `null`) means the capture is not retained, and the bot keeps checking until the cutoff. If nothing valid is retained, the question resolves VOID at its deadline.
- **Exact values.** Numbers are read from the raw text, never through floating point: `3.6123` stays `3.6123`. Up to 18 decimal places. `scale` divides by 10^n (for example 18 for token amounts).
- **Evidence.** Every retained response is archived publicly with its hash and checked again before anything is signed. Keep responses small (well under 1 MB): narrow queries with date parameters.
- **URLs** are written in exact normalized form, for example `https://rpc.monad.xyz/` with the trailing slash. No API keys in URLs.

## `json-api.v1`: any public JSON API

```json
"reader": {
  "select": "/features",
  "aggregate": "count",
  "filter": [{ "path": "/properties/mag", "op": "gte", "value": "4.5" }],
  "checks": [{ "path": "/metadata/status", "equals": "200" }]
}
```

| Setting | Meaning |
|---|---|
| `select` | JSON Pointer to the value, or to the list for totals |
| `aggregate` | `value` (the selected value), `only` (exactly one list item matches; read `field`), `count`, `sum`, `max`, `min` (over `field`) |
| `field` | Pointer inside each list item, for `only`, `sum`, `max`, `min` |
| `filter` | Up to 8 conditions on list items: `eq`, `ne` (text) or `gt`, `gte`, `lt`, `lte` (numbers). An item without the field does not match |
| `checks` | Up to 8 identity checks: the value at `path` must equal `equals`, or the capture is refused |
| `publishedAt` | `{ "path", "format" }` for the `initial` vintage. Formats: `unix-seconds`, `unix-millis`, `iso-datetime`, `date` |
| `scale`, `valueFormat` | Optional divisor; required time format when the decision compares timestamps |

Duplicate keys, malformed JSON and more than 50,000 list items are refused.

## `stat-table.v1`: official statistics

**CSV:** pick one row by column values and read one column. The row must match exactly once. Cells such as `.`, `NA`, `:` or empty mean not published yet.

```json
"reader": { "format": "csv", "select": { "observation_date": "2026-09-01" }, "valueColumn": "UNRATE" }
```

**SDMX-JSON** (ECB, OECD, IMF, BIS and others; versions 1 and 2, series-level messages): pick a series by dimension values and one period. Dimensions with a single value can be left out.

```json
"reader": { "format": "sdmx-json", "select": { "REF_AREA": "U2" }, "period": "2026-09" }
```

**JSON-stat 2.0** (Eurostat and others): pick one category for every dimension with more than one; the time dimension is part of `select`.

```json
"reader": { "format": "json-stat", "select": { "geo": "EA20", "time": "2026-09" } }
```

## `html-text.v1`: official pages, last resort

```json
"reader": {
  "anchors": ["THE EMPLOYMENT SITUATION"],
  "pattern": "and the unemployment rate [a-z ]{0,40}(?:at|to) ([0-9]+\\.[0-9]) percent, the U\\.S\\. Bureau of Labor Statistics reported",
  "grouping": "none"
}
```

Every anchor must appear in the page text, and the pattern (one capture group) must match exactly once, or the capture is refused. Write the pattern so only the headline sentence matches: BLS repeats the rate further down the page. `grouping: "comma"` removes thousands separators. Nested repetition, backreferences and lookbehind are refused. Pages change without notice, so prefer a data source whenever one exists.

## `evm-rpc.v1`: any EVM chain

```json
"reader": { "chainId": 143, "at": 1791061800, "until": 1791065400, "metric": "tx-count", "stride": 10, "finalitySeconds": 30 }
```

| Setting | Meaning |
|---|---|
| `chainId` | Checked against the RPC before anything is read (143 is Monad mainnet) |
| `at` | UTC seconds. The block used is the first block with a timestamp at or after `at` |
| `until` | For ranges: blocks from the `at` block up to, not including, the first block at or after `until` |
| `metric` | `call` (contract read, `uint256`/`int256`), `balance`, `nonce`, `block-field` (`gasUsed`, `gasLimit`, `baseFeePerGas`, `transactions`), `tx-count` (sum over the range, every `stride` blocks), `log-count` (logs from `address` with optional `topics`) |
| `finalitySeconds` | The capture must be at least this long after the last block used |

The evidence keeps the chain ID and the two blocks on each side of every boundary, and the reader checks their numbers, parent hashes and timestamps, so the chosen block is provable. At most 1,000 metric calls per capture: on Monad, one second is about 2.5 blocks, so an hour of `tx-count` needs a `stride` of 10 or more. Chain rules must use the `first-observed-snapshot` vintage and a window that opens after `until` (or `at`). List one RPC URL, or up to three as a cross-check: every listed URL must then be readable, and readings taken together must agree, or the question stays unresolved.

## The rule check

Run every rule before preparing a market:

```bash
node apps/web/scripts/check-settlement-rule.mjs my-rules.json --closes-at 1791061200
```

It validates each rule, prints its hash and timeline, reads each source now and reports one of:

| Status | Meaning |
|---|---|
| `ok` | Valid. The value is not public yet (as a prediction needs), or the window has already opened |
| `already-public` | The answer can already be read. Move the window or choose a period not yet published |
| `source-error` | The source could not be read or did not match the settings. Fix the rule |
| `invalid` | The rule itself is invalid |

For a rule whose window is in the future, `not-yet-available` on each source is the expected result.

## Verified against live sources (30 September 2026)

Polish central bank USD rate (JSON, `3.8537`), EMSC earthquakes of magnitude 4.5 or more (JSON count), FRED unemployment (CSV, `4.1`), ECB EUR/USD (SDMX-JSON, `1.1378`), Eurostat euro-area inflation (JSON-stat), BLS Employment Situation headline (HTML, `4.1`), and Monad mainnet transaction count and block gas (EVM, chain 143). Eurostat's `prc_hicp_manr` stopped updating in February 2026; check that a dataset is still current before using it.
