import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runFieldDeskAgent } from "../fielddesk-agent";
import { sourceSearchResults, evidenceMap, readinessAreas, reviewerQuestions, actionList, corrections, dtsRows, packageRows } from "../fielddesk-static";
import type { AgentRunInput, FieldDeskAgentRun } from "../fielddesk-types";

export async function runOpenAIAgent(input: AgentRunInput): Promise<FieldDeskAgentRun> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini";

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured.");
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost:3000",
      "X-Title": "FieldDesk"
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are FieldDesk Agent. Reason over controlled, synthetic administrative context. Return only valid JSON matching the provided schema. Do not approve travel, submit into DTS, or invent real external facts."
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "Analyze the TDY Travel Readiness workflow and return the complete FieldDeskAgentRun JSON.",
            input,
            controlledContext: loadControlledContext(),
            outputGuidance: {
              statuses: ["Found", "Weak", "Missing", "Conflict", "Resolved", "Improved", "High", "Low"],
              initialReadinessScore: 72,
              correctedReadinessScore: 91,
              preserveTableOrder: true,
              expectedOutputShape: {
                mission: "object",
                sourceSearchResults: "array of [source, finding]",
                evidenceMap: "array of [requirement, evidence, source, status]",
                readiness: "object with score, risk, riskLabel, areas",
                issues: "array of issue objects",
                reviewerQuestions: "array of strings",
                corrections: "array of [name, state]",
                actionList: "array of [action, owner, status]",
                dtsRows: "array of [field, value]",
                packageRows: "array of strings",
                activityTrail: "array of event objects"
              }
            }
          })
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "fielddesk_agent_run",
          strict: false,
          schema: fieldDeskAgentRunJsonSchema
        }
      }
    })
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`OpenRouter request failed with status ${response.status}${detail ? `: ${detail}` : ""}`);
  }

  const completion = (await response.json()) as OpenRouterChatCompletion;
  const content = completion.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("OpenRouter response did not include message content.");
  }

  return repairAgentRun(normalizeAgentRun(JSON.parse(content)), runFieldDeskAgent(input));
}

function normalizeAgentRun(value: unknown): Partial<FieldDeskAgentRun> {
  if (isRecord(value) && isRecord(value.output)) return value.output as Partial<FieldDeskAgentRun>;
  if (isRecord(value) && isRecord(value.run)) return value.run as Partial<FieldDeskAgentRun>;
  if (isRecord(value) && isRecord(value.FieldDeskAgentRun)) return value.FieldDeskAgentRun as Partial<FieldDeskAgentRun>;
  return isRecord(value) ? value as Partial<FieldDeskAgentRun> : {};
}

function repairAgentRun(candidate: Partial<FieldDeskAgentRun>, fallback: FieldDeskAgentRun): FieldDeskAgentRun {
  return {
    mission: isRecord(candidate.mission) ? candidate.mission as FieldDeskAgentRun["mission"] : fallback.mission,
    sourceSearchResults: nonEmptyArray(candidate.sourceSearchResults) ? candidate.sourceSearchResults : fallback.sourceSearchResults,
    evidenceMap: nonEmptyArray(candidate.evidenceMap) ? candidate.evidenceMap : fallback.evidenceMap,
    readiness: isRecord(candidate.readiness) ? candidate.readiness as FieldDeskAgentRun["readiness"] : fallback.readiness,
    issues: nonEmptyArray(candidate.issues) ? candidate.issues : fallback.issues,
    reviewerQuestions: nonEmptyArray(candidate.reviewerQuestions) ? candidate.reviewerQuestions : fallback.reviewerQuestions,
    corrections: nonEmptyArray(candidate.corrections) ? candidate.corrections : fallback.corrections,
    actionList: nonEmptyArray(candidate.actionList) ? candidate.actionList : fallback.actionList,
    dtsRows: nonEmptyArray(candidate.dtsRows) ? candidate.dtsRows : fallback.dtsRows,
    packageRows: nonEmptyArray(candidate.packageRows) ? candidate.packageRows : fallback.packageRows,
    activityTrail: nonEmptyArray(candidate.activityTrail) ? candidate.activityTrail : fallback.activityTrail
  };
}

function nonEmptyArray<T>(value: readonly T[] | undefined): value is readonly T[] {
  return Array.isArray(value) && value.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function loadControlledContext() {
  return {
    staticTables: {
      sourceSearchResults,
      evidenceMap,
      readinessAreas,
      reviewerQuestions,
      actionList,
      corrections,
      dtsRows,
      packageRows
    },
    sourceFiles: {
      outlookMessages: readJson("outlook_messages.json"),
      sharePointDocuments: readJson("sharepoint_documents.json"),
      gsaPerDiem: readJson("gsa_per_diem_fixture.json"),
      sourceManifest: readJson("source_manifest.json"),
      uploadedDocuments: readJson("uploaded_documents.json"),
      agentRuns: readJson("agent_runs.json"),
      jtrExcerpt: readText("jtr_excerpt.md"),
      localSop: readText("local_sop.md"),
      priorPacket: readText("prior_successful_packet.md"),
      rosterV2: readText("roster_v2.csv"),
      rosterV3Corrected: readText("roster_v3_corrected.csv"),
      fundingMemo: readText("funding_memo.md")
    }
  };
}

function readJson(filename: string) {
  return JSON.parse(readText(filename)) as unknown;
}

function readText(filename: string) {
  return readFileSync(join(process.cwd(), "data", filename), "utf8");
}

type OpenRouterChatCompletion = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

const statusEnum = ["Found", "Weak", "Missing", "Conflict", "Resolved", "Improved", "High", "Low"];

const tupleArraySchema = {
  type: "array",
  items: {
    type: "array",
    items: {
      type: "string"
    },
    minItems: 2
  }
};

const fieldDeskAgentRunJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "mission",
    "sourceSearchResults",
    "evidenceMap",
    "readiness",
    "issues",
    "reviewerQuestions",
    "corrections",
    "actionList",
    "dtsRows",
    "packageRows",
    "activityTrail"
  ],
  properties: {
    mission: {
      type: "object",
      additionalProperties: false,
      required: ["workflow", "destination", "dates", "travelers"],
      properties: {
        workflow: { type: "string" },
        destination: { type: "string" },
        dates: { type: "string" },
        travelers: { type: "string" }
      }
    },
    sourceSearchResults: tupleArraySchema,
    evidenceMap: tupleArraySchema,
    readiness: {
      type: "object",
      additionalProperties: false,
      required: ["score", "risk", "riskLabel", "areas"],
      properties: {
        score: { type: "number", minimum: 0, maximum: 100 },
        risk: { type: "string", enum: ["High", "Low"] },
        riskLabel: { type: "string" },
        areas: tupleArraySchema
      }
    },
    issues: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "title", "status", "summary", "owner", "suggestedActions"],
        properties: {
          id: { type: "string", enum: ["roster", "funding", "justification"] },
          title: { type: "string" },
          status: { type: "string", enum: statusEnum },
          summary: { type: "string" },
          owner: { type: "string" },
          suggestedActions: {
            type: "array",
            items: { type: "string" }
          }
        }
      }
    },
    reviewerQuestions: {
      type: "array",
      items: { type: "string" }
    },
    corrections: tupleArraySchema,
    actionList: tupleArraySchema,
    dtsRows: tupleArraySchema,
    packageRows: {
      type: "array",
      items: { type: "string" }
    },
    activityTrail: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "detail", "status"],
        properties: {
          label: { type: "string" },
          detail: { type: "string" },
          status: { type: "string", enum: statusEnum }
        }
      }
    }
  }
};
