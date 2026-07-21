import { getCapturedEmailsForRecipient } from "../../../../../src/local/email-capture";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ recipient: string }> },
): Promise<Response> {
  if (process.env.APP_ENV !== "local" && process.env.APP_ENV !== "test") {
    return new Response("Not found", { status: 404 });
  }

  const { recipient } = await params;
  const decodedRecipient = decodeURIComponent(recipient);
  const emails = getCapturedEmailsForRecipient(decodedRecipient);

  return Response.json({ emails }, { status: 200 });
}
