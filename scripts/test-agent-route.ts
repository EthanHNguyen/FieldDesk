import assert from "node:assert/strict";
import { POST } from "../src/app/api/agent-runs/route";
import type { AgentRunApiResponse, AgentRunInput } from "../src/lib/fielddesk-types";

const input: AgentRunInput = {
  intent: "Send 10 soldiers to Demo Training Site for training from June 10-14. Lodging and rental vehicles required.",
  selectedSources: ["Outlook", "SharePoint", "GSA", "JTR", "Unit Checklist", "Local SOP"],
  resolutions: {
    roster: false,
    funding: false,
    justification: false
  },
  vehicleJustification: ""
};

async function main() {
  const originalMode = process.env.FIELD_DESK_AGENT_MODE;
  const originalKey = process.env.OPENROUTER_API_KEY;
  const originalMockContent = process.env.FIELD_DESK_TEST_OPENROUTER_CONTENT;

  try {
    process.env.FIELD_DESK_AGENT_MODE = "mock";
    const invalid = await postJson({ trigger: "invalid", input });
    assert.equal(invalid.status, 400);
    const invalidBody = await invalid.json() as AgentRunApiResponse;
    assert.equal(invalidBody.ok, false);
    if (!invalidBody.ok) assert.equal(invalidBody.error.code, "invalid_request");

    process.env.FIELD_DESK_AGENT_MODE = "unsupported";
    const unsupported = await postJson({ sessionId: "test", input });
    assert.equal(unsupported.status, 501);
    const unsupportedBody = await unsupported.json() as AgentRunApiResponse;
    assert.equal(unsupportedBody.ok, false);
    if (!unsupportedBody.ok) assert.equal(unsupportedBody.error.code, "unsupported_agent_mode");

    process.env.FIELD_DESK_AGENT_MODE = "openai";
    delete process.env.OPENROUTER_API_KEY;
    const missingKey = await postJson({ sessionId: "test", input });
    assert.equal(missingKey.status, 500);
    const missingKeyBody = await missingKey.json() as AgentRunApiResponse;
    assert.equal(missingKeyBody.ok, false);
    if (!missingKeyBody.ok) {
      assert.equal(missingKeyBody.error.code, "agent_run_failed");
      assert.match(missingKeyBody.error.message, /OPENROUTER_API_KEY/);
    }

    process.env.FIELD_DESK_AGENT_MODE = "openai";
    process.env.OPENROUTER_API_KEY = "test-key";
    process.env.FIELD_DESK_TEST_OPENROUTER_CONTENT = JSON.stringify({
      mission: {
        workflow: "TDY Travel",
        destination: "Demo Training Site",
        dates: "June 10-14",
        travelers: "10"
      }
    });
    const malformedOutput = await postJson({ sessionId: "test", input });
    assert.equal(malformedOutput.status, 502);
    const malformedOutputBody = await malformedOutput.json() as AgentRunApiResponse;
    assert.equal(malformedOutputBody.ok, false);
    if (!malformedOutputBody.ok) assert.equal(malformedOutputBody.error.code, "invalid_agent_output");

    console.log("FieldDesk route failure-mode tests passed.");
  } finally {
    restoreEnv("FIELD_DESK_AGENT_MODE", originalMode);
    restoreEnv("OPENROUTER_API_KEY", originalKey);
    restoreEnv("FIELD_DESK_TEST_OPENROUTER_CONTENT", originalMockContent);
  }
}

function postJson(body: unknown) {
  return POST(new Request("http://localhost/api/agent-runs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  }));
}

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
