import { createHealthResponse } from "../../../../src/local/smoke";

export async function GET(): Promise<Response> {
  return createHealthResponse();
}
