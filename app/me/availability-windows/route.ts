// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function GET(_request: Request): Response {
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function POST(_request: Request): Response {
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
