"use client";

import {
  Activity,
  Archive,
  Award,
  Bell,
  BookOpen,
  Box,
  Calendar,
  Car,
  Check,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Crosshair,
  Database,
  Download,
  FileText,
  Folder,
  GraduationCap,
  Grid3X3,
  IdCard,
  InfoIcon,
  Mail,
  MapPin,
  Package as PackageIcon,
  Plane,
  Play,
  Plus,
  Search,
  Shield,
  ShieldCheck,
  Target,
  Upload,
  UserCheck,
  Users,
  Wrench,
  type LucideIcon
} from "lucide-react";
import { useState, type CSSProperties } from "react";
import { requestFieldDeskAgentRun } from "../lib/fielddesk-client";
import {
  expectedOutputs,
  missionIntent,
  sourceToggles,
  workflows,
  workflowSteps
} from "../lib/fielddesk-static";
import type { FieldDeskAgentRun, IssueId, ResolutionState, Step, Status } from "../lib/fielddesk-types";

const initialResolutionState: ResolutionState = {
  roster: false,
  funding: false,
  justification: false
};

export default function Home() {
  const [showDashboard, setShowDashboard] = useState(true);
  const [step, setStep] = useState<Step>(1);
  const [intent, setIntent] = useState(missionIntent);
  const [resolved, setResolved] = useState(false);
  const [resolution, setResolution] = useState<ResolutionState>(initialResolutionState);
  const [activeIssue, setActiveIssue] = useState<keyof ResolutionState>("roster");
  const [vehicleJustification, setVehicleJustification] = useState(
    "Rental vehicles are required to move personnel between lodging, training site, and required training support locations due to schedule constraints and lack of available unit transportation."
  );
  const [agentRun, setAgentRun] = useState<FieldDeskAgentRun | null>(null);
  const [agentRunError, setAgentRunError] = useState<string | null>(null);
  const [selectedSources, setSelectedSources] = useState<string[]>(() => [...sourceToggles]);
  const allIssuesResolved = resolution.roster && resolution.funding && resolution.justification;

  async function submitAgentRun({
    nextStep,
    nextResolution = resolution,
    trigger
  }: {
    nextStep: Step;
    nextResolution?: ResolutionState;
    trigger: "initial_analysis" | "correction_staged" | "source_changed" | "justification_edited";
  }) {
    setStep(nextStep);
    setResolved(nextStep >= 5);
    setAgentRun(null);
    setAgentRunError(null);

    try {
      const run = await requestFieldDeskAgentRun(
        {
          intent,
          selectedSources,
          resolutions: nextResolution,
          vehicleJustification
        },
        trigger
      );
      setAgentRun(run);
    } catch (error: unknown) {
      setAgentRunError(error instanceof Error ? error.message : "Agent run failed.");
    }
  }

  function advance(next: Step) {
    setStep(next);
    if (next >= 5) setResolved(true);
  }

  function openDashboard() {
    setShowDashboard(true);
  }

  function openWorkflow() {
    setShowDashboard(false);
    setStep(1);
    setResolved(false);
    setResolution(initialResolutionState);
    setAgentRun(null);
    setAgentRunError(null);
    setActiveIssue("roster");
    setSelectedSources([...sourceToggles]);
  }

  function stageResolution(key: IssueId) {
    setResolution((current) => ({ ...current, [key]: true }));
    if (key === "roster") setActiveIssue("funding");
    if (key === "funding") setActiveIssue("justification");
  }

  function applyDemoCorrections() {
    const nextResolution = { roster: true, funding: true, justification: true };
    setResolution(nextResolution);
    void submitAgentRun({ nextStep: 5, nextResolution, trigger: "correction_staged" });
  }

  return (
    <main>
      <ClassificationBanner />
      <TopNav onWorkflows={openDashboard} />
      <div className="page">
        {showDashboard ? (
          <WorkflowsDashboard onOpen={openWorkflow} />
        ) : (
          <>
            <section className="hero">
              <h1>TDY Travel Readiness</h1>
              <p>Transforms fragmented administrative work into mission-ready action.</p>
              <p>Reduce drag. Surface gaps. Accelerate execution.</p>
            </section>
            <div className="workspace">
              <section className="mainPanel">
                {step === 1 && (
                  <CaptureIntent
                    intent={intent}
                    selectedSources={selectedSources}
                    setIntent={setIntent}
                    setSelectedSources={setSelectedSources}
                    onStart={() => void submitAgentRun({ nextStep: 2, trigger: "initial_analysis" })}
                  />
                )}
                {step !== 1 && !agentRun && (
                  <AgentRunState
                    error={agentRunError}
                    resolution={resolution}
                    selectedSources={selectedSources}
                    step={step}
                  />
                )}
                {step === 2 && agentRun && <SearchSources intent={intent} run={agentRun} onNext={() => advance(3)} />}
                {step === 3 && agentRun && <EvidenceMap run={agentRun} onNext={() => advance(4)} />}
                {step === 4 && agentRun && (
                  <SurfaceGaps
                    activeIssue={activeIssue}
                    allIssuesResolved={allIssuesResolved}
                    justification={vehicleJustification}
                    resolution={resolution}
                    run={agentRun}
                    onActiveIssue={setActiveIssue}
                    onJustificationChange={setVehicleJustification}
                    onResolve={applyDemoCorrections}
                    onStageResolution={stageResolution}
                    onRecompute={() => void submitAgentRun({ nextStep: 5, trigger: "correction_staged" })}
                  />
                )}
                {step === 5 && agentRun && <ResolveRecompute run={agentRun} onExport={() => advance(6)} />}
                {step === 6 && agentRun && <ExportDts run={agentRun} />}
              </section>
              {agentRun && <MissionRail run={agentRun} step={step} resolved={resolved} />}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function AgentRunState({
  error,
  resolution,
  selectedSources,
  step
}: {
  error: string | null;
  resolution: ResolutionState;
  selectedSources: string[];
  step: Step;
}) {
  const correctionMode = step >= 5;
  const steps = correctionMode
    ? [
        {
          icon: "Upload",
          title: "Ingest staged evidence",
          detail: [
            resolution.roster ? "Corrected roster" : null,
            resolution.funding ? "Funding memo" : null,
            resolution.justification ? "Vehicle justification" : null
          ].filter(Boolean).join(", ") || "Waiting for staged corrections"
        },
        { icon: "Document", title: "Rebuild evidence map", detail: "Refreshing requirement coverage from the updated packet." },
        { icon: "Readiness", title: "Re-score readiness", detail: "Checking whether blockers moved from open risk to route-ready." },
        { icon: "Action List", title: "Prepare final work product", detail: "Updating reviewer notes, action list, and DTS draft fields." }
      ]
    : [
        ...selectedSources.map((source) => ({
          icon: source,
          title: `Searching ${source}`,
          detail: sourceDetail(source)
        })),
        { icon: "Library", title: "Consolidating evidence", detail: "Deduplicating source findings and aligning them to TDY requirements." },
        { icon: "Alert", title: "Analyzing gaps and conflicts", detail: "Checking for missing funding, roster mismatches, and weak justifications." },
        { icon: "Readiness", title: "Preparing readiness assessment", detail: "Scoring return risk and drafting reviewer objections." }
      ];

  return (
    <Card>
      <h2>
        <Icon name="Activity" /> Agent Run
      </h2>
      {error ? (
        <>
          <p className="muted">{error}</p>
          <StatusPill status="High" label="API boundary unavailable" />
        </>
      ) : (
        <>
          <p className="muted">{correctionMode ? "Recomputing readiness from staged corrections." : "Searching sources and building the TDY readiness picture."}</p>
          <div className="analysisBanner activeRunBanner">
            <span className="spinner" />
            <div>
              <strong>{correctionMode ? "Recomputing corrected packet" : `Collecting evidence across ${selectedSources.length} sources`}</strong>
              <span>{correctionMode ? "The agent is validating staged evidence and updating outputs." : "The agent is searching, consolidating, and analyzing evidence."}</span>
            </div>
            <span className="progressText">Agent running</span>
          </div>
          <div className="agentTimeline" aria-label="Agent run progress">
            {steps.map((item, index) => (
              <div className="agentStep" key={`${item.title}-${index}`} style={{ "--step-delay": `${index * 0.42}s` } as CSSProperties}>
                <span className="agentStepIcon">
                  <Icon name={item.icon} />
                </span>
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.detail}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

function sourceDetail(source: string) {
  if (source === "Outlook") return "Scanning approvals, reviewer comments, and funding-related email threads.";
  if (source === "SharePoint") return "Checking training orders, rosters, unit checklists, and prior packet files.";
  if (source === "GSA") return "Retrieving per diem rate evidence for Demo Training Site.";
  if (source === "JTR") return "Reading TDY policy excerpts for required support and justifications.";
  if (source === "Unit Checklist") return "Comparing packet contents against required unit routing artifacts.";
  if (source === "Local SOP") return "Applying local routing expectations before review.";
  return "Searching selected source artifacts.";
}

function ClassificationBanner() {
  return <div className="classificationBanner">SYNTHETIC DEMO · NO REAL PERSONNEL DATA · NO LIVE SYSTEMS</div>;
}

function TopNav({ onWorkflows }: { onWorkflows: () => void }) {
  return (
    <header className="topNav">
      <div className="brand">
        <div className="mark">F</div>
        <span>FieldDesk</span>
      </div>
      <nav aria-label="Primary">
        {["Workflows", "Sources", "Activity", "Outputs"].map((item, index) => (
          <button className={index === 0 ? "navActive" : ""} key={item} type="button" onClick={index === 0 ? onWorkflows : undefined}>
            <Icon name={item} />
            {item}
          </button>
        ))}
      </nav>
      <div className="account">
        <button type="button" className="teamButton">
          <Icon name="Team" /> Demo Team
        </button>
        <span className="bell">
          <Bell size={18} aria-hidden="true" />
        </span>
        <span className="avatar">DU</span>
        <span>Demo User</span>
      </div>
    </header>
  );
}

function WorkflowsDashboard({ onOpen }: { onOpen: () => void }) {
  return (
    <>
      <section className="dashboardHero">
        <div>
          <h1>Workflows</h1>
          <p>Standardized administrative workflows for mission execution.</p>
          <p>Reduce drag. Surface gaps. Accelerate execution.</p>
        </div>
        <div className="dashboardActions">
          <button className="primary" type="button">
            <Plus size={18} aria-hidden="true" /> New Workflow
          </button>
          <button className="secondary" type="button">
            <Icon name="Export" /> Import Template
          </button>
        </div>
      </section>
      <div className="dashboardGrid">
        <section>
          <div className="filterBar">
            <label className="searchBox">
              <Icon name="Search" />
              <input aria-label="Search workflows" placeholder="Search workflows..." />
            </label>
            {["All", "Travel", "Personnel", "Logistics", "Readiness", "Recently used"].map((filter) => (
              <button className={filter === "All" ? "filterActive" : ""} type="button" key={filter}>
                {filter}
              </button>
            ))}
          </div>
          <div className="workflowCards">
            {workflows.map((workflow) => (
              <article className={`workflowCard ${workflow.featured ? "featuredCard" : ""}`} key={workflow.title}>
                <div className="workflowTop">
                  <span className={`workflowIcon ${workflow.accent}`}>
                    <Icon name={workflow.icon} />
                  </span>
                  {workflow.featured && (
                    <span className="featuredBadge">
                      <ShieldCheck size={13} aria-hidden="true" /> Featured
                    </span>
                  )}
                </div>
                <h2>{workflow.title}</h2>
                <p>{workflow.description}</p>
                <span className={`categoryTag ${workflow.accent}`}>
                  <Icon name={workflow.category} /> {workflow.category}
                </span>
                <dl className="workflowMeta">
                  <div>
                    <dt>Owner</dt>
                    <dd>Demo Team</dd>
                  </div>
                  <div>
                    <dt>Last run</dt>
                    <dd>{workflow.lastRun}</dd>
                  </div>
                  <div>
                    <dt>Usage</dt>
                    <dd>{workflow.usage}</dd>
                  </div>
                </dl>
                <button className={workflow.featured ? "primary openWorkflow" : "secondary openWorkflow"} type="button" onClick={workflow.featured ? onOpen : undefined}>
                  Open <ChevronRight size={16} aria-hidden="true" />
                </button>
              </article>
            ))}
          </div>
        </section>
        <DashboardRail />
      </div>
    </>
  );
}

function DashboardRail() {
  return (
    <aside className="dashboardRail">
      <Card>
        <h2>
          <Icon name="Library" /> Library Overview
        </h2>
        {[
          ["Active Workflows", "8"],
          ["Featured", "1"],
          ["Recently Used", "3"],
          ["Ready Templates", "8"]
        ].map(([label, value]) => (
          <div className="railMetric" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
        <button className="linkButton" type="button">
          View all templates ›
        </button>
      </Card>
      <Card>
        <div className="railHeader">
          <h2>
            <Icon name="Clock" /> Recently Used
          </h2>
          <button className="linkButton compact" type="button">
            View all
          </button>
        </div>
        {[
          ["TDY Travel Readiness", "Opened 2h ago", "Airplane"],
          ["Supply Request", "Updated yesterday", "Cube"],
          ["Leave Request", "Used this week", "Calendar"]
        ].map(([title, detail, icon]) => (
          <div className="recentItem" key={title}>
            <span className="workflowIcon small">
              <Icon name={icon} />
            </span>
            <div>
              <strong>{title}</strong>
              <span>{detail}</span>
            </div>
          </div>
        ))}
      </Card>
      <Card>
        <h2>
          <Icon name="Outputs" /> Common Outputs
        </h2>
        {expectedOutputs.map((output) => (
          <div className="outputLine" key={output}>
            <span className="smallCheck">
              <Check size={13} aria-hidden="true" />
            </span>
            {output}
          </div>
        ))}
        <p className="railNote">Outputs configure in workflow steps <Info /></p>
      </Card>
    </aside>
  );
}

function CaptureIntent({
  intent,
  selectedSources,
  setIntent,
  setSelectedSources,
  onStart
}: {
  intent: string;
  selectedSources: string[];
  setIntent: (value: string) => void;
  setSelectedSources: (value: string[]) => void;
  onStart: () => void;
}) {
  function toggleSource(source: string) {
    setSelectedSources(
      selectedSources.includes(source)
        ? selectedSources.filter((selected) => selected !== source)
        : [...selectedSources, source]
    );
  }

  return (
    <Card>
      <SectionTitle number="1" title="Mission Intent" />
      <p className="muted">Describe the mission request in natural language.</p>
      <label className="srOnly" htmlFor="intent">
        Mission intent
      </label>
      <textarea id="intent" value={intent} onChange={(event) => setIntent(event.target.value)} maxLength={2000} />
      <div className="charCount">{intent.length}/2000</div>
      <Divider />
      <SectionTitle number="2" title="Sources" />
      <p className="muted">Select the authoritative sources to ground analysis.</p>
      <div className="toggleGrid">
        {sourceToggles.map((source) => (
          <SourceToggle active={selectedSources.includes(source)} key={source} label={source} onToggle={() => toggleSource(source)} />
        ))}
      </div>
      <Divider />
      <SectionTitle number="3" title="Expected Outputs" />
      <p className="muted">Select the artifacts this workflow should produce.</p>
      <div className="outputGrid">
        {expectedOutputs.map((output) => (
          <span className="checkItem" key={output}>
            <span className="checkbox">
              <Check size={13} aria-hidden="true" />
            </span>
            <Icon name={output} />
            {output}
          </span>
        ))}
      </div>
      <div className="buttonRow">
        <button type="button" className="primary" onClick={onStart}>
          <Icon name="Play" /> Start Analysis
        </button>
      </div>
    </Card>
  );
}

function SearchSources({ intent, run, onNext }: { intent: string; run: FieldDeskAgentRun; onNext: () => void }) {
  return (
    <Card>
      <SectionTitle number="2" title="Search Sources" />
      <p className="muted">Searching authoritative sources for supporting evidence.</p>
      <div className="analysisBanner">
        <span className="smallCheck">
          <Check size={13} aria-hidden="true" />
        </span>
        <div>
          <strong>Collecting evidence across {run.sourceSearchResults.length} sources</strong>
          <span>Source search completed.</span>
        </div>
        <span className="progressText">Complete</span>
      </div>
      <table>
        <thead>
          <tr>
            <th>Source</th>
            <th>Status</th>
            <th>Findings</th>
          </tr>
        </thead>
        <tbody>
          {run.sourceSearchResults.map(([source, result]) => (
            <tr key={`${source}-${result}`}>
              <td>
                <Icon name={source} /> {source}
              </td>
              <td>
                <StatusPill
                  status={result.includes("disabled") || source === "Funding Folder" ? "Missing" : "Found"}
                  label={result.includes("disabled") ? "Disabled" : source === "Funding Folder" ? "Not Found" : "Complete"}
                />
              </td>
              <td>{result}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="capturedIntent">
        <strong>Captured Intent</strong>
        <span>
          <Icon name="Document" /> {intent}
        </span>
      </div>
      <BottomAction label="Build Evidence Map" onClick={onNext} />
    </Card>
  );
}

function EvidenceMap({ run, onNext }: { run: FieldDeskAgentRun; onNext: () => void }) {
  const foundCount = run.evidenceMap.filter((row) => row[3] === "Found" || row[3] === "Resolved").length;
  const weakCount = run.evidenceMap.filter((row) => row[3] === "Weak" || row[3] === "Improved").length;
  const missingCount = run.evidenceMap.filter((row) => row[3] === "Missing" || row[3] === "Conflict").length;

  return (
    <Card>
      <div className="cardHeader">
        <div>
          <h2>Evidence Map <Info /></h2>
          <p className="muted">Map discovered evidence to workflow requirements.</p>
        </div>
        <div className="summaryPills">
          <Counter color="green" value={foundCount} label="Found" />
          <Counter color="orange" value={weakCount} label="Weak" />
          <Counter color="red" value={missingCount} label="Missing" />
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Requirement</th>
            <th>Evidence</th>
            <th>Source</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {run.evidenceMap.map(([requirement, evidence, source, status]) => (
            <tr key={requirement}>
              <td>{requirement}</td>
              <td>{evidence}</td>
              <td>
                <Icon name={source} /> {source}
              </td>
              <td>
                <StatusPill status={status as Status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <BottomAction label="Surface Gaps" onClick={onNext} />
    </Card>
  );
}

function SurfaceGaps({
  activeIssue,
  allIssuesResolved,
  justification,
  resolution,
  run,
  onActiveIssue,
  onJustificationChange,
  onResolve,
  onStageResolution,
  onRecompute
}: {
  activeIssue: keyof ResolutionState;
  allIssuesResolved: boolean;
  justification: string;
  resolution: ResolutionState;
  run: FieldDeskAgentRun;
  onActiveIssue: (issue: keyof ResolutionState) => void;
  onJustificationChange: (value: string) => void;
  onResolve: () => void;
  onStageResolution: (issue: keyof ResolutionState) => void;
  onRecompute: () => void;
}) {
  return (
    <div className="stack">
      <Card>
        <h2>
          <Icon name="Readiness" /> Readiness Assessment
        </h2>
        <div className="readinessGrid">
          <div className="scoreBlock">
            <span>Readiness Score <Info /></span>
            <strong className="scoreBlue">{run.readiness.score}</strong>
            <em>/ 100</em>
          </div>
          <div className="scoreBlock">
            <span>Risk of Return <Info /></span>
            <strong className="riskHigh">
              <Icon name="Alert" /> {run.readiness.risk}
            </strong>
            <em>{run.readiness.riskLabel}</em>
          </div>
          <StatusMatrix items={run.readiness.areas} />
        </div>
      </Card>
      <Card>
        <GapTitle number="2" title="Return Risk" tone="red" />
        <p className="muted">This packet is likely to come back from review unless the open blockers are staged and recomputed.</p>
        <div className="packageList">
          {run.issues
            .filter((issue) => !["Found", "Improved", "Resolved"].includes(issue.status))
            .map((issue) => (
              <div key={issue.id}>
                <span>
                  <Icon name="Alert" /> {issue.title}
                </span>
                <StatusPill status={issue.status} />
              </div>
            ))}
        </div>
      </Card>
      <IssueResolutionWorkspace
        activeIssue={activeIssue}
        justification={justification}
        resolution={resolution}
        run={run}
        onActiveIssue={onActiveIssue}
        onJustificationChange={onJustificationChange}
        onStageResolution={onStageResolution}
      />
      <Card>
        <GapTitle number="3" title="Likely Reviewer Objections" tone="orange" />
        <ol className="questions">
          {run.reviewerQuestions.map((question) => (
            <li key={question}>{question}</li>
          ))}
        </ol>
      </Card>
      <div className="buttonRow">
        <button type="button" className="primary" onClick={allIssuesResolved ? onRecompute : () => onStageResolution(activeIssue)}>
          {allIssuesResolved ? "Recompute Readiness" : "Stage Selected Action"}
        </button>
        <button type="button" className="secondary" onClick={onResolve}>
          Stage All Demo Evidence
        </button>
      </div>
    </div>
  );
}

function IssueResolutionWorkspace({
  activeIssue,
  justification,
  resolution,
  run,
  onActiveIssue,
  onJustificationChange,
  onStageResolution
}: {
  activeIssue: keyof ResolutionState;
  justification: string;
  resolution: ResolutionState;
  run: FieldDeskAgentRun;
  onActiveIssue: (issue: keyof ResolutionState) => void;
  onJustificationChange: (value: string) => void;
  onStageResolution: (issue: keyof ResolutionState) => void;
}) {
  const activeIssueData = run.issues.find((issue) => issue.id === activeIssue);
  const openIssueCount = run.issues.filter((issue) => !["Found", "Improved", "Resolved"].includes(issue.status)).length;

  return (
    <Card>
      <div className="resolverHeader">
        <div>
          <h2>
            <Icon name="Action List" /> Resolve Issues
          </h2>
          <p className="muted">Select a blocker, take a suggested action, then recompute readiness when evidence is staged.</p>
        </div>
        <StatusPill status={Object.values(resolution).every(Boolean) ? "Low" : "High"} label={Object.values(resolution).every(Boolean) ? "Ready to recompute" : `${openIssueCount} blockers`} />
      </div>
      <div className="resolverGrid">
        <div className="issueQueue">
          {run.issues.map((issue, index) => (
            <button
              className={`issueQueueItem ${activeIssue === issue.id ? "active" : ""}`}
              key={issue.id}
              onClick={() => onActiveIssue(issue.id)}
              type="button"
            >
              <span className="issueNumber">{index + 1}</span>
              <span>
                <strong>{issue.title}</strong>
                <em>{issue.summary}</em>
              </span>
              <StatusPill status={issue.status} />
            </button>
          ))}
        </div>
        <div className="issueWorkbench">
          {activeIssue === "roster" && (
            <RosterResolution actions={activeIssueData?.suggestedActions ?? []} resolved={resolution.roster} onStage={() => onStageResolution("roster")} />
          )}
          {activeIssue === "funding" && (
            <FundingResolution actions={activeIssueData?.suggestedActions ?? []} resolved={resolution.funding} onStage={() => onStageResolution("funding")} />
          )}
          {activeIssue === "justification" && (
            <JustificationResolution
              actions={activeIssueData?.suggestedActions ?? []}
              justification={justification}
              resolved={resolution.justification}
              onChange={onJustificationChange}
              onStage={() => onStageResolution("justification")}
            />
          )}
        </div>
      </div>
    </Card>
  );
}

function RosterResolution({ actions, resolved, onStage }: { actions: string[]; resolved: boolean; onStage: () => void }) {
  return (
    <div className="resolutionPanel">
      <GapTitle number="1" title="Conflict Detected" />
      <table className="miniTable">
        <thead>
          <tr>
            <th>User intent</th>
            <th>Training order</th>
            <th>Current roster</th>
            <th>Proposed roster</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>10</td>
            <td>10</td>
            <td className="redText">8</td>
            <td className="greenText">10</td>
          </tr>
        </tbody>
      </table>
      <div className="evidenceDrop">
        <Icon name="Document" />
        <div>
          <strong>roster_v3_corrected.csv</strong>
          <span>Detected 10 selected personnel. Replaces roster_v2.csv for this packet.</span>
        </div>
        <StatusPill status={resolved ? "Resolved" : "Found"} label={resolved ? "Staged" : "Suggested"} />
      </div>
      <ActionChips actions={actions} />
      <button className="primary" type="button" onClick={onStage}>
        <Icon name="Upload" /> {resolved ? "Correction Staged" : "Stage Corrected Roster"}
      </button>
    </div>
  );
}

function FundingResolution({ actions, resolved, onStage }: { actions: string[]; resolved: boolean; onStage: () => void }) {
  return (
    <div className="resolutionPanel">
      <GapTitle number="2" title="Missing Artifact" />
      <p>
        <strong className="redText">No funding source detected.</strong>
        <span>No funding memo, fund cite, or funding approval artifact was found in any connected source.</span>
      </p>
      <div className="evidenceDrop">
        <Icon name="Funding" />
        <div>
          <strong>funding_memo.pdf</strong>
          <span>Includes planning line of accounting and covers 10 travelers for June 10-14.</span>
        </div>
        <StatusPill status={resolved ? "Resolved" : "Found"} label={resolved ? "Attached" : "Found in folder"} />
      </div>
      <ActionChips actions={actions} />
      <button className="primary" type="button" onClick={onStage}>
        <Icon name="Upload" /> {resolved ? "Funding Attached" : "Attach Funding Memo"}
      </button>
    </div>
  );
}

function JustificationResolution({
  actions,
  justification,
  resolved,
  onChange,
  onStage
}: {
  actions: string[];
  justification: string;
  resolved: boolean;
  onChange: (value: string) => void;
  onStage: () => void;
}) {
  return (
    <div className="resolutionPanel">
      <GapTitle number="3" title="Weak Justification" tone="orange" />
      <p>FieldDesk drafted mission-specific language. Review or edit it before staging the packet update.</p>
      <label className="resolverLabel" htmlFor="vehicle-justification">Rental vehicle justification</label>
      <textarea
        className="justificationInput"
        id="vehicle-justification"
        value={justification}
        onChange={(event) => onChange(event.target.value)}
      />
      <ActionChips actions={actions} />
      <button className="primary" type="button" onClick={onStage}>
        <Icon name="Document" /> {resolved ? "Justification Added" : "Add Justification"}
      </button>
    </div>
  );
}

function ResolveRecompute({ run, onExport }: { run: FieldDeskAgentRun; onExport: () => void }) {
  return (
    <div className="stack">
      <Card className="successCard">
        <h2>
          <span className="bigCheck">
            <Check size={25} aria-hidden="true" />
          </span> Updated Readiness
        </h2>
        <div className="readinessGrid">
          <div className="scoreBlock">
            <span>Readiness Score</span>
            <strong className="scoreGreen">{run.readiness.score}</strong>
            <em>/ 100</em>
          </div>
          <div className="scoreBlock">
            <span>Risk of Return</span>
            <strong className={run.readiness.risk === "Low" ? "riskLow" : "riskHigh"}>
              <ShieldCheck size={30} aria-hidden="true" /> {run.readiness.risk}
            </strong>
          </div>
          <StatusMatrix items={run.readiness.areas} />
        </div>
      </Card>
      <Card>
        <h2>Corrections Applied</h2>
        <div className="correctionGrid">
          {run.corrections.map(([name, state]) => (
            <div className="correction" key={name}>
              <Icon name={name} />
              <div>
                <strong>{name}</strong>
                <span>{state}</span>
              </div>
              <StatusPill status="Found" label="Complete" />
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <h2>Action List</h2>
        <table>
          <thead>
            <tr>
              <th>Action</th>
              <th>Owner</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {run.actionList.map(([action, owner, status]) => (
              <tr key={action}>
                <td>
                  <span className="smallCheck">
                    <Check size={13} aria-hidden="true" />
                  </span> {action}
                </td>
                <td>{owner}</td>
                <td>
                  <StatusPill status={status === "Ready" ? "Low" : status === "Open" ? "Weak" : "Found"} label={status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <div className="buttonRow">
        <button type="button" className="primary" onClick={onExport}>
          <Icon name="Document" /> Generate Final Package
        </button>
        <button type="button" className="secondary" onClick={onExport}>
          <Icon name="Export" /> Start Automated DTS Entry
        </button>
      </div>
    </div>
  );
}

function ExportDts({ run }: { run: FieldDeskAgentRun }) {
  const workProduct = run.objectOutput.generatedWorkProduct;

  return (
    <div className="stack">
      <div className="routeBanner">
        <span className="bigCheck">
          <Check size={25} aria-hidden="true" />
        </span>
        <div>
          <strong>Ready to Route</strong>
          <span>DTS handoff package prepared.</span>
        </div>
      </div>
      <Card>
        <h2>Packet Summary</h2>
        <p>{workProduct.packetSummary}</p>
        <Divider />
        <h2>Rental Vehicle Justification</h2>
        <p>{workProduct.rentalVehicleJustification}</p>
      </Card>
      <Card>
        <h2>Evidence And Review Notes</h2>
        <table>
          <thead>
            <tr>
              <th>Requirement</th>
              <th>Evidence</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {run.objectOutput.evidenceMap.map((item) => (
              <tr key={item.requirementId}>
                <td>{item.requirement}</td>
                <td>{item.evidenceSummary}</td>
                <td>
                  <StatusPill status={item.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card>
        <h2>DTS Authorization Draft</h2>
        <p className="muted">Mock export showing how validated information maps into DTS.</p>
        <table>
          <thead>
            <tr>
              <th>DTS Field</th>
              <th>FieldDesk Value</th>
            </tr>
          </thead>
          <tbody>
            {run.dtsRows.map(([field, value]) => (
              <tr key={field}>
                <td>{field}</td>
                <td className={value.includes(".pdf") ? "linkText" : ""}>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card>
        <h2>Export Package</h2>
        <div className="packageList">
          {run.packageRows.map((row) => (
            <div key={row}>
              <span>
                <span className="smallCheck">
                  <Check size={13} aria-hidden="true" />
                </span> {row}
              </span>
              <StatusPill status="Found" label="Complete" />
            </div>
          ))}
        </div>
        <Divider />
        <h2>Source List</h2>
        <div className="packageList">
          {run.objectOutput.sourceSearchResults.map((source) => (
            <div key={`${source.source}-${source.finding}`}>
              <span>
                <Icon name={source.source} /> {source.source}
              </span>
              <StatusPill status={source.finding.includes("disabled") ? "Missing" : "Found"} label={source.finding.includes("disabled") ? "Disabled" : "Included"} />
            </div>
          ))}
        </div>
        <div className="buttonRow left">
          <button type="button" className="primary">
            <Icon name="Export" /> Start Automated DTS Entry
          </button>
          <button type="button" className="secondary">
            <Icon name="Download" /> Download Package
          </button>
        </div>
      </Card>
    </div>
  );
}

function MissionRail({ run, step, resolved }: { run: FieldDeskAgentRun; step: Step; resolved: boolean }) {
  const status = step === 1 ? "Intent captured" : step < 4 ? ["Analyzing sources", "Evidence mapped"][step - 2] : resolved ? "Ready for human review" : "High review risk";
  return (
    <aside className="rail">
      <h2>Mission Summary</h2>
      {Object.entries(run.mission).map(([label, value]) => (
        <div className="summaryRow" key={label}>
          <span>{titleCase(label)}</span>
          <strong>{value}</strong>
        </div>
      ))}
      <div className="summaryRow">
        <span>Status</span>
        <strong className={resolved ? "greenText" : step >= 4 ? "redText" : "blueText"}>
          <span className="dot" /> {status}
        </strong>
      </div>
      <div className="progress">
        <h2>Workflow Progress <span>({step} of 6)</span></h2>
        {workflowSteps.map((label, index) => {
          const number = index + 1;
          const done = number < step;
          const active = number === step;
          return (
            <div className={`progressItem ${done ? "done" : ""} ${active ? "active" : ""}`} key={label}>
              <span className="progressCircle">{done ? <Check size={16} aria-hidden="true" /> : number}</span>
              <div>
                <strong>{label}</strong>
                <span>{done ? "Complete" : active ? "In progress" : "Pending"}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="progress">
        <h2>Activity Trail</h2>
        {run.activityTrail.map((event) => (
          <div className="activityItem" key={event.label}>
            <StatusPill status={event.status} />
            <div>
              <strong>{event.label}</strong>
              <span>{event.detail}</span>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`card ${className}`}>{children}</div>;
}

function SectionTitle({ number, title }: { number: string; title: string }) {
  return (
    <h2>
      {number}. {title} <Info />
    </h2>
  );
}

function Divider() {
  return <hr />;
}

function Info() {
  return (
    <span className="info">
      <InfoIcon size={12} aria-hidden="true" />
    </span>
  );
}

function SourceToggle({ active, label, onToggle }: { active: boolean; label: string; onToggle: () => void }) {
  return (
    <button aria-pressed={active} className={`sourceToggle ${active ? "" : "inactive"}`} onClick={onToggle} type="button">
      <Icon name={label} />
      {label}
      <span className="switch"><span /></span>
    </button>
  );
}

function StatusPill({ status, label = status }: { status: Status; label?: string }) {
  return <span className={`pill ${status.toLowerCase()}`}>{label}</span>;
}

function Counter({ color, value, label }: { color: "green" | "orange" | "red"; value: number; label: string }) {
  return (
    <span className="counter">
      <span className={`dot ${color}`} /> <strong>{value}</strong> {label}
    </span>
  );
}

function BottomAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <div className="buttonRow">
      <button type="button" className="primary" onClick={onClick}>
        {label}
      </button>
    </div>
  );
}

function StatusMatrix({ items }: { items: ReadonlyArray<readonly [string, string]> }) {
  return (
    <div className="statusMatrix">
      {items.map(([area, status]) => (
        <div key={area}>
          <span>{area}</span>
          <StatusPill status={status as Status} />
        </div>
      ))}
    </div>
  );
}

function GapTitle({ number, title, tone = "red" }: { number: string; title: string; tone?: "red" | "orange" }) {
  return (
    <h2 className="gapTitle">
      <span className={tone === "red" ? "warnIcon" : "questionIcon"}>{tone === "red" ? <Icon name="Alert" /> : <CircleHelp size={17} aria-hidden="true" />}</span>
      {number}. {title}
    </h2>
  );
}

function ActionChips({ actions }: { actions: string[] }) {
  return (
    <div className="actionChips">
      <span>Suggested actions</span>
      {actions.map((action) => (
        <button type="button" className="secondary small" key={action}>
          {action}
        </button>
      ))}
    </div>
  );
}

function Icon({ name }: { name: string }) {
  if (/Outlook/i.test(name)) {
    return <OutlookLogo />;
  }
  if (/SharePoint/i.test(name)) {
    return <SharePointLogo />;
  }
  if (/GSA/i.test(name)) {
    return <GSALogo />;
  }

  const registry: Array<[RegExp, LucideIcon]> = [
    [/Mail/i, Mail],
    [/JTR|Policy|Document|Draft|File/i, FileText],
    [/Map/i, MapPin],
    [/Play/i, Play],
    [/Export|Upload|Import/i, Upload],
    [/Download/i, Download],
    [/Team|Users|Personnel/i, Users],
    [/Workflows|Grid/i, Grid3X3],
    [/Sources|Library/i, BookOpen],
    [/Activity/i, Activity],
    [/Outputs|Package/i, PackageIcon],
    [/Airplane|Travel|TDY/i, Plane],
    [/Calendar|Leave/i, Calendar],
    [/Cube|Supply/i, Box],
    [/Wrench|Maintenance/i, Wrench],
    [/Graduate|Training/i, GraduationCap],
    [/Id|Action/i, IdCard],
    [/Target|Range/i, Crosshair],
    [/Award/i, Award],
    [/Search/i, Search],
    [/Clock|Recently/i, Clock],
    [/Readiness|Shield/i, ShieldCheck],
    [/Funding|Dollar/i, Database],
    [/Rental|Vehicle|Car/i, Car],
    [/Folder/i, Folder],
    [/Checklist|Clipboard/i, ClipboardCheck],
    [/Archive/i, Archive],
    [/Approval/i, UserCheck],
    [/Alert|Warning/i, Shield],
    [/Question/i, CircleHelp],
    [/Plus/i, Plus],
    [/List/i, ClipboardList],
    [/Destination/i, Target]
  ];
  const match = registry.find(([pattern]) => pattern.test(name))?.[1] ?? FileText;
  const Lucide = match;
  return (
    <span className="icon">
      <Lucide size={16} strokeWidth={2} aria-hidden="true" />
    </span>
  );
}

function OutlookLogo() {
  return (
    <span className="brandLogo outlookLogo" aria-label="Outlook">
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <rect x="11" y="6" width="16" height="20" rx="2" fill="#0A5EBE" />
        <path d="M12 9h14v3H12z" fill="#28A8EA" />
        <path d="M12 13h14v3H12z" fill="#50D9FF" opacity=".65" />
        <path d="M12 17h14v8H12z" fill="#0364B8" />
        <path d="M18 16l9-7v17l-9-7z" fill="#0A5EBE" />
        <rect x="3" y="10" width="16" height="14" rx="2" fill="#0078D4" />
        <path d="M7.5 15.2c.8-.9 1.9-1.4 3.2-1.4 2.4 0 4.1 1.8 4.1 4.2s-1.7 4.2-4.1 4.2c-1.3 0-2.4-.5-3.2-1.4-.8-.8-1.2-1.8-1.2-2.8 0-1.1.4-2.1 1.2-2.8zm1.5 4.2c.4.5.9.8 1.7.8s1.3-.3 1.7-.8c.3-.4.5-.9.5-1.5s-.2-1.1-.5-1.5c-.4-.5-.9-.8-1.7-.8s-1.3.3-1.7.8c-.3.4-.5.9-.5 1.5s.2 1.1.5 1.5z" fill="#fff" />
      </svg>
    </span>
  );
}

function SharePointLogo() {
  return (
    <span className="brandLogo sharePointLogo" aria-label="SharePoint">
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <circle cx="20" cy="10" r="7" fill="#36C5F0" />
        <circle cx="22" cy="21" r="8" fill="#00A4A6" />
        <circle cx="10" cy="17" r="7" fill="#0078D4" />
        <rect x="5" y="10" width="15" height="15" rx="2" fill="#008272" />
        <path d="M9 19.8c.7.5 1.6.8 2.6.8 1.1 0 1.8-.4 1.8-1.1 0-.6-.4-.9-1.5-1.2l-1.1-.3c-1.6-.4-2.6-1.2-2.6-2.7 0-1.7 1.4-2.8 3.5-2.8 1.2 0 2.3.3 3.1.8l-.7 1.5c-.7-.4-1.5-.6-2.4-.6-1 0-1.6.4-1.6 1 0 .5.4.8 1.5 1.1l1.1.3c1.8.5 2.7 1.3 2.7 2.8 0 1.8-1.5 2.9-3.8 2.9-1.4 0-2.7-.4-3.5-1z" fill="#fff" />
      </svg>
    </span>
  );
}

function GSALogo() {
  return (
    <span className="brandLogo gsaLogo" aria-label="GSA">
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <rect x="3" y="3" width="26" height="26" rx="2" fill="#005EA8" />
        <path d="M8 20.1c-.8-.8-1.2-1.9-1.2-3.2s.4-2.4 1.3-3.2c.9-.8 2-1.2 3.5-1.2 1 0 1.9.2 2.7.6v2.1c-.8-.5-1.7-.8-2.6-.8-.8 0-1.4.2-1.8.7-.5.4-.7 1-.7 1.8s.2 1.4.7 1.9c.4.4 1 .7 1.7.7.4 0 .8-.1 1.1-.2v-1.3h-1.5v-1.7h3.8v4.2c-.9.5-2 .8-3.4.8-1.6 0-2.8-.4-3.6-1.2zm7.9.7v-2c.8.5 1.7.7 2.7.7.8 0 1.2-.2 1.2-.7 0-.2-.1-.4-.3-.5-.2-.1-.6-.3-1.2-.5-.9-.3-1.5-.6-1.9-1-.4-.4-.6-.9-.6-1.6 0-.8.3-1.5 1-2 .7-.5 1.6-.7 2.7-.7.9 0 1.7.1 2.4.4v1.9c-.7-.4-1.5-.6-2.3-.6-.8 0-1.2.2-1.2.7 0 .2.1.4.3.5.2.1.6.3 1.1.4.9.3 1.6.6 2 1 .4.4.6.9.6 1.7 0 .9-.3 1.5-1 2-.7.5-1.6.7-2.9.7-1.1.1-2-.1-2.6-.4zm7.1.2l3.1-8.3h2.4l3.1 8.3h-2.3l-.5-1.5h-2.9l-.5 1.5zm3.4-3.2h1.9l-.9-2.9z" fill="#fff" />
      </svg>
    </span>
  );
}

function titleCase(value: string) {
  return value.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase());
}
