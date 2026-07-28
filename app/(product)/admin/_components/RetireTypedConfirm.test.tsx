// @vitest-environment happy-dom

import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RetireTypedConfirm } from "./RetireTypedConfirm";

afterEach(cleanup);

function buildProps(
  overrides: Partial<{
    topicId: string;
    topicName: string;
    csrfToken: string;
    disabledBySelfAction: boolean;
  }> = {},
) {
  return {
    topicId: "topic-1",
    topicName: "Sailing",
    csrfToken: "csrf-1",
    disabledBySelfAction: false,
    action: vi.fn(async () => {}),
    ...overrides,
  };
}

describe("RetireTypedConfirm", () => {
  it("disables the Retire button until the typed name matches the topic", () => {
    const props = buildProps();
    render(<RetireTypedConfirm {...props} />);

    const button = screen.getByTestId<HTMLButtonElement>(
      "topics-retire-button-topic-1",
    );
    expect(button.disabled).toBe(true);

    const input = screen.getByTestId<HTMLInputElement>(
      "topics-retire-input-topic-1",
    );
    fireEvent.change(input, { target: { value: "wrong-name" } });
    expect(button.disabled).toBe(true);

    fireEvent.change(input, { target: { value: "  SAILING  " } });
    expect(button.disabled).toBe(false);
  });

  it("includes the topicId, csrf token, and confirmName in the submitted form", () => {
    const props = buildProps();
    render(<RetireTypedConfirm {...props} />);

    const input = screen.getByTestId<HTMLInputElement>(
      "topics-retire-input-topic-1",
    );
    fireEvent.change(input, { target: { value: "Sailing" } });

    const form = screen.getByTestId<HTMLFormElement>(
      "topics-retire-form-topic-1",
    );
    const csrfInput = form.querySelector<HTMLInputElement>(
      'input[name="_csrf"]',
    );
    const topicIdInput = form.querySelector<HTMLInputElement>(
      'input[name="topicId"]',
    );
    expect(csrfInput?.value).toBe("csrf-1");
    expect(topicIdInput?.value).toBe("topic-1");
    expect(input.value).toBe("Sailing");
  });

  it("renders disabled input, disabled button, and the self-action help text when disabledBySelfAction is true", () => {
    const props = buildProps({ disabledBySelfAction: true });
    render(<RetireTypedConfirm {...props} />);

    const input = screen.getByTestId<HTMLInputElement>(
      "topics-retire-input-topic-1",
    );
    expect(input.disabled).toBe(true);

    const button = screen.getByTestId<HTMLButtonElement>(
      "topics-retire-button-topic-1",
    );
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("title")).toBe(
      "You cannot retire a Topic you proposed.",
    );

    const help = screen.getByTestId<HTMLSpanElement>(
      "topics-self-action-help-topic-1",
    );
    expect(help.textContent).toBe(
      "You cannot retire a Topic you proposed.",
    );
    expect(help.getAttribute("role")).toBe("note");
    expect(input.getAttribute("aria-describedby")).toBe(help.id);
    expect(button.getAttribute("aria-describedby")).toBe(help.id);
  });

  it("keeps the Retire button disabled even when the typed-confirm matches a self-action topic", () => {
    const props = buildProps({ disabledBySelfAction: true });
    render(<RetireTypedConfirm {...props} />);

    const input = screen.getByTestId<HTMLInputElement>(
      "topics-retire-input-topic-1",
    );
    fireEvent.change(input, { target: { value: "Sailing" } });

    const button = screen.getByTestId<HTMLButtonElement>(
      "topics-retire-button-topic-1",
    );
    expect(button.disabled).toBe(true);
  });

  it("does not render the self-action help text when the topic is not self-action", () => {
    const props = buildProps({ disabledBySelfAction: false });
    render(<RetireTypedConfirm {...props} />);

    expect(
      screen.queryByTestId("topics-self-action-help-topic-1"),
    ).toBeNull();
  });
});
