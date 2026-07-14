import { createSearchHistoryHandlers } from "../../../src/search/history-route";

const handlers = createSearchHistoryHandlers();

export async function GET(request: Request): Promise<Response> {
  return handlers.getHistory(request);
}
