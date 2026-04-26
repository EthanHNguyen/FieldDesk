export type Step = 1 | 2 | 3 | 4 | 5 | 6;

export type Status = "Found" | "Weak" | "Missing" | "Conflict" | "Resolved" | "Improved" | "High" | "Low";

export type IssueId = "roster" | "funding" | "justification";

export type ResolutionState = Record<IssueId, boolean>;

export type AgentRunInput = {
  intent: string;
  selectedSources: string[];
  resolutions: ResolutionState;
  vehicleJustification: string;
};

export type AgentMode = "mock" | "openai";

export type AgentRunTrigger = "initial_analysis" | "correction_staged" | "source_changed" | "justification_edited";

export type AgentRunRequest = {
  sessionId?: string;
  previousRunId?: string;
  trigger?: AgentRunTrigger;
  input: AgentRunInput;
};

export type SourceSearchResult = readonly [source: string, finding: string];

export type EvidenceMapItem = readonly [requirement: string, evidence: string, source: string, status: Status];

export type ReadinessArea = readonly [area: string, status: Status];

export type CorrectionItem = readonly [name: string, state: string];

export type ActionItem = readonly [action: string, owner: string, status: string];

export type DtsExportRow = readonly [field: string, value: string];

export type AgentIssue = {
  id: IssueId;
  title: string;
  status: Status;
  summary: string;
  owner: string;
  suggestedActions: string[];
};

export type ActivityEvent = {
  label: string;
  detail: string;
  status: Status;
};

export type FieldDeskAgentRun = {
  mission: {
    workflow: string;
    destination: string;
    dates: string;
    travelers: string;
  };
  sourceSearchResults: ReadonlyArray<SourceSearchResult>;
  evidenceMap: ReadonlyArray<EvidenceMapItem>;
  readiness: {
    score: number;
    risk: "High" | "Low";
    riskLabel: string;
    areas: ReadonlyArray<ReadinessArea>;
  };
  issues: ReadonlyArray<AgentIssue>;
  reviewerQuestions: ReadonlyArray<string>;
  corrections: ReadonlyArray<CorrectionItem>;
  actionList: ReadonlyArray<ActionItem>;
  dtsRows: ReadonlyArray<DtsExportRow>;
  packageRows: ReadonlyArray<string>;
  activityTrail: ReadonlyArray<ActivityEvent>;
};

export type AgentRunEnvelope = {
  sessionId: string;
  runId: string;
  previousRunId?: string;
  mode: AgentMode;
  trigger: AgentRunTrigger;
  status: "completed";
  createdAt: string;
  input: AgentRunInput;
  output: FieldDeskAgentRun;
  events: ReadonlyArray<ActivityEvent>;
};

export type AgentRunApiResponse =
  | {
      ok: true;
      envelope: AgentRunEnvelope;
      run: FieldDeskAgentRun;
    }
  | {
      ok: false;
      error: {
        code: "invalid_request" | "unsupported_agent_mode" | "agent_run_failed" | "invalid_agent_output";
        message: string;
        details?: string[];
      };
    };
