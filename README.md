# Flurbo

An on-chain combinatorial market maker for prediction markets: one shared
liquidity pool that coherently prices multi-leg claims through a deterministic
cost function, with tradable conditional claims as a planned extension.

## Product direction

This README records the user's reaffirmed direction and takes precedence over
the routing-first positioning in [the competition strategy](FLURBO_COMPETITION_STRATEGY.md).
That document remains a reference for supporting integrations. The accounting
and numerical-safety requirements in [the mechanism review](FLURBO_REVIEW_AND_BUILD_PLAN.md)
still apply.

- **One shared pool per event cluster:** base and composed claims draw on the
  same funded liquidity and joint-state liability ledger. Composing a new claim
  inside that cluster does not require funding a separate pool.
- **Coherent multi-leg pricing:** arbitrary AND/OR/NOT combinations within the
  supported event set compile to canonical payoffs and use the same cost function.
  Begin with two events, then three; unlimited event counts are not an MVP promise.
- **On-chain execution:** contracts compute and enforce executable pool prices
  from current state, with user slippage limits. Rust supplies reference calculations
  and simulations. Trading against the pool must work without RFQ responses or Kuru.
- **Conditional claims remain on the roadmap:** displaying `P(A | B)` alone does
  not implement a tradable claim. First specify the payout/collateral behavior
  when B is false, fungibility, and settlement; then prove accounting and implement
  it as a separate milestone. Phase 1 covers Boolean claims only.
- **Kuru supports the core:** external liquidity and optional routing can improve
  execution, while the shared market maker remains the primary mechanism.

The first end-to-end gate is a funded on-chain pool that quotes, buys, sells,
and settles base and multi-leg claims from the same state while preserving
collateral coverage. Kuru integration follows that gate.

## Current phase

Phase 1 implements a dependency-free Rust payoff algebra. It supports one to
three binary events, canonical terminal-state masks, Boolean composition, and
validation of two-child split/merge identities. It does not execute trades yet.

Event `i` is bit `i` of the terminal-state index. Bit `x` of a claim mask is
its payout in terminal state `x`. For two events, A is `0b1010`, B is `0b1100`,
and A AND B is `0b1000`. Equivalent expressions produce the same mask.
Constant claims are allowed during algebra but rejected by `validate_tradable`.
Masks describe payoffs only: future ledger keys must also identify the cluster
and its event definitions, collateral, resolver, and settlement rules.

Run from the repository root:

```sh
cargo test --workspace
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
```

## Build phases

Each phase is a milestone made of small commits. Keep each commit focused on
one behavior with its relevant checks; finish and review a phase before starting
the next. Record completed work here.

1. **Payoff foundation:** workspace, masks, Boolean operations, partition
   validation, and exhaustive conservation tests.
2. **Reference pricing and accounting:** stable exact-state LMSR, owned inventory,
   liability tracking, and independent numerical fixtures. Separate commits for
   pricing and accounting; floating-point results are reference calculations only.
3. **Contracts:** ledger first, then funded pool and bounded arithmetic, followed
   by settlement/redemption. Gate: direct on-chain base and multi-leg trading,
   coherent quotes, conservation, and collateral coverage through settlement.
4. **Supporting Kuru execution:** split/merge, wrappers, compatibility spike,
   bounded Rust route candidates, then atomic executor. Gate: a real parent purchase delivers the exact child claim,
   sells the residual, and respects gross funding and net-spend constraints.
5. **Product:** scenario entry and quotes, then Envio positions and execution
   receipts, followed by settlement UI. Start with two events; expand to three
   after the full lifecycle works.
6. **Evidence and release:** reproducible route comparisons, failure cases,
   usability feedback, and deployment/demo instructions. CRE remains optional.

Separate extension milestone: specify and implement tradable conditional claims,
with explicit false-condition settlement and verified collateral accounting.
The Boolean MVP does not complete this part of the longer-term product vision.

Next slice: reference pricing and deterministic quote fixtures.
