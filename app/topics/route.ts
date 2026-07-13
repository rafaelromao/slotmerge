import { getSessionFromRequest } from "../../src/auth/session";
import { listActiveTopics } from "../../src/topics/repository";

export async function GET(request: Request): Promise<Response> {
  const session = await getSessionFromRequest(request);

  if (!session) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }

  const topics = await listActiveTopics();

  return Response.json({
    topics: topics.map((topic) => ({
      id: topic.id,
      name: topic.name,
    })),
  });
}
