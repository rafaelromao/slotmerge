import { captureEmail } from "../../../../../src/local/email-capture";

type CaptureRequestBody = {
  recipient: string;
  type: string;
  payload: Record<string, unknown>;
  capturedAt: string;
};

export async function POST(request: Request): Promise<Response> {
  if (process.env.APP_ENV !== "local" && process.env.APP_ENV !== "test") {
    return new Response("Not found", { status: 404 });
  }

  const body = (await request.json()) as CaptureRequestBody;
  captureEmail({
    recipient: body.recipient,
    type: body.type,
    payload: body.payload,
    capturedAt: body.capturedAt,
  });

  return new Response(null, { status: 204 });
}
