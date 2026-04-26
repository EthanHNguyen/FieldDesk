# FieldDesk TODO

## Backend API Readiness

- [ ] Introduce workflow session and agent run concepts.
  - `WorkflowSession`: full user journey.
  - `AgentRun`: one recomputation over current session state.
  - `CorrectionEvent`: user action that changes evidence or assumptions.
- [ ] Add run envelope fields:
  - `sessionId`
  - `runId`
  - `previousRunId`
  - `mode`
  - `trigger`
  - `status`
  - `createdAt`
  - `input`
  - `output`
  - `events`
- [ ] Refactor `/api/agent-runs` into:
  - request validation
  - session/input loader
  - agent dispatcher
  - adapter call
  - response validation
  - structured error response
- [ ] Add adapter files:
  - `src/lib/agent-adapters/mock-agent.ts`
  - `src/lib/agent-adapters/openai-agent.ts`
  - `src/lib/agent-adapters/run-agent.ts`
- [ ] Preserve `FIELD_DESK_AGENT_MODE=mock` as deterministic fallback.
- [ ] Add `FIELD_DESK_AGENT_MODE=openai` only after schemas and evals are in place.

## Schemas And Contracts

- [ ] Replace tuple-heavy backend outputs with object schemas.
- [ ] Add schema validation for both request and response.
- [ ] Define core output schemas:
  - `EvidenceMap`
  - `GapFinding`
  - `ConflictFinding`
  - `ReviewerObjection`
  - `ReadinessAssessment`
  - `GeneratedWorkProduct`
- [ ] Add citation/source references to evidence items.
- [ ] Add confidence and rationale fields where useful.
- [ ] Improve client error handling so API validation, unsupported mode, model failure, and malformed output are distinguishable.

## Golden Dataset And Evals

- [ ] Create `evals/golden/demo_tdy/`.
- [ ] Add golden scenario files:
  - `input.json`
  - `sources/outlook_messages.json`
  - `sources/sharepoint_documents.json`
  - `sources/gsa_per_diem_fixture.json`
  - `sources/jtr_excerpt.md`
  - `sources/unit_checklist.md`
  - `sources/local_sop.md`
  - `sources/uploaded_documents.json`
  - `expected_initial_output.json`
  - `corrections.json`
  - `expected_corrected_output.json`
  - `rubric.json`
- [ ] Evaluate initial run facts:
  - Demo Training Site destination.
  - June 10-14 dates.
  - 10 travelers.
  - approval email found.
  - training order found.
  - `roster_v2.csv` found.
  - GSA per diem found.
  - JTR references found.
  - funding source missing.
  - traveler count conflict detected.
  - rental vehicle justification weak.
  - readiness score near 72.
  - risk is High.
  - reviewer objections include funding and traveler count.
- [ ] Evaluate corrected run facts:
  - `roster_v3_corrected.csv` accepted.
  - `funding_memo.pdf` accepted.
  - rental vehicle justification accepted.
  - traveler count resolved.
  - funding found.
  - rental vehicle improved.
  - readiness score near 91.
  - risk is Low.
  - final work product includes packet summary, action list, reviewer notes, source list.
- [ ] Use exact checks for IDs/statuses/facts.
- [ ] Use range checks for readiness score.
- [ ] Use contains checks for prose.
- [ ] Avoid exact prose matching for model-generated summaries.

## Testing

- [ ] Add unit tests for the mock agent adapter.
- [ ] Add API route tests for valid and invalid `/api/agent-runs` requests.
- [ ] Add tests for unsupported `FIELD_DESK_AGENT_MODE`.
- [ ] Add response schema validation tests.
- [ ] Add agent contract tests shared by mock and OpenAI adapters.
- [ ] Add failure-mode tests:
  - malformed request
  - malformed model output
  - missing API key
  - unsupported mode
  - model timeout
- [ ] Extend Playwright only for demo-critical paths.

## LLM Agent Integration

- [ ] Implement OpenAI adapter behind the dispatcher.
- [ ] Keep connectors mocked.
- [ ] Pass controlled mock source context to the agent.
- [ ] Require structured output.
- [ ] Validate model output before returning to UI.
- [ ] Keep mock mode as test oracle and fallback.

## Demo Polish

- [ ] Make the activity feed match the PRD demo script.
- [ ] Make the value moment obvious: FieldDesk catches avoidable administrative failure before review.
- [ ] Ensure final work product includes:
  - evidence map
  - readiness report
  - gap summary
  - conflict summary
  - reviewer questions
  - human action list
  - packet summary
  - rental vehicle justification
  - per diem estimate
  - source list
  - final routing checklist
- [ ] Keep real Outlook, SharePoint, GSA, DTS, auth, and RBAC out of scope for MVP.
