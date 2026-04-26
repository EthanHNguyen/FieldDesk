import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentArtifact, AgentRunContext, AgentRunInput, CorrectionEvent, FieldDeskAgentRun, UnavailableArtifactSummary } from "../fielddesk-types";

export async function runOpenAIAgent(input: AgentRunInput): Promise<FieldDeskAgentRun> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL ?? "openai/gpt-5.5";
  const context = buildAgentRunContext(input);

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
            "You are FieldDesk Agent. Reason over the current run's availableArtifacts only. Unavailable artifacts are not evidence and must not satisfy requirements. You may mention unavailable artifacts only as recommended next actions. Return only valid JSON matching the provided schema. Do not approve travel, submit into DTS, or invent real external facts."
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "Analyze the TDY Travel Readiness workflow using only the current AgentRunContext and return the complete FieldDeskAgentRun JSON.",
            agentRunContext: context,
            outputGuidance: {
              statuses: ["Found", "Weak", "Missing", "Conflict", "Resolved", "Improved", "High", "Low"],
              preserveTableOrder: true,
              requiredEvidenceRequirements: [
                "Mission purpose",
                "Travel dates",
                "Destination",
                "Traveler roster",
                "Approval",
                "Per diem estimate",
                "Policy reference",
                "Unit checklist",
                "Rental vehicle justification",
                "Funding source"
              ],
              requiredIssueIds: ["roster", "funding", "justification"],
              scoringGuidance: "Score and risk should follow the evidence available in this run. Do not treat unavailable artifacts as found.",
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

  return normalizeAgentRun(JSON.parse(content));
}

function normalizeAgentRun(value: unknown): FieldDeskAgentRun {
  if (isRecord(value) && isRecord(value.output)) return value.output as FieldDeskAgentRun;
  if (isRecord(value) && isRecord(value.run)) return value.run as FieldDeskAgentRun;
  if (isRecord(value) && isRecord(value.FieldDeskAgentRun)) return value.FieldDeskAgentRun as FieldDeskAgentRun;
  return value as FieldDeskAgentRun;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function buildAgentRunContext(input: AgentRunInput): AgentRunContext {
  const corrected = input.resolutions.roster || input.resolutions.funding || input.resolutions.justification;
  const availableArtifacts: AgentArtifact[] = [];
  const unavailableArtifacts: UnavailableArtifactSummary[] = [];
  const correctionEvents: CorrectionEvent[] = [];

  addOutlookArtifacts(input, availableArtifacts, unavailableArtifacts);
  addSharePointArtifacts(input, availableArtifacts, unavailableArtifacts);
  addReferenceArtifacts(input, availableArtifacts);
  addUploadedArtifacts(input, availableArtifacts, unavailableArtifacts);

  if (input.resolutions.roster) {
    correctionEvents.push({ type: "artifact_added", artifactId: "sp-004", title: "roster_v3_corrected.csv" });
  }
  if (input.resolutions.funding) {
    correctionEvents.push({ type: "artifact_added", artifactId: "upload-003", title: "funding_memo.md" });
  }
  if (input.resolutions.justification) {
    availableArtifacts.push({
      id: "justification-001",
      source: "User correction",
      title: "Rental vehicle justification",
      kind: "Text",
      content: input.vehicleJustification,
      facts: {
        rentalVehicleJustificationAccepted: true
      }
    });
    correctionEvents.push({ type: "justification_accepted", artifactId: "justification-001", title: "Rental vehicle justification" });
  }

  return {
    sessionId: "demo-tdy-session",
    trigger: corrected ? "correction_staged" : "initial_analysis",
    intent: input.intent,
    selectedSources: input.selectedSources,
    availableArtifacts,
    unavailableArtifacts,
    correctionEvents,
    vehicleJustification: input.vehicleJustification
  };
}

function addOutlookArtifacts(input: AgentRunInput, available: AgentArtifact[], unavailable: UnavailableArtifactSummary[]) {
  if (!input.selectedSources.includes("Outlook")) return;
  const mailbox = readJson<Record<string, unknown>>("outlook_messages.json");
  const messages = Array.isArray(mailbox.messages) ? mailbox.messages : [];

  for (const message of messages) {
    if (!isRecord(message)) continue;
    const availableInState = typeof message.availableInState === "string" ? message.availableInState : "initial";
    const artifact = {
      id: String(message.id),
      source: "Outlook",
      title: String(message.subject),
      kind: "Email",
      content: String(message.body),
      facts: message.extractedEvidence
    };

    if (availableInState === "corrected" && !input.resolutions.funding) {
      unavailable.push({
        id: artifact.id,
        source: artifact.source,
        title: artifact.title,
        reason: "Funding evidence is not available until the funding correction is staged."
      });
    } else {
      available.push(artifact);
    }
  }
}

function addSharePointArtifacts(input: AgentRunInput, available: AgentArtifact[], unavailable: UnavailableArtifactSummary[]) {
  if (!input.selectedSources.includes("SharePoint")) return;
  const site = readJson<Record<string, unknown>>("sharepoint_documents.json");
  const documents = Array.isArray(site.documents) ? site.documents : [];

  for (const document of documents) {
    if (!isRecord(document)) continue;
    const availableInState = typeof document.availableInState === "string" ? document.availableInState : "initial";
    const filename = String(document.filename);
    const artifact = {
      id: String(document.id),
      source: "SharePoint",
      title: filename,
      kind: String(document.kind),
      content: [String(document.extractedText), readOptionalCsv(filename)].filter(Boolean).join("\n\n"),
      facts: document.extractedEvidence
    };

    if (availableInState === "corrected" && !input.resolutions.roster) {
      unavailable.push({
        id: artifact.id,
        source: artifact.source,
        title: artifact.title,
        reason: "Corrected roster is not available until the roster correction is staged."
      });
    } else {
      available.push(artifact);
    }
  }
}

function addReferenceArtifacts(input: AgentRunInput, available: AgentArtifact[]) {
  if (input.selectedSources.includes("GSA")) {
    available.push({
      id: "gsa-001",
      source: "GSA",
      title: "Demo Training Site per diem rates",
      kind: "JSON",
      content: JSON.stringify(readJson("gsa_per_diem_fixture.json")),
      facts: { destination: "Demo Training Site", perDiemRatesFound: true }
    });
  }

  if (input.selectedSources.includes("JTR")) {
    available.push({
      id: "jtr-001",
      source: "JTR",
      title: "JTR TDY excerpt",
      kind: "Markdown",
      content: readText("jtr_excerpt.md"),
      facts: { policyReferenceFound: true }
    });
  }

  if (input.selectedSources.includes("Local SOP")) {
    available.push({
      id: "sop-001",
      source: "Local SOP",
      title: "Unit TDY routing SOP",
      kind: "Markdown",
      content: readText("local_sop.md"),
      facts: { routingExpectationsFound: true }
    });
  }
}

function addUploadedArtifacts(input: AgentRunInput, available: AgentArtifact[], unavailable: UnavailableArtifactSummary[]) {
  const uploads = readJson<Record<string, unknown>>("uploaded_documents.json");
  const documents = Array.isArray(uploads.uploads) ? uploads.uploads : [];

  for (const document of documents) {
    if (!isRecord(document)) continue;
    const availableInState = typeof document.availableInState === "string" ? document.availableInState : "initial";
    const filename = String(document.filename);
    const artifact = {
      id: String(document.id),
      source: "Uploaded docs",
      title: filename,
      kind: filename.endsWith(".json") ? "JSON" : "Markdown",
      content: filename === "funding_memo.md" ? readText("funding_memo.md") : String(document.extractedText),
      facts: { uploadedDocument: true }
    };

    if (availableInState === "corrected" && !input.resolutions.funding) {
      unavailable.push({
        id: artifact.id,
        source: artifact.source,
        title: artifact.title,
        reason: "Funding memo is not uploaded until the funding correction is staged."
      });
    } else {
      available.push(artifact);
    }
  }
}

function readOptionalCsv(filename: string) {
  if (filename === "roster_v2.csv") return readText("roster_v2.csv");
  if (filename === "roster_v3_corrected.csv") return readText("roster_v3_corrected.csv");
  return "";
}

function readJson<T = unknown>(filename: string): T {
  return JSON.parse(readText(filename)) as T;
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
