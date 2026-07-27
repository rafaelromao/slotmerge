// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DeleteAccountConfirm } from "./DeleteAccountConfirm";

afterEach(cleanup);

describe("DeleteAccountConfirm", () => {
  it("enables deletion only when the input matches DELETE exactly", () => {
    render(<DeleteAccountConfirm csrfToken="csrf-295" />);

    const input = screen.getByRole<HTMLInputElement>("textbox", {
      name: "Type DELETE to confirm",
    });
    const button = screen.getByRole<HTMLButtonElement>("button", {
      name: "Delete my account",
    });

    expect(button.disabled).toBe(true);
    for (const value of ["delete", "DELETE ", " DELETE"]) {
      fireEvent.change(input, { target: { value } });
      expect(button.disabled).toBe(true);
    }

    fireEvent.change(input, { target: { value: "DELETE" } });
    expect(button.disabled).toBe(false);
  });

  it("renders server validation as an announced field error", () => {
    render(
      <DeleteAccountConfirm csrfToken="csrf-295" error="confirm_mismatch" />,
    );

    const form = screen.getByTestId<HTMLFormElement>("delete-account-form");
    const input = screen.getByRole<HTMLInputElement>("textbox", {
      name: "Type DELETE to confirm",
    });
    const error = screen.getByRole("alert");

    expect(form.method).toBe("POST");
    expect(form.getAttribute("action")).toBe("/me/delete/submit");
    expect(
      form.querySelector<HTMLInputElement>('input[name="_csrf"]')?.value,
    ).toBe("csrf-295");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe(error.id);
    expect(error.getAttribute("aria-live")).toBe("polite");
    expect(error.textContent).toContain("match DELETE exactly");
  });
});
