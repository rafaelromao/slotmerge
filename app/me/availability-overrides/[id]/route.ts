export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  await params;

  return Response.json(
    { error: "gone", message: "This endpoint has been retired." },
    {
      status: 404,
      headers: {
        Link: `</me/availability>; rel="successor-version"`,
      },
    },
  );
}
