import { buildPacketAnalysis } from "../../../lib/fielddesk-demo";

export const runtime = "nodejs";

type RunWorkflowRequest = {
  input?: string;
  text?: string;
};

export async function POST(request: Request) {
  let payload: RunWorkflowRequest = {};

  try {
    payload = (await request.json()) as RunWorkflowRequest;
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  return Response.json(buildPacketAnalysis(payload.input ?? payload.text));
}
