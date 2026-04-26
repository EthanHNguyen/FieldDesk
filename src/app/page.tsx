"use client";

import { ChangeEvent, useMemo, useState } from "react";
import { defaultMissionRequest, demoFiles, type DemoFile, type PacketAnalysisResponse, type PacketSnapshotItem } from "../lib/fielddesk-demo";

type StepId = 1 | 2 | 3 | 4 | 5 | 6 | 7;
type FeedbackState = "Helpful" | "Incorrect" | "Needs more context" | "";

const workflows = [
  {
    id: "tdy",
    title: "TDY Training Travel Packet",
    status: "Active",
    description: "Prepares a review-ready training travel packet with itinerary, funding, and approvals."
  },
  {
    id: "leave",
    title: "Leave Packet",
    status: "Coming Soon",
    description: "Builds a leave request packet with entitlements, routing, and approvals."
  },
  {
    id: "maintenance",
    title: "Maintenance Work Order",
    status: "Coming Soon",
    description: "Creates a maintenance work order packet with tasks, parts, and approvals."
  },
  {
    id: "supply",
    title: "Supply Request",
    status: "Coming Soon",
    description: "Builds a supply request packet with items, quantities, and justifications."
  },
  {
    id: "software",
    title: "Mission Software Approval Packet",
    status: "Coming Soon",
    description: "Prepares a software approval packet with risk, compliance, and signatures."
  }
];

const steps: Array<{ id: StepId; label: string }> = [
  { id: 1, label: "Select Workflow" },
  { id: 2, label: "Gather Inputs" },
  { id: 3, label: "Upload Inputs" },
  { id: 4, label: "Review & Validate" },
  { id: 5, label: "Risk Review" },
  { id: 6, label: "Handoff" },
  { id: 7, label: "Generated Draft" }
];

const snapshotAreas = ["Traveler Information", "Orders", "Itinerary", "Entitlements", "Funding / Line of Accounting", "Approvals", "Supporting Docs"];

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function fileRows(uploadedFiles: DemoFile[]) {
  return uploadedFiles.length > 0 ? uploadedFiles : demoFiles;
}

function statusClass(status: PacketSnapshotItem["status"]) {
  switch (status) {
    case "Evidence Found":
      return "border-[#7c8f39]/30 bg-[#eef3dd] text-[#40541e]";
    case "Generated":
      return "border-[#90a9c8]/40 bg-[#edf5ff] text-[#245a96]";
    case "Needs Review":
      return "border-[#d8aa3d]/40 bg-[#fff7e6] text-[#9a6500]";
    case "Missing":
      return "border-[#d15d55]/40 bg-[#fff0ef] text-[#b3261e]";
    case "Human Review Required":
      return "border-[#d8aa3d]/40 bg-[#fff7e6] text-[#7a5300]";
  }
}

function AppIcon({ label, tone = "olive" }: { label: string; tone?: "olive" | "blue" | "red" | "gray" }) {
  const tones = {
    olive: "border-[#6f7d35] bg-[#eef3dd] text-[#4c5b1e]",
    blue: "border-[#93b4d8] bg-[#eef6ff] text-[#275b91]",
    red: "border-[#d15d55] bg-[#fff0ef] text-[#b3261e]",
    gray: "border-zinc-300 bg-zinc-100 text-zinc-600"
  };

  return <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border text-xs font-bold ${tones[tone]}`}>{label}</span>;
}

function SyntheticDemoBanners() {
  return (
    <>
      <div className="fixed inset-x-0 top-0 z-50 bg-[#007A33] px-3 py-1 text-center text-xs font-bold uppercase tracking-widest text-white">
        SYNTHETIC DEMO - NO REAL PERSONNEL DATA
      </div>
      <div className="fixed inset-x-0 bottom-0 z-50 bg-[#007A33] px-3 py-1 text-center text-xs font-bold uppercase tracking-widest text-white">
        SYNTHETIC DEMO - NO REAL PERSONNEL DATA
      </div>
    </>
  );
}

function Header() {
  return (
    <header className="sticky top-6 z-30 border-b border-[#1d354c] bg-[#07192b] text-white shadow-[0_12px_30px_rgba(7,25,43,0.18)]">
      <div className="flex min-h-20 items-center justify-between gap-4 px-5 lg:px-8">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-12 items-center justify-center rounded-md border border-[#b9c16a]/60 bg-[#263a27] text-2xl font-bold text-white shadow-inner">
            F
          </div>
          <div className="text-3xl font-bold tracking-normal">FieldDesk</div>
          <div className="hidden rounded-md bg-[#657236] px-4 py-2 text-sm text-white shadow-sm md:block">Less Admin. More Mission.</div>
        </div>
        <div className="flex items-center gap-5 text-sm">
          <span className="hidden md:inline">Library</span>
          <span className="hidden md:inline">Settings</span>
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#657236] font-bold">SGT</span>
        </div>
      </div>
    </header>
  );
}

function Sidebar({ step, setStep }: { step: StepId; setStep: (step: StepId) => void }) {
  return (
    <aside className="hidden w-72 shrink-0 bg-[#10263b] px-7 py-8 text-slate-200 shadow-[inset_-1px_0_0_rgba(255,255,255,0.06)] lg:block">
      <div className="mb-8 text-[#c5d36d]">
        <div className="text-sm font-bold uppercase tracking-[0.18em]">Workflow</div>
        <div className="mt-1 text-sm text-slate-400">Step {step} of 7</div>
      </div>
      <ol className="space-y-5">
        {steps.map((item) => {
          const complete = item.id < step;
          const active = item.id === step;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => setStep(item.id)}
                className={`flex w-full items-center gap-4 text-left ${active ? "text-white" : complete ? "text-[#cbd77a]" : "text-slate-400"}`}
              >
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-full border text-sm ${
                    active
                      ? "border-[#cbd77a] bg-[#cbd77a] text-[#10263b]"
                      : complete
                        ? "border-[#cbd77a] bg-[#cbd77a]/20 text-[#cbd77a]"
                        : "border-slate-500 text-slate-400"
                  }`}
                >
                  {complete ? "OK" : item.id}
                </span>
                <span className={active ? "font-semibold" : ""}>{item.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="mt-10 border-t border-white/10 pt-6">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Resources</div>
        <div className="mt-4 space-y-4 text-sm text-slate-300">
          <div>References & Policies</div>
          <div>Templates</div>
          <div>Saved Packets</div>
        </div>
      </div>
    </aside>
  );
}

function RightRail({ step }: { step: StepId }) {
  if (step === 4) {
    return (
      <RightPanel title="Provenance Examples">
        <SideLine title="TDY Training Request" body="Document - 2 pages" />
        <SideLine title="TDY Training Order" body="Document - 3 pages" />
        <SideLine title="Training Schedule" body="Document - 1 page" />
        <div className="mt-8 border-t border-slate-200 pt-7">
          <h3 className="font-semibold uppercase tracking-wide text-[#58672c]">About Confidence</h3>
          <p className="mt-4 text-sm leading-6 text-slate-700">
            Confidence reflects how strongly FieldDesk can support a packet-prep recommendation using your inputs and related sources.
          </p>
        </div>
      </RightPanel>
    );
  }

  if (step === 5) {
    return (
      <RightPanel title="Why This Matters">
        <p className="text-sm leading-6 text-slate-700">Funding is required to document the source of government funds and prevent routing delays.</p>
        <div className="mt-8 border-t border-slate-200 pt-7">
          <h3 className="font-semibold uppercase tracking-wide text-[#58672c]">What To Do Next</h3>
          <ol className="mt-5 space-y-5 text-sm text-slate-700">
            <li>1. Add a fund cite or funding source.</li>
            <li>2. Identify the approving funding official.</li>
            <li>3. Re-run review to clear the risk.</li>
          </ol>
        </div>
      </RightPanel>
    );
  }

  if (step === 6) {
    return (
      <RightPanel title="Trust & Safety">
        <p className="text-sm leading-6 text-slate-700">
          FieldDesk does not submit paperwork or approve requests. It prepares packets for human review and cites the sources behind each suggestion.
        </p>
        <div className="mt-8 border-t border-slate-200 pt-7">
          <h3 className="font-semibold uppercase tracking-wide text-[#58672c]">Human-In-The-Loop</h3>
          <p className="mt-4 text-sm leading-6 text-slate-700">
            Review the information, gather missing evidence, and mark the item resolved when ready to proceed.
          </p>
        </div>
      </RightPanel>
    );
  }

  if (step === 7) {
    return (
      <RightPanel title="Sources In This Draft">
        <SideLine title="Roster (roster.csv)" body="Personnel source" />
        <SideLine title="Training Order" body="Destination and dates" />
        <SideLine title="Per Diem Rates" body="Mock GSA rate table" />
        <div className="mt-8 border-t border-slate-200 pt-7">
          <h3 className="font-semibold uppercase tracking-wide text-[#58672c]">Disclaimer</h3>
          <p className="mt-4 text-sm leading-6 text-slate-700">
            This draft was generated for administrative assistance only. A human must review, verify, and route contents.
          </p>
        </div>
      </RightPanel>
    );
  }

  return (
    <RightPanel title="About FieldDesk">
      <p className="text-sm leading-6 text-slate-700">FieldDesk helps NCOs build accurate admin packets faster.</p>
      <div className="mt-7 space-y-5 text-sm text-slate-700">
        <div>Guided workflows</div>
        <div>Source-backed suggestions</div>
        <div>Human-controlled routing</div>
      </div>
      <div className="mt-8 rounded-md border border-[#d9dcc5] bg-[#fbfbf4] p-5">
        <h3 className="font-semibold uppercase tracking-wide text-[#58672c]">Trust & Safety</h3>
        <p className="mt-4 text-sm leading-6 text-slate-700">
          FieldDesk does not submit paperwork or approve requests. Use only synthetic-only, approved, shareable materials.
        </p>
      </div>
    </RightPanel>
  );
}

function RightPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <aside className="hidden w-80 shrink-0 border-l border-slate-200 bg-[#fbfbf8] px-8 py-10 xl:block">
      <h2 className="border-b border-[#8d9652] pb-4 font-semibold uppercase tracking-wide text-[#58672c]">{title}</h2>
      <div className="mt-6">{children}</div>
      <div className="mt-10 text-sm text-slate-400">Version 0.1.0 (Demo)</div>
    </aside>
  );
}

function SideLine({ title, body }: { title: string; body: string }) {
  return (
    <div className="mb-6">
      <div className="font-medium text-slate-900">{title}</div>
      <div className="mt-1 text-sm text-slate-500">{body}</div>
    </div>
  );
}

function PageShell({
  step,
  setStep,
  children
}: {
  step: StepId;
  setStep: (step: StepId) => void;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-[#f7f7f3] pb-8 pt-6 text-slate-900">
      <SyntheticDemoBanners />
      <Header />
      <div className="mx-auto flex min-h-[calc(100vh-7rem)] max-w-[1720px] overflow-hidden border-x border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <Sidebar step={step} setStep={setStep} />
        <section className="min-w-0 flex-1 px-5 py-8 sm:px-8 lg:px-12">{children}</section>
        <RightRail step={step} />
      </div>
    </main>
  );
}

export default function Home() {
  const [step, setStep] = useState<StepId>(1);
  const [mission, setMission] = useState(defaultMissionRequest);
  const [result, setResult] = useState<PacketAnalysisResponse | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<DemoFile[]>([]);
  const [feedback, setFeedback] = useState<FeedbackState>("");
  const [draftFeedback, setDraftFeedback] = useState("");
  const [draftAction, setDraftAction] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState("");

  const rows = useMemo(() => fileRows(uploadedFiles), [uploadedFiles]);
  const analysis = result;
  const issue = analysis?.selected_issue;

  function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).map((file) => ({
      name: file.name,
      kind: file.name.split(".").pop()?.toUpperCase() ?? "FILE",
      size: `${Math.max(1, Math.round(file.size / 1024))} KB`,
      description: "Uploaded by user for packet review.",
      source: "manual upload"
    }));

    setUploadedFiles(files);
  }

  async function analyze(nextStep: StepId = 4) {
    setError("");
    setIsAnalyzing(true);

    try {
      const response = await fetch("/api/run-workflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: mission })
      });
      const payload = (await response.json()) as PacketAnalysisResponse | { error?: string };

      if (!response.ok) {
        throw new Error("error" in payload && payload.error ? payload.error : "Packet analysis failed.");
      }

      setResult(payload as PacketAnalysisResponse);
      setStep(nextStep);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Packet analysis failed.");
    } finally {
      setIsAnalyzing(false);
    }
  }

  return (
    <PageShell step={step} setStep={setStep}>
      {step === 1 && (
        <Screen>
          <Kicker>Select a workflow</Kicker>
          <Title>Select a workflow</Title>
          <Lead>FieldDesk turns scattered orders, policies, rosters, and messages into review-ready admin packets.</Lead>
          <div className="mt-8 grid gap-5 lg:grid-cols-2">
            {workflows.map((workflow) => (
              <button
                key={workflow.id}
                type="button"
                disabled={workflow.status !== "Active"}
                onClick={() => setStep(2)}
                className={`min-h-44 rounded-md border p-5 text-left shadow-sm transition ${
                  workflow.status === "Active"
                    ? "border-[#68743a] bg-white hover:bg-[#fbfbf4]"
                    : "border-slate-200 bg-white/80 opacity-70"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <AppIcon label={workflow.id === "tdy" ? "TDY" : "SO"} />
                  <span className={`rounded-md border px-3 py-1 text-xs font-semibold uppercase ${workflow.status === "Active" ? "border-[#aab36a] bg-[#f5f7e7] text-[#53601f]" : "border-slate-200 bg-slate-100 text-slate-500"}`}>
                    {workflow.status}
                  </span>
                </div>
                <h2 className="mt-4 text-xl font-bold text-[#0b2035]">{workflow.title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">{workflow.description}</p>
              </button>
            ))}
          </div>
          <InfoBar>FieldDesk is a workflow platform. For this demo, only the TDY Training Travel Packet workflow is implemented.</InfoBar>
        </Screen>
      )}

      {step === 2 && (
        <Screen>
          <Kicker>Gather inputs</Kicker>
          <Title>Describe the TDY request</Title>
          <Lead>Provide the mission or admin task. FieldDesk will extract key facts and use them to build the TDY packet.</Lead>
          <div className="mt-8 rounded-md border border-[#68743a] bg-white p-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <AppIcon label="TDY" />
                <div>
                  <h2 className="font-bold text-[#0b2035]">TDY Training Travel Packet</h2>
                  <p className="text-sm text-slate-600">Prepares a review-ready packet with itinerary, funding, and approvals.</p>
                </div>
              </div>
              <span className="rounded-md border border-[#aab36a] bg-[#f5f7e7] px-3 py-1 text-xs font-semibold uppercase text-[#53601f]">Active</span>
            </div>
          </div>
          <label htmlFor="mission" className="mt-7 block text-sm font-semibold text-slate-900">
            Enter mission / admin task
          </label>
          <textarea
            id="mission"
            value={mission}
            onChange={(event) => setMission(event.target.value)}
            className="mt-3 min-h-60 w-full resize-none rounded-md border border-[#68743a] bg-white p-5 text-lg leading-8 text-slate-900 outline-none focus:ring-2 focus:ring-[#cbd77a]"
            maxLength={2000}
          />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {["10 travelers", "Demo Training Site", "June 10-14", "Lodging", "Rental cars", "Per diem"].map((item) => (
              <span key={item} className="rounded-md border border-[#d9dcc5] bg-[#fbfbf4] px-3 py-2 text-sm text-slate-700">
                {item}
              </span>
            ))}
          </div>
          <Actions>
            <Button variant="secondary" onClick={() => setMission(defaultMissionRequest)}>
              Reset sample
            </Button>
            <Button onClick={() => setStep(3)}>Analyze request</Button>
          </Actions>
        </Screen>
      )}

      {step === 3 && (
        <Screen>
          <Kicker>Upload inputs</Kicker>
          <Title>Upload supporting inputs</Title>
          <Lead>Upload supporting documents and data for the TDY Training Travel Packet.</Lead>
          <div className="mt-8 rounded-md border border-dashed border-slate-300 bg-white p-10 text-center">
            <div className="text-lg font-medium text-slate-900">Drag and drop files here</div>
            <div className="mt-2 text-sm text-slate-500">Accepted file types: .pdf, .csv, .xlsx, .docx, .txt</div>
            <label className="mt-5 inline-flex cursor-pointer rounded-md border border-slate-300 bg-white px-5 py-3 text-sm font-medium text-slate-800 hover:bg-slate-50">
              Browse files
              <input className="hidden" type="file" multiple onChange={handleFiles} />
            </label>
          </div>
          <div className="mt-7 flex items-center justify-between">
            <h2 className="font-bold text-[#0b2035]">Uploaded files ({rows.length})</h2>
            <button type="button" onClick={() => setUploadedFiles(demoFiles)} className="text-sm font-medium text-[#53601f] underline">
              Use sample package
            </button>
          </div>
          <div className="mt-3 overflow-hidden rounded-md border border-slate-200 bg-white">
            {rows.map((file) => (
              <div key={file.name} className="grid gap-3 border-b border-slate-200 p-4 last:border-b-0 md:grid-cols-[240px_1fr_120px] md:items-center">
                <div>
                  <div className="font-semibold text-slate-900">{file.name}</div>
                  <div className="text-sm text-slate-500">
                    {file.kind} - {file.size}
                  </div>
                </div>
                <div className="text-sm leading-6 text-slate-600">{file.description}</div>
                <div className="text-sm font-medium text-[#53601f]">Uploaded</div>
              </div>
            ))}
          </div>
          <InfoBar>These inputs are mocked demo fixtures. In a real deployment, data may come from source systems or manual uploads.</InfoBar>
          {error && <ErrorBar>{error}</ErrorBar>}
          <Actions>
            <Button variant="secondary" onClick={() => setStep(2)}>
              Back
            </Button>
            <Button onClick={() => void analyze(4)} disabled={isAnalyzing}>
              {isAnalyzing ? "Analyzing..." : "Build packet snapshot"}
            </Button>
          </Actions>
        </Screen>
      )}

      {step === 4 && analysis && (
        <Screen>
          <Kicker>Review & validate</Kicker>
          <Title>Packet readiness snapshot</Title>
          <Lead>FieldDesk analyzes your inputs and related orders to generate a snapshot of key packet areas and supporting evidence.</Lead>
          <FactGrid analysis={analysis} />
          <SnapshotTable items={analysis.packet_snapshot} onIssue={() => setStep(5)} />
          <InfoBar>Review areas that need attention and adjust inputs as needed. FieldDesk will refresh this snapshot when re-run.</InfoBar>
          <Actions>
            <Button variant="secondary" onClick={() => setStep(3)}>
              Back
            </Button>
            <Button onClick={() => setStep(5)}>Review risk area</Button>
          </Actions>
        </Screen>
      )}

      {step === 4 && !analysis && <LoadingScreen onAnalyze={() => void analyze(4)} />}

      {step === 5 && analysis && issue && (
        <Screen>
          <Kicker>Risk review</Kicker>
          <Title>Review risks before routing</Title>
          <Lead>FieldDesk scanned the packet for policy, funding, and data quality risks. Review the item below before handoff.</Lead>
          <div className="mt-8 grid gap-6 lg:grid-cols-[290px_1fr]">
            <div className="rounded-md border border-slate-200 bg-white p-5">
              <h2 className="mb-4 text-sm font-medium text-slate-600">Packet Snapshot</h2>
              {snapshotAreas.map((area) => {
                const isFunding = area === "Funding / Line of Accounting";
                return (
                  <button
                    key={area}
                    type="button"
                    onClick={() => (isFunding ? setStep(6) : undefined)}
                    className={`mb-2 flex w-full items-center gap-3 rounded-md border p-3 text-left ${
                      isFunding ? "border-[#d15d55] bg-[#fff8f6]" : "border-transparent bg-white"
                    }`}
                  >
                    <span className={`flex h-8 w-8 items-center justify-center rounded-full ${isFunding ? "bg-[#fff0ef] text-[#b3261e]" : "bg-[#eef3dd] text-[#40541e]"}`}>
                      {isFunding ? "!" : "OK"}
                    </span>
                    <span>
                      <span className="block text-sm font-medium text-slate-900">{area}</span>
                      <span className={`block text-xs ${isFunding ? "text-[#b3261e]" : "text-[#507047]"}`}>{isFunding ? "Missing" : "Complete"}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="rounded-md border border-[#d15d55] bg-white p-8">
              <AppIcon label="!" tone="red" />
              <h2 className="mt-6 text-3xl font-bold text-[#0b2035]">
                {issue.item} - <span className="text-[#b3261e]">Missing</span>
              </h2>
              <p className="mt-5 max-w-2xl text-xl leading-8 text-slate-700">No fund cite or approving funding source was detected in the uploaded packet.</p>
              <div className="mt-8 border-t border-slate-200 pt-6">
                <h3 className="font-semibold text-slate-900">Why this matters</h3>
                <p className="mt-3 text-slate-700">Without a valid fund cite and approving funding source, this request may be returned before routing.</p>
              </div>
              <div className="mt-8">
                <div className="mb-2 flex items-center justify-between text-sm text-slate-600">
                  <span>Confidence in missing-info flag</span>
                  <span className="text-2xl font-bold text-[#0b2035]">86%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[#f7d2d2]">
                  <div className="h-full w-[86%] rounded-full bg-[#d94747]" />
                </div>
              </div>
              <div className="mt-8 rounded-md border border-[#efc3bf] bg-[#fff0ef] p-5 text-[#7f1d1d]">
                <div className="font-semibold text-[#b3261e]">Critical funding gap detected</div>
                <p className="mt-2 text-sm leading-6">
                  The packet contains travelers, dates, lodging, rental vehicle needs, and per diem requirements, but no fund cite,
                  travel authorization, or approving funding source. Collect one of those artifacts before routing so the reviewer can
                  confirm who may obligate funds for this TDY.
                </p>
                <div className="mt-3 grid gap-2 text-sm md:grid-cols-3">
                  <span className="rounded border border-[#efc3bf] bg-white px-3 py-2">Missing: fund cite</span>
                  <span className="rounded border border-[#efc3bf] bg-white px-3 py-2">Missing: travel authorization</span>
                  <span className="rounded border border-[#efc3bf] bg-white px-3 py-2">Action: funding approval</span>
                </div>
              </div>
            </div>
          </div>
          <Actions>
            <Button variant="secondary" onClick={() => setStep(4)}>
              Back
            </Button>
            <Button variant="secondary" onClick={() => void analyze(5)} disabled={isAnalyzing}>
              Re-run review
            </Button>
            <Button onClick={() => setStep(6)}>Fix this risk</Button>
          </Actions>
        </Screen>
      )}

      {step === 6 && analysis && issue && (
        <Screen>
          <button type="button" onClick={() => setStep(5)} className="mb-5 text-sm font-medium text-slate-600 hover:text-slate-900">
            Back to packet review
          </button>
          <Title>Missing Item Review: {issue.item}</Title>
          <Lead>FieldDesk analyzed the packet and could not find sufficient evidence for this item.</Lead>
          <div className="mt-6 overflow-hidden rounded-md border border-slate-200 bg-white">
            <DetailRow label="Packet item" value={issue.item} />
            <DetailRow label="Evidence found" value="No funding document detected." tone="red" />
            <DetailRow label="Potential reviewer question" value={issue.potential_reviewer_question} />
            <DetailRow label="Suggested supporting evidence" value={issue.suggested_supporting_evidence} />
            <DetailRow label="Human action" value={issue.human_action} />
            <DetailRow label="Confidence" value={issue.confidence_explanation} />
            <div className="grid gap-4 border-b border-slate-200 p-4 md:grid-cols-[260px_1fr]">
              <div className="font-semibold text-slate-900">Provenance</div>
              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <div className="font-semibold text-slate-900">Found in packet</div>
                  {issue.provenance.found_sources.map((source) => (
                    <div key={source} className="mt-2 text-sm text-slate-700">{source}</div>
                  ))}
                </div>
                <div>
                  <div className="font-semibold text-slate-900">Missing from packet</div>
                  {issue.provenance.missing_sources.map((source) => (
                    <div key={source} className="mt-2 text-sm text-[#b3261e]">{source}</div>
                  ))}
                </div>
              </div>
            </div>
            <div className="grid gap-4 p-4 md:grid-cols-[260px_1fr]">
              <div className="font-semibold text-slate-900">Reasoning trace</div>
              <ul className="list-disc space-y-2 pl-5 text-sm text-slate-700">
                {issue.reasoning_trace.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3 rounded-md border border-slate-200 bg-white p-3">
            <span className="mr-auto text-sm text-slate-700">Was this assessment helpful?</span>
            {(["Helpful", "Incorrect", "Needs more context"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setFeedback(item)}
                className={`rounded-md border px-5 py-2 text-sm ${feedback === item ? "border-[#68743a] bg-[#eef3dd] text-[#40541e]" : "border-slate-200 bg-white text-slate-700"}`}
              >
                {item}
              </button>
            ))}
          </div>
          {feedback && <InfoBar>Feedback captured: {feedback}</InfoBar>}
          <Actions>
            <Button variant="secondary" onClick={() => setStep(5)}>
              Back
            </Button>
            <Button onClick={() => setStep(7)}>Generate draft packet</Button>
          </Actions>
        </Screen>
      )}

      {step === 7 && analysis && (
        <Screen>
          <Kicker>Generated draft</Kicker>
          <Title>Generated Packet Draft</Title>
          <Lead>Review the packet below, provide changes if needed, or stage it for the next human approval review.</Lead>
          <div className="mt-6 rounded-md border border-slate-200 bg-white p-6">
            <div className="flex flex-wrap items-start justify-between gap-4 rounded-md border border-slate-200 bg-[#fbfbf4] p-4">
              <div className="flex items-center gap-4">
                <AppIcon label="TDY" />
                <div>
                  <h2 className="text-xl font-bold text-[#0b2035]">TDY Training Travel Packet</h2>
                  <p className="text-sm text-slate-600">Demo Training Site training TDY packet</p>
                </div>
              </div>
              <div className="rounded-md border border-[#eed4a8] bg-[#fff7e6] p-3 text-sm font-medium text-[#7a5300]">
                Draft only. Human review required before routing.
              </div>
            </div>
            <div className="mt-6 grid gap-6 xl:grid-cols-2">
              {analysis.draft_packet.sections.map((section) => (
                <div key={section.heading} className="border-t border-slate-200 pt-4">
                  <h3 className="text-sm font-bold uppercase tracking-wide text-[#0b2035]">{section.heading}</h3>
                  <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                    {section.lines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-6 rounded-md border border-slate-200 bg-white p-5">
            <label htmlFor="draft-feedback" className="text-sm font-semibold text-slate-900">
              Feedback or requested changes
            </label>
            <textarea
              id="draft-feedback"
              value={draftFeedback}
              onChange={(event) => setDraftFeedback(event.target.value)}
              placeholder="Example: Add SFC Demo Packet Owner as the packet POC and clarify rental vehicles are government-rate vehicles."
              className="mt-3 min-h-28 w-full resize-none rounded-md border border-slate-300 bg-white p-4 text-sm leading-6 text-slate-900 outline-none focus:border-[#68743a] focus:ring-2 focus:ring-[#dce6a0]"
            />
            {draftAction && <div className="mt-3 rounded-md border border-[#a8c5e8] bg-[#f2f7ff] px-4 py-3 text-sm text-[#2c5c9b]">{draftAction}</div>}
          </div>
          <Actions>
            <Button variant="secondary" onClick={() => setStep(6)}>
              Back
            </Button>
            <Button variant="secondary" onClick={() => setStep(2)}>
              New request
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                setDraftAction(
                  draftFeedback.trim()
                    ? "Redraft request captured. FieldDesk would regenerate the packet with your reviewer notes."
                    : "Add feedback before requesting a redraft."
                )
              }
            >
              Redraft
            </Button>
            <Button onClick={() => setDraftAction("Approval request staged for human review. FieldDesk did not submit paperwork or approve the packet.")}>
              Request approval
            </Button>
          </Actions>
        </Screen>
      )}
    </PageShell>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-6xl">{children}</div>;
}

function Kicker({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 text-sm font-bold uppercase tracking-[0.18em] text-[#58672c]">{children}</div>;
}

function Title({ children }: { children: React.ReactNode }) {
  return <h1 className="text-4xl font-bold tracking-normal text-[#0b2035] md:text-5xl">{children}</h1>;
}

function Lead({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 max-w-3xl text-lg leading-8 text-slate-700">{children}</p>;
}

function InfoBar({ children }: { children: React.ReactNode }) {
  return <div className="mt-6 rounded-md border border-[#a8c5e8] bg-[#f2f7ff] px-4 py-3 text-sm text-[#2c5c9b]">{children}</div>;
}

function ErrorBar({ children }: { children: React.ReactNode }) {
  return <div className="mt-6 rounded-md border border-[#d15d55] bg-[#fff0ef] px-4 py-3 text-sm text-[#b3261e]">{children}</div>;
}

function Actions({ children }: { children: React.ReactNode }) {
  return <div className="mt-8 flex flex-wrap justify-end gap-3">{children}</div>;
}

function Button({
  children,
  onClick,
  disabled,
  variant = "primary"
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary";
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-md px-5 py-3 text-sm font-semibold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${
        variant === "primary"
          ? "bg-[#5f6d2c] text-white hover:bg-[#4d5b22]"
          : "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}

function FactGrid({ analysis }: { analysis: PacketAnalysisResponse }) {
  const facts = [
    ["Destination", String(analysis.summary.destination.value)],
    ["Dates", String(analysis.summary.dates.value)],
    ["Travelers", String(analysis.summary.travelers.value)],
    ["Purpose", String(analysis.summary.purpose.value)],
    ["Logistics", String(analysis.summary.logistics.value)]
  ];

  return (
    <div className="mt-8 grid gap-4 md:grid-cols-5">
      {facts.map(([label, value]) => (
        <div key={label} className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-sm text-slate-500">{label}</div>
          <div className="mt-3 text-lg font-semibold text-[#0b2035]">{value}</div>
        </div>
      ))}
    </div>
  );
}

function SnapshotTable({ items, onIssue }: { items: PacketSnapshotItem[]; onIssue: () => void }) {
  return (
    <div className="mt-6 overflow-hidden rounded-md border border-slate-200 bg-white">
      <div className="grid grid-cols-[1fr_170px_120px_1.4fr] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-sm font-medium text-slate-600">
        <div>Packet Area</div>
        <div>Status</div>
        <div>Confidence</div>
        <div>Why</div>
      </div>
      {items.map((item) => (
        <button
          key={item.area}
          type="button"
          onClick={item.status === "Missing" ? onIssue : undefined}
          className={`grid w-full grid-cols-[1fr_170px_120px_1.4fr] gap-4 border-b border-slate-200 px-5 py-4 text-left last:border-b-0 ${
            item.status === "Missing" ? "bg-[#fff8f6] ring-1 ring-inset ring-[#efb2ad]" : "bg-white"
          }`}
        >
          <div className="font-semibold text-slate-900">{item.area}</div>
          <div>
            <span className={`inline-flex rounded-md border px-3 py-1 text-sm ${statusClass(item.status)}`}>{item.status}</span>
          </div>
          <div className="text-slate-900">{percent(item.confidence)}</div>
          <div className="text-sm leading-6 text-slate-700">{item.reason}</div>
        </button>
      ))}
    </div>
  );
}

function DetailRow({ label, value, tone = "normal" }: { label: string; value: string; tone?: "normal" | "red" }) {
  return (
    <div className="grid gap-4 border-b border-slate-200 p-4 last:border-b-0 md:grid-cols-[260px_1fr]">
      <div className="font-semibold text-slate-900">{label}</div>
      <div className={tone === "red" ? "text-[#b3261e]" : "text-slate-700"}>{value}</div>
    </div>
  );
}

function LoadingScreen({ onAnalyze }: { onAnalyze: () => void }) {
  return (
    <Screen>
      <Title>Packet snapshot not generated yet</Title>
      <Lead>Run the packet analysis to build the readiness snapshot and missing-item review.</Lead>
      <Actions>
        <Button onClick={onAnalyze}>Build packet snapshot</Button>
      </Actions>
    </Screen>
  );
}
