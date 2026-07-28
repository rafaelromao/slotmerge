export type ProblemJsonInput = {
  title: string;
  detail?: string;
  type?: string;
};

export function problemJson(status: number, input: ProblemJsonInput): Response {
  const body: { type: string; title: string; status: number; detail?: string } =
    {
      type: input.type ?? "about:blank",
      title: input.title,
      status,
    };

  if (input.detail !== undefined) {
    body.detail = input.detail;
  }

  return Response.json(body, {
    status,
    headers: {
      "content-type": "application/problem+json",
    },
  });
}
