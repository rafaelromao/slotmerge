/**
 * Stub route — not yet implemented.
 * E2E test coverage: PRD stories 10-14 → test 51 (topic proposal submission)
 */
export const dynamic = "force-dynamic";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(request: Request) {
  await Promise.resolve();
  return new Response(
    JSON.stringify({ error: "not_implemented" }),
    { status: 501, headers: { "Content-Type": "application/json" } },
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function POST(request: Request) {
  await Promise.resolve();
  return new Response(
    JSON.stringify({ error: "not_implemented" }),
    { status: 501, headers: { "Content-Type": "application/json" } },
  );
}
