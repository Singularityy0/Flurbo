# Funded factored pool: local execution milestone

`FactoredPool` now joins the bounded factored cost function, conservative quotes,
exact maximum liabilities, per-owner holdings, real ERC-20 transfers, and final
redemption. This is one shared pool for one immutable cluster. Tests deploy it
locally with mock collateral and synthetic outcomes; no public deployment or
real-asset use has been performed or approved.

## Five reviewable pieces

1. `FactoredPositions`: exact uint128 holdings keyed by owner and `(scope, mask)`.
   Credits and debits are internal to the calling pool. Matching aggregate
   liability does not authorize another owner's sale or redemption.
2. `FactoredFunding`: immutable collateral, precision, b, event count, close time
   and elimination order; one-time conservative initial funding, exact transfers,
   reentrancy protection and balance coverage checks. This layer is abstract.
3. `FactoredTrading`: stored factor tables, live execution-time quotes, inclusive
   slippage limits and deadlines, owner debits/credits and cached exact maximum
   liability. This layer is also abstract and is not a standalone deployable pool.
4. `FactoredPool`: the concrete contract adds immutable resolver/rules, one-time
   finalization and partial or full redemption of winning and losing claims.
5. End-to-end adversarial tests and documentation check these pieces together.

## Creation and funding

The constructor takes `(token, eventCount, liquidity, closesAt, eliminationOrder,
resolver, settlementRulesHash)`. It accepts the existing 1–32 event, width-at-most-2
domain and a complete fixed order. The initial factor set is empty, representing
a uniform prior with zero outstanding claims. Dependencies can be added by
supported trades only while the declared order remains within its width bound.
The immutable rules hash must commit the intended event definitions and outcome
rules; the contract cannot verify their meaning. Resolver and rules must be nonzero.

`requiredFunding` rounds the initial upper cost enclosure into collateral atoms,
covering the ideal `b*eventCount*ln(2)` subsidy. Anyone can supply this exact amount
once before close. This contribution creates no LP receipt, refund, withdrawal or
profit entitlement. Direct donations do not activate trading and create no rights.
There is no administrative balance-withdrawal path in this implementation.

## Shared trading and collateral coverage

`buy` and `sell` take scope, local payoff mask, quantity, an inclusive collateral
limit, and deadline. Quantities and payouts use collateral atoms. One winning
claim atom pays one collateral atom. The scope/mask language and conservative
exact-scope selling restriction follow [factored quotes](FACTORED_QUOTES.md).
The pool stores the quotes' resulting factors and their exact maximum liability;
there is no enumeration of all global outcomes in execution.

Quotes are views, not reservations. Execution reads stored state and recomputes
the quote. Sales require the caller's exact claim holdings; another scope or a
logically equivalent claim cannot replace them. A sell debits ownership before
quote evaluation, but any failure reverts the entire operation. Funded state,
closing time, deadline, and coverage are checked before trading. Coverage is also
checked after transfers and liability updates.

Every accepted transfer must change both pool and counterparty balances by the
signed amount. False-return, reverting, receiver-tax and extra-sender-fee tokens
are rejected; exact-transfer tokens that return no value are supported through
SafeERC20. All fund/trade/resolve/redeem mutations share one reentrancy guard.

## Resolution and redemption

After close, only the immutable trusted resolver can submit a uint32 terminal
state, once. Bits outside the cluster are rejected. Resolution evaluates the
stored factors at that single outcome and switches required collateral from the
maximum over all outcomes to the actual remaining winning payout. Resolution
does not transfer assets and is allowed during a shortfall; it cannot conceal
an uncovered actual winning payout.

Redemption burns caller-owned units and subtracts them from every winning entry
of the corresponding local factor. A winning claim pays exactly its quantity;
a losing claim burns without any token transfer. Partial redemption is allowed,
and total redemption can exceed the per-trade quantity cap. Coverage must hold
before and after redemption, protecting remaining winners from a first-mover
withdrawal during a shortfall. No more trading is possible after close.

Before resolution, the cached maximum is updated only from the exact evaluator
on an accepted trade. After resolution, remaining payout decreases only by actual
winning redemption amounts; the old unresolved maximum is no longer used.
There are no extra credit, factor mutation, mint, or payout entry points.

## Evidence and remaining gates

Tests independently reconstruct terminal liabilities from all tracked owners'
holdings after mixed buys, sales and redemptions. They compare that result with
stored factors and required collateral, including overlaps and partial sales.
Adversarial tests snapshot holdings, factors, balances, allowances, supply and
resolution state around failures; verify rollback, callbacks, no-return tokens,
losing burns, stale limits, and shortfall recovery. Precision checks cover
0/6/18 decimals, and a 32-event lifecycle exercises event 31 through redemption.

With solc 0.8.28 and 200 optimizer runs, the local concrete runtime is 19,196
bytes. The 32-event lifecycle test used about 6.80 million gas including deployment,
funding, one trade and redemption; it is not a dense-graph trade benchmark.
Large graph execution remains expensive and requires optimization and explicit
deployment gas limits. Run `forge test` and `forge fmt --check` before committing.
The [first gas optimization](FACTORED_GAS.md) reduces the two large-graph quote
benchmarks by about 29% and 34% while preserving their complete outputs.

The existing enumerated `ReferencePool`, its base-event receipts, Kuru fork
rehearsal and CRE receiver remain separate reference integrations. Their adapters
must be ported to factored scope/mask keys and uint32 outcomes before claiming
this pool completes those partner flows. Kuru anchoring, actual conditional
securities, mobile/Mera/AUSD trades, Envio indexing, deployment verification and
the other [partner milestones](INTEGRATIONS.md) remain required. Missing bounty
criteria and the passkey domain still require user input when those steps resume.
