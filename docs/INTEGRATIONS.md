# Idea alignment and partner delivery

Source: `tmp/flurboidea.md`, read September 20, 2026, and the supplied `resources/`
files. This checklist preserves the idea's integrations; it is not evidence of
completed integration or verified eligibility. No end-to-end partner integration
is complete. [The September 21 readiness checkpoint](INTEGRATION_READINESS.md)
records successful public RPC, AUSD decimals and contract-presence checks on
Monad mainnet/testnet, plus Kuru and Mera source inspection. Alchemy account access,
real Kuru orders, and native mobile authentication remain unverified.
The user will provide the missing Agora, Mera, and community bounty details later.

The [factored pool's local lifecycle](FACTORED_POOL.md) now covers funded trades,
owner accounting and redemption, including 32-event tests. [Base-event
receipts](FACTORED_BASE_TOKENS.md) are now ported to factored scope/mask keys and
locally tested. The Kuru fork rehearsal and CRE adapters still target the
enumerated reference pool; porting those flows is an explicit remaining gate.

## Required integration milestones

| Partner / source | Role and completion evidence | Human input / verification still needed |
|---|---|---|
| Monad / `resources/general.txt` | On-chain cost function, verified deployments, gas measurements and full trade-to-redemption lifecycle | Funded deployment account and chosen network before live deployment |
| Agora / idea sections 8.0–8.1 | Expo/React Native app, Mera authentication, actual AUSD balance, pool collateral, trades and redemption on mobile | Full bounty text pending; verify supported network, official AUSD address, decimals and availability; physical-device validation |
| Kuru assets / `resources/kuru.txt` | Backed base-event ERC-20s, deployed pairs, order placement/cancel/fill, issuance/redemption trail, funded liquidity, customer and continuation evidence | Verify exact deployment/ABI and listing access; operator inventory/gas budget and maker introductions |
| Kuru consumer / `resources/kuru.txt` | Real Kuru trading in the product; target users, independent usage, acquisition/retention and continuation plan | User recruitment and actual usage evidence; never label team/keeper traffic as independent demand |
| Community team / idea section 8.4 | Correct Programming Club IIT Kanpur team identity and submission | Full criteria pending; user confirms eligibility, team roster and registration |
| Chainlink CRE / `resources/chainlink.txt` | Fetch/validate source-of-record observations and orchestrate cluster settlement; successful CRE CLI simulation or live workflow | Source and resolution rules; CRE access/configuration when required; verify receiver authentication and network before live reporting |
| Mera UX / idea section 8.6 | Consumer account layer: passkey onboarding, scoped sessions, real mobile trades, recovery and expiry behavior | Full criteria pending; relying-party domain and physical-device/passkey testing |
| Mera PRF / idea section 8.6 | Non-wallet use of derived material for position commitments, with a real recovery demonstration | Full criteria pending; specify durable storage/indexing and key derivation/domain separation; passkey alone cannot reconstruct history |
| MetaMask / `resources/metamask.txt` | Installable Agent Wallet plugin with quote/position/distribution flows, `skills/<name>/SKILL.md`, README, real-flow demo <=5 minutes | User wallet setup, policy/MFA and funding; verify supported Agent Wallet version; all plugin transactions must use its signing path |
| Envio / `resources/envio.txt` | Live derived marginal/conditional history, joint-state transitions, keeper activity, positions and realized maker PnL; published schema/handlers or HyperSync client, consuming app and demo | Token/hosting access when needed; validate replay, reorgs and RPC reconciliation; measured history does not prove a worst-case bound |
| Alchemy / `resources/alchemy.txt` | Monad RPC for keeper/client/simulation and settlement notifications where supported; evidence of actual service use | User configures credentials locally when required; verify webhook/network support before depending on it |
| Kimi (stretch) / `resources/kimi.txt` | Propose dependency structures from descriptions; deterministic width/trade-language validation and user review; working demo and article describing Kimi's contribution | API access and publishing approval when reached; model output never determines executable prices or bypasses structure validation |

Kuru is mandatory to the final two-tier product. CRE and the mobile/Mera/AUSD
path are planned work, not silently optional. Kimi stays stretch scope; any other
scope reduction must be raised with the user. Missing private keys or API tokens
must be configured locally, not requested in chat or written to the repository.

## Mechanism gates that preserve the idea honestly

- Enumeration is the small-state reference oracle. The factored engine must
  declare its supported graph width and securities and preserve them after every
  accepted update. Reject unsupported trades explicitly; a compact initial graph
  alone does not establish efficient updates.
- Conditional analytics and conditional trading are different deliverables.
  Specify payouts when the condition is false, collateral and fungibility first;
  do not present an AND token or a probability ratio as a completed conditional.
- For uniform fixed-b LMSR, initial ideal subsidy is `b * ln(N)` for `N` terminal
  states, not base events. Total outstanding payout liabilities can exceed this
  subsidy. Track collateral coverage separately and reserve for numerical error.
- Use executable Kuru prices, depth, fees and gas. A midpoint difference is not
  proof of executable profit. Base trades inform marginals, not all correlations.
- PRF material can recover a key; recover positions from durable data. Do not
  promise privacy of public transfers or history recovery without that data.

## Research and access notes

Read the two papers requested in the idea before the pricing slice. Reviewed
their mechanism and scope: [ParlayMarket](https://arxiv.org/html/2603.22596v2)
uses a shared pairwise model with learning/error analysis; its statistical loss
results are not our contract's collateral invariant.
[Toward Black–Scholes](https://arxiv.org/html/2510.15205v1) studies a logit
jump-diffusion kernel and risk/calibration tools, not a replacement implementation
of our LMSR. We claim neither invention of LMSR nor absence of prior combinatorial makers.

[Pennock and Xia](https://arxiv.org/abs/1202.3756) characterize structure-preserving
securities. This motivates explicit closure checks in the factored milestone.
[Kuru market deployment docs](https://docs.kuru.io/sdk/deploy-market) describe
Router deployment for ERC-20 pairs; docs alone do not prove our intended network,
wrapper, liquidity configuration or frontend listing is operational. The supplied
bounty's testnet documentation should also be checked during that spike.

No deployment, listing, sponsor message, or submission has been performed.
