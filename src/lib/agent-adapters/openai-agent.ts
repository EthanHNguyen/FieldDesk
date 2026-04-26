import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildPerDiemVerification } from "../deterministic-rules";
import type { AgentArtifact, AgentRunContext, AgentRunInput, CorrectionEvent, FieldDeskAgentObjectOutput, FieldDeskAgentRun, UnavailableArtifactSummary } from "../fielddesk-types";

export async function runOpenAIAgent(input: AgentRunInput): Promise<FieldDeskAgentRun> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL ?? "google/gemini-3-flash-preview";

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured.");
  }

  const context = buildAgentRunContext(input);

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost:3000",
      "X-Title": "FieldDesk Agent"
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
            task: "Analyze the TDY Travel Readiness workflow using only the current AgentRunContext and return FieldDeskAgentObjectOutput JSON.",
            agentRunContext: context,
            outputGuidance: {
              statuses: ["Found", "Weak", "Missing", "Conflict", "Resolved", "Improved", "High", "Low"],
              preserveTableOrder: true,
              requiredSourceRows,
              tripFactsRule: "Extract structured tripFacts (destination, locality, startDate, endDate, travelers) from available artifacts. Use ISO 8601 (YYYY-MM-DD) for all dates. If dates are ranges like 'June 10-14, 2026', resolve to '2026-06-10' and '2026-06-14'.",
              sourceSearchRule:
                "Return exactly one sourceSearchResults row for every requiredSourceRows entry, in requiredSourceRows order. If a required source is not in selectedSources, return that source with finding 'Source disabled for this run' and no artifact IDs. Include supporting/reference sources such as JTR, Unit Checklist, and Local SOP even when they only corroborate requirements.",
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
              evidenceMapRule: "Return EXACTLY one row in evidenceMap for each requirement listed in requiredEvidenceRequirements. Do not change the requirement names. Use status 'Conflict' if evidence exists but contradicts mission intent (e.g. traveler count mismatch).",
              requiredIssueIds: ["roster", "funding", "justification"],
              citationRule: "Every evidence-backed claim must cite available artifact IDs. Never cite unavailable artifact IDs as evidence.",
              deterministicMathRule:
                "Do not calculate per diem totals yourself. Use GSA evidence only to identify locality/rates. The application verifies per diem math deterministically after generation.",
              policyTraceabilityRule:
                "For gaps and findings tied to policy or unit routing, cite available JTR, Unit Checklist, or Local SOP artifact IDs in evidenceArtifactIds and rationale.",
              scoringGuidance: "Readiness score (0-100 integer) and risk (High/Low) should follow the evidence available in this run. Initial runs with gaps normally score 50-76. Corrected runs with no major gaps score 88-95.",
              expectedOutputShape: {
                mission: "object",
                tripFacts: "object with structured dates and travelers",
                sourceSearchResults: "array of { source, finding, artifactIds }",
                evidenceMap: "array of { requirementId, requirement, status, evidenceArtifactIds, evidenceSummary, sourceSummary, rationale, confidence }",
                readiness: "object with score, risk, riskLabel, areas",
                findings: "array of issue objects with artifact citations",
                reviewerObjections: "array of { question, rationale, evidenceArtifactIds }",
                generatedWorkProduct: "object with packetSummary, rentalVehicleJustification, dtsRows, packageRows, actionList",
                activityTrail: "array of event objects",
                agentTrace: "array of trace steps (plan, tool_call, observation, synthesis, verification)"
              }
            }
          })
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "fielddesk_agent_object_output",
          strict: false,
          schema: fieldDeskAgentObjectOutputJsonSchema
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

  return objectOutputToFieldDeskRun(normalizeAgentObjectOutput(JSON.parse(content)), input);
}

function normalizeAgentObjectOutput(value: unknown): FieldDeskAgentObjectOutput {
  if (isRecord(value) && isRecord(value.output)) return value.output as FieldDeskAgentObjectOutput;
  if (isRecord(value) && isRecord(value.run)) return value.run as FieldDeskAgentObjectOutput;
  if (isRecord(value) && isRecord(value.FieldDeskAgentObjectOutput)) return value.FieldDeskAgentObjectOutput as FieldDeskAgentObjectOutput;
  return value as FieldDeskAgentObjectOutput;
}

function objectOutputToFieldDeskRun(output: FieldDeskAgentObjectOutput, input: AgentRunInput): FieldDeskAgentRun {
  const normalizedOutput = normalizeSourceCoverage(output, input);

  return {
    mission: normalizedOutput.mission,
    sourceSearchResults: (normalizedOutput.sourceSearchResults || []).map((row) => [row.source, row.finding]),
    evidenceMap: (normalizedOutput.evidenceMap || []).map((item) => [item.requirement, item.evidenceSummary || "None", item.sourceSummary || item.evidenceArtifactIds.join(", ") || "None", item.status]),
    readiness: {
      score: normalizedOutput.readiness?.score ?? 0,
      risk: normalizedOutput.readiness?.risk ?? "High",
      riskLabel: normalizedOutput.readiness?.riskLabel ?? "Unknown",
      areas: (normalizedOutput.readiness?.areas || []).map((area) => [area.area, area.status])
    },
    issues: (normalizedOutput.findings || []).map((finding) => ({
      id: finding.id,
      title: finding.title,
      status: finding.status,
      summary: finding.summary,
      owner: finding.owner,
      suggestedActions: finding.suggestedActions || []
    })),
    reviewerQuestions: (normalizedOutput.reviewerObjections || []).map((objection) => objection.question),
    corrections: (normalizedOutput.generatedWorkProduct?.actionList || [])
      .filter((action) => /roster|funding|justification/i.test(action.action))
      .map((action) => [action.action, action.status]),
    actionList: (normalizedOutput.generatedWorkProduct?.actionList || []).map((action) => [action.action, action.owner, action.status]),
    dtsRows: (normalizedOutput.generatedWorkProduct?.dtsRows || []).map((row) => [row.field, row.value]),
    packageRows: normalizedOutput.generatedWorkProduct?.packageRows || [],
    activityTrail: normalizedOutput.activityTrail || [],
    agentTrace: normalizedOutput.agentTrace,
    objectOutput: normalizedOutput
  };
}

function normalizeSourceCoverage(output: FieldDeskAgentObjectOutput, input: AgentRunInput): FieldDeskAgentObjectOutput {
  const evidenceMap = normalizeEvidenceControls(output);
  const generatedWorkProduct = normalizeGeneratedWorkProduct(output);
  const existingRows = new Map((output.sourceSearchResults || []).map((row) => [row.source.toLowerCase(), row]));
  const sourceSearchResults = requiredSourceRows.map((source) => {
    if (!input.selectedSources.includes(source)) {
      return {
        source,
        finding: "Source disabled for this run",
        artifactIds: []
      };
    }

    return existingRows.get(source.toLowerCase()) ?? { source, finding: "Source not analyzed by agent", artifactIds: [] };
  });
  const extraRows = (output.sourceSearchResults || []).filter((row) => !requiredSourceRows.some((source) => source.toLowerCase() === row.source.toLowerCase()));

  return {
    ...output,
    evidenceMap,
    generatedWorkProduct,
    sourceSearchResults: [...sourceSearchResults, ...extraRows]
  };
}

function normalizeGeneratedWorkProduct(output: FieldDeskAgentObjectOutput) {
  const generatedWorkProduct = output.generatedWorkProduct || { dtsRows: [], actionList: [], packageRows: [], packetSummary: "", rentalVehicleJustification: "" };
  const dtsRows = (generatedWorkProduct.dtsRows || []).filter((row) => !/per diem/i.test(row.field));

  if (!output.tripFacts) {
    return {
      ...generatedWorkProduct,
      dtsRows: [
        ...dtsRows,
        {
          field: "Per Diem Estimate",
          value: "Missing trip facts for verification",
          sourceArtifactIds: []
        }
      ]
    };
  }

  try {
    const perDiem = buildPerDiemVerification(output.tripFacts);
    return {
      ...generatedWorkProduct,
      dtsRows: [
        ...dtsRows,
        {
          field: "Per Diem Estimate",
          value: `${perDiem.formattedTotal} verified from GSA fixture`,
          sourceArtifactIds: ["gsa-001"]
        }
      ]
    };
  } catch (e) {
    return {
      ...generatedWorkProduct,
      dtsRows: [
        ...dtsRows,
        {
          field: "Per Diem Estimate",
          value: `Verification failed: ${e instanceof Error ? e.message : "Unknown error"}`,
          sourceArtifactIds: []
        }
      ]
    };
  }
}

function normalizeEvidenceControls(output: FieldDeskAgentObjectOutput) {
  const evidenceMap = output.evidenceMap || [];
  const tripFacts = output.tripFacts;

  return evidenceMap.map((item) => {
    if (/per diem/i.test(item.requirement)) {
      if (/source disabled|none/i.test(item.evidenceSummary)) return item;
      if (!tripFacts) return { ...item, status: "Weak" as const, evidenceSummary: "Missing trip facts for verification" };

      try {
        const perDiem = buildPerDiemVerification(tripFacts);
        return {
          ...item,
          evidenceSummary: perDiem.summary,
          sourceSummary: "GSA fixture",
          evidenceArtifactIds: item.evidenceArtifactIds.includes("gsa-001") ? item.evidenceArtifactIds : [...item.evidenceArtifactIds, "gsa-001"],
          mathVerified: true
        };
      } catch (e) {
        return {
          ...item,
          status: "Conflict" as const,
          evidenceSummary: `Verification failed: ${e instanceof Error ? e.message : "Unknown error"}`
        };
      }
    }

    return item;
  });
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
    if (filename === "unit_tdy_checklist.pdf" && input.selectedSources.includes("Unit Checklist")) continue;
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

  if (input.selectedSources.includes("Unit Checklist")) {
    const site = readJson<Record<string, unknown>>("sharepoint_documents.json");
    const documents = Array.isArray(site.documents) ? site.documents : [];
    const checklist = documents.find((document) => isRecord(document) && document.id === "sp-003");

    if (isRecord(checklist)) {
      available.push({
        id: "sp-003",
        source: "Unit Checklist",
        title: String(checklist.filename),
        kind: String(checklist.kind),
        content: String(checklist.extractedText),
        facts: checklist.extractedEvidence
      });
    }
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

const artifactIdsSchema = {
  type: "array",
  items: { type: "string" }
};

const requiredSourceRows = ["Outlook", "SharePoint", "GSA", "JTR", "Unit Checklist", "Local SOP"];

const fieldDeskAgentObjectOutputJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "mission",
    "tripFacts",
    "sourceSearchResults",
    "evidenceMap",
    "readiness",
    "findings",
    "reviewerObjections",
    "generatedWorkProduct",
    "activityTrail",
    "agentTrace"
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
    tripFacts: {
      type: "object",
      additionalProperties: false,
      required: ["destination", "locality", "startDate", "endDate", "travelers", "evidenceArtifactIds", "confidence", "rationale"],
      properties: {
        destination: { type: "string" },
        locality: { type: "string" },
        startDate: { type: "string" },
        endDate: { type: "string" },
        travelers: { type: "integer" },
        evidenceArtifactIds: artifactIdsSchema,
        confidence: { type: "number", minimum: 0, maximum: 1 },
        rationale: { type: "string" }
      }
    },
    sourceSearchResults: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["source", "finding", "artifactIds"],
        properties: {
          source: { type: "string" },
          finding: { type: "string" },
          artifactIds: artifactIdsSchema
        }
      }
    },
    evidenceMap: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["requirementId", "requirement", "status", "evidenceArtifactIds", "evidenceSummary", "sourceSummary", "rationale", "confidence"],
        properties: {
          requirementId: { type: "string" },
          requirement: { type: "string" },
          status: { type: "string", enum: statusEnum },
          evidenceArtifactIds: artifactIdsSchema,
          evidenceSummary: { type: "string" },
          sourceSummary: { type: "string" },
          rationale: { type: "string" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          mathVerified: { type: "boolean" },
          policyReference: {
            type: "object",
            additionalProperties: false,
            required: ["source", "reference", "excerpt"],
            properties: {
              source: { type: "string" },
              reference: { type: "string" },
              excerpt: { type: "string" }
            }
          }
        }
      }
    },
    readiness: {
      type: "object",
      additionalProperties: false,
      required: ["score", "risk", "riskLabel", "areas"],
      properties: {
        score: { type: "integer" },
        risk: { type: "string", enum: ["High", "Low"] },
        riskLabel: { type: "string" },
        areas: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["area", "status", "rationale"],
            properties: {
              area: { type: "string" },
              status: { type: "string", enum: statusEnum },
              rationale: { type: "string" }
            }
          }
        }
      }
    },
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "title", "status", "summary", "evidenceArtifactIds", "rationale", "confidence", "owner", "suggestedActions"],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          status: { type: "string", enum: statusEnum },
          summary: { type: "string" },
          evidenceArtifactIds: artifactIdsSchema,
          rationale: { type: "string" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          owner: { type: "string" },
          suggestedActions: { type: "array", items: { type: "string" } }
        }
      }
    },
    reviewerObjections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["question", "rationale", "evidenceArtifactIds"],
        properties: {
          question: { type: "string" },
          rationale: { type: "string" },
          evidenceArtifactIds: artifactIdsSchema
        }
      }
    },
    generatedWorkProduct: {
      type: "object",
      additionalProperties: false,
      required: ["packetSummary", "rentalVehicleJustification", "dtsRows", "packageRows", "actionList"],
      properties: {
        packetSummary: { type: "string" },
        rentalVehicleJustification: { type: "string" },
        dtsRows: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["field", "value", "sourceArtifactIds"],
            properties: {
              field: { type: "string" },
              value: { type: "string" },
              sourceArtifactIds: artifactIdsSchema
            }
          }
        },
        packageRows: { type: "array", items: { type: "string" } },
        actionList: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["action", "owner", "status"],
            properties: {
              action: { type: "string" },
              owner: { type: "string" },
              status: { type: "string" }
            }
          }
        }
      }
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
    },
    agentTrace: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["stepIndex", "kind", "label", "status"],
        properties: {
          stepIndex: { type: "integer" },
          kind: { type: "string", enum: ["plan", "tool_call", "observation", "synthesis", "verification"] },
          label: { type: "string" },
          toolName: { type: "string" },
          argsSummary: { type: "string" },
          observationSummary: { type: "string" },
          artifactIds: artifactIdsSchema,
          status: { type: "string", enum: statusEnum }
        }
      }
    }
  }
};
