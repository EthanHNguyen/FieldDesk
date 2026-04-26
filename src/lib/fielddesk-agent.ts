import {
  actionList,
  agentTrace as staticAgentTrace,
  corrections,
  dtsRows,
  evidenceMap,
  missionSummary,
  packageRows,
  readinessAreas,
  reviewerQuestions,
  tripFacts
} from "./fielddesk-static";
import { buildPerDiemVerification } from "./deterministic-rules";
import type { ActivityEvent, AgentIssue, AgentRunInput, EvidenceMapItem, FieldDeskAgentObjectOutput, FieldDeskAgentRun, ReadinessArea, SourceSearchResult, Status, AgentTraceStep } from "./fielddesk-types";

const resolvedReadinessAreas: ReadinessArea[] = [
  ["Mission intent", "Found"],
  ["Destination", "Found"],
  ["Dates", "Found"],
  ["Traveler count", "Resolved"],
  ["Approval", "Found"],
  ["Per diem", "Found"],
  ["Funding", "Found"],
  ["Rental vehicle", "Improved"],
  ["Reviewer risk", "Low"]
];

export function runFieldDeskAgent(input: AgentRunInput): FieldDeskAgentRun {
  const allResolved = input.resolutions.roster && input.resolutions.funding && input.resolutions.justification;
  const evidence = buildEvidenceMap(input);
  const issues = buildIssues(input);
  const sourceDegraded = input.selectedSources.length < 6;
  const score = allResolved ? 91 : Math.max(48, 72 - disabledSourcePenalty(input));
  const risk = allResolved && !sourceDegraded ? "Low" : "High";

  const run: Omit<FieldDeskAgentRun, "objectOutput"> = {
    mission: missionSummary,
    sourceSearchResults: buildSourceSearchResults(input),
    evidenceMap: evidence,
    readiness: {
      score,
      risk,
      riskLabel: risk === "Low" ? "Ready to route" : sourceDegraded ? "Source coverage gap" : "High review risk",
      areas: buildReadinessAreas(input, risk)
    },
    issues,
    reviewerQuestions: buildReviewerQuestions(input),
    corrections: buildCorrections(input),
    actionList: buildActionList(input),
    dtsRows: buildDtsRows(input),
    packageRows: [...packageRows],
    activityTrail: buildActivityTrail(input, issues),
    agentTrace: buildAgentTrace(input)
  };

  return {
    ...run,
    objectOutput: buildObjectOutput(run)
  };
}

function buildAgentTrace(input: AgentRunInput): AgentTraceStep[] {
  const allResolved = input.resolutions.roster && input.resolutions.funding && input.resolutions.justification;
  const trace = [...staticAgentTrace] as AgentTraceStep[];

  if (allResolved) {
    return [
      ...trace,
      {
        stepIndex: trace.length + 1,
        kind: "verification",
        label: "Correction verification",
        observationSummary: "All staged corrections verified against target state.",
        status: "Resolved"
      }
    ];
  }

  return trace;
}

function buildObjectOutput(run: Omit<FieldDeskAgentRun, "objectOutput">): FieldDeskAgentObjectOutput {

  return {
    mission: run.mission,
    tripFacts,
    agentTrace: [...run.agentTrace],
    sourceSearchResults: run.sourceSearchResults.map(([source, finding]) => ({
      source,
      finding,
      artifactIds: inferArtifactIds(`${source} ${finding}`)
    })),
    evidenceMap: run.evidenceMap.map(toAgentEvidenceItem),
    findings: run.issues.map((issue) => ({
      ...issue,
      evidenceArtifactIds: findingArtifactIds(issue),
      rationale: issue.summary,
      confidence: issue.status === "Missing" || issue.status === "Weak" ? 0.78 : 0.9
    })),
    reviewerObjections: run.reviewerQuestions.map((question) => ({
      question,
      rationale: "Reviewer may reject the packet if this point is not supported by attached evidence.",
      evidenceArtifactIds: inferArtifactIds(question)
    })),
    readiness: {
      ...run.readiness,
      areas: run.readiness.areas.map(([area, status]) => ({
        area,
        status,
        rationale: status === "Missing" || status === "Conflict" || status === "Weak" || status === "High" ? "Open risk remains for this area." : "Area is supported for review."
      }))
    },
    generatedWorkProduct: {
      packetSummary: "TDY packet prepared for Demo Training Site training with evidence, reviewer objections, corrections, and DTS draft fields assembled for human review.",
      rentalVehicleJustification: run.evidenceMap.find(([requirement]) => requirement === "Rental vehicle justification")?.[1] ?? "",
      dtsRows: run.dtsRows.map(([field, value]) => ({
        field,
        value,
        sourceArtifactIds: inferArtifactIds(`${field} ${value}`)
      })),
      packageRows: [...run.packageRows],
      actionList: run.actionList.map(([action, owner, status]) => ({
        action,
        owner,
        status
      }))
    },
    activityTrail: [...run.activityTrail]
  };
}

function toAgentEvidenceItem([requirement, evidence, source, status]: EvidenceMapItem) {
  const hasEvidence = evidence !== "None" && evidence !== "Source disabled";
  const perDiem = requirement === "Per diem estimate" && hasEvidence ? buildPerDiemVerification(tripFacts) : null;

  return {
    requirementId: requirement.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    requirement,
    status,
    evidenceArtifactIds: hasEvidence ? inferArtifactIds(`${evidence} ${source}`) : [],
    evidenceSummary: perDiem ? perDiem.summary : evidence,
    sourceSummary: perDiem ? "GSA fixture" : source,
    rationale: status === "Missing" || status === "Conflict" || status === "Weak" ? "Requires user action before routing." : "Evidence satisfies the workflow requirement.",
    confidence: status === "Missing" || status === "Weak" ? 0.72 : 0.9,
    mathVerified: perDiem ? true : undefined,
    policyReference: policyReferenceFor(requirement)
  };
}

function buildDtsRows(input: AgentRunInput) {
  const perDiem = input.selectedSources.includes("GSA") ? buildPerDiemVerification(tripFacts) : null;
  return dtsRows.map(([field, value]) => {
    if (/per diem/i.test(field)) {
      return [field, perDiem ? `${perDiem.formattedTotal} verified from GSA fixture` : "Missing GSA source for verification"] as const;
    }
    return [field, value] as const;
  });
}

function policyReferenceFor(requirement: string) {
  if (requirement === "Policy reference") {
    return {
      source: "JTR",
      reference: "Mocked JTR excerpt",
      excerpt: "TDY packets commonly include destination, dates, purpose, traveler data, lodging and meals information, transportation justification, and supporting authorization artifacts."
    };
  }

  if (["Unit checklist", "Funding source", "Rental vehicle justification"].includes(requirement)) {
    return {
      source: "Local SOP",
      reference: "TDY Packet Routing Expectations",
      excerpt: "Include a funding memo or line of accounting before routing; include per diem estimate and lodging requirement; provide mission-specific rental vehicle justification when rental vehicles are requested."
    };
  }

  return undefined;
}

function inferArtifactIds(text: string) {
  const ids: string[] = [];
  const checks: Array<[RegExp, string]> = [
    [/approval|demoapprover|outlook/i, "outlook-001"],
    [/fund|memo/i, "upload-003"],
    [/training_order|training order|purpose|dates|destination/i, "sp-001"],
    [/roster_v3|corrected roster/i, "sp-004"],
    [/roster|traveler/i, "sp-002"],
    [/checklist/i, "sp-003"],
    [/per diem|gsa/i, "gsa-001"],
    [/jtr|policy/i, "jtr-001"],
    [/sop|routing/i, "sop-001"],
    [/justification/i, "justification-001"]
  ];

  for (const [pattern, id] of checks) {
    if (pattern.test(text) && !ids.includes(id)) ids.push(id);
  }

  return ids;
}

function findingArtifactIds(issue: AgentIssue) {
  if (issue.id === "roster") return issue.status === "Resolved" ? ["sp-001", "sp-004"] : ["sp-001", "sp-002"];
  if (issue.id === "funding") return issue.status === "Found" ? ["upload-003"] : [];
  if (issue.id === "justification") return issue.status === "Improved" ? ["justification-001"] : [];
  return [];
}

function buildEvidenceMap(input: AgentRunInput): EvidenceMapItem[] {
  return evidenceMap.map(([requirement, evidence, source, status]) => {
    if (requirement === "Traveler roster" && input.resolutions.roster) {
      return [requirement, "roster_v3_corrected.csv", source, "Resolved"];
    }
    if (requirement === "Rental vehicle justification" && input.resolutions.justification) {
      return [requirement, input.vehicleJustification, "Input", "Improved"];
    }
    if (requirement === "Funding source" && input.resolutions.funding) {
      return [requirement, "funding_memo.pdf", "Funding Folder", "Found"];
    }
    const sourceStatus = statusForDisabledSource(requirement, input.selectedSources);
    if (sourceStatus) {
      return [requirement, sourceStatus.evidence, sourceStatus.source, sourceStatus.status];
    }
    return [requirement, evidence, source, status];
  });
}

function buildSourceSearchResults(input: AgentRunInput): SourceSearchResult[] {
  const rows = ["Outlook", "SharePoint", "GSA", "JTR", "Unit Checklist", "Local SOP"];

  return rows.map((source) => {
    if (!input.selectedSources.includes(source)) {
      return [source, "Source disabled for this run"];
    }
    return [source, sourceFinding(source)];
  });
}

function sourceFinding(source: string) {
  if (source === "Outlook") return "Found approval email from Demo Approver and reviewer note requesting fund cite";
  if (source === "SharePoint") return "Found training_order.pdf and roster_v2.csv";
  if (source === "GSA") return "Found Demo Training Site per diem rates";
  if (source === "JTR") return "Found lodging and rental vehicle references";
  if (source === "Unit Checklist") return "Found unit_tdy_checklist.pdf";
  if (source === "Local SOP") return "Found unit TDY routing expectations";
  return "Searched selected source artifacts";
}

function buildReadinessAreas(input: AgentRunInput, risk: "High" | "Low"): ReadinessArea[] {
  const base = input.resolutions.roster && input.resolutions.funding && input.resolutions.justification ? resolvedReadinessAreas : readinessAreas;

  return base.map(([area, status]) => {
    if (area === "Approval" && !input.selectedSources.includes("Outlook")) return [area, "Missing"];
    if ((area === "Traveler count" || area === "Funding") && !input.selectedSources.includes("SharePoint")) return [area, "Missing"];
    if (area === "Per diem" && !input.selectedSources.includes("GSA")) return [area, "Missing"];
    if (area === "Rental vehicle" && !input.selectedSources.includes("JTR")) return [area, "Weak"];
    if (area === "Reviewer risk") return [area, risk];
    return [area, status];
  });
}

function buildIssues(input: AgentRunInput): AgentIssue[] {
  const issues: AgentIssue[] = [
    {
      id: "roster",
      title: "Traveler count mismatch",
      status: input.resolutions.roster ? "Resolved" : "Conflict",
      summary: "Intent and order show 10 travelers; roster_v2.csv lists 8.",
      owner: "Junior NCO",
      suggestedActions: ["Use corrected roster", "Keep request at 10 travelers", "Attach roster delta note"]
    },
    {
      id: "funding",
      title: "Funding source missing",
      status: input.resolutions.funding ? "Found" : "Missing",
      summary: "No funding memo, fund cite, or funding approval artifact found.",
      owner: "Junior NCO",
      suggestedActions: ["Attach funding memo", "Extract fund cite", "Link approval email"]
    },
    {
      id: "justification",
      title: "Rental vehicle justification weak",
      status: input.resolutions.justification ? "Improved" : "Weak",
      summary: "Rental vehicles are requested, but mission-specific support is thin.",
      owner: "FieldDesk + Junior NCO",
      suggestedActions: ["Accept suggested language", "Add to packet summary", "Flag for reviewer visibility"]
    }
  ];

  return issues;
}

function statusForDisabledSource(requirement: string, selectedSources: string[]): { evidence: string; source: string; status: Status } | null {
  if ((requirement === "Approval") && !selectedSources.includes("Outlook")) {
    return { evidence: "Source disabled", source: "Outlook", status: "Missing" };
  }
  if ((requirement === "Traveler roster" || requirement === "Unit checklist") && !selectedSources.includes("SharePoint")) {
    return { evidence: "Source disabled", source: "SharePoint", status: "Missing" };
  }
  if (requirement === "Per diem estimate" && !selectedSources.includes("GSA")) {
    return { evidence: "Source disabled", source: "GSA", status: "Missing" };
  }
  if (requirement === "Policy reference" && !selectedSources.includes("JTR")) {
    return { evidence: "Source disabled", source: "JTR", status: "Missing" };
  }
  return null;
}

function buildReviewerQuestions(input: AgentRunInput) {
  return reviewerQuestions.filter((question) => {
    if (input.resolutions.roster && question.includes("10 travelers")) return false;
    if (input.resolutions.funding && question.includes("funding source")) return false;
    if (input.resolutions.justification && question.includes("rental vehicles")) return false;
    return true;
  });
}

function buildCorrections(input: AgentRunInput) {
  const staged = corrections.filter(([name]) => {
    if (name.includes("roster")) return input.resolutions.roster;
    if (name.includes("funding")) return input.resolutions.funding;
    if (name.includes("Rental")) return input.resolutions.justification;
    return false;
  });

  return staged.length > 0 ? staged : corrections;
}

function buildActionList(input: AgentRunInput) {
  return actionList.map(([action, owner, status]) => {
    if (action.includes("roster")) return [action, owner, input.resolutions.roster ? "Complete" : "Open"] as const;
    if (action.includes("funding")) return [action, owner, input.resolutions.funding ? "Complete" : "Open"] as const;
    if (action.includes("rental")) return [action, owner, input.resolutions.justification ? "Complete" : "Open"] as const;
    return [action, owner, status] as const;
  });
}

function buildActivityTrail(input: AgentRunInput, issues: AgentIssue[]): ActivityEvent[] {
  const stagedCount = Object.values(input.resolutions).filter(Boolean).length;
  const openCount = issues.filter((issue) => issue.status !== "Resolved" && issue.status !== "Improved" && issue.status !== "Found").length;

  return [
    {
      label: "Intent captured",
      detail: "Mission request parsed for TDY readiness.",
      status: "Found"
    },
    {
      label: "Sources searched",
      detail: `${input.selectedSources.length} source sets enabled.`,
      status: input.selectedSources.length >= 6 ? "Found" : "Weak"
    },
    {
      label: "Issues surfaced",
      detail: `${openCount} blocker${openCount === 1 ? "" : "s"} require action.`,
      status: openCount > 0 ? "High" : "Low"
    },
    {
      label: "Actions staged",
      detail: `${stagedCount} of 3 corrective actions staged.`,
      status: stagedCount === 3 ? "Resolved" : "Weak"
    }
  ];
}

function disabledSourcePenalty(input: AgentRunInput) {
  return ["Outlook", "SharePoint", "GSA", "JTR", "Unit Checklist", "Local SOP"].filter((source) => !input.selectedSources.includes(source)).length * 6;
}
