import { createEnqueueSmokeResponse } from "../../../../src/local/enqueue-smoke";

export async function POST(request: Request): Promise<Response> {
  return createEnqueueSmokeResponse(request);
}
