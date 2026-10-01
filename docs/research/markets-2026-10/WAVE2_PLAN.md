# Wave 2 implementation plan: 35 questions in 9 pools

Written 1 October 2026, 17:25 UTC. This is a plan only. Nothing has been prepared, deployed, committed or changed on Render or GitHub, and no funds have moved. It implements `WAVE2.md` (its "Revised schedule" section) and changes it where live checks or the code said otherwise; every change is listed in section 1. All times are UTC unless marked IST.

Draft rules for all 35 questions, the rule check runner and its output are in the session scratchpad (`wave2/rules.mjs`, `wave2/run-checks.mjs`, `wave2/checks-all.json`). After approval they move into `workflows/cre/src/wave2.ts` (section 3).

## 0. Summary

- **All 35 rules are valid.** The rule check returns no `invalid` and no `already-public`. 23 are `ok`; 12 are `source-error` only because their release is not out yet (BLS September row, EIA 10/05/26 column, ECB 9 October rate, SOFR 8 October, TSE result files). For every one of those except TSE, the same reader settings pointed at the latest published period parse the right value today (27 "twin" checks, all `ok`). Section 5 has the table.
- **The critical path is the settlement bot, not the markets.** Today only one pool can propose answers, at most 8 collections can be listed, and the collection bundle would outgrow what one environment variable can hold. F1 and F2 can run on today's code by switching the single proposing pool by hand. From 6 October 21:30 two pools need captures at the same time, so the bot change in section 2.3 must be live before then; to list all nine pools early it should be live on 2 October.
- **Funding:** 2,841.92 test AUSD for all nine pools (b = 100 for eight pools, b = 250 for Brazil). The deployer holds 19,571.23 AUSD and 362.1 MON. Deployment gas is about 1.5 MON per pool. No top-up is needed.
- **Changes to WAVE2.md** (details in section 1): J2 jobless claims came from FRED, an aggregator, so I propose the Treasury 30-year yield instead; weather reads 11:00 to 18:00 local time because three stations return 1.2 to 1.4 MB per day; Brazil rules read candidates by ballot number and the runoff code (6258) is in fact published; capture windows are shorter so pools pay out sooner.
- **Decisions I need from you** are in section 8.

## 1. Where the code or live sources differ from the brief

1. **The Brazil runoff code is published.** TSE's `https://resultados.tse.jus.br/oficial/comum/config/ele-c.json` (generated 30 Sep) lists election `6257` (federal first round, 04/10/2026) with `cdt2: 6258`, its second-round code. B4 therefore gets an automatic rule on the 6258 file. A manual assertion is still the fallback for a layout change, and for the no-runoff case (Lula's row is then absent, so nothing is captured).
2. **Flávio's ballot name has no accent.** TSE's candidate registry (`divulgacandcontas.tse.jus.br`, read 1 Oct) lists `FLAVIO BOLSONARO` (number 22, PL) and `LULA` (number 13). The WAVE2 sketch filtered on `FLÁVIO BOLSONARO` and would never match. The rules select by ballot number instead.
3. **NWS and the User-Agent.** Node's `fetch` sends `User-Agent: node` (checked against httpbin), and `api.weather.gov` answered 200 for all four stations. No change is needed.
4. **Three NWS stations are too large for a full day.** A full local day is 110 KB at KNYC but 1.43 MB at KORD, 1.24 MB at KLAX and 1.26 MB at KMIA (five-minute observations). Captures are stored in Redis on the free Upstash plan and re-read on every cycle until assertion. I narrowed each question to 11:00 to 18:00 local time: 31 KB, 431 KB, 353 KB and 384 KB.
5. **At most 8 listed collections.** The limit is enforced in `apps/web/server/practice-collections.mjs:12`, `apps/web/scripts/notify-settlement.mjs:120` and `apps/web/src/practice-collections.ts:9`. Three are registered now (Showcase v0, pre-test-v1, pre-test-v2), so 9 more makes 12.
6. **The bundle will not fit in one environment variable.** `FLURBO_PRACTICE_COLLECTIONS_JSON` is 34 KB with three pools. A four-question manifest is about 15 KB (pre-test-v1's is 14.9 KB), so 12 pools come to about 170 KB. Linux limits a single environment string to 128 KiB.
7. **Only one pool can propose.** This matches memory. `resolutionRound` throws if more than one pool has an evidence function (`apps/web/server/resolution-worker.mjs:192`). `runResolution` builds deterministic evidence and source collection only for `FLURBO_RESOLUTION_MANIFEST_JSON` (`apps/web/scripts/run-resolution.mjs:139,164`); every other pool is finish-only. Production `/healthz` right now: base pilot Release milestones `0x28d5…`, three practice collections, worker `complete` (pre-test-v2 delivered), bot idle.
8. **J2 used FRED.** `fred.stlouisfed.org` republishes Labor Department data, so it is an aggregator under the source rule. The Labor Department publishes the claims headline only as a PDF. I propose the Treasury 30-year par yield for 9 October in its place (same Treasury CSV as J3 and J4). Keeping FRED claims is the alternative; its rule also checks `ok`.
9. **An answer is final at the capture cutoff, not when the source publishes.** A `first-observed-snapshot` rule ends its observation at `publicationCutoff`, and the worker asserts only after that. The "answer known" times in WAVE2 are therefore earlier than settlement. I shortened windows where the source is reliable, so payouts come sooner (section 3 has each window).
10. **N1 stride.** A stride of 300 needs about 953 calls a day, close to the 1,000-call reader limit. A small rise in block rate would fail the capture for good. Stride 400 gives about 715 calls. The threshold is rescaled from live data: 16,169 sampled transactions over the last 24 hours.
11. **How the rule check reports pre-release sources.** Before release, BLS gives `EXTRACTION_AMBIGUOUS_OR_MISSING` (no September row), EIA `OBSERVATION_IDENTITY_MISMATCH` (no 10/05/26 column), ECB `SOURCE_EMPTY` (HTTP 200 with an empty body), SOFR `EXTRACTION_AMBIGUOUS_OR_MISSING` (empty `refRates`) and TSE `SOURCE_FETCH_FAILED` (404). Each shows as `source-error`, and the bot keeps checking. The prepare script will accept only these listed reasons, and only for these rules.
12. **BLS API v1 quota.** Unregistered v1 use has a small daily request quota per IP; I believe it is 25, but please confirm. The bot makes 4 requests if the data is there at 12:35. Render's outbound IP is shared with other tenants, though. If BLS refuses with a quota message, nothing is captured and the fallback is a manual assertion.
13. **Stale lines in WAVE2.md.** It still says "no elections" and gives Pool 1 a close of 11:30 and Brazil a close of 10:00. The revised schedule wins; I will correct those lines when I implement.

## 2. Feasibility: nine pools at once

### 2.1 What a new pool needs today (the pre-test-v2 pattern)

1. Prepare (`prepare-pre-test-v2.ts --prepare`), deploy (`DeployPreTestV2`), verify (`verify-pilot.ts --pre-test-v2`), bundle (`bundle-pre-test-v2.ts <saved bundle>`).
2. On Render, for the site and the monitor: set `FLURBO_PRACTICE_COLLECTIONS_JSON` to the new bundle and `FLURBO_PRACTICE_ACTIVE_POOL` to the featured pool.
3. On Render, for the bot to capture and propose: `FLURBO_RESOLUTION_POOL`, `FLURBO_RESOLUTION_RULES_HASH` and `FLURBO_RESOLUTION_MANIFEST_JSON` (the verified manifest), with `FLURBO_RESOLUTION_SOURCE_MODE=deterministic-source-v1`, `FLURBO_RESOLUTION_EVIDENCE_ORIGIN=https://flurbo.singu.online`, and `FLURBO_RESOLUTION_PROPOSALS=true` and `FLURBO_RESOLUTION_EXECUTE=true`. Source collection only runs with proposals on.
4. Other pools can only be finished (finalize a timeout, deliver), through `FLURBO_RESOLUTION_FINISH_ALLOWLIST` plus an exactly matching `FLURBO_RESOLUTION_COLLECTIONS_JSON`.

### 2.2 What breaks with nine

| Limit | Where | Effect |
|---|---|---|
| One proposing pool | `resolution-worker.mjs:192`, `run-resolution.mjs:139,164` | Only that pool captures sources and asserts. Rotating it by hand works until two pools need captures at once. The first overlap is 6 Oct 21:30 (Fuel E1 and E2 open while Brazil B1 to B3 is still open). 10 Oct 00:05 needs Crypto week and Monad network in the same hour. Brazil B4 needs F3 to propose again on 25 to 27 Oct. |
| 8 collections | server, monitor, browser (section 1, item 5) | Wave 2 pools 6 to 9 cannot be listed. |
| Environment size | Render env, 128 KiB per variable | The bundle reaches the limit around the 7th collection. |
| Load | Upstash free plan (500,000 commands a month), QuickNode credits | The monitor costs about 3 Redis commands per pool per check, every cycle; see 2.4. |

### 2.3 Recommended change: branch `wave2-bot` (I write it, you review and merge)

1. **Collections from Supabase KV.** Move the collections bundle out of the single environment variable and into Supabase KV (like other rebuildable data). The server and monitor will fetch it from there, eliminating the env size limit constraint.
2. **Raise the cap from 8 to 16** in the three places above, with corresponding tests. A Docker browser test covers Markets, Portfolio and a market page with 12 collections. Keep the old pools (Showcase v0, pre-test-v1, pre-test-v2) listed until 13 Oct.
3. **Several proposing pools.** Design multi-pool proposing properly: read a per-pool list of `{pool, rulesHash, manifest}` from config. For each pool, initialize its own per-pool source collection, per-pool `verifyPendingEvidence`, and per-pool `proposerHoldings` checks. The worker maintains one shared signer journal and lease, processing the pools sequentially. End-to-end tests will be added in `apps/web/tests` covering two deterministic pools proposing at the same time. Finish-only pools can be resolved from the same source, which removes the duplicate `FLURBO_RESOLUTION_COLLECTIONS_JSON` on Render. The GitHub Actions path is unchanged.
4. **Per-pool monitor cadence.** A delivered pool is checked once more and then skipped (an in-memory note; a restart checks it again). When the bot runs every 2 minutes for one pool, the others are still read about every 8 minutes. That keeps each pool inside the 15-minute `HOSTED_CHECK_GAP` alarm and the worker's 900-second freshness rule, while cutting most of the extra Redis and RPC reads. (Designed so the 9 pools do not add per-cycle Redis reads beyond what is needed).
5. **Tests:** proposing allowlist parsing and refusals, two proposing pools sharing one pending transaction, file loader and cap, monitor skipping, and the existing `apps/web` and `workflows/cre` suites, all run locally. Browser tests run in Docker (`mcr.microsoft.com/playwright:v1.56.1-noble`, `MSYS_NO_PATHCONV=1`).
6. **Docs:** `SETTLEMENT_BOT_RENDER.md` (new variables, rotation and rollback) and `SETTLEMENT_READERS.md` (expected pre-release reasons).

**Launch rollout and fallback if the branch slips:** Brazil (F3) will be the primary auto-settled pool for 4 October (set as `FLURBO_RESOLUTION_POOL`). Crypto weekend and Crypto week will be listed as finish-only pools with manual assertion as the fallback. Jobs Friday (F1) will be dropped this week unless the multi-pool branch lands first. This removes the need to manually rotate the single proposer environment variables over the weekend.

### 2.4 Load estimates (please check the dashboards before I add pools)

- **Upstash:** each monitored pool costs about 3 commands per check, plus one write every 5 minutes. With 12 pools at the 10-minute idle cadence, that is about 5,000 to 6,000 commands a day. Source collection adds about 3 to 5 commands per rule per cycle while its capture window is open, which is small with the short windows below. With change 4, I expect about 7,000 to 9,000 a day at the busiest. Without it, the 2-minute cadence near deadlines could reach about 25,000. The free plan is about 16,000 a day, shared with the site. **Please tell me today's daily command count** (Upstash console, solid-fly-322049).
- **QuickNode:** the monitor's status read is about 1 to 3 requests per pool check at about 30 credits each, so about 150,000 credits a day for 12 pools. Please check the remaining monthly credits.
- **Public Monad mainnet RPC** (captures only): about 30 calls per price or supply read, and about 730 for N1.
- **Resend:** monitor alert emails grow with assertions (35 questions). The busiest day, 10 Oct, may send 15 to 25. The free plan allows 100 a day.

## 3. Per-pool build

### 3.1 Shared pieces (one generic path instead of nine copies)

- `workflows/cre/src/wave2.ts`: rule builders per source (BLS, Chainlink, TSE, EIA, ECB, NWS, USGS, GFZ, Treasury, SOFR, Monad tx-count and supply, GitHub). A `WAVE2_POOLS` table holds each pool's label, title, fixed close, `liquidityAtoms`, assertion period, the expected pre-release reasons and the twin rules. `prepareWave2(id, selection, now, thresholds)` calls `preparePilot` exactly as `preparePreTestV2` does. It refuses a close less than one hour away, and refuses observation ends more than 90 days out.
- `config/wave2-thresholds.json`: the thresholds only, so they can be re-pulled on listing day without touching code.
- `workflows/cre/scripts/prepare-wave2.ts --pool <ID> --prepare`: writes `target/deployments/wave2-<id>-prepared.json` with the `wx` flag. A rerun must reproduce the same `configHash`, as with pre-test-v2. It runs `checkRule` on every rule with the pool's `--closes-at`. It refuses `invalid`, `already-public` and any `source-error` not listed as expected for that rule. It runs the twins and refuses if one fails, then prints each threshold beside today's reading.
- `workflows/cre/test/wave2.test.ts`: per pool, it checks the question count, adapters, the close against the revised schedule, and that every `scheduledAt` and chain `at` is after the close. It also checks the 3-hour rule after intervals, b and funding, that no question text contains an em dash, the 90-day and 30-day deploy limits, and the refusal to prepare within an hour of the close.
- `contracts/script/DeployWave2.s.sol`: nine path-only subclasses of `DeployPilot`, from `DeployWave2F1` to `DeployWave2Crypto`. `preparedPath` is `internal pure`, so it cannot read an env var. Pool and resolver logic do not change.
- `workflows/cre/scripts/verify-pilot.ts`: one `--wave2-<id>` flag per pool, with prefix `wave2-<id>`.
- `workflows/cre/scripts/bundle-wave2.ts <id> [saved env bundle]`: before `wave2-bot` it appends to a saved copy of the env bundle, as `bundle-pre-test-v2.ts` does. After the branch is live it appends to `config/practice-collections.json`.
- **Bot configuration per pool.** Before `wave2-bot`, the pool becomes the single proposer (three env vars) when its turn comes in the rotation. After, its `pool:rulesHash` is added to `FLURBO_RESOLUTION_PROPOSE_ALLOWLIST`.
- **Common settings:** `first-observed-snapshot` for all 35 questions, `missingPolicy: resolver-timeout-void`, challenge and voting periods 1 hour, bond 1 test AUSD. The assertion period is 12 hours, or 48 hours for Brazil. It only delays a VOID timeout, never a normal payout, and it gives time for a manual assertion.

The site label is shown first; labels match the server's label pattern.

### 3.2 F1 Jobs Friday ("Jobs Friday"): close 2 Oct 12:00, b = 100, payout about 2 Oct 17:35

All four use `json-api.v1` on `https://api.bls.gov/publicAPI/v1/timeseries/data/<series>`. The reader settings are `select /Results/series/0/data`, `aggregate only`, `field /value`, `filter [{/year eq 2026}, {/period eq M09}]`, `checks [{/status equals REQUEST_SUCCEEDED}, {/Results/series/0/seriesID equals <series>}]`. Each capture window is 2 Oct 12:35 to 16:30. The release is 12:30.

| Event | Yes if | Series | Latest (Aug) |
|---|---|---|---|
| us-unemployment-sep | Unemployment rate at least 4.2% | LNS14000000 | 4.1 |
| us-u6-sep | U-6 at least 7.8% | LNS13327709 | 7.7 |
| us-participation-sep | Participation at least 61.6% | LNS11300000 | 61.6 |
| us-hourly-earnings-sep | Average hourly earnings at least 37.85 dollars | CES0500000003 | 37.75 |

### 3.3 F2 Crypto weekend ("Crypto weekend"): close 3 Oct 18:00, b = 100, payout about 4 Oct 04:05

All four use `evm-rpc.v1` on `https://rpc.monad.xyz/` with chain 143, `metric call`, `data 0x50d25bcd` (latestAnswer), `returns int256`, `scale 8`, `finalitySeconds 60`, and `at` 4 Oct 00:00. Capture runs 00:05 to 03:00. Thresholds are reset to the spot price at prepare time. Today's values:

| Event | Feed (Monad mainnet) | Spot 1 Oct 17:15 | Draft threshold |
|---|---|---|---|
| mon-usd-oct4 | `0xBcD78f76005B7515837af6b50c7C52BCf73822fb` | 0.032569 | 0.0325 |
| btc-usd-oct4 | `0xc1d4C3331635184fA4C3c22fb92211B2Ac9E0546` | 84,172.41 | 84,000 |
| eth-usd-oct4 | `0x1B1414782B859871781bA3E4B0979b9ca57A0A04` | 2,680 | 2,680 |
| sol-usd-oct4 | `0x16F8008c3e89f62e5e2b909Ce70999370D38F4F2` | 117.16 | 117 |

### 3.4 F3 Brazil election ("Brazil election"): close 4 Oct 19:30, b = 250, assertion 48 h, payout about 27 Oct 13:05

All four use `json-api.v1` on `https://resultados.tse.jus.br/oficial/ele2026/<code>/dados-simplificados/br/br-c0001-e00<code>-r.json`, with `select /cand` and `checks [{/pst equals 100,00}]` so only a fully counted file is retained. Where possible a rule reads one candidate's own row (`aggregate only` with filter `/n eq <number>`). If the layout changes, the result is then no capture rather than a wrong No.

| Event | Yes if | Settings | Capture |
|---|---|---|---|
| br-lula-first | Lula (13) finishes first | 6257, `only`, filter `/n eq 13`, field `/seq`, category equals `1` | 5 Oct 06:00 to 7 Oct 06:00 |
| br-runoff | A runoff is held | 6257, `count`, filter `/st eq 2º turno`, at least 2 | same |
| br-flavio-runoff | Flávio Bolsonaro (22) qualifies | 6257, `only`, filter `/n eq 22`, field `/st`, category equals `2º turno` | same |
| br-lula-elected-runoff | Lula is elected on 25 Oct (No if no runoff) | 6258, `only`, filter `/n eq 13`, field `/st`, category equals `Eleito` | 25 Oct 23:00 to 27 Oct 12:00 |

The capture opens at 06:00 rather than at midnight. That gives one of us 01:00 to 05:30 UTC (06:30 to 11:00 IST) to compare the live partial-count file with these field names and strings before the bot can act. Polls close and counting starts at 20:00 UTC on 4 Oct.

*Note on liquidity:* We will seed the Brazil pool with one tiny "B2 AND B4" and "B3 AND B4" trade each, from an operator trading wallet (never the settlement signer). This will be noted in the market description.

### 3.5 Fuel and the euro ("Fuel and the euro"): close 5 Oct 11:00, b = 100, payout about 9 Oct 23:05

| Event | Yes if | Reader | Capture | Latest |
|---|---|---|---|---|
| gasoline-oct5 | EIA U.S. regular gasoline, week of 5 Oct, at least 4.45 | `html-text.v1` on `https://www.eia.gov/petroleum/gasdiesel/`. Anchors `U.S. Regular Gasoline Prices` and `10/05/26`. The pattern anchors on the table caption, requires `10/05/26` as the third date column and takes the third U.S. value: ``Regular Gasoline Prices\*\(dollars per gallon\) full history XLS Change from [0-9/]{8} [0-9/]{8} 10/05/26 2 year ago year ago week ago U\.S\. [0-9]\.[0-9]{3} [0-9]\.[0-9]{3} ([0-9]\.[0-9]{3}) `` | 6 Oct 21:30 to 7 Oct 21:00 (the page states the next release is 6 October) | 4.465 |
| diesel-oct5 | EIA U.S. on-highway diesel at least 6.40 | Same, with caption `On-Highway Diesel Fuel Prices` | same | 6.382 |
| ecb-eurusd-2026-10-09 | ECB USD reference rate for 9 Oct at least 1.1300 | `stat-table.v1` SDMX-JSON on `https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A?startPeriod=2026-10-09&endPeriod=2026-10-09&format=jsondata`, `select {CURRENCY: USD}`, `period 2026-10-09` | 9 Oct 14:30 to 22:00 | 1.1355 (30 Sep), 1.1298 (1 Oct) |

The EIA patterns matched exactly once each on today's page with `09/28/26` in place of `10/05/26`, returning 4.465 and 6.382.

### 3.6 Weather 7 Oct ("Weather 7 Oct"): close 6 Oct 12:00, b = 100, payout about 8 Oct 13:05

`json-api.v1` on `https://api.weather.gov/stations/<ST>/observations?start=<s>&end=<e>`, with `select /features`, `aggregate max`, `field /properties/temperature/value` and `filter [{/properties/temperature/value gte -100}]`, which drops `null` readings. Each question says "the highest temperature among the observations reported between 11:00 and 18:00 local time". Capture opens 3 hours after the interval and closes 8 Oct 12:00.

| Event | Station | Interval (UTC) | Capture opens | Draft threshold |
|---|---|---|---|---|
| nyc-high-oct7 | KNYC | 7 Oct 15:00 to 22:00 | 8 Oct 01:00 | 20.0 C |
| chicago-high-oct7 | KORD | 7 Oct 16:00 to 23:00 | 8 Oct 02:00 | 21.0 C |
| la-high-oct7 | KLAX | 7 Oct 18:00 to 8 Oct 01:00 | 8 Oct 04:00 | 26.0 C |
| miami-high-oct7 | KMIA | 7 Oct 15:00 to 22:00 | 8 Oct 01:00 | 31.0 C |

At prepare time the thresholds are set from the NWS point forecast for 7 October, rounded, so each question is near even.

### 3.7 Planet ("Planet"): close 6 Oct 00:00, window 6 Oct 00:00 to 13 Oct 00:00, b = 100, payout about 13 Oct 10:05

Capture runs 13 Oct 03:00 to 09:00 for all four.

| Event | Yes if | Reader |
|---|---|---|
| quake-m65 | At least one M6.5+ earthquake | `json-api.v1` on `https://earthquake.usgs.gov/fdsnws/event/1/count?starttime=2026-10-06T00:00:00&endtime=2026-10-13T00:00:00&minmagnitude=6.5&eventtype=earthquake&format=geojson`, `select /count`, `aggregate value` (a quiet week returns `{"count":0}`, a real No) |
| quake-m7 | At least one M7.0+ | Same with `minmagnitude=7.0` |
| kp5 | Kp reaches 5.000 or more | `json-api.v1` on `https://kp.gfz.de/app/json/?start=2026-10-06T00:00:00Z&end=2026-10-12T23:59:59Z&index=Kp`, `select /Kp`, `aggregate max`, `field ""`, `checks [{/datetime/0 equals 2026-10-06T00:00:00Z}, {/datetime/55 equals 2026-10-12T21:00:00Z}]`. The checks require all 56 intervals to be present. |
| kp6 | Kp reaches 6.000 or more | Same |

Twins for 24 to 30 Sep: one M6.5+, no M7+, max Kp 4.333.

### 3.8 Rates ("Rates"): close 8 Oct 10:00, b = 100, payout about 10 Oct 07:05

| Event | Yes if | Reader | Capture | Latest (30 Sep) |
|---|---|---|---|---|
| treasury-30y-oct9 (replaces J2) | 30-year par yield for 9 Oct at least 5.65 | `stat-table.v1` CSV on the Treasury 2026 daily par yield CSV (WAVE2 URL), `select {Date: 10/09/2026}`, `valueColumn 30 Yr` | 9 Oct 22:00 to 10 Oct 06:00 | 5.64 |
| sofr-2026-10-08 | SOFR for 8 Oct at least 3.89 | `json-api.v1` on the NY Fed search URL, `select /refRates`, `aggregate only`, `field /percentRate`, `filter [{/effectiveDate eq 2026-10-08}]` | 9 Oct 12:30 to 18:00 | 3.90 (month end); 3.88 on 29 Sep |
| treasury-2y-oct9 | 2-year at least 4.90 | As 30-year, `2 Yr` | 9 Oct 22:00 to 10 Oct 06:00 | 4.88 |
| treasury-10y-oct9 | 10-year at least 5.30 | As 30-year, `10 Yr` | same | 5.29 |

The alternative to treasury-30y-oct9 is to keep J2 (FRED `ICSA`, week ending 3 Oct, at least 200,000, capture 8 Oct 13:00 to 9 Oct 12:00).

### 3.9 Monad network ("Monad network"): close 8 Oct 23:00, b = 100, payout about 12 Oct 13:05

| Event | Yes if | Reader | Capture | Latest |
|---|---|---|---|---|
| tx-oct9 | At least 16,500 transactions across every 400th block, 9 Oct 00:00 to 10 Oct 00:00 | `evm-rpc.v1` `tx-count`, `stride 400` | 10 Oct 00:05 to 12:00 | 16,169 (last 24 h) |
| usdc-supply-oct10 | USDC total supply at least 230,000,000 at 10 Oct 00:00 | `call` totalSupply on `0x754704Bc059F8C67012fEd69BC8A327a5aafb603`, `scale 6` | 10 Oct 00:05 to 03:00 | 217,564,796 |
| wmon-supply-oct10 | WMON total supply at least 300,000,000 | `call` on `0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A`, `scale 18` | same | 300,837,003 |
| monad-bft-releases | At least 22 stable releases | `json-api.v1` on `https://api.github.com/repos/category-labs/monad-bft/releases?per_page=100` (139 KB), `select ""`, `aggregate count`, `filter [{/prerelease eq false}, {/draft eq false}]` (the boolean filter works) | 12 Oct 00:00 to 12:00 | 21 |

### 3.10 Crypto week ("Crypto week"): close 9 Oct 12:00, b = 100, payout about 10 Oct 04:05

Same reader as F2, with `at` 10 Oct 00:00 and capture 00:05 to 03:00. WAVE2's draft thresholds are MON 0.0340, BTC 85,000, ETH 2,700 and SOL 120. They are re-pulled at prepare time.

## 4. Funding

Initial funding is b x n x ln 2 test AUSD (b x ln(2^n) in `pilot-config.ts`). Liquidity is set per pool through `liquidityAtoms`.

| Pool | n | b | Funding (AUSD) |
|---|---|---|---|
| F1 Jobs Friday | 4 | 100 | 277.26 |
| F2 Crypto weekend | 4 | 100 | 277.26 |
| F3 Brazil election | 4 | 250 | 693.15 |
| Fuel and the euro | 3 | 100 | 207.95 |
| Weather 7 Oct | 4 | 100 | 277.26 |
| Planet | 4 | 100 | 277.26 |
| Rates | 4 | 100 | 277.26 |
| Monad network | 4 | 100 | 277.26 |
| Crypto week | 4 | 100 | 277.26 |
| **Total** | 35 | | **2,841.92** |

With b = 100, a 10-share trade moves the price by about 2.5%; with b = 250, about 1%. Brazil keeps 250 because it is the flagship pool.

Wallet balances on Monad testnet, read 1 Oct 17:10. Nothing is moved by this plan.

| Wallet | Address | MON | AUSD | Needs for wave 2 |
|---|---|---|---|---|
| Deployer (creator) | `0xf1fe…c391` | 362.14 | 19,571.23 | 2,426.03 AUSD funding and about 14 MON of gas (1.44 to 1.60 MON per deployment, measured from the pre-test-v1 and deterministic-test broadcasts). About 17,145 AUSD remains. |
| Settlement signer | `0x6713…adea` | 49.67 | 294.00 | 1 AUSD bond per assertion, at most about 9 outstanding at once (10 Oct 03:00), returned on finalization. About 115 transactions (approve, assert, finalize, deliver); under 6 MON at worst. Never trades. |
| Starter | `0x8C5b…0d8d` | 199.40 | 0 | Unrelated to wave 2. 0.5 MON per new member is about 398 more members. |
| AUSD dispenser | `0x5b76…0277` | 0 | 8,650.00 | Unrelated. 50 AUSD per claim is 173 more claims. |
| Reviewers | `0x1FC6…`, `0x41C2…`, `0x555D…` | 2.0, 2.0, 20.3 | 0 | Only for disputes. |
| Old signer | `0x632a…` | | | Never fund. |

## 5. Rule check results (read-only, 1 Oct 17:05 to 17:20)

Each pool's rules were run through `checkRule` from `apps/web/scripts/check-settlement-rule.mjs` with that pool's `--closes-at`.

| Pool | Event | Status | Source result now | Verdict |
|---|---|---|---|---|
| F1 | 4 BLS questions | source-error | `EXTRACTION_AMBIGUOUS_OR_MISSING` (no M09 row) | Expected pre-release; twins on M08 read 4.1, 7.7, 61.6, 37.75 |
| F2 | 4 Chainlink questions | ok | not-yet-available (block not produced) | Fine; twins at now-30 min read the spot prices above |
| F3 | 4 TSE questions | source-error | `SOURCE_FETCH_FAILED` (404 until counting starts) | Expected; cannot be twinned (2022 and 2024 files are archived) |
| Fuel | gasoline-oct5, diesel-oct5 | source-error | `OBSERVATION_IDENTITY_MISMATCH` (no 10/05/26 column) | Expected; twins on 09/28/26 read 4.465, 6.382 |
| Fuel | ecb-eurusd-2026-10-09 | source-error | `SOURCE_EMPTY` | Expected; twin on 30 Sep reads 1.1355 |
| Weather | 4 NWS questions | ok | not-yet-available (`VALUE_MISSING`) | Fine; twins on 30 Sep read 22.8, 21.1, 27, 29 |
| Planet | quake-m65, quake-m7 | ok | current-reading 0 (future window) | Fine; twins on 24 to 30 Sep read 1 and 0 |
| Planet | kp5, kp6 | ok | not-yet-available | Fine; twin reads 4.333 |
| Rates | 3 Treasury questions | ok | not-yet-available | Fine; twins read 4.88, 5.29, 5.64 |
| Rates | sofr-2026-10-08 | source-error | `EXTRACTION_AMBIGUOUS_OR_MISSING` (empty list) | Expected; twin on 30 Sep reads 3.9 |
| Monad | 3 chain questions | ok | not-yet-available | Fine; twins read 16,169 / 217.56M / 300.84M |
| Monad | monad-bft-releases | ok | current-reading 21 | Fine |
| Crypto week | 4 Chainlink questions | ok | not-yet-available | Fine |
| Alternate | J2 FRED claims | ok | not-yet-available | Valid, but an aggregator (section 1, item 8) |

Totals: 23 `ok`, 12 `source-error` (all expected pre-release), 0 `invalid`, 0 `already-public`. No rule needs replacing for a check failure. The substitutions in this plan are for sourcing policy (J2), size (weather) and robustness (Brazil, N1 stride). I will rerun every check at prepare time, because thresholds and prices move.

## 6. Timeline

Deploy transactions must land more than one hour before the close (the deploy script and `preparePilot` both refuse otherwise). I use a 30-minute margin on top. Each deployment follows the same order: I prepare and you deploy. I then verify and build the bundle, you update Render, and I check `/healthz`.

| When (UTC) | IST | Step | Who |
|---|---|---|---|
| 1 Oct, on approval | | Write `wave2.ts`, thresholds config, prepare, test, deploy, verify and bundle scripts; run tests and rule checks | Me |
| 1 Oct about 21:00 (target); 4 Oct 18:00 (hard) | 2 Oct 02:30; 5 Oct 01:30 | **F3 Brazil:** prepare (me). Deploy (you): `FOUNDRY_PROFILE=demo`, `forge script contracts/script/DeployWave2.s.sol:DeployWave2F3 --use target/tools/solc-0.8.28.exe --rpc-url https://testnet-rpc.monad.xyz --account flurbo-testnet --sender "$FLURBO_DEPLOYER" --broadcast --slow`, keystore password at the hidden prompt. Then verify (me). Export the current `FLURBO_PRACTICE_COLLECTIONS_JSON` to a file for me (you). Bundle (me). On Render (you): new bundle, `FLURBO_PRACTICE_ACTIVE_POOL` = F3, and `FLURBO_RESOLUTION_POOL`, `_RULES_HASH`, `_MANIFEST_JSON` = F3. Check `/healthz`: F3 listed, worker `wait` (me) | Both |
| 2 Oct 00:00 to 08:00 | 05:30 to 13:30 | Build and test `wave2-bot` (me); you review, commit, merge; Render redeploys | Both |
| 2 Oct, after F3 is live | | Deploy F2 (spot thresholds), Fuel, Weather (forecast thresholds), each with the same steps. These fit in the env bundle (3 + 4 = 7 collections). Note: F1 Jobs Friday is dropped this week unless `wave2-bot` lands first. F2 is deployed as a finish-only pool. | Both |
| After `wave2-bot` is live, target 2 to 3 Oct | | You commit `config/practice-collections.json` (all registered pools) and set `FLURBO_PRACTICE_COLLECTIONS_SOURCE=file` and `FLURBO_RESOLUTION_PROPOSE_ALLOWLIST`. Then Planet, Rates, Monad network, Crypto week each get prepare, deploy, verify, a file append, your commit, and an allowlist entry | Both |
| 4 Oct 00:05 to 04:05 | 05:35 to 09:35 | F2 capture window. If multi-pool not landed: manual assertion from block explorer. | Manual |
| 5 Oct 01:00 to 05:30 | 06:30 to 11:00 | Compare the live TSE 6257 file with the F3 rules (fields `cand`, `n`, `seq`, `st`, `pst`; strings `2º turno`, `Eleito`, `100,00`). If anything differs, remove F3 from the proposers before 06:00 and plan a manual assertion | You or me |
| 6 Oct 21:00 | 7 Oct 02:30 | **Hard deadline for `wave2-bot`** (first overlapping capture windows) | |
| 7 Oct 00:01 | 05:31 | Existing Release milestones pool: observation ends; reth v2.6.1 still needs your manual NO or it goes VOID (unchanged, listed so it is not forgotten) | You |
| 7 Oct 06:00 to 07:05 | 11:30 to 12:35 | F3 B1 to B3 asserted (pool pays only after B4) | Bot |
| 8 Oct 12:00 to 13:05 | 17:30 to 18:35 | Weather settles | Bot |
| 9 Oct 22:00 to 23:05 | 10 Oct 03:30 to 04:35 | Fuel and the euro settles | Bot |
| 10 Oct 00:05 to 07:05 | 05:35 to 12:35 | Busiest stretch: 9 chain captures at 00:05; Crypto week, N2, N3 asserted at 03:00 (about 16 transactions over 2 to 3 cycles); Rates at 06:00 | Bot |
| 12 Oct 12:00 to 13:05 | 17:30 to 18:35 | Monad network settles | Bot |
| 13 Oct 09:00 to 10:05 | 14:30 to 15:35 | Planet settles | Bot |
| 25 Oct 23:00 to 27 Oct 13:05 | | Brazil B4 captured (or manual No if there is no runoff), pool delivers | Bot or you |

Hard deploy deadlines (the deploy transaction must be mined before this time):

| Pool | Deadline (UTC) |
|---|---|
| F1 | 2 Oct 10:30 |
| F2 | 3 Oct 16:30 |
| F3 | 4 Oct 18:00 |
| Fuel | 5 Oct 09:30 |
| Planet | 5 Oct 22:30 |
| Weather | 6 Oct 10:30 |
| Rates | 8 Oct 08:30 |
| Monad network | 8 Oct 21:30 |
| Crypto week | 9 Oct 10:30 |

## 7. Risks and fallbacks per pool

Both fallbacks rely on the same mechanics.

- **Manual assertion** from a non-reviewer wallet (never the settlement signer for a pool it holds, never `0x632a…`), with a 1 AUSD bond, within the assertion window. That window is 12 hours after the cutoff, or 48 hours for Brazil. The evidence goes into the pool's public archive.
- **VOID** if nobody asserts. A VOID question pays each side 0.5 per unit, which is not a refund.

Two further protections:

- **Kill switch.** Remove the pool from `FLURBO_RESOLUTION_PROPOSE_ALLOWLIST` (or, before `wave2-bot`, repoint the proposer) so the bot cannot assert a suspect value.
- **Dispute.** Within the 1-hour challenge window, a non-reviewer, non-asserter wallet can dispute with a bond, and the reviewers (operator-controlled, as disclosed) vote.

| Pool | Main risks | Fallback |
|---|---|---|
| F1 | BLS API quota on Render's shared IP; BLS late or a shutdown (none as of 1 Oct: Labor released claims today); F1 not deployed before 11:00 | Manual assertion from the BLS release before 3 Oct 04:30; otherwise VOID. If the deploy slips past 10:30, drop F1 and move the four questions to a later release |
| F2 | Public RPC prunes state after a few days (captures run within minutes; the window ends 3 h after); feed not updated near midnight (it reads latestAnswer, which can lag up to the heartbeat; the question says latestAnswer) | Manual assertion from a block explorer read at the same block within the 12 h window; VOID |
| F3 | Result file layout or strings differ from 2022 (`seq` written as `01`, a different status string); `pst` never reaches exactly `100,00` before 7 Oct 06:00; candidate registration change (Avalanche is pending and shares number 28, which does not affect these rules); B4 has no runoff | Layout check on 5 Oct morning plus the kill switch; manual assertion with TSE evidence within 48 h; B4 No by manual assertion if there is no runoff. Fail-open case: B2 counts statuses, so a renamed status would read 0, which is a wrong No. It needs the morning check |
| Fuel | EIA changes the page layout or delays the release past 7 Oct 21:00; ECB late on 9 Oct | Manual assertion from the EIA page or XLS and from the ECB site; VOID |
| Weather | NWS outage; one station's afternoon window misses the day's peak (by design; the question says 11:00 to 18:00); response grows over 2 MB (now at most 431 KB) | Manual assertion from the same API URL; VOID |
| Planet | Late USGS entries (the 3 h settle rule covers most); GFZ missing the last interval (the checks then refuse the capture) | Rerun at the next cycle inside the 6 h window; manual assertion; VOID |
| Rates | US shutdown (Treasury or SOFR not published); Treasury posts after 10 Oct 06:00 | Manual assertion within 12 h; VOID |
| Monad network | Block rate rises sharply (stride 400 allows up to about 4.6 blocks a second before the 1,000-call limit); public RPC rate limits during the 715-call N1 capture (it retries with backoff and again next cycle); GitHub's 60-requests-per-hour unauthenticated limit on a shared Render IP | Retries within the windows; manual assertion; VOID |
| Crypto week | Same as F2, and the 10 Oct 00:05 burst (9 captures) on the public RPC | Same as F2 |
| All | Bot change slips; Upstash or QuickNode quota; Render restarts during a capture (a restart only skips a cycle) | Hand rotation of the proposer (good until 6 Oct 21:00); check quotas before adding pools; retire delivered pools from monitoring |

Width limit: each question can join combinations with at most two others, permanently and first come. In Planet the nested pairs (P1 with P2, P3 with P4) make some combinations near impossible, and they will price near zero, as expected. In Brazil the most valuable links are B4 with B3 (Lula's runoff price against Flávio) and B4 with B2. If early traders link B4 to B1 first, one of those becomes unavailable. See decision 5.

## 8. Decisions (Resolved)
All decisions approved by operator on Oct 1.
1. **J2:** Replaced jobless claims with the Treasury 30-year yield for 9 Oct.
2. **b:** 100 for all pools except Brazil (250).
3. **Assertion period:** 12 h for bot-asserted pools, 48 h for Brazil.
4. **Brazil links:** Will seed with one tiny "B2 AND B4" and "B3 AND B4" trade each from an operator trading wallet (not the settlement signer).
5. **Weather:** 11:00 to 18:00 local window accepted.
6. **Old pools & Collections:** Old pools stay listed until 13 Oct. Collections bundle will be moved to Supabase KV with an increased cap of 16 in the `wave2-bot` branch.
7. **Quotas:** Operator will send Upstash/QuickNode numbers separately; bot cadence designed to prevent unnecessary Redis reads.

## 9. After approval

I will write the code and tests in section 3 and the `wave2-bot` branch in section 2.3. I will run every test and rule check, prepare each pool when its turn comes, and verify deployments and bundles. I will not commit, push, merge, deploy, change Render or GitHub settings, move funds or spend gas. Each of those steps is yours, at the points marked in the timeline. Private keys stay in your keystore and Render secrets. The settlement signer never trades, and `secrets/` is never committed.
