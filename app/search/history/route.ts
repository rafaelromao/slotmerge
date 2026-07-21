// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function GET(_request: Request): Response {
  return Response.json(
    { error: "gone", message: "This endpoint has been retired." },
    {
      status: 404,
      headers: {
        Link: `</api/v1/searches/{id}>; rel="successor-version"`,
      },
    },
  );
}
