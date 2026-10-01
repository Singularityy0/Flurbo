# Invite-launch markets: 35 questions in 9 pools

Compiled 1 October 2026, 16:00 UTC, for listing on 2 and 3 October and settlement by 13 October (the Brazil pool by about 27 October, after the runoff). Every question settles through one of the four general settlement readers (`docs/SETTLEMENT_READERS.md`): 7 through `evm-rpc.v1`, 15 through `json-api.v1`, 4 through `stat-table.v1` and 2 through `html-text.v1`. Every source below was read live today; the baseline column shows what it returned. Thresholds sit near the current value so each answer is roughly even, except where a pool deliberately nests two thresholds.

Topics follow the earlier constraint: no sports, pop culture, awards or elections. All times UTC.

## Revised schedule: longer trading windows, plus fast pools (supersedes the pool closes below)

A pool has one trading close, and it must come before the earliest observation or release among its questions. So the way to give late joiners more time is to group questions by when their answer becomes knowable, not only by topic. Each close below is the latest safe one for its questions. Pools must be deployed at least one hour before their close.

**Fast pools** (resolve within days, for people who want quick feedback):

| Pool | Questions | Close (UTC) | Answer known |
|---|---|---|---|
| F1 Jobs Friday | Sept unemployment at least 4.2% (Aug 4.1); U-6 at least 7.8% (Aug 7.7); participation at least 61.6% (Aug 61.6); average hourly earnings at least $37.85 (Aug $37.75). All BLS API, same release | 2 Oct 12:00 | 2 Oct 12:30 |
| F2 Crypto weekend | MON, BTC, ETH, SOL on Chainlink (Monad) at the first block at or after 4 Oct 00:00; thresholds set at the spot price on listing day | 3 Oct 18:00 | 4 Oct 00:00 |
| F3 Brazil first round | B1 to B4 (Pool 7) | 4 Oct 19:30 (polls close 20:00 UTC; TSE releases nothing before) | B1 to B3: 4 Oct night; B4: 25 Oct |

**Longer pools** (about a week of trading for late joiners):

| Pool | Questions | Close (UTC) | Answer known | Trading days if listed 2 Oct |
|---|---|---|---|---|
| Fuel and the euro | E1 gasoline, E2 diesel (EIA survey taken Monday 5 Oct), E3 EUR/USD for 9 Oct | 5 Oct 11:00 (before EIA's Monday survey) | 6 Oct and 9 Oct | 3 |
| Weather 7 Oct | W1 to W4 | 6 Oct 12:00 (the NYC local day starts 7 Oct 04:00) | 8 Oct | 4 |
| Planet | P1 to P4, window moved to 6 Oct 00:00 to 13 Oct 00:00 | 6 Oct 00:00 (window starts at close) | 13 Oct 03:00 | 4 |
| Rates | J2 claims (week ending 3 Oct), E4 SOFR for 8 Oct, J3 2-year and J4 10-year for 9 Oct | 8 Oct 10:00 (before 8 Oct repo trading) | 8 to 9 Oct | 6 |
| Monad network | N1 transactions moved to 9 Oct 00:00 to 10 Oct 00:00, N2 USDC and N3 WMON at 10 Oct 00:00, N4 monad-bft releases by 12 Oct | 8 Oct 23:00 | 10 to 12 Oct | 6 |
| Crypto week | C1 to C4 at 10 Oct 00:00 | 9 Oct 12:00 | 10 Oct 00:00 | 7 |

That is 35 questions in 9 pools. The fast pools also give the earliest payouts, so new members see a full cycle (trade, settle, collect) in their first days. Deploy F1 tonight if possible: listed now it gets about 18 hours of trading instead of 6.

Option after 4 October: a Brazil runoff pool (Lula against the qualifier, plus governor runoffs in large states) closing 25 Oct 19:30, so people who join after the first round still have an election to trade.

## Pools are separate markets

Each pool is its own contract: its own price state, its own collateral, its own trading close and settlement. Combinations (AND, OR, exactly one) only work inside one pool. A trade in one pool never moves prices in another, even when the topics are related (for example the crypto weekend and crypto week pools, or the 2-year yield and the jobs report). Related pools can therefore drift apart; traders and agents can profit from bringing them back in line, but the protocol does not enforce it.

To price a cross-topic relationship (jobs data and yields, BTC and MON), both questions must sit in the same pool, which then closes at the earlier of their two closes. That is the trade-off behind the grouping above: same-pool for relationships people will trade, separate pools where a later close matters more. Within a pool, each question can be combined with at most two others.

## Summary

| ID | Yes if | Reader | Baseline (1 Oct) | Est. P(Yes) |
|---|---|---|---|---|
| **Pool 1: US jobs and yields** (close 2 Oct 11:30) | | | | |
| J1 | US unemployment rate for September 2026 is at least 4.2% | json-api (BLS API) | 4.1% Aug, 4.1% Jul, 4.2% Jun | 0.35 |
| J2 | Initial jobless claims for the week ending 3 October are at least 200,000 | stat-table (FRED CSV) | 197,000 (26 Sep); 197k to 212k since August | 0.50 |
| J3 | 2-year Treasury par yield for 9 October is at least 4.90% | stat-table (Treasury CSV) | 4.88% (30 Sep) | 0.45 |
| J4 | 10-year Treasury par yield for 9 October is at least 5.30% | stat-table (Treasury CSV) | 5.29% (30 Sep) | 0.48 |
| **Pool 2: Prices and the dollar** (close 3 Oct 12:00) | | | | |
| E1 | EIA US regular gasoline retail price for the week of 5 October is at least $4.45 | html-text (EIA) | $4.465 (28 Sep), down $0.013 on the week | 0.50 |
| E2 | EIA US on-highway diesel price for the week of 5 October is at least $6.40 | html-text (EIA) | $6.382 (28 Sep), down $0.147 | 0.40 |
| E3 | ECB euro reference rate for 9 October is at least 1.1300 US dollars | stat-table (ECB SDMX) | 1.1298 (1 Oct); 1.1403 on 25 Sep | 0.48 |
| E4 | SOFR for 8 October is at least 3.89% | json-api (NY Fed) | 3.90% (30 Sep, month end), 3.88% (29 Sep) | 0.40 |
| **Pool 3: Crypto prices, read on Monad** (close 3 Oct 12:00) | | | | |
| C1 | Chainlink MON/USD on Monad is at least $0.0340 at the first block at or after 10 Oct 00:00 | evm-rpc | $0.03244 (1 Oct 15:47); $0.02875 three days earlier | 0.42 |
| C2 | Chainlink BTC/USD on Monad is at least $85,000 at the same block | evm-rpc | $83,907 | 0.45 |
| C3 | Chainlink ETH/USD on Monad is at least $2,700 at the same block | evm-rpc | $2,676 | 0.47 |
| C4 | Chainlink SOL/USD on Monad is at least $120 at the same block | evm-rpc | $117.06 | 0.42 |
| **Pool 4: Monad network** (close 3 Oct 12:00) | | | | |
| N1 | Monad mainnet records at least 22,000 transactions across every 300th block from the first block at or after 8 Oct 00:00 to the first at or after 9 Oct 00:00 | evm-rpc | 19 to 30 tx per sampled block over the last day, about 22,000 for 953 samples | 0.50 |
| N2 | Native USDC total supply on Monad is at least 230,000,000 at the first block at or after 10 Oct 00:00 | evm-rpc | 217.6M (1 Oct), 209.2M (28 Sep) | 0.50 |
| N3 | WMON total supply is at least 300,000,000 at the same block | evm-rpc | 300.3M (1 Oct), 312.4M (28 Sep) | 0.45 |
| N4 | category-labs/monad-bft lists at least 22 stable (non-prerelease) GitHub releases at the 12 Oct snapshot | json-api (GitHub API) | 21 stable; releases on 23 Sep, 15 Sep, 1 Sep, 25 Aug | 0.60 |
| **Pool 5: Weather on 7 October** (close 3 Oct 12:00) | | | | |
| W1 | Highest temperature reported by NWS station KNYC (Central Park) on 7 Oct, local day, is at least 20.0 C | json-api (NWS) | 16 to 23 C in late September | 0.50 |
| W2 | Same for KORD (Chicago O'Hare), at least 21.0 C | json-api (NWS) | 18 to 26 C | 0.45 |
| W3 | Same for KLAX (Los Angeles airport), at least 26.0 C | json-api (NWS) | 25 to 29 C | 0.45 |
| W4 | Same for KMIA (Miami airport), at least 31.0 C | json-api (NWS) | 29 to 33 C | 0.50 |
| **Pool 6: Planet** (close 3 Oct 12:00; window 3 Oct 12:00 to 10 Oct 12:00) | | | | |
| P1 | USGS catalogue has at least one earthquake of magnitude 6.5 or more anywhere in the window | json-api (USGS) | 42 in the last year: P(at least one in 7 days) 0.55 | 0.55 |
| P2 | Same, magnitude 7.0 or more | json-api (USGS) | 15 in the last year | 0.25 |
| P3 | GFZ planetary Kp reaches 5 or more in any 3-hour interval of the window | json-api (GFZ) | 61% of 7-day windows in the last year; September max 5 | 0.60 |
| P4 | Same, Kp 6 or more | json-api (GFZ) | 29% of 7-day windows | 0.29 |

## Why these pools combine well

- **Jobs and yields (J1 to J4).** A weak jobs report (J1 Yes) usually pulls the 2-year yield down (J3 No); the 2-year and 10-year move together. "Unemployment up AND 2-year below 4.90" is the trade people will want.
- **Prices and the dollar (E1 to E4).** Gasoline and diesel share crude oil; diesel is at $6.38, up $2.63 on the year, so it is a live topic. SOFR and the euro are the money side.
- **Crypto (C1 to C4).** Strongly correlated; "MON up AND BTC down" or "exactly one of ETH and SOL" are real views, not noise. MON is the price the Monad audience watches.
- **Monad network (N1 to N4).** Activity, stablecoin growth, MON wrapping and client releases: the chain's own pulse, read from the chain itself.
- **Weather (W1 to W4).** The most-traded prediction format elsewhere; four cities give independent and weakly linked answers (New York and Chicago share weather systems).
- **Planet (P1 to P4).** Two nested pairs (P2 implies P1, P4 implies P3), so combinations such as "Kp 6 AND no M6.5 earthquake" have clear meanings. Nested pairs are the first real case for the semantic guard noted in MARKETS.md.

## Sources and reader settings

### Pool 1

| ID | Source URL | Reader settings | Capture window |
|---|---|---|---|
| J1 | `https://api.bls.gov/publicAPI/v1/timeseries/data/LNS14000000` (BLS public API, no key) | `select /Results/series/0/data`, `aggregate only`, `field /value`, `filter [{/year eq 2026}, {/period eq M09}]`, `checks [{/status equals REQUEST_SUCCEEDED}]` | Release 2 Oct 12:30 (BLS calendar, first Friday). Capture 2 Oct 12:35 to 3 Oct 12:00. Not published by then: VOID |
| J2 | `https://fred.stlouisfed.org/graph/fredgraph.csv?id=ICSA&cosd=2026-09-01` | CSV, `select {observation_date: 2026-10-03}`, `valueColumn ICSA` | Department of Labor releases 8 Oct 12:30. Capture 8 Oct 13:00 to 9 Oct 12:00 |
| J3, J4 | `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/2026/all?type=daily_treasury_yield_curve&field_tdr_date_value=2026&page&_format=csv` | CSV, `select {Date: 10/09/2026}`, `valueColumn "2 Yr"` and `"10 Yr"` | Treasury posts after the close. Capture 9 Oct 22:00 to 10 Oct 18:00 |

### Pool 2

| ID | Source URL | Reader settings | Capture window |
|---|---|---|---|
| E1 | `https://www.eia.gov/petroleum/gasdiesel/` | Anchors `U.S. Regular Gasoline Prices`, `10/05/26`; pattern on the U.S. row of the gasoline table taking the third (newest) value, matched exactly once; grouping none | EIA's next release is 6 October (page states it). Capture 6 Oct 21:00 to 8 Oct 00:00 |
| E2 | Same page | Anchors `U.S. On-Highway Diesel Fuel Prices`, `10/05/26`; pattern on the diesel U.S. row | Same |
| E3 | `https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A?startPeriod=2026-10-09&endPeriod=2026-10-09&format=jsondata` | SDMX-JSON, `period 2026-10-09` | ECB publishes about 14:15 CET. Capture 9 Oct 14:00 to 10 Oct 12:00 |
| E4 | `https://markets.newyorkfed.org/api/rates/secured/sofr/search.json?startDate=2026-10-08&endDate=2026-10-08` | `select /refRates`, `aggregate only`, `field /percentRate`, `filter [{/effectiveDate eq 2026-10-08}]` | Published 9 Oct about 12:00. Capture 9 Oct 12:30 to 10 Oct 12:00 |

### Pools 3 and 4 (Monad mainnet, chain 143, `https://rpc.monad.xyz/`)

| ID | Contract or metric | Reader settings |
|---|---|---|
| C1 | Chainlink MON/USD `0xBcD78f76005B7515837af6b50c7C52BCf73822fb` (8 decimals, 2% deviation, 1 h heartbeat) | `metric call`, `data 0x50d25bcd` (latestAnswer), `returns int256`, `scale 8`, `at` 10 Oct 00:00 |
| C2 | BTC/USD `0xc1d4C3331635184fA4C3c22fb92211B2Ac9E0546` (8 decimals) | same |
| C3 | ETH/USD `0x1B1414782B859871781bA3E4B0979b9ca57A0A04` (8 decimals) | same |
| C4 | SOL/USD `0x16F8008c3e89f62e5e2b909Ce70999370D38F4F2` (8 decimals) | same |
| N1 | Transactions | `metric tx-count`, `at` 8 Oct 00:00, `until` 9 Oct 00:00, `stride 300` (about 953 calls, under the 1,000 limit at 3.31 blocks per second) |
| N2 | USDC `0x754704Bc059F8C67012fEd69BC8A327a5aafb603` | `metric call`, `data 0x18160ddd` (totalSupply), `returns uint256`, `scale 6`, `at` 10 Oct 00:00 |
| N3 | WMON `0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A` | same, `scale 18` |
| N4 | `https://api.github.com/repos/category-labs/monad-bft/releases?per_page=100` (145 KB) | `select ""`, `aggregate count`, `filter [{/prerelease eq false}, {/draft eq false}]`; capture 12 Oct 00:00 to 12 Oct 12:00 |

Feed addresses come from Chainlink's published Monad mainnet directory; every feed updated within a minute of the check. `finalitySeconds 60` for all chain reads.

**Important:** the public Monad RPC keeps contract state for only a few days (a call at a block 7 days old failed, 3 days old worked). C1 to C4, N2 and N3 must capture within an hour of their `at` time: windows of 10 Oct 00:02 to 10 Oct 06:00, with the bot on its fast cadence. Block data (N1) is not affected.

### Pool 5 (NWS `api.weather.gov`)

`https://api.weather.gov/stations/KNYC/observations?start=2026-10-07T04:00:00Z&end=2026-10-08T04:00:00Z` (and KORD 05:00Z, KLAX 07:00Z, KMIA 04:00Z, the local midnight in each case). Reader: `select /features`, `aggregate max`, `field /properties/temperature/value`, `filter [{/properties/temperature/value gte -100}]` (drops missing readings, which are `null`). About 110 KB per day.

The question must say "highest temperature among the station's reported observations", not "official daily high": the hourly observations can miss the peak between reports, and the official climate report is a separate text product. Capture window: local day end plus 3 hours (the interval rule) to plus 30 hours. NWS refuses an empty User-Agent but accepts none; confirm the reader's request header with the rule check.

### Pool 6

| ID | Source URL | Reader settings |
|---|---|---|
| P1, P2 | `https://earthquake.usgs.gov/fdsnws/event/1/count?starttime=2026-10-03T12:00:00&endtime=2026-10-10T12:00:00&minmagnitude=6.5&format=geojson` (and 7.0) | `select /count`, `aggregate value`; Yes if at least 1 |
| P3, P4 | `https://kp.gfz.de/app/json/?start=2026-10-03T12:00:00Z&end=2026-10-10T11:59:59Z&index=Kp` | `select /Kp`, `aggregate max`, `field ""` (each item is the number); Yes if at least 5 (or 6) |

Capture 10 Oct 15:00 (interval end plus 3 hours) to 11 Oct 12:00. USGS returns `{"count": 0}` for a quiet week, so No is a real answer, not missing data. GFZ values in the window are preliminary; the first retained capture decides.

## Timeline

| Step | When (UTC) |
|---|---|
| Deploy Pool 1 | 2 Oct before 10:00 (the deploy script needs trading close at least one hour after deployment) |
| Deploy Pools 2 to 6 | 2 Oct, any time before 11:00 on 3 Oct |
| Trading closes | Pool 1: 2 Oct 11:30. Others: 3 Oct 12:00 |
| Last observation | N4 snapshot 12 Oct 12:00 |
| Last final answer | About 13 Oct 12:00 with 1 h assertion, challenge and voting periods |

## Pool 7: Brazil's presidential election (runoff structure)

Clément Lesaege (28 Sep) argued that the clearest need for joint pricing is a two-round election: which pair reaches the runoff, and who wins each possible runoff. Separate "who makes the runoff" and "who wins" markets can disagree with each other; one shared pool cannot, and the conditional value (who wins if they face X) is what voters and analysts actually want. This relaxes the earlier "no elections" constraint.

Brazil votes on 4 October (first round) with a runoff on 25 October if nobody takes a majority of valid votes ([2026 Brazilian general election](https://en.wikipedia.org/wiki/2026_Brazilian_general_election)). Thirteen candidates are registered. Late-September first-round polls ([polling summary](https://en.wikipedia.org/wiki/Opinion_polling_for_the_2026_Brazilian_presidential_election)): Lula 39 to 45%, Flávio Bolsonaro 34 to 42%, Caiado 2 to 4%, Zema 1 to 4%. Runoff polls Lula against Flávio Bolsonaro range from 43 to 49 for Bolsonaro and 42 to 43.5 for Lula; Lula against Caiado is tied.

| ID | Yes if | Reader | Est. P(Yes) |
|---|---|---|---|
| B1 | Lula finishes first in the 4 October first round | json-api (TSE) | 0.60 |
| B2 | The presidential election goes to a runoff (no candidate elected on 4 October) | json-api (TSE) | 0.85 |
| B3 | Flávio Bolsonaro qualifies for the runoff | json-api (TSE) | 0.80 |
| B4 | Lula is elected in the 25 October runoff | json-api (TSE), manual fallback | 0.42 |

Trading closes 4 October 10:00 UTC, before polls open (08:00 Brasília). B1 to B3 settle on the night of 4 October; B4 on 25 October, so the pool pays out about 27 October.

Useful combinations: "B2 AND B4" is Lula winning a runoff; "B1 AND NOT B4" is Lula leading the first round and losing; the pool's conditional "B4 given B3" is the Lula against Flávio runoff price that Clément's argument is about.

**Source.** The TSE official results feed is live for 2026: `https://resultados.tse.jus.br/oficial/comum/config/ele-c.json` (updated 30 Sep) lists the federal first round as election `6257` on 04/10/2026. Following the 2022 layout, the presidential file would be `https://resultados.tse.jus.br/oficial/ele2026/6257/dados-simplificados/br/br-c0001-e006257-r.json`; it returns 404 until counting starts, which the bot treats as "keep checking". In 2022 that file listed each candidate with name (`nm`), rank (`seq`), status (`st`: `Eleito`, `2º turno`, `Não eleito`) and percent counted (`pst`). Reader sketch for B3: `select /cand`, `aggregate count`, `filter [{/nm eq FLÁVIO BOLSONARO}, {/st eq 2º turno}]`, `checks [{/pst equals 100,00}]` so only a fully counted file is retained. Percentages use a decimal comma, so rules read statuses and ranks, never percentages.

**Risks.**
1. The 2026 file name and fields cannot be verified before election night: earlier files are archived and this year's by-election paths also return 404. If the layout differs, the bot captures nothing and the operator asserts each answer from the TSE result with its evidence, challengeable like any assertion.
2. The runoff election code is not published yet. The pattern (6257 federal first round, 6259 state, gaps at 6258 and 6260) suggests `6258`, but that is a guess, so B4 should be operator-asserted unless TSE publishes the code before trading closes. If there is no runoff, B4 resolves No by assertion from the first-round result.
3. Candidate names in the file must be matched exactly as TSE writes them (uppercase, accents); confirm on election night before the first capture or rely on the rank and status of the expected candidate.
4. Width limit: each question can be linked to at most two others through traded combinations. B4 with B2 and B3 uses its two links; a later B1 and B4 combination would be refused. That is acceptable here but matters for France below.

## France 2027 (design for a flagship pool, not for this wave)

Clément's own example: first round in April 2027, runoff two weeks later. The informative quantities are P(RN candidate wins given each possible opponent) and P(each bloc reaches the runoff). A pool would hold questions such as: RN candidate reaches the runoff; LFI candidate reaches the runoff; the Ensemble (centre) candidate reaches the runoff; RN candidate is elected. Then "RN elected given LFI in the runoff" against "RN elected given centre in the runoff" is exactly the comparison that changes tactical first-round voting.

Three constraints shape it:
1. **The width limit binds.** "Winner" naturally links to every possible opponent, but each question can link to at most two others. With four questions the winner question can be combined with two runoff-composition questions only. Either accept two named opponents per pool, or this is the first real case for raising the bound in the factored engine.
2. **Settlement.** Official results come from the Ministry of the Interior and the Conseil constitutionnel's proclamation; their 2027 URLs are not known yet, so the first version would be operator-asserted with evidence.
3. **Candidates are not declared**, so questions must name parties or blocs and define the nominee (for example "the candidate endorsed by the Rassemblement national"). French residents cannot legally bet on elections with real money; this pool is test assets only and should say so.

## Risks and checks before listing

1. **Run every rule through `apps/web/scripts/check-settlement-rule.mjs`** with its real close time. Expect `ok` or `not-yet-available`; any `already-public` or `source-error` blocks that market.
2. **Monad state pruning** (above): short capture windows for state reads, and the bot's fast cadence must cover 10 Oct 00:00.
3. **US data** (J1, J2, J3, J4, E1, E2) depends on no government shutdown. Today none: Treasury posted 30 Sep and the Labor Department released claims on 1 Oct. A lapse later would VOID these.
4. **J1 timing**: Pool 1 must be live before the Friday 12:30 release. If deployment slips, replace J1 with August-revised payrolls or drop Pool 1 to three questions.
5. **html-text (E1, E2)**: EIA's table layout can change; write each pattern so it matches only the newest U.S. value in its own table, and keep the anchors.
6. **GitHub API**: unauthenticated limit of 60 requests per hour per IP; the bot polls far less. The reth release list is 5.3 MB, over the 2 MB capture cap, so reth is not used.
7. **Nested pairs** (P1 and P2, P3 and P4): impossible combinations will price near zero; that is expected, and a good teaching example.
8. **Re-pull baselines on listing day** for J3, J4, E3, C1 to C4 and N2, N3, and move thresholds if a value has moved past them.
