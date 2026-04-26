import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runAgent } from "../src/lib/agent-adapters/run-agent";
import type { AgentMode, AgentRunInput, FieldDeskAgentRun, Status } from "../src/lib/fielddesk-types";

type ExpectedOutput = {
  mission?: {
    destination?: string;
    dates?: string | string[];
    travelers?: string;
  };
  readiness: {
    score: {
      min: number;
      max: number;
    };
    risk: "High" | "Low";
  };
  requiredEvidenceStatuses: Record<string, Status | Status[]>;
  requiredIssueStatuses: Record<string, Status | Status[]>;
  requiredReviewerConcepts?: string[];
  requiredExportValues?: string[];
  forbiddenEvidenceRefs?: string[];
  requiredEvidenceRefs?: string[];
};

const scenarioDir = join(process.cwd(), "evals", "golden", "demo_tdy");
const mode = parseMode(process.argv[2]);
const useJudge = process.argv[3] === "judge";

async function main() {
  loadDotEnv();

  const input = readJson<AgentRunInput>("input.json");
  const corrections = readJson<AgentRunInput["resolutions"]>("corrections.json");
  const expectedInitial = readJson<ExpectedOutput>("expected_initial_output.json");
  const expectedCorrected = readJson<ExpectedOutput>("expected_corrected_output.json");

  const initial = await runAgent(mode, input);
  const corrected = await runAgent(mode, {
    ...input,
    resolutions: corrections
  });

  if (useJudge) {
    await judgeRuns({ input, corrections, initial, corrected, expectedInitial, expectedCorrected });
  } else {
    assertRun("initial", initial, expectedInitial);
    assertRun("corrected", corrected, expectedCorrected);
  }

  console.log(`FieldDesk golden eval passed in ${mode}${useJudge ? " judge" : ""} mode.`);
}

async function judgeRuns(payload: {
  input: AgentRunInput;
  corrections: AgentRunInput["resolutions"];
  initial: FieldDeskAgentRun;
  corrected: FieldDeskAgentRun;
  expectedInitial: ExpectedOutput;
  expectedCorrected: ExpectedOutput;
}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_JUDGE_MODEL ?? process.env.OPENROUTER_MODEL ?? "openai/gpt-5.5";

  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured for judge eval.");

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost:3000",
      "X-Title": "FieldDesk Eval Judge"
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are an exacting evaluator for FieldDesk. Judge whether the agent output satisfies the TDY workflow rubric. Prefer factual correctness over wording. Do not require exact prose. Return only JSON."
        },
        {
          role: "user",
          content: JSON.stringify({
            rubric: readJson("rubric.json"),
            task:
              "Grade the initial and corrected FieldDesk agent outputs. The initial run must not use funding_memo or roster_v3_corrected as evidence. The corrected run should use them. The model may choose its own score calibration if risk/status reasoning is coherent.",
            expectedInitial: payload.expectedInitial,
            expectedCorrected: payload.expectedCorrected,
            input: payload.input,
            corrections: payload.corrections,
            outputs: {
              initial: payload.initial,
              corrected: payload.corrected
            }
          })
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "fielddesk_eval_judgment",
          strict: false,
          schema: judgeSchema
        }
      }
    })
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Judge request failed with status ${response.status}${detail ? `: ${detail}` : ""}`);
  }

  const completion = await response.json() as OpenRouterChatCompletion;
  const content = completion.choices?.[0]?.message?.content;
  if (!content) throw new Error("Judge response did not include message content.");

  const judgment = JSON.parse(content) as JudgeResult;
  if (judgment.score < 0.8) {
    throw new Error(`Judge eval failed: score=${judgment.score}; findings=${judgment.findings.join(" | ")}`);
  }

  console.log(`Judge score: ${judgment.score}`);
  for (const finding of judgment.findings) console.log(`- ${finding}`);
}

function assertRun(label: string, run: FieldDeskAgentRun, expected: ExpectedOutput) {
  if (expected.mission?.destination) assertContains(`${label} mission.destination`, run.mission.destination, expected.mission.destination);
  if (expected.mission?.dates) assertContainsAny(`${label} mission.dates`, run.mission.dates, Array.isArray(expected.mission.dates) ? expected.mission.dates : [expected.mission.dates]);
  if (expected.mission?.travelers) assertContains(`${label} mission.travelers`, run.mission.travelers, expected.mission.travelers);

  assertRange(`${label} readiness.score`, run.readiness.score, expected.readiness.score.min, expected.readiness.score.max);
  assertEqual(`${label} readiness.risk`, run.readiness.risk, expected.readiness.risk);

  for (const [requirement, status] of Object.entries(expected.requiredEvidenceStatuses)) {
    const item = run.evidenceMap.find(([name]) => name === requirement);
    assertDefined(`${label} evidence ${requirement}`, item);
    assertOneOf(`${label} evidence ${requirement} status`, item[3], Array.isArray(status) ? status : [status]);
  }

  for (const [issueId, status] of Object.entries(expected.requiredIssueStatuses)) {
    const issue = run.issues.find((candidate) => candidate.id === issueId);
    assertDefined(`${label} issue ${issueId}`, issue);
    assertOneOf(`${label} issue ${issueId} status`, issue.status, Array.isArray(status) ? status : [status]);
  }

  for (const concept of expected.requiredReviewerConcepts ?? []) {
    assertContains(`${label} reviewer concept`, run.reviewerQuestions.join(" "), concept);
  }

  for (const value of expected.requiredExportValues ?? []) {
    assertContains(`${label} export value`, run.dtsRows.flat().join(" "), value);
  }

  const evidenceText = [run.sourceSearchResults.flat().join(" "), run.evidenceMap.flat().join(" "), run.dtsRows.flat().join(" ")].join(" ");

  for (const value of expected.forbiddenEvidenceRefs ?? []) {
    assertNotContains(`${label} forbidden evidence ref`, evidenceText, value);
  }

  for (const value of expected.requiredEvidenceRefs ?? []) {
    assertContains(`${label} required evidence ref`, evidenceText, value);
  }
}

function parseMode(value: string | undefined): AgentMode {
  if (value === "openai") return "openai";
  return "mock";
}

function readJson<T>(filename: string): T {
  return JSON.parse(readFileSync(join(scenarioDir, filename), "utf8")) as T;
}

function loadDotEnv() {
  try {
    const env = readFileSync(join(process.cwd(), ".env"), "utf8");
    for (const line of env.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator === -1) continue;
      const key = trimmed.slice(0, separator);
      const value = trimmed.slice(separator + 1);
      process.env[key] ??= value;
    }
  } catch {
    // Optional for mock evals and CI.
  }
}

function assertDefined<T>(label: string, value: T | undefined): asserts value is T {
  if (value === undefined) throw new Error(`${label} was not found.`);
}

function assertEqual<T>(label: string, actual: T, expected: T) {
  if (actual !== expected) throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}.`);
}

function assertRange(label: string, actual: number, min: number, max: number) {
  if (actual < min || actual > max) throw new Error(`${label}: expected ${min}-${max}, received ${actual}.`);
}

function assertContains(label: string, actual: string, expected: string) {
  if (!actual.toLowerCase().includes(expected.toLowerCase())) throw new Error(`${label}: expected "${actual}" to include "${expected}".`);
}

function assertContainsAny(label: string, actual: string, expected: string[]) {
  if (!expected.some((value) => actual.toLowerCase().includes(value.toLowerCase()))) {
    throw new Error(`${label}: expected "${actual}" to include one of ${expected.join(", ")}.`);
  }
}

function assertNotContains(label: string, actual: string, forbidden: string) {
  if (actual.toLowerCase().includes(forbidden.toLowerCase())) throw new Error(`${label}: expected "${actual}" not to include "${forbidden}".`);
}

function assertOneOf<T>(label: string, actual: T, expected: T[]) {
  if (!expected.includes(actual)) throw new Error(`${label}: expected one of ${expected.join(", ")}, received ${String(actual)}.`);
}

type JudgeResult = {
  pass: boolean;
  score: number;
  findings: string[];
};

type OpenRouterChatCompletion = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

const judgeSchema = {
  type: "object",
  additionalProperties: false,
  required: ["pass", "score", "findings"],
  properties: {
    pass: { type: "boolean" },
    score: { type: "number", minimum: 0, maximum: 1 },
    findings: {
      type: "array",
      items: { type: "string" }
    }
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
