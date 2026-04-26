# FieldDesk TODO

## Backend API Readiness

- [x] Introduce workflow session and agent run concepts.
  - `WorkflowSession`: full user journey.
  - `AgentRun`: one recomputation over current session state.
  - `CorrectionEvent`: user action that changes evidence or assumptions.
- [x] Add run envelope fields:
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
- [x] Refactor `/api/agent-runs` into:
  - request validation
  - session/input loader
  - agent dispatcher
  - adapter call
  - response validation
  - structured error response
- [x] Add adapter files:
  - `src/lib/agent-adapters/mock-agent.ts`
  - `src/lib/agent-adapters/openai-agent.ts`
  - `src/lib/agent-adapters/run-agent.ts`
- [x] Preserve `FIELD_DESK_AGENT_MODE=mock` as deterministic fallback.
- [x] Add `FIELD_DESK_AGENT_MODE=openai` adapter path.

## Schemas And Contracts

- [x] Add object-native backend output alongside legacy UI fields.
- [x] Add schema validation for both request and response.
- [x] Define core output schemas:
  - `EvidenceMap`
  - `GapFinding`
  - `ConflictFinding`
  - `ReviewerObjection`
  - `ReadinessAssessment`
  - `GeneratedWorkProduct`
- [x] Add citation/source references to evidence items.
- [x] Add confidence and rationale fields where useful.
- [x] Improve client error handling so API validation, unsupported mode, model failure, and malformed output are distinguishable.

## Golden Dataset And Evals

- [x] Create `evals/golden/demo_tdy/`.
- [x] Add golden scenario files:
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
- [x] Evaluate initial run facts:
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
- [x] Evaluate corrected run facts:
  - `roster_v3_corrected.csv` accepted.
  - `funding_memo.pdf` accepted.
  - rental vehicle justification accepted.
  - traveler count resolved.
  - funding found.
  - rental vehicle improved.
  - readiness score near 91.
  - risk is Low.
  - final work product includes packet summary, action list, reviewer notes, source list.
- [x] Use exact checks for IDs/statuses/facts.
- [x] Use range checks for readiness score.
- [x] Use contains checks for prose.
- [x] Avoid exact prose matching for model-generated summaries.

## Testing

- [x] Add unit tests for the mock agent adapter.
- [x] Add API contract tests for valid and invalid agent run requests.
- [x] Add tests for unsupported `FIELD_DESK_AGENT_MODE`.
- [x] Add response schema validation tests.
- [ ] Add agent contract tests shared by mock and OpenAI adapters.
- [ ] Add failure-mode tests:
  - malformed request
  - malformed model output
  - missing API key
  - unsupported mode
  - model timeout
- [ ] Extend Playwright only for demo-critical paths.

## LLM Agent Integration

- [x] Implement OpenAI adapter behind the dispatcher.
- [x] Keep connectors mocked.
- [x] Pass controlled mock source context to the agent.
- [x] Require structured output.
- [x] Validate model output before returning to UI.
- [x] Keep mock mode as test oracle and fallback.

## Demo Polish

- [ ] Make the activity feed match the PRD demo script.
- [x] Make the value moment obvious: FieldDesk catches avoidable administrative failure before review.
- [x] Ensure final work product includes:
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
- [x] Keep real Outlook, SharePoint, GSA, DTS, auth, and RBAC out of scope for MVP.
