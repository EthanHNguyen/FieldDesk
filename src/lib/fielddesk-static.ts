export const missionIntent =
  "Send 10 soldiers to Demo Training Site for training from June 10-14. Lodging and rental vehicles required.";

export const missionSummary = {
  workflow: "TDY Travel",
  destination: "Demo Training Site",
  dates: "June 10-14",
  travelers: "10"
};

export const tripFacts = {
  destination: "Demo Training Site",
  locality: "Columbus, GA",
  startDate: "2026-06-10",
  endDate: "2026-06-14",
  travelers: 10,
  evidenceArtifactIds: ["sp-001"],
  confidence: 0.95,
  rationale: "Extracted from mission intent and training order artifacts."
};

export const workflowSteps = [
  "Capture Intent",
  "Search Sources",
  "Build Evidence Map",
  "Surface Gaps",
  "Resolve & Recompute",
  "Export to DTS"
];

export const sourceToggles = ["Outlook", "SharePoint", "GSA", "JTR", "Unit Checklist", "Local SOP"];
export const expectedOutputs = ["Evidence Map", "Readiness Assessment", "Reviewer Objections", "Action List", "DTS Export Draft"];

export const workflows = [
  {
    title: "TDY Travel Readiness",
    description: "Collect evidence, surface gaps, and prepare work for DTS routing.",
    category: "Travel",
    icon: "Airplane",
    accent: "blue",
    featured: true,
    lastRun: "2h ago",
    usage: "24 runs"
  },
  {
    title: "Leave Request",
    description: "Assemble required approvals, dates, and supporting documents.",
    category: "Personnel",
    icon: "Calendar",
    accent: "green",
    featured: false,
    lastRun: "1d ago",
    usage: "18 runs"
  },
  {
    title: "Supply Request",
    description: "Prepare request packets, funding support, and routing artifacts.",
    category: "Logistics",
    icon: "Cube",
    accent: "purple",
    featured: false,
    lastRun: "1d ago",
    usage: "15 runs"
  },
  {
    title: "Maintenance Request",
    description: "Track maintenance inputs, required forms, and readiness blockers.",
    category: "Readiness",
    icon: "Wrench",
    accent: "orange",
    featured: false,
    lastRun: "2d ago",
    usage: "12 runs"
  },
  {
    title: "Training Approval",
    description: "Prepare training support, rosters, approvals, and justifications.",
    category: "Readiness",
    icon: "Graduate",
    accent: "blue",
    featured: false,
    lastRun: "3d ago",
    usage: "10 runs"
  },
  {
    title: "Personnel Action",
    description: "Collect supporting records for admin changes and review.",
    category: "Personnel",
    icon: "Id",
    accent: "teal",
    featured: false,
    lastRun: "4d ago",
    usage: "14 runs"
  },
  {
    title: "Range Request",
    description: "Assemble scheduling, safety, and approval requirements.",
    category: "Readiness",
    icon: "Target",
    accent: "red",
    featured: false,
    lastRun: "5d ago",
    usage: "9 runs"
  },
  {
    title: "Award Package",
    description: "Build complete award submissions with citations and endorsements.",
    category: "Personnel",
    icon: "Award",
    accent: "gold",
    featured: false,
    lastRun: "6d ago",
    usage: "8 runs"
  }
] as const;

export const sourceSearchResults = [
  ["Outlook", "Found approval email from Demo Approver"],
  ["Outlook", "Found reviewer note requesting fund cite"],
  ["SharePoint", "Found training_order.pdf"],
  ["SharePoint", "Found roster_v2.csv"],
  ["SharePoint", "Found unit_tdy_checklist.pdf"],
  ["GSA", "Found Demo Training Site per diem rates"],
  ["JTR", "Found lodging and rental vehicle references"],
  ["Local SOP", "Found unit TDY routing expectations"],
  ["Funding Folder", "No funding memo found"]
] as const;

export const evidenceMap = [
  ["Mission purpose", "Training order", "SharePoint", "Found"],
  ["Travel dates", "Training order + intent", "SharePoint / Input", "Found"],
  ["Destination", "Training order + intent", "SharePoint / Input", "Found"],
  ["Traveler roster", "roster_v2.csv", "SharePoint", "Found"],
  ["Approval", "Demo Approver email", "Outlook", "Found"],
  ["Per diem estimate", "Demo Training Site rate data", "GSA", "Found"],
  ["Policy reference", "JTR excerpts", "JTR", "Found"],
  ["Unit checklist", "unit_tdy_checklist.pdf", "SharePoint", "Found"],
  ["Rental vehicle justification", "User intent only", "Input", "Weak"],
  ["Funding source", "None", "Outlook / SharePoint / Funding Folder", "Missing"]
] as const;

export const readinessAreas = [
  ["Mission intent", "Found"],
  ["Destination", "Found"],
  ["Dates", "Found"],
  ["Traveler count", "Conflict"],
  ["Approval", "Found"],
  ["Per diem", "Found"],
  ["Funding", "Missing"],
  ["Rental vehicle", "Weak"],
  ["Reviewer risk", "High"]
] as const;

export const reviewerQuestions = [
  "Why does the request list 10 travelers while the roster lists 8?",
  "What funding source supports this TDY?",
  "Who approved lodging?",
  "Why are rental vehicles required?",
  "Does the per diem estimate match the travel dates and location?"
];

export const corrections = [
  ["roster_v3_corrected.csv", "Uploaded"],
  ["funding_memo.pdf", "Uploaded"],
  ["Rental vehicle justification", "Added"]
] as const;

export const actionList = [
  ["Confirm corrected roster", "Junior NCO", "Complete"],
  ["Attach funding memo", "Junior NCO", "Complete"],
  ["Add rental vehicle justification", "Junior NCO", "Complete"],
  ["Include per diem estimate", "FieldDesk", "Complete"],
  ["Route for human review", "Junior NCO", "Ready"]
] as const;

export const dtsRows = [
  ["Trip Type", "TDY"],
  ["Destination", "Demo Training Site"],
  ["Travel Dates", "June 10-14"],
  ["Travelers", "10 soldiers"],
  ["Purpose", "Training"],
  ["Lodging", "Required"],
  ["Rental Vehicle", "Required"],
  ["Funding Source", "funding_memo.pdf"],
  ["Per Diem", "GSA Demo Training Site rates"],
  ["Supporting Docs", "Training order, corrected roster, funding memo, approval email"]
] as const;

export const packageRows = [
  "Mission details mapped",
  "Travelers mapped",
  "Per diem estimate attached",
  "Funding memo attached",
  "Approval email attached",
  "Supporting documents packaged"
];

export const agentTrace = [
  {
    stepIndex: 1,
    kind: "plan",
    label: "Initialize workflow",
    observationSummary: "Mission intent captured; workflow steps initialized.",
    status: "Found"
  },
  {
    stepIndex: 2,
    kind: "tool_call",
    label: "Search Outlook",
    toolName: "searchSource",
    argsSummary: "source=Outlook, query=approval",
    observationSummary: "Found approval email and reviewer note.",
    artifactIds: ["outlook-001"],
    status: "Found"
  },
  {
    stepIndex: 3,
    kind: "tool_call",
    label: "Search SharePoint",
    toolName: "searchSource",
    argsSummary: "source=SharePoint, query=training order",
    observationSummary: "Found training order and roster.",
    artifactIds: ["sp-001", "sp-002"],
    status: "Found"
  },
  {
    stepIndex: 4,
    kind: "tool_call",
    label: "Calculate Per Diem",
    toolName: "calculatePerDiem",
    argsSummary: "travelers=10, location=Demo Training Site",
    observationSummary: "Deterministic per diem verification successful: $7,340.",
    status: "Found"
  },
  {
    stepIndex: 5,
    kind: "synthesis",
    label: "Generate Readiness",
    observationSummary: "Evidence map built; 3 gaps identified (roster, funding, justification).",
    status: "Weak"
  }
];
