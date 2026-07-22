import {
  authWorkflow,
  requestContextFromRequest,
} from "../../../../src/workflow/auth";

export const dynamic = "force-dynamic";

export const POST = async (request: Request): Promise<Response> => {
  const formData = await request.formData();
  const email = formData.get("email");
  if (typeof email !== "string") {
    return jsonResponse({ error: "invalid_email" }, 400);
  }

  const result = await authWorkflow.requestMagicLink({
    email,
    requestContext: requestContextFromRequest(request),
  });
  if (result.ok) {
    return jsonResponse({ sent: true }, 202);
  }
  if (result.error === "rate_limited") {
    return jsonResponse({ error: result.error }, 429);
  }
  return jsonResponse({ error: result.error }, 400);
};

function jsonResponse(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
