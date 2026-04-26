import {
  actionList,
  corrections,
  dtsRows,
  evidenceMap,
  missionSummary,
  packageRows,
  readinessAreas,
  reviewerQuestions,
  sourceSearchResults
} from "./fielddesk-static";
import type { AgentRunInput, EvidenceMapItem, FieldDeskAgentRun, ReadinessArea } from "./fielddesk-types";

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

  return {
    mission: missionSummary,
    sourceSearchResults: [...sourceSearchResults],
    evidenceMap: buildEvidenceMap(input),
    readiness: {
      score: allResolved ? 91 : 72,
      risk: allResolved ? "Low" : "High",
      riskLabel: allResolved ? "Ready to route" : "High review risk",
      areas: allResolved ? resolvedReadinessAreas : [...readinessAreas]
    },
    reviewerQuestions: buildReviewerQuestions(input),
    corrections: buildCorrections(input),
    actionList: buildActionList(input),
    dtsRows: [...dtsRows],
    packageRows: [...packageRows]
  };
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
    return [requirement, evidence, source, status];
  });
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
