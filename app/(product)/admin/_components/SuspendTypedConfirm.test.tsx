// @vitest-environment happy-dom

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";

import { SuspendTypedConfirm } from "./SuspendTypedConfirm";

afterEach(cleanup);

function buildProps() {
  return {
    userId: "u-2",
    userEmail: "ada@example.com",
    csrfToken: "csrf-1",
    action: vi.fn(async () => {}),
  };
}

describe("SuspendTypedConfirm", () => {
  it("disables the Suspend button until the typed email matches", () => {
    const props = buildProps();
    render(<SuspendTypedConfirm {...props} />);

    const button = screen.getByTestId<HTMLButtonElement>(
      "suspend-confirm-button-u-2",
    );
    expect(button.disabled).toBe(true);

    const input = screen.getByTestId<HTMLInputElement>(
      "suspend-confirm-input-u-2",
    );
    fireEvent.change(input, { target: { value: "wrong@example.com" } });
    expect(button.disabled).toBe(true);

    fireEvent.change(input, { target: { value: "  ADA@example.com  " } });
    expect(button.disabled).toBe(false);
  });

  it("includes the userId, csrf token, and confirmEmail in the submitted form", () => {
    const props = buildProps();
    render(<SuspendTypedConfirm {...props} />);

    const input = screen.getByTestId<HTMLInputElement>(
      "suspend-confirm-input-u-2",
    );
    fireEvent.change(input, { target: { value: "ada@example.com" } });

    const form = screen.getByTestId("suspend-typed-confirm-u-2");
    const csrfInput = form.querySelector<HTMLInputElement>(
      'input[name="_csrf"]',
    );
    const userIdInput = form.querySelector<HTMLInputElement>(
      'input[name="userId"]',
    );
    expect(csrfInput?.value).toBe("csrf-1");
    expect(userIdInput?.value).toBe("u-2");
    expect(input.value).toBe("ada@example.com");
  });
});
