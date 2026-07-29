// @vitest-environment happy-dom

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup } from "@testing-library/react";

import { HeaderMenuToggle } from "../app/(product)/_components/HeaderMenuToggle";

afterEach(cleanup);

describe("HeaderMenuToggle", () => {
  it("updates aria-expanded when the disclosure opens and closes", () => {
    render(
      <HeaderMenuToggle displayName="Alice User" email="alice@example.com">
        <span>Menu</span>
      </HeaderMenuToggle>,
    );

    const trigger = screen.getByTestId("avatar-dropdown-trigger");
    expect(trigger.getAttribute("aria-label")).toBe(
      "Account menu for Alice User",
    );
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });
});
