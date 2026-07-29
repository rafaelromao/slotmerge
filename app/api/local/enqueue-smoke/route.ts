import { createEnqueueSmokeResponse } from "../../../../src/local/enqueue-smoke";
import { systemClock } from "../../../../src/system/clock";

export async function POST(request: Request): Promise<Response> {
  return createEnqueueSmokeResponse(request, { clock: systemClock() });
}
