# FieldDesk TODO

Goal: keep the hackathon demo reliable while making the backend credible to technical judges. FieldDesk should stay agent-first: the model handles semantic extraction and workflow reasoning; code handles source access, schema validation, arithmetic, and auditability.

## Completed

- [x] Build the TypeScript / Next.js `/api/agent-runs` route.
- [x] Preserve `FIELD_DESK_AGENT_MODE=mock` as deterministic fallback.
- [x] Preserve `FIELD_DESK_AGENT_MODE=openai` for live OpenRouter runs.
- [x] Validate agent run requests and responses.
- [x] Keep `.env` ignored.
- [x] Use static fixture sources for Outlook, SharePoint, GSA, JTR, Unit Checklist, Local SOP, and uploaded corrections.
- [x] Add object-native agent output alongside legacy UI table fields.
- [x] Add `TripFacts` to object output:
  - `destination`
  - `locality`
  - `startDate`
  - `endDate`
  - `travelers`
  - `evidenceArtifactIds`
  - `confidence`
  - `rationale`
- [x] Remove regex date parsing from deterministic per diem math.
- [x] Make deterministic per diem math consume structured `TripFacts`.
- [x] Add runtime validation for ISO dates, positive traveler counts, and date order.
- [x] Add fixture-backed typed tools:
  - `searchSource`
  - `readArtifact`
  - `lookupGsaRate`
  - `calculatePerDiem`
  - `retrievePolicyReference`
- [x] Enforce source selection and correction state in fixture tools.
- [x] Add `agentTrace` types and include trace on run/envelope responses.
- [x] Add mock trace steps for demo-critical phases.
- [x] Update evals to check structured `tripFacts`.
- [x] Add deterministic math tests.
- [x] Add fixture tool tests.
- [x] Add backend architecture design doc.

## Current MVP Hardening

- [x] Make `agentTrace` required in `validateAgentRunOutput`.
- [x] Add exact eval checks for trace phases:
  - source search
  - per diem calculation
  - final synthesis
- [x] Add eval checks for deterministic per diem output:
  - total includes `$7,340`
  - summary includes `4 nights`
  - summary includes `5 travel days`
  - `mathVerified === true`
- [ ] Audit OpenRouter normalization so it never fabricates evidence that should fail validation.
- [ ] Add tests for missing/disabled sources:
  - [ ] GSA disabled means no math verification.
  - [ ] SharePoint disabled means no training order/roster evidence.
  - [x] corrected roster is unavailable before roster correction.
  - [x] funding memo is unavailable before funding correction.
- [ ] Add API failure-mode tests:
  - malformed request
  - unsupported mode
  - missing API key in OpenRouter mode
  - malformed model output

## Autonomous Agent Loop

The repo is not yet using a true model-driven tool loop in the active API path. Do not mark this complete until `/api/agent-runs` can exercise it behind an explicit mode and the output passes the same validation/evals as the current adapter.

- [ ] Add `FIELD_DESK_AGENT_MODE=tool-loop`.
- [ ] Define `AgentRunState`:
  - input
  - selected sources
  - observations
  - artifacts read
  - trip facts
  - per diem verification
  - policy references
  - evidence map draft
  - open issues
  - trace
- [ ] Add model decision schema:
  - `tool_call`
  - `finish`
- [ ] Validate tool arguments before execution.
- [ ] Execute tools only through the fixture tool context.
- [ ] Enforce max steps.
- [ ] Synthesize `FieldDeskAgentObjectOutput`, then convert through the same adapter path as OpenRouter mode.
- [ ] Add tests:
  - loop cannot exceed max steps
  - invalid tool args fail closed
  - unavailable artifacts cannot be read
  - final output passes `validateAgentRunOutput`

## Demo Verification

- [x] Run full local suite:
  - [x] `npm run lint`
  - [x] `npm run build`
  - [x] `npm run test:api`
  - [x] `npm run test:rules`
  - [x] `npm run test:tools`
  - [x] `npm run test:e2e`
  - [x] `npm run eval:mock`
  - [x] `npm run eval:openrouter`
- [ ] Start the app on `localhost:3000`.
- [ ] Capture screenshots for each screen.
- [ ] Verify:
  - top classification banner only
  - no bottom banner
  - source rows show all selected sources
  - Agent Run loading state advances during latency
  - corrected run changes readiness appropriately
  - per diem shows deterministic verification
  - citations/policy references are visible

## Defer Until After Demo

- [ ] Real Outlook OAuth.
- [ ] Real SharePoint Graph integration.
- [ ] Live GSA API integration.
- [ ] Durable database persistence.
- [ ] RBAC/auth.
- [ ] Prompt caching.
- [ ] Full external agent framework migration.
- [ ] Multi-scenario generalized workflow library.
