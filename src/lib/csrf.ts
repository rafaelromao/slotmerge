import { timingSafeEqual } from "node:crypto";

import { loadRuntimeConfig } from "../config/runtime";
import type { Session } from "../auth/session";

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export class CsrfError extends Error {
  constructor() {
    super("CSRF check failed");
    this.name = "CsrfError";
  }

  toResponse(): Response {
    return new Response(null, {
      status: 403,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

export async function assertCsrfOrThrow(
  request: Request,
  session: Session,
): Promise<void> {
  if (UNSAFE_METHODS.has(request.method.toUpperCase())) {
    assertOrigin(request);
    assertSecFetchSite(request);
  }

  const token = await extractTokenFromRequest(request);
  if (!token) {
    throw new CsrfError();
  }

  if (!tokensMatch(token, session.csrfToken)) {
    throw new CsrfError();
  }
}

export function assertCsrfFromFormData(
  formData: FormData,
  session: Session,
): void {
  const token = formData.get("_csrf");
  if (typeof token !== "string" || !token) {
    throw new CsrfError();
  }

  if (!tokensMatch(token, session.csrfToken)) {
    throw new CsrfError();
  }
}

function assertOrigin(request: Request): void {
  const origin = request.headers.get("Origin");
  if (!origin) {
    throw new CsrfError();
  }

  const expected = new URL(loadRuntimeConfig().appPublicUrl).origin;
  if (origin !== expected) {
    throw new CsrfError();
  }
}

function assertSecFetchSite(request: Request): void {
  const site = request.headers.get("Sec-Fetch-Site");
  if (site && site.toLowerCase() === "cross-site") {
    throw new CsrfError();
  }
}

async function extractTokenFromRequest(
  request: Request,
): Promise<string | null> {
  const headerToken = request.headers.get("x-csrf-token");
  if (headerToken) {
    return headerToken;
  }

  const contentType = request.headers.get("Content-Type") ?? "";
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const text = await request.clone().text();
    const params = new URLSearchParams(text);
    return params.get("_csrf");
  }

  if (contentType.includes("multipart/form-data")) {
    const form = await request.clone().formData();
    const value = form.get("_csrf");
    return typeof value === "string" ? value : null;
  }

  return null;
}

function tokensMatch(actual: string, expected: string): boolean {
  if (actual.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}
