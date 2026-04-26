# Backend Agent Design

## Architecture Overview

FieldDesk uses a TypeScript / Next.js API with a controlled agent workflow. The stable MVP path is a live model synthesis pass over controlled artifacts, followed by deterministic verification and schema validation. The backend also includes an explicit autonomous tool-loop mode for technical review: `FIELD_DESK_AGENT_MODE=tool-loop`.

### Key Components

1.  **FieldDesk Agent Adapter**: The OpenRouter adapter asks the model to reason over the current run's available artifacts and return structured `FieldDeskAgentObjectOutput`.
2.  **Fixture-Backed Tools**: Typed local tools (`src/lib/agent-tools/`) expose the future connector boundary for Outlook, SharePoint, GSA, policy references, and uploaded corrections. These tools enforce selected-source and staged-correction availability.
3.  **Deterministic Verification**: Math-heavy and policy-sensitive logic, especially per diem calculation, is handled by code (`src/lib/deterministic-rules.ts`), not by the LLM.
4.  **Autonomous Tool Loop**: In `tool-loop` mode, the model chooses one action at a time, the API validates tool arguments, executes fixture tools, appends observations to `AgentRunState`, and rejects premature finish attempts until minimum evidence has been collected.
5.  **Agent Trace**: Runs include an `agentTrace` that describes the operational phases of the run. In `tool-loop` mode this trace is built from actual tool decisions and observations.
6.  **Evaluation Framework**: `scripts/eval-fielddesk.ts` compares agent output against golden datasets using exact checks and LLM-as-a-judge.

## Reasoning vs. Verification

FieldDesk explicitly separates reasoning from verification:
- **Reasoning (Model-owned)**: The agent extracts structured `TripFacts`, identifies evidence gaps, and synthesizes readiness assessments.
- **Verification (Code-owned)**: The system verifies per diem math and policy alignment using deterministic rules after the model produces its initial analysis.

## Workflow Sequence

1.  **Intent Capture**: User provides mission intent and selects sources.
2.  **Context Construction**: The API builds source and correction context from selected sources and staged issue resolutions.
3.  **Tool Selection**: In `tool-loop` mode, the model chooses the next tool call or asks to finish.
4.  **Tool Execution**: The API validates arguments and executes only fixture-backed tools with source/correction access controls.
5.  **Observation Update**: Tool observations are appended to `AgentRunState` and exposed in the run trace.
6.  **Final Synthesis**: The model returns `FieldDeskAgentObjectOutput` using only collected observations.
7.  **Deterministic Verification**: The adapter verifies per diem math from structured `TripFacts` and fixture GSA rates.
8.  **Validation**: The final run is converted into the UI-compatible shape and validated before returning.

## Agent Loop

`FIELD_DESK_AGENT_MODE=tool-loop` runs this bounded loop:

1.  Agent chooses a tool call.
2.  API validates tool arguments.
3.  API executes fixture-backed tools with source/correction access controls.
4.  Observation is appended to `AgentRunState`.
5.  The loop repeats until the model returns `finish` or max steps is reached.
6.  Final synthesis returns `FieldDeskAgentObjectOutput` and passes the same validation/evals as the current OpenRouter adapter.

## Evaluation Strategy

Technical defensibility is maintained through:
- **Golden Scenarios**: The `demo_tdy` scenario serves as the primary baseline.
- **Exact Checks**: Verifying specific fields like `startDate`, `endDate`, and `estimatedTotal`.
- **Judge Eval**: Using a separate LLM to grade the reasoning quality and groundedness of the output.
