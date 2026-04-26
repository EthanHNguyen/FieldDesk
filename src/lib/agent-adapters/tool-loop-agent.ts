import { calculatePerDiem, readArtifact, retrievePolicyReference, searchSource, type FixtureToolContext, type ToolResult } from "../agent-tools/fixture-tools";
import { runOpenRouterAgentLoop, openRouterHeaders } from "../agent-runtime/openrouter";
import type { AgentContext, AgentMessage, AgentRuntimeEvent, AgentToolDefinition } from "../agent-runtime/types";
import type { AgentRunInput, AgentTraceStep, FieldDeskAgentObjectOutput, FieldDeskAgentRun, TripFacts } from "../fielddesk-types";
import { runMockAgent } from "./mock-agent";
import { fieldDeskAgentObjectOutputJsonSchema, objectOutputToFieldDeskRun, requiredSourceRows } from "./openai-agent";

type FieldDeskToolContext = FixtureToolContext;

type ToolDecision =
  | {
      kind: "tool_call";
      toolName: string;
      args: Record<string, unknown>;
      rationale?: string;
    }
  | {
      kind: "finish";
      rationale?: string;
    };

type TranscriptObservation = {
  toolName: string;
  ok: boolean;
  summary: string;
  artifactIds: string[];
  data?: unknown;
};

const maxTurns = 8;

export async function runToolLoopAgent(input: AgentRunInput): Promise<FieldDeskAgentRun> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL ?? "google/gemini-3-flash-preview";
  const runStartedAt = Date.now();

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured.");
  }

  logAgent("agent_start", {
    model,
    selectedSources: input.selectedSources,
    resolutions: input.resolutions,
    intentPreview: input.intent.slice(0, 120)
  });

  const context = createAgentContext(input);
  const scriptedMessages = runScriptedTranscriptIfConfigured(context, input);
  const loopResult = scriptedMessages
    ? { messages: scriptedMessages, stopReason: "Scripted transcript completed.", turns: countAssistantTurns(scriptedMessages) }
    : await runOpenRouterAgentLoop(context, {
        apiKey,
        model,
        title: "FieldDesk Transcript Agent",
        maxTurns,
        transformContext,
        emit: emitRuntimeEvent
      });

  const observations = observationsFromTranscript(loopResult.messages);
  const trace = traceFromTranscript(loopResult.messages, loopResult.stopReason);
  const output = await synthesizeFinalOutput({
    input,
    messages: loopResult.messages,
    observations,
    trace,
    stopReason: loopResult.stopReason,
    apiKey,
    model
  });

  output.agentTrace = trace;
  const run = objectOutputToFieldDeskRun(output, input);
  logAgent("agent_end", {
    elapsedMs: Date.now() - runStartedAt,
    turns: loopResult.turns,
    messages: loopResult.messages.length,
    observations: observations.length,
    readinessScore: run.readiness.score,
    readinessRisk: run.readiness.risk,
    traceSteps: run.agentTrace.length
  });
  return run;
}

function createAgentContext(input: AgentRunInput): AgentContext<FieldDeskToolContext> {
  return {
    systemPrompt:
      "You are FieldDesk's autonomous TDY readiness agent. Use tools to inspect selected sources before final synthesis. Prefer calling multiple independent tools in the same turn. Do not invent evidence. Preserve missing or conflicting evidence. When enough evidence has been inspected, respond briefly without tool calls.",
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          objective: "Collect source-backed TDY readiness evidence for the workflow, then stop for final synthesis.",
          missionInput: input,
          selectedSources: input.selectedSources,
          requiredSourceRows: requiredSourceRows.filter((source) => input.selectedSources.includes(source)),
          workflowEvidenceRequirements: [
            "mission purpose",
            "travel dates",
            "destination",
            "traveler roster",
            "approval or reviewer risk",
            "funding evidence",
            "per diem estimate when GSA evidence is available",
            "rental vehicle justification",
            "policy or SOP references when available"
          ],
          guidance: [
            "Read primary artifacts; do not rely on search results alone.",
            "Extract trip facts yourself from evidence and mission input.",
            "If roster evidence conflicts with the mission traveler count, keep the mission requirement as trip facts and record the roster conflict later.",
            "Use calculatePerDiem with extracted trip facts when GSA is selected and trip facts are known.",
            "Return no final JSON in this phase; only use tools or say evidence collection is complete."
          ]
        })
      }
    ],
    tools: createTools(),
    toolContext: {
      selectedSources: input.selectedSources,
      resolutions: input.resolutions
    }
  };
}

function createTools(): AgentToolDefinition<FieldDeskToolContext>[] {
  return [
    {
      name: "searchSource",
      description: "Search a selected FieldDesk source and return matching available artifact IDs plus short summaries.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["source", "query"],
        properties: {
          source: { type: "string", enum: requiredSourceRows },
          query: { type: "string" }
        }
      },
      execute: (args, context) => searchSource(String(args.source), String(args.query ?? ""), context)
    },
    {
      name: "readArtifact",
      description: "Read one available artifact by ID. Returned content and facts become transcript evidence.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["artifactId"],
        properties: {
          artifactId: { type: "string" }
        }
      },
      execute: (args, context) => readArtifact(String(args.artifactId), context)
    },
    {
      name: "calculatePerDiem",
      description: "Calculate and verify the TDY per diem total deterministically from extracted trip facts.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["tripFacts"],
        properties: {
          tripFacts: {
            type: "object",
            additionalProperties: true,
            required: ["destination", "locality", "startDate", "endDate", "travelers", "evidenceArtifactIds", "confidence", "rationale"],
            properties: {
              destination: { type: "string" },
              locality: { type: "string" },
              startDate: { type: "string" },
              endDate: { type: "string" },
              travelers: { type: "number" },
              evidenceArtifactIds: { type: "array", items: { type: "string" } },
              confidence: { type: "number" },
              rationale: { type: "string" }
            }
          }
        }
      },
      execute: (args) => calculatePerDiem(args.tripFacts as TripFacts)
    },
    {
      name: "retrievePolicyReference",
      description: "Retrieve a short policy or SOP reference for a TDY packet topic.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["topic"],
        properties: {
          topic: { type: "string" }
        }
      },
      execute: (args) => retrievePolicyReference(String(args.topic ?? ""))
    }
  ];
}

function runScriptedTranscriptIfConfigured(context: AgentContext<FieldDeskToolContext>, input: AgentRunInput): AgentMessage[] | null {
  const raw = process.env.FIELD_DESK_TEST_TOOL_LOOP_DECISIONS;
  if (!raw) return null;

  const messages = [...context.messages];
  const decisions = JSON.parse(raw) as ToolDecision[];
  const collectedMessages: AgentMessage[] = [];

  for (const [index, decision] of decisions.entries()) {
    if (decision.kind === "finish") {
      const missing = missingWorkflowRequirements(messages, input);
      const accepted = missing.length === 0;
      messages.push({
        role: "assistant",
        content: accepted ? decision.rationale ?? "Evidence collection complete." : `Finish rejected; still need to ${missing.join(", ")}.`
      });
      if (accepted) break;
      continue;
    }

    const toolCallId = `scripted-${index}`;
    messages.push({
      role: "assistant",
      content: decision.rationale,
      toolCalls: [{ id: toolCallId, name: decision.toolName, args: decision.args }]
    });
    const tool = context.tools.find((candidate) => candidate.name === decision.toolName);
    const result = tool ? tool.execute(decision.args, context.toolContext) : { ok: false, error: `Unknown tool: ${decision.toolName}` };
    messages.push({
      role: "tool",
      toolCallId,
      toolName: decision.toolName,
      content: JSON.stringify(result)
    });
  }

  collectedMessages.push(...messages);
  logAgent("scripted_transcript", {
    messages: collectedMessages.length,
    observations: observationsFromTranscript(collectedMessages).length
  });
  return collectedMessages;
}

async function synthesizeFinalOutput(args: {
  input: AgentRunInput;
  messages: AgentMessage[];
  observations: TranscriptObservation[];
  trace: AgentTraceStep[];
  stopReason: string;
  apiKey: string;
  model: string;
}): Promise<FieldDeskAgentObjectOutput> {
  if (process.env.FIELD_DESK_TEST_TOOL_LOOP_FINAL === "mock") {
    const mockRun = await runMockAgent(args.input);
    return {
      ...mockRun.objectOutput,
      agentTrace: args.trace
    };
  }

  const startedAt = Date.now();
  const payload = {
    task: "Return FieldDeskAgentObjectOutput for the TDY readiness workflow.",
    input: args.input,
    stopReason: args.stopReason,
    transcript: compactTranscriptForSynthesis(args.messages),
    requiredSourceRows,
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
    outputRules: [
      "Use only evidence present in transcript tool results.",
      "Cite artifact IDs from tool results.",
      "Do not approve travel or invent unavailable evidence.",
      "If calculatePerDiem was used, copy its deterministic total instead of recalculating in prose.",
      "Preserve conflicts and missing evidence as findings."
    ]
  };

  logAgent("synthesis_start", {
    model: args.model,
    transcriptMessages: args.messages.length,
    observations: args.observations.length,
    payloadBytes: JSON.stringify(payload).length
  });

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: openRouterHeaders(args.apiKey, "FieldDesk Transcript Synthesis"),
    body: JSON.stringify({
      model: args.model,
      messages: [
        {
          role: "system",
          content:
            "You are FieldDesk Agent. Synthesize the final FieldDeskAgentObjectOutput from the transcript. Return only valid JSON."
        },
        {
          role: "user",
          content: JSON.stringify(payload)
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
    throw new Error(`OpenRouter transcript synthesis failed with status ${response.status}${detail ? `: ${detail}` : ""}`);
  }

  const completion = await response.json() as OpenRouterChatCompletion;
  const output = parseModelJson<FieldDeskAgentObjectOutput>(completion, "OpenRouter transcript synthesis");
  logAgent("synthesis_end", {
    elapsedMs: Date.now() - startedAt,
    evidenceItems: output.evidenceMap?.length,
    findings: output.findings?.length,
    score: output.readiness?.score
  });
  return output;
}

function transformContext(messages: AgentMessage[]): AgentMessage[] {
  return messages.map((message) => {
    if (message.role !== "tool") return message;
    return {
      ...message,
      content: compactToolMessageContent(message.content)
    };
  });
}

function compactTranscriptForSynthesis(messages: AgentMessage[]) {
  return transformContext(messages).map((message) => {
    if (message.role === "assistant" && message.toolCalls) {
      return {
        role: message.role,
        content: message.content,
        toolCalls: message.toolCalls
      };
    }
    return message;
  });
}

function compactToolMessageContent(content: string) {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (isToolResult(parsed) && parsed.ok && isRecord(parsed.data) && typeof parsed.data.content === "string") {
      return JSON.stringify({
        ...parsed,
        data: {
          ...parsed.data,
          content: parsed.data.content.slice(0, 1600)
        }
      });
    }
  } catch {
    return content;
  }
  return content;
}

function observationsFromTranscript(messages: AgentMessage[]): TranscriptObservation[] {
  return messages
    .filter((message): message is Extract<AgentMessage, { role: "tool" }> => message.role === "tool")
    .map((message) => {
      const result = parseToolResult(message.content);
      return {
        toolName: message.toolName,
        ok: result.ok,
        summary: summarizeToolResult(message.toolName, result),
        artifactIds: artifactIdsFromResult(result),
        data: result.ok ? result.data : undefined
      };
    });
}

function traceFromTranscript(messages: AgentMessage[], stopReason: string): AgentTraceStep[] {
  const trace: AgentTraceStep[] = [
    {
      stepIndex: 1,
      kind: "plan",
      label: "Plan evidence search",
      observationSummary: "FieldDesk agent initialized a transcript-based tool loop for TDY readiness.",
      status: "Found"
    }
  ];

  for (const message of messages) {
    if (message.role === "assistant" && message.content && (!message.toolCalls || message.toolCalls.length === 0)) {
      trace.push({
        stepIndex: trace.length + 1,
        kind: "observation",
        label: message.content.startsWith("Finish rejected") ? "Continue collection" : "Assistant checkpoint",
        observationSummary: message.content,
        status: message.content.startsWith("Finish rejected") ? "Weak" : "Found"
      });
    }
    if (message.role === "tool") {
      const result = parseToolResult(message.content);
      const observation: TranscriptObservation = {
        toolName: message.toolName,
        ok: result.ok,
        summary: summarizeToolResult(message.toolName, result),
        artifactIds: artifactIdsFromResult(result),
        data: result.ok ? result.data : undefined
      };
      trace.push({
        stepIndex: trace.length + 1,
        kind: "tool_call",
        label: toolLabel(observation.toolName),
        toolName: observation.toolName,
        observationSummary: observation.summary,
        artifactIds: observation.artifactIds,
        status: observation.ok ? "Found" : "Conflict"
      });
    }
  }

  trace.push({
    stepIndex: trace.length + 1,
    kind: "synthesis",
    label: "Finish evidence collection",
    observationSummary: stopReason,
    status: "Found"
  });
  return trace;
}

function missingWorkflowRequirements(messages: AgentMessage[], input: AgentRunInput) {
  const observations = observationsFromTranscript(messages);
  const evidenceText = observations
    .filter((observation) => observation.ok)
    .map((observation) => `${observation.summary} ${JSON.stringify(observation.data ?? {})}`)
    .join("\n")
    .toLowerCase();

  const missing: string[] = [];
  if (!observations.some((observation) => observation.toolName === "searchSource" && observation.ok)) missing.push("search at least one selected source");
  if (!observations.some((observation) => observation.toolName === "readArtifact" && observation.ok)) missing.push("read at least one artifact");
  if (input.selectedSources.includes("SharePoint") && !/(roster|traveler|soldier|training order)/i.test(evidenceText)) {
    missing.push("inspect roster or training order evidence");
  }
  if (input.selectedSources.includes("Outlook") && !/(approval|proceed|fund|reviewer|risk)/i.test(evidenceText)) {
    missing.push("inspect approval or reviewer evidence");
  }
  return missing;
}

function parseToolResult(content: string): ToolResult<unknown> {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (isToolResult(parsed)) return parsed;
  } catch {
    return { ok: false, error: "Tool result was not valid JSON." };
  }
  return { ok: false, error: "Tool result had an unexpected shape." };
}

function isToolResult(value: unknown): value is ToolResult<unknown> {
  return isRecord(value) && typeof value.ok === "boolean";
}

function artifactIdsFromResult(result: ToolResult<unknown>) {
  if (!result.ok) return [];
  if (isRecord(result.data) && Array.isArray(result.data.artifacts)) {
    return result.data.artifacts
      .filter(isRecord)
      .map((artifact) => String(artifact.id));
  }
  if (isRecord(result.data) && typeof result.data.id === "string") return [result.data.id];
  return [];
}

function summarizeToolResult(toolName: string, result: ToolResult<unknown>) {
  if (!result.ok) return result.error;
  if (toolName === "searchSource" && isRecord(result.data) && Array.isArray(result.data.artifacts)) {
    return `Found ${result.data.artifacts.length} available artifact${result.data.artifacts.length === 1 ? "" : "s"}.`;
  }
  if (toolName === "readArtifact" && isRecord(result.data)) {
    return `Read ${String(result.data.title)} from ${String(result.data.source)}.`;
  }
  if (toolName === "calculatePerDiem" && isRecord(result.data)) {
    return `Verified per diem total ${String(result.data.formattedTotal ?? "")}.`;
  }
  if (toolName === "retrievePolicyReference" && isRecord(result.data)) {
    return `Retrieved ${String(result.data.source)} ${String(result.data.reference)}.`;
  }
  return "Tool completed.";
}

function toolLabel(toolName: string) {
  if (toolName === "searchSource") return "Search source";
  if (toolName === "readArtifact") return "Read artifact";
  if (toolName === "calculatePerDiem") return "Verify per diem";
  if (toolName === "retrievePolicyReference") return "Retrieve policy";
  return "Run tool";
}

function countAssistantTurns(messages: AgentMessage[]) {
  return messages.filter((message) => message.role === "assistant").length;
}

function parseModelJson<T>(completion: OpenRouterChatCompletion, label: string): T {
  const content = completion.choices?.[0]?.message?.content;
  if (!content) throw new Error(`${label} did not include message content.`);
  return JSON.parse(content) as T;
}

function emitRuntimeEvent(event: AgentRuntimeEvent) {
  logAgent(event.type, {
    elapsedMs: event.elapsedMs,
    ...(event.data ?? {})
  });
}

function logAgent(event: string, payload: Record<string, unknown>) {
  console.log(`[fielddesk-agent] ${event}`, JSON.stringify(payload));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type OpenRouterChatCompletion = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};
