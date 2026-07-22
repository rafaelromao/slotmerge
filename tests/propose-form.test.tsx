// @vitest-environment happy-dom
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

describe("ProposeForm (propose client island)", () => {
  it("renders the propose form structure with the CSRF token", async () => {
    const { ProposeForm } = await import(
      "../app/(product)/me/_components/ProposeForm"
    );
    const html = renderToString(<ProposeForm csrfToken="csrf-1" />);

    expect(html).toContain("topics-propose-form");
    expect(html).toContain('name="_csrf" value="csrf-1"');
    expect(html).toContain('id="topics-propose-input"');
    expect(html).toContain("topics-propose-hint");
    expect(html).not.toContain("topics-propose-error");
    expect(html).toContain("topics-propose-submit");
    expect(html).not.toContain("topics-propose-success");
  });

  it("renders the propose field with an inline error and preserves input when state is too_similar", async () => {
    const { ProposeFormField } = await import(
      "../app/(product)/me/_components/ProposeForm"
    );
    const html = renderToString(
      <ProposeFormField
        state={{
          ok: "error",
          fieldError:
            "Too similar to existing Topics: Product strategy. Please pick a different name.",
          values: { candidateName: "Product strateg" },
        }}
      />,
    );

    expect(html).toContain("topics-propose-error");
    expect(html).toContain("Product strateg");
    expect(html).toContain("Too similar to existing Topics");
    expect(html).toContain('aria-invalid="true"');
    expect(html).not.toContain("topics-propose-hint");
  });

  it("renders the propose field with the hint when state is idle", async () => {
    const { ProposeFormField } = await import(
      "../app/(product)/me/_components/ProposeForm"
    );
    const html = renderToString(
      <ProposeFormField state={{ ok: "idle" }} />,
    );

    expect(html).toContain("topics-propose-hint");
    expect(html).toContain('aria-invalid="false"');
    expect(html).not.toContain("topics-propose-error");
  });

  it("renders the success banner when state is success", async () => {
    const { ProposeFormStatus } = await import(
      "../app/(product)/me/_components/ProposeForm"
    );
    const html = renderToString(
      <ProposeFormStatus
        state={{
          ok: "success",
          values: { candidateName: "Sailing" },
          proposal: {
            id: "proposal-1",
            candidateName: "Sailing",
            status: "pending",
            createdAt: new Date(),
          },
        }}
      />,
    );

    expect(html).toContain("topics-propose-success");
    expect(html).toContain("Proposal submitted");
  });

  it("returns nothing when state is not success", async () => {
    const { ProposeFormStatus } = await import(
      "../app/(product)/me/_components/ProposeForm"
    );
    expect(
      renderToString(<ProposeFormStatus state={{ ok: "idle" }} />),
    ).toBe("");
    expect(
      renderToString(
        <ProposeFormStatus
          state={{
            ok: "error",
            fieldError: "x",
            values: { candidateName: "y" },
          }}
        />,
      ),
    ).toBe("");
  });
});
