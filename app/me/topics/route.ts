/**
 * Stub route — not yet implemented.
 * E2E test coverage: PRD stories 15-17 → tests 51-53 (topic associations)
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
export async function PUT(request: Request) {
  await Promise.resolve();
  return new Response(
    JSON.stringify({ error: "not_implemented" }),
    { status: 501, headers: { "Content-Type": "application/json" } },
  );
}
