# Research and model output

The research layer turns market questions into a validated forecast. It never builds, signs or sends transactions, and its output cannot change wallets, contracts, recipients, amounts, budgets or policies.

## Retrieval

A retriever returns evidence records: `{id, url, title, publisher, retrievedAt, publishedAt | null, contentSha256, excerpt}`. Retrieved text is untrusted data. It is passed to a model only inside clearly delimited data blocks, with instructions that the text is evidence to weigh and never instructions to follow. Evidence ids are assigned by the retriever, so a model can cite sources but cannot invent them.

## Model output (`flurbo.agent-model-forecast.v1`)

The model returns one JSON object, either as the whole reply or as the whole reply inside one fenced block (```` ```json ```` or ```` ``` ````). Anything else is malformed.

| Field | Type | Rule |
| --- | --- | --- |
| `schema` | string | `flurbo.agent-model-forecast.v1` |
| `abstain` | boolean | `true` ends validation with `model_abstained` |
| `abstainReason` | string or null | When abstaining: `insufficient_evidence`, `contradictory_evidence`, `stale_evidence`, `ambiguous_rules` or `other` |
| `events` | integers | The requested event indices, ascending |
| `statesPpm` | integers | One per local state (`2^events`), each 0 to 1,000,000, summing to 1,000,000 |
| `evidenceIds` | strings | Distinct ids of retrieved evidence |
| `assumptions` | strings | At most 8, each 3 to 300 characters |
| `uncertainty` | string | 3 to 600 characters |
| `explanation` | string | 10 to 1,200 characters |

No other fields are allowed. When `abstain` is true, only `schema`, `abstain`, `abstainReason` and optionally `explanation` are read.

## Validation order and outcomes

1. Not a single JSON object as above, unknown or missing fields, wrong types or lengths: `malformed_output`.
2. `abstain` is true: `model_abstained` (with the model's reason).
3. `events` differ from the requested events: `events_out_of_scope`.
4. Wrong number of states, a value out of range, or a sum other than 1,000,000: `invalid_distribution`.
5. No cited evidence: `no_evidence`. A cited id not retrieved: `unknown_evidence`.
6. No cited record is fresh (`now - (publishedAt or retrievedAt) <= maxEvidenceAgeSeconds`): `stale_evidence`.

Otherwise the output becomes a `flurbo.agent-forecast.v1` forecast with source `{kind: "provider", name: "{provider}/{model}"}` and evidence taken from the retrieval records, not from the model. Every failure is an abstention; the runtime never repairs model output.

Provider calls use a timeout, a bounded number of retries for transport errors only, and per-cycle and per-hour request budgets. A missing provider configuration is reported as `provider_not_configured`, never replaced by a fixed forecast. A fixture forecaster is always labelled as a fixture, never as AI.

Fixtures: `fixtures/research.json`.
