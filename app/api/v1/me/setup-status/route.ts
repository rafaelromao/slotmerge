import { getSessionFromRequest } from "../../../../../src/auth/session";
import { problemJson } from "../../../../../src/api/problem-json";
import { serializeSetupStatus } from "../../../../../src/api/serializers";
import { createProductionSetupHomeWorkflow } from "../../../../../src/workflow/setup-home-production";
import type { SetupHomeWorkflow } from "../../../../../src/workflow/setup-home";

let workflowOverride: SetupHomeWorkflow | null = null;

export function setSetupHomeWorkflowForTests(
  workflow: SetupHomeWorkflow | null,
) {
  workflowOverride = workflow;
}

function getSetupHomeWorkflow(): SetupHomeWorkflow {
  return workflowOverride ?? createProductionSetupHomeWorkflow();
}

export async function GET(request: Request): Promise<Response> {
  const session = await getSessionFromRequest(request);

  if (!session) {
    return problemJson(401, {
      title: "Sign in required",
      detail: "Authenticate with a sealed session cookie to read setup status.",
    });
  }

  const result = await getSetupHomeWorkflow().loadSummary({
    userId: session.user.id,
  });

  if (!result.ok) {
    return problemJson(503, {
      title: "Setup status unavailable",
      detail: "The setup status could not be read. Try again in a moment.",
    });
  }

  return Response.json(serializeSetupStatus(result.value));
}
