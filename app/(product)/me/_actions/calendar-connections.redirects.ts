import type { Session } from "../../../../src/auth/session";

export type CalendarConnectionFormIntent = "save" | "refresh" | "disconnect";

export type CalendarConnectionFormErrorCode =
  | "csrf_error"
  | "missing_connection"
  | "forbidden"
  | "missing_calendar_token"
  | "missing_oauth_configuration"
  | "provider_request_failed"
  | "enqueue_failed"
  | "invalid_confirmation"
  | "invalid_provider"
  | "invalid_input";

export function buildErrorRedirect(
  intent: CalendarConnectionFormIntent,
  code: CalendarConnectionFormErrorCode,
  connectionId?: string,
): string {
  const params = new URLSearchParams({ intent });
  params.set("error", code);
  if (connectionId) {
    params.set("connectionId", connectionId);
  }
  return `/me/calendar-connections?${params.toString()}`;
}

export function refreshRedirectTarget(
  session: Session,
  connectionId: string,
): string {
  if (session.user.role === "admin") {
    return `/admin?action=refresh_ok&connectionId=${encodeURIComponent(connectionId)}`;
  }
  return `/me/calendar-connections?intent=refresh&success=1&connectionId=${encodeURIComponent(connectionId)}`;
}

export function disconnectRedirectTarget(session: Session): string {
  if (session.user.role === "admin") {
    return "/admin?action=disconnect_ok";
  }
  return "/me/calendar-connections?intent=disconnect&success=1";
}

export function refreshErrorRedirect(
  session: Session,
  code: CalendarConnectionFormErrorCode,
  connectionId: string | null,
): string {
  if (session.user.role === "admin") {
    const params = new URLSearchParams({ action: "refresh_err", error: code });
    if (connectionId) {
      params.set("connectionId", connectionId);
    }
    return `/admin?${params.toString()}`;
  }
  return buildErrorRedirect("refresh", code, connectionId ?? undefined);
}

export function disconnectErrorRedirect(
  session: Session,
  code: CalendarConnectionFormErrorCode,
): string {
  if (session.user.role === "admin") {
    const params = new URLSearchParams({
      action: "disconnect_err",
      error: code,
    });
    return `/admin?${params.toString()}`;
  }
  return buildErrorRedirect("disconnect", code);
}
