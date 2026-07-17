import type { Session } from "../auth/session";

export function isAdminSession(session: Session | null): session is Session {
  return session?.user.role === "admin";
}

export function adminAccessDeniedResponse(session: Session | null): Response {
  return htmlResponse(
    session
      ? "<h1>Forbidden</h1><p>Admin access required.</p>"
      : "<h1>Unauthorized</h1><p>Sign in required.</p>",
    session ? 403 : 401,
  );
}

export function htmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export type AdminAlert = {
  message: string;
};

export function renderAdminShell({
  title,
  body,
  alert,
}: {
  title: string;
  body: string;
  alert?: AdminAlert;
}): string {
  const alertHtml = alert
    ? `<p role="alert">${escapeHtml(alert.message)}</p>`
    : "";

  return `<!doctype html>
<html lang="en">
  <body>
    <main>
      <h1>${escapeHtml(title)}</h1>
      ${alertHtml}
      ${body}
    </main>
  </body>
</html>`;
}
