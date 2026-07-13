import { createSearchHistoryHandlers } from "../../../../src/search/history-route";

const handlers = createSearchHistoryHandlers();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  return handlers.getSnapshot(request, id);
}
