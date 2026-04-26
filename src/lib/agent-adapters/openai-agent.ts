import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildPerDiemVerification } from "../deterministic-rules";
import type { AgentArtifact, AgentEvidenceItem, AgentFinding, AgentRunContext, AgentRunInput, CorrectionEvent, FieldDeskAgentObjectOutput, FieldDeskAgentRun, Status, UnavailableArtifactSummary } from "../fielddesk-types";

export async function runOpenAIAgent(input: AgentRunInput): Promise<FieldDeskAgentRun> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL ?? "google/gemini-3-flash-preview";

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured.");
  }

  const context = buildAgentRunContext(input);
  const completion = process.env.FIELD_DESK_TEST_OPENROUTER_CONTENT === undefined
    ? await requestOpenRouterCompletion({ apiKey, model, context })
    : {
        choices: [
          {
            message: {
              content: process.env.FIELD_DESK_TEST_OPENROUTER_CONTENT
            }
          }
        ]
      };

  const content = completion.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("OpenRouter response did not include message content.");
  }

  return objectOutputToFieldDeskRun(normalizeAgentObjectOutput(JSON.parse(content)), input);
}

async function requestOpenRouterCompletion({ apiKey, model, context }: { apiKey: string; model: string; context: AgentRunContext }) {
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
            task: "Analyze the TDY readiness workflow using only the current AgentRunContext and return FieldDeskAgentObjectOutput JSON.",
            agentRunContext: context,
            outputGuidance: {
              statuses: ["Found", "Weak", "Missing", "Conflict", "Resolved", "Improved", "High", "Low"],
              preserveTableOrder: true,
              requiredSourceRows,
              tripFactsRule: "Extract structured tripFacts (destination, locality, startDate, endDate, travelers) from available artifacts. Use ISO 8601 (YYYY-MM-DD) for all dates. If dates are ranges like 'June 10-14, 2026', resolve to '2026-06-10' and '2026-06-14'.",
              sourceSearchRule:
                "Return exactly one sourceSearchResults row for every requiredSourceRows entry, in requiredSourceRows order. If a required source is not in selectedSources, return that source with finding 'Source disabled for this run' and no artifact IDs. Include supporting/reference sources such as JTR, Unit Checklist, and Local SOP even when they only corroborate requirements.",
              requiredEvidenceRequirements,
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

  return (await response.json()) as OpenRouterChatCompletion;
}

function normalizeAgentObjectOutput(value: unknown): FieldDeskAgentObjectOutput {
  if (isRecord(value) && isRecord(value.output)) return value.output as FieldDeskAgentObjectOutput;
  if (isRecord(value) && isRecord(value.run)) return value.run as FieldDeskAgentObjectOutput;
  if (isRecord(value) && isRecord(value.FieldDeskAgentObjectOutput)) return value.FieldDeskAgentObjectOutput as FieldDeskAgentObjectOutput;
  return value as FieldDeskAgentObjectOutput;
}

export function objectOutputToFieldDeskRun(output: FieldDeskAgentObjectOutput, input: AgentRunInput): FieldDeskAgentRun {
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
  const evidenceMap = normalizeEvidenceMap(output, input);
  const generatedWorkProduct = normalizeGeneratedWorkProduct(output);
  const findings = normalizeFindings(output, input, evidenceMap);
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
    findings,
    generatedWorkProduct,
    sourceSearchResults: [...sourceSearchResults, ...extraRows]
  };
}

function normalizeEvidenceMap(output: FieldDeskAgentObjectOutput, input: AgentRunInput): AgentEvidenceItem[] {
  const controlledRows = normalizeEvidenceControls(output);
  return requiredEvidenceRequirements.map((requirement) => {
    const existing = controlledRows.find((item) => item.requirement.toLowerCase() === requirement.toLowerCase()) ?? findEvidence(controlledRows, patternForRequirement(requirement));
    const fallback = fallbackEvidenceItem(requirement, input, output);
    const merged = existing ? mergeEvidenceItem(existing, fallback) : fallback;
    return normalizeEvidenceControls({ ...output, evidenceMap: [merged] })[0];
  });
}

function mergeEvidenceItem(existing: AgentEvidenceItem, fallback: AgentEvidenceItem): AgentEvidenceItem {
  return {
    ...fallback,
    ...existing,
    requirementId: fallback.requirementId,
    requirement: fallback.requirement,
    status: existing.status || fallback.status,
    evidenceArtifactIds: existing.evidenceArtifactIds?.length ? existing.evidenceArtifactIds : fallback.evidenceArtifactIds,
    evidenceSummary: existing.evidenceSummary || fallback.evidenceSummary,
    sourceSummary: existing.sourceSummary || fallback.sourceSummary,
    rationale: existing.rationale || fallback.rationale,
    confidence: existing.confidence ?? fallback.confidence,
    mathVerified: existing.mathVerified ?? fallback.mathVerified,
    policyReference: existing.policyReference ?? fallback.policyReference
  };
}

function fallbackEvidenceItem(requirement: string, input: AgentRunInput, output: FieldDeskAgentObjectOutput): AgentEvidenceItem {
  const base = (status: Status, evidenceSummary: string, sourceSummary: string, evidenceArtifactIds: string[] = [], confidence = 0.8): AgentEvidenceItem => ({
    requirementId: requirementId(requirement),
    requirement,
    status,
    evidenceArtifactIds,
    evidenceSummary,
    sourceSummary,
    rationale: status === "Missing" || status === "Weak" || status === "Conflict" ? "Requires user action before routing." : "Evidence supports the workflow requirement.",
    confidence
  });

  if (requirement === "Mission purpose") return base("Found", "Leader development training.", "SharePoint / Outlook", ["sp-001", "outlook-001"], 0.88);
  if (requirement === "Travel dates") return base("Found", output.tripFacts ? `${output.tripFacts.startDate} to ${output.tripFacts.endDate}.` : "June 10-14.", "SharePoint / Input", ["sp-001"], 0.88);
  if (requirement === "Destination") return base("Found", output.tripFacts?.destination || "Demo Training Site, GA.", "SharePoint / Input", ["sp-001"], 0.88);
  if (requirement === "Traveler roster") {
    if (!input.selectedSources.includes("SharePoint")) return base("Missing", "Source disabled", "SharePoint", [], 0.7);
    return input.resolutions.roster
      ? base("Resolved", "Corrected roster contains 10 personnel.", "SharePoint (roster_v3_corrected.csv)", ["sp-004"], 0.92)
      : base("Conflict", "Roster contains 8 personnel; mission requires 10.", "SharePoint (roster_v2.csv)", ["sp-002"], 0.9);
  }
  if (requirement === "Approval") {
    if (!input.selectedSources.includes("Outlook")) return base("Missing", "Source disabled", "Outlook", [], 0.7);
    return base("Found", "Approval email to prepare packet received.", "Outlook", ["outlook-001"], 0.86);
  }
  if (requirement === "Per diem estimate") {
    if (!input.selectedSources.includes("GSA")) return base("Missing", "Source disabled", "GSA", [], 0.7);
    if (!output.tripFacts) return base("Weak", "Missing trip facts for verification.", "GSA fixture", ["gsa-001"], 0.72);
    try {
      const perDiem = buildPerDiemVerification(output.tripFacts);
      return {
        ...base("Found", perDiem.summary, "GSA fixture", ["gsa-001"], 0.95),
        mathVerified: true
      };
    } catch {
      return base("Conflict", "Per diem verification failed.", "GSA fixture", ["gsa-001"], 0.72);
    }
  }
  if (requirement === "Policy reference") {
    if (!input.selectedSources.includes("JTR")) return base("Missing", "Source disabled", "JTR", [], 0.7);
    return {
      ...base("Found", "JTR excerpt supports TDY policy traceability.", "JTR", ["jtr-001"], 0.84),
      policyReference: {
        source: "JTR",
        reference: "Mocked JTR excerpt",
        excerpt: "TDY packets commonly include destination, dates, purpose, traveler data, lodging and meals information, transportation justification, and supporting authorization artifacts."
      }
    };
  }
  if (requirement === "Unit checklist") {
    if (!input.selectedSources.includes("Unit Checklist")) return base("Missing", "Source disabled", "Unit Checklist", [], 0.7);
    return base("Found", "Unit checklist lists roster, funding, lodging, and routing requirements.", "Unit Checklist", ["sp-003"], 0.84);
  }
  if (requirement === "Rental vehicle justification") {
    return input.resolutions.justification
      ? base("Improved", input.vehicleJustification, "User correction", ["justification-001"], 0.88)
      : base("Weak", "Rental vehicles are requested, but mission-specific support is thin.", "Input / Local SOP", ["sop-001"], 0.78);
  }
  if (requirement === "Funding source") {
    return input.resolutions.funding
      ? base("Found", "Funding memo is staged for the packet.", "Uploaded docs", ["upload-003"], 0.9)
      : base("Missing", "No fund cite or funding memo found.", "Outlook / SharePoint", [], 0.9);
  }

  return base("Missing", "No evidence found.", "None", [], 0.5);
}

function patternForRequirement(requirement: string): RegExp {
  if (requirement === "Mission purpose") return /mission|purpose|training/i;
  if (requirement === "Travel dates") return /date|travel date|june|2026-06/i;
  if (requirement === "Destination") return /destination|demo training site/i;
  if (requirement === "Traveler roster") return /traveler|roster|personnel/i;
  if (requirement === "Approval") return /approval|approved/i;
  if (requirement === "Per diem estimate") return /per diem|lodging|m&ie|gsa/i;
  if (requirement === "Policy reference") return /policy|jtr|trace/i;
  if (requirement === "Unit checklist") return /checklist/i;
  if (requirement === "Rental vehicle justification") return /rental|vehicle|justification|transport/i;
  if (requirement === "Funding source") return /fund|loa|fiscal/i;
  return new RegExp(requirement, "i");
}

function requirementId(requirement: string) {
  return requirement.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function normalizeFindings(output: FieldDeskAgentObjectOutput, input: AgentRunInput, evidenceMap: FieldDeskAgentObjectOutput["evidenceMap"]): AgentFinding[] {
  const existing = new Map((output.findings || []).map((finding) => [finding.id, finding]));

  return [
    normalizeRosterFinding(existing.get("roster"), input, evidenceMap),
    normalizeFundingFinding(existing.get("funding"), input, evidenceMap),
    normalizeJustificationFinding(existing.get("justification"), input, evidenceMap)
  ];
}

function normalizeRosterFinding(existing: AgentFinding | undefined, input: AgentRunInput, evidenceMap: FieldDeskAgentObjectOutput["evidenceMap"]): AgentFinding {
  const evidence = findEvidence(evidenceMap, /traveler|roster|personnel/i);
  if (input.resolutions.roster) {
    return mergeFinding(existing, {
      id: "roster",
      title: "Traveler Count Mismatch",
      status: "Resolved",
      summary: "Corrected roster is staged and confirms the mission traveler count.",
      owner: "S1",
      suggestedActions: ["Use roster_v3_corrected.csv", "Attach corrected roster to packet"],
      evidenceArtifactIds: evidence?.evidenceArtifactIds ?? ["sp-004"],
      rationale: "Roster correction is staged for recompute.",
      confidence: 0.92
    });
  }

  return mergeFinding(existing, {
    id: "roster",
    title: "Traveler Count Mismatch",
    status: openStatus(existing?.status, evidence?.status, "Conflict"),
    summary: existing?.summary || evidence?.evidenceSummary || "Mission intent requires 10 travelers, but current roster evidence does not fully support the packet.",
    owner: "S1",
    suggestedActions: ["Upload corrected roster", "Update request to match roster", "Add missing travelers to roster"],
    evidenceArtifactIds: evidence?.evidenceArtifactIds ?? [],
    rationale: evidence?.rationale || "Traveler count evidence must match the mission requirement before routing.",
    confidence: evidence?.confidence ?? 0.86
  });
}

function normalizeFundingFinding(existing: AgentFinding | undefined, input: AgentRunInput, evidenceMap: FieldDeskAgentObjectOutput["evidenceMap"]): AgentFinding {
  const evidence = findEvidence(evidenceMap, /fund|loa|fiscal/i);
  if (input.resolutions.funding) {
    return mergeFinding(existing, {
      id: "funding",
      title: "Missing Funding Evidence",
      status: "Found",
      summary: "Funding memo is staged for recompute.",
      owner: "Budget Office",
      suggestedActions: ["Attach funding memo", "Add fund cite to DTS draft"],
      evidenceArtifactIds: evidence?.evidenceArtifactIds ?? ["upload-003"],
      rationale: "Funding correction is staged for validation.",
      confidence: 0.92
    });
  }

  return mergeFinding(existing, {
    id: "funding",
    title: "Missing Funding Evidence",
    status: openStatus(existing?.status, evidence?.status, "Missing"),
    summary: existing?.summary || evidence?.evidenceSummary || "No funding memo, fund cite, or funding approval artifact is available for the packet.",
    owner: "Budget Office",
    suggestedActions: ["Upload funding memo", "Add fund cite", "Attach funding approval"],
    evidenceArtifactIds: evidence?.evidenceArtifactIds ?? [],
    rationale: evidence?.rationale || "A reviewer is likely to return the packet without fiscal authorization.",
    confidence: evidence?.confidence ?? 0.9
  });
}

function normalizeJustificationFinding(existing: AgentFinding | undefined, input: AgentRunInput, evidenceMap: FieldDeskAgentObjectOutput["evidenceMap"]): AgentFinding {
  const evidence = findEvidence(evidenceMap, /rental|vehicle|justification|transport/i);
  if (input.resolutions.justification) {
    return mergeFinding(existing, {
      id: "justification",
      title: "Weak Justification",
      status: "Improved",
      summary: "Mission-specific rental vehicle justification is staged for recompute.",
      owner: "Requester",
      suggestedActions: ["Use mission-specific justification", "Attach justification statement"],
      evidenceArtifactIds: evidence?.evidenceArtifactIds ?? ["justification-001"],
      rationale: "User accepted a mission-specific justification.",
      confidence: 0.88
    });
  }

  return mergeFinding(existing, {
    id: "justification",
    title: "Weak Justification",
    status: openStatus(existing?.status, evidence?.status, "Weak"),
    summary: existing?.summary || evidence?.evidenceSummary || "Rental vehicles are requested, but the packet needs mission-specific justification.",
    owner: "Requester",
    suggestedActions: ["Add mission-specific rental vehicle justification", "Explain movement between lodging, training site, and support locations"],
    evidenceArtifactIds: evidence?.evidenceArtifactIds ?? [],
    rationale: evidence?.rationale || "A reviewer may ask why rental vehicles are required for this mission.",
    confidence: evidence?.confidence ?? 0.82
  });
}

function mergeFinding(existing: AgentFinding | undefined, fallback: AgentFinding): AgentFinding {
  return {
    ...fallback,
    ...existing,
    id: fallback.id,
    title: existing?.title || fallback.title,
    status: isOpenStatus(fallback.status) ? fallback.status : existing?.status || fallback.status,
    summary: existing?.summary || fallback.summary,
    owner: existing?.owner || fallback.owner,
    suggestedActions: existing?.suggestedActions?.length ? existing.suggestedActions : fallback.suggestedActions,
    evidenceArtifactIds: existing?.evidenceArtifactIds?.length ? existing.evidenceArtifactIds : fallback.evidenceArtifactIds,
    rationale: existing?.rationale || fallback.rationale,
    confidence: existing?.confidence ?? fallback.confidence
  };
}

function openStatus(existingStatus: Status | undefined, evidenceStatus: Status | undefined, fallback: Status): Status {
  for (const status of [existingStatus, evidenceStatus]) {
    if (status && isOpenStatus(status)) return status;
  }
  return fallback;
}

function isOpenStatus(status: Status) {
  return !["Found", "Improved", "Resolved", "Low"].includes(status);
}

function findEvidence(evidenceMap: FieldDeskAgentObjectOutput["evidenceMap"], pattern: RegExp) {
  return evidenceMap.find((item) => pattern.test(`${item.requirement} ${item.evidenceSummary} ${item.rationale}`));
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

export const requiredSourceRows = ["Outlook", "SharePoint", "GSA", "JTR", "Unit Checklist", "Local SOP"];
const requiredEvidenceRequirements = [
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
];

export const fieldDeskAgentObjectOutputJsonSchema = {
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
