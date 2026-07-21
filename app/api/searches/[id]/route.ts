export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  return Response.json(
    { error: "gone", message: "This endpoint has been retired." },
    {
      status: 404,
      headers: {
        Link: `</api/v1/searches/${id}>; rel="successor-version"`,
      },
    },
  );
}
