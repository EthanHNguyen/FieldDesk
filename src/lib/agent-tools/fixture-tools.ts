import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentRunInput, TripFacts } from "../fielddesk-types";
import { buildPerDiemVerification } from "../deterministic-rules";

function readDataFile(filename: string): string {
  return readFileSync(join(process.cwd(), "data", filename), "utf8");
}

function readJson<T = unknown>(filename: string): T {
  return JSON.parse(readDataFile(filename)) as T;
}

export type ToolResult<T> = {
  ok: true;
  data: T;
} | {
  ok: false;
  error: string;
};

export type FixtureToolContext = Pick<AgentRunInput, "selectedSources" | "resolutions">;

type ArtifactSummary = {
  id: string;
  title: string;
  summary: string;
  relevance: number;
};

type ArtifactRecord = {
  id: string;
  source: string;
  title: string;
  content: string;
  availableInState: "initial" | "corrected";
  facts?: Record<string, unknown>;
};

export function searchSource(source: string, query: string, context: FixtureToolContext): ToolResult<{ artifacts: ArtifactSummary[] }> {
  if (!context.selectedSources.includes(source)) {
    return { ok: false, error: `Source '${source}' is not selected for this run.` };
  }

  const artifacts = allArtifacts()
    .filter((artifact) => artifact.source === source)
    .filter((artifact) => isArtifactAvailable(artifact, context))
    .map((artifact) => ({ artifact, relevance: scoreArtifact(artifact, query) }))
    .filter((entry) => query.trim().length === 0 || entry.relevance > 0)
    .sort((a, b) => b.relevance - a.relevance)
    .map((artifact) => ({
      id: artifact.artifact.id,
      title: artifact.artifact.title,
      summary: summarize(artifact.artifact.content),
      relevance: artifact.relevance
    }));

  return artifacts.length > 0 ? { ok: true, data: { artifacts } } : { ok: false, error: `No available artifacts found for source: ${source}` };
}

export function readArtifact(artifactId: string, context: FixtureToolContext): ToolResult<{ id: string; title: string; content: string; source: string; facts?: Record<string, unknown> }> {
  const artifact = findAvailableArtifact(artifactId, context);

  if (!artifact.ok) return artifact;

  return { ok: true, data: artifact.data };
}

function findAvailableArtifact(artifactId: string, context: FixtureToolContext): ToolResult<ArtifactRecord> {
  const artifact = allArtifacts().find((candidate) => candidate.id === artifactId);

  if (!artifact) {
    return { ok: false, error: `Artifact not found: ${artifactId}` };
  }

  if (artifact.source !== "Uploaded docs" && !context.selectedSources.includes(artifact.source)) {
    return { ok: false, error: `Artifact source '${artifact.source}' is not selected for this run.` };
  }

  if (!isArtifactAvailable(artifact, context)) {
    return { ok: false, error: `Artifact '${artifactId}' is not available until its correction is staged.` };
  }

  return { ok: true, data: artifact };
}

export function lookupGsaRate(locality: string, fiscalYear: number): ToolResult<{ state: string; city: string; county: string; locality: string; lodging: number; mealsIncidentals: number; firstLastDayMeals: number }> {
  const gsaFixture = readJson<{ fiscalYear: number; rates: { state: string; city: string; county: string; locality: string; lodging: number; mealsIncidentals: number; firstLastDayMeals: number }[] }>("gsa_per_diem_fixture.json");
  const normalizedLocality = normalizeLocality(locality);

  if (fiscalYear !== gsaFixture.fiscalYear) {
    return { ok: false, error: `No GSA fixture configured for fiscal year: ${fiscalYear}` };
  }

  const rate = gsaFixture.rates.find((r) =>
    normalizeLocality(r.city) === normalizedLocality ||
    normalizeLocality(r.locality).includes(normalizedLocality)
  );

  if (!rate) return { ok: false, error: `No GSA rate found for locality: ${locality}` };
  return { ok: true, data: rate };
}

export function calculatePerDiem(tripFacts: TripFacts): ToolResult<ReturnType<typeof buildPerDiemVerification>> {
  try {
    const perDiem = buildPerDiemVerification(tripFacts);
    return { ok: true, data: perDiem };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

export function retrievePolicyReference(topic: string): ToolResult<{ source: string; reference: string; excerpt: string }> {
  if (/travel|tdy|per diem|vehicle|rental/i.test(topic)) {
    return {
      ok: true,
      data: {
        source: "JTR",
        reference: "JTR Chapter 2",
        excerpt: "Standard travel and transportation allowances for TDY..."
      }
    };
  }
  if (/checklist|routing|sop/i.test(topic)) {
    return {
      ok: true,
      data: {
        source: "Local SOP",
        reference: "Unit TDY Routing Expectations",
        excerpt: "All TDY packets must include a funding memo and verified per diem estimate..."
      }
    };
  }
  return { ok: false, error: `No policy reference found for topic: ${topic}` };
}

function allArtifacts(): ArtifactRecord[] {
  return [
    ...outlookArtifacts(),
    ...sharePointArtifacts(),
    {
      id: "gsa-001",
      source: "GSA",
      title: "Demo Training Site per diem rates",
      content: readDataFile("gsa_per_diem_fixture.json"),
      availableInState: "initial"
    },
    {
      id: "jtr-001",
      source: "JTR",
      title: "JTR TDY excerpt",
      content: readDataFile("jtr_excerpt.md"),
      availableInState: "initial"
    },
    {
      id: "sop-001",
      source: "Local SOP",
      title: "Unit TDY routing SOP",
      content: readDataFile("local_sop.md"),
      availableInState: "initial"
    },
    ...uploadedArtifacts()
  ];
}

function outlookArtifacts(): ArtifactRecord[] {
  const mailbox = readJson<{ messages: { id: string | number; subject: string; body: string; availableInState?: string; extractedEvidence?: unknown }[] }>("outlook_messages.json");
  return mailbox.messages.map((message) => ({
    id: String(message.id),
    source: "Outlook",
    title: message.subject,
    content: message.body,
    availableInState: availableInState(message.availableInState),
    facts: isRecord(message.extractedEvidence) ? message.extractedEvidence : undefined
  }));
}

function sharePointArtifacts(): ArtifactRecord[] {
  const site = readJson<{ documents: { id: string | number; filename: string; extractedText: string; availableInState?: string; extractedEvidence?: unknown }[] }>("sharepoint_documents.json");
  return site.documents.map((document) => ({
    id: String(document.id),
    source: document.id === "sp-003" ? "Unit Checklist" : "SharePoint",
    title: document.filename,
    content: [document.extractedText, readOptionalCsv(document.filename)].filter(Boolean).join("\n\n"),
    availableInState: availableInState(document.availableInState),
    facts: isRecord(document.extractedEvidence) ? document.extractedEvidence : undefined
  }));
}

function uploadedArtifacts(): ArtifactRecord[] {
  const uploads = readJson<{ uploads: { id: string | number; filename: string; extractedText: string; availableInState?: string; extractedEvidence?: unknown }[] }>("uploaded_documents.json");
  return uploads.uploads.map((upload) => ({
    id: String(upload.id),
    source: "Uploaded docs",
    title: upload.filename,
    content: upload.filename === "funding_memo.md" ? readDataFile("funding_memo.md") : upload.extractedText,
    availableInState: availableInState(upload.availableInState),
    facts: isRecord(upload.extractedEvidence) ? upload.extractedEvidence : undefined
  }));
}

function isArtifactAvailable(artifact: ArtifactRecord, context: FixtureToolContext) {
  if (artifact.availableInState === "initial") return true;
  if (artifact.id === "sp-004") return context.resolutions.roster;
  if (artifact.id === "outlook-003" || artifact.id === "upload-003") return context.resolutions.funding;
  return false;
}

function readOptionalCsv(filename: string) {
  if (filename === "roster_v2.csv") return readDataFile("roster_v2.csv");
  if (filename === "roster_v3_corrected.csv") return readDataFile("roster_v3_corrected.csv");
  return "";
}

function availableInState(value: string | undefined): "initial" | "corrected" {
  return value === "corrected" ? "corrected" : "initial";
}

function summarize(content: string) {
  return content.length > 100 ? `${content.slice(0, 100)}...` : content;
}

function normalizeLocality(value: string) {
  return value.toLowerCase().replace(/\bdemo training site\b/g, "demo training site");
}

function scoreArtifact(artifact: ArtifactRecord, query: string) {
  const tokens = query.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2);
  if (tokens.length === 0) return 1;

  const haystack = `${artifact.title}\n${artifact.content}\n${JSON.stringify(artifact.facts ?? {})}`.toLowerCase();
  return tokens.reduce((score, token) => score + (haystack.includes(token) ? 1 : 0), 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
