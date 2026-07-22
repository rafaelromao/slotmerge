import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";

import {
  DiscoverabilityView,
  toConsentView,
} from "../app/(product)/me/_components/DiscoverabilityView";

const noopAction = async () => {
  // noop action for component tests
};

describe("DiscoverabilityView", () => {
  it("renders the consent form with the checkbox unchecked and no copy when consent is null", () => {
    const view = toConsentView(null);
    const html = renderToString(
      <DiscoverabilityView
        view={view}
        csrfToken="csrf-token-1"
        setDiscoverabilityAction={noopAction}
      />,
    );

    expect(html).toContain("data-testid=\"discoverability-form\"");
    expect(html).toContain("data-testid=\"discoverability-consent-checkbox\"");
    expect(html).toContain("data-testid=\"discoverability-save\"");
    expect(html).not.toContain("data-testid=\"discoverability-granted\"");
    expect(html).not.toContain("data-testid=\"discoverability-revoked-note\"");
  });

  it("renders the granted view with the granted date and a Revoke button when consent is granted", () => {
    const view = toConsentView({
      state: "granted",
      grantedAt: new Date("2026-07-12T12:00:00.000Z"),
    });
    const html = renderToString(
      <DiscoverabilityView
        view={view}
        csrfToken="csrf-token-1"
        setDiscoverabilityAction={noopAction}
      />,
    );

    expect(html).toContain("data-testid=\"discoverability-granted\"");
    expect(html).toContain("data-testid=\"discoverability-revoke\"");
    expect(html).toContain("data-state=\"granted\"");
    expect(html).not.toContain("data-testid=\"discoverability-form\"");
    expect(html).toContain("Consent granted on");
    expect(html).toContain("July");
  });

  it("renders the revoked view with the form plus the 'Consent revoked on' note when consent is revoked", () => {
    const view = toConsentView({
      state: "revoked",
      revokedAt: new Date("2026-07-13T08:00:00.000Z"),
    });
    const html = renderToString(
      <DiscoverabilityView
        view={view}
        csrfToken="csrf-token-1"
        setDiscoverabilityAction={noopAction}
      />,
    );

    expect(html).toContain("data-testid=\"discoverability-form\"");
    expect(html).toContain("data-testid=\"discoverability-consent-checkbox\"");
    expect(html).toContain("data-testid=\"discoverability-revoked-note\"");
    expect(html).toContain("data-state=\"revoked\"");
    expect(html).toContain("Consent revoked on");
    expect(html).not.toContain("data-testid=\"discoverability-granted\"");
  });

  it("surfaces the consent_required field error inline and announces it via aria-live", () => {
    const view = toConsentView(null);
    const html = renderToString(
      <DiscoverabilityView
        view={view}
        csrfToken="csrf-token-1"
        errorCode="consent_required"
        setDiscoverabilityAction={noopAction}
      />,
    );

    expect(html).toContain("data-testid=\"discoverability-consent-error\"");
    expect(html).toContain("aria-live=\"polite\"");
    expect(html).toContain("Please tick the consent checkbox");
  });

  it("embeds the csrf token and the granted=true hidden field on the consent form", () => {
    const view = toConsentView(null);
    const html = renderToString(
      <DiscoverabilityView
        view={view}
        csrfToken="csrf-token-1"
        setDiscoverabilityAction={noopAction}
      />,
    );

    expect(html).toContain("name=\"_csrf\" value=\"csrf-token-1\"");
    expect(html).toContain("name=\"granted\" value=\"true\"");
  });

  it("embeds the csrf token and the granted=false hidden field on the revoke form", () => {
    const view = toConsentView({
      state: "granted",
      grantedAt: new Date("2026-07-12T12:00:00.000Z"),
    });
    const html = renderToString(
      <DiscoverabilityView
        view={view}
        csrfToken="csrf-token-1"
        setDiscoverabilityAction={noopAction}
      />,
    );

    expect(html).toContain("data-testid=\"discoverability-revoke-form\"");
    expect(html).toContain("name=\"_csrf\" value=\"csrf-token-1\"");
    expect(html).toContain("name=\"granted\" value=\"false\"");
  });

  it("lists the visible and hidden items in the Organizer copy block", () => {
    const view = toConsentView(null);
    const html = renderToString(
      <DiscoverabilityView
        view={view}
        csrfToken="csrf-token-1"
        setDiscoverabilityAction={noopAction}
      />,
    );

    expect(html).toContain("Display name");
    expect(html).toContain("Avatar");
    expect(html).toContain("Short bio");
    expect(html).toContain("Full Topic profile");
    expect(html).toContain("Topic-filtered Availability");

    expect(html).toContain("Raw calendar events");
    expect(html).toContain("Calendar titles");
    expect(html).toContain("Attendees");
    expect(html).toContain("Locations");
    expect(html).toContain("Descriptions");
    expect(html).toContain("Email address");
  });
});
