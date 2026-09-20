# Flurbo

Scenario execution through a shared prediction pool and related Kuru markets.
The product direction is recorded in [the revised strategy](FLURBO_COMPETITION_STRATEGY.md).

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
3. **Contracts:** ledger and split/merge first, then funded pool and bounded
   arithmetic, wrappers, and settlement/redemption. Verify conservation and
   collateral coverage before integrating execution.
4. **Kuru execution:** compatibility spike, bounded Rust route candidates, then
   atomic executor. Gate: a real parent purchase delivers the exact child claim,
   sells the residual, and respects gross funding and net-spend constraints.
5. **Product:** scenario entry and quotes, then Envio positions and execution
   receipts, followed by settlement UI. Start with two events; expand to three
   after the full lifecycle works.
6. **Evidence and release:** reproducible route comparisons, failure cases,
   usability feedback, and deployment/demo instructions. CRE remains optional.

Next slice: reference pricing and deterministic quote fixtures.
