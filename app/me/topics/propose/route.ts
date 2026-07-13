import { submitTopicProposal } from "../route";

export async function POST(request: Request): Promise<Response> {
  return submitTopicProposal(request);
}
