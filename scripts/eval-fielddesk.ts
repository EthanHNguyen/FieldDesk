import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runAgent } from "../src/lib/agent-adapters/run-agent";
import type { AgentMode, AgentRunInput, FieldDeskAgentRun, Status } from "../src/lib/fielddesk-types";

type ExpectedOutput = {
  mission?: {
    destination?: string;
    dates?: string;
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
  requiredIssueStatuses: Record<string, Status>;
  requiredReviewerConcepts?: string[];
  requiredExportValues?: string[];
};

const scenarioDir = join(process.cwd(), "evals", "golden", "demo_tdy");
const mode = parseMode(process.argv[2]);

async function main() {
  loadDotEnv();

  const input = readJson<AgentRunInput>("input.json");
  const corrections = readJson<AgentRunInput["resolutions"]>("corrections.json");
  const expectedInitial = readJson<ExpectedOutput>("expected_initial_output.json");
  const expectedCorrected = readJson<ExpectedOutput>("expected_corrected_output.json");

  const initial = await runAgent(mode, input);
  assertRun("initial", initial, expectedInitial);

  const corrected = await runAgent(mode, {
    ...input,
    resolutions: corrections
  });
  assertRun("corrected", corrected, expectedCorrected);

  console.log(`FieldDesk golden eval passed in ${mode} mode.`);
}

function assertRun(label: string, run: FieldDeskAgentRun, expected: ExpectedOutput) {
  if (expected.mission?.destination) assertContains(`${label} mission.destination`, run.mission.destination, expected.mission.destination);
  if (expected.mission?.dates) assertContains(`${label} mission.dates`, run.mission.dates, expected.mission.dates);
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
    assertEqual(`${label} issue ${issueId} status`, issue.status, status);
  }

  for (const concept of expected.requiredReviewerConcepts ?? []) {
    assertContains(`${label} reviewer concept`, run.reviewerQuestions.join(" "), concept);
  }

  for (const value of expected.requiredExportValues ?? []) {
    assertContains(`${label} export value`, run.dtsRows.flat().join(" "), value);
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

function assertOneOf<T>(label: string, actual: T, expected: T[]) {
  if (!expected.includes(actual)) throw new Error(`${label}: expected one of ${expected.join(", ")}, received ${String(actual)}.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
