import { legacyRedirect } from "../../../../src/lib/legacy-redirect";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  return legacyRedirect({
    target: `/api/v1/searches/${id}`,
    sunset: new Date("2026-12-31T23:59:59.000Z"),
  });
}
