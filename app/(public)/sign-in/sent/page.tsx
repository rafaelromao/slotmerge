import Link from "next/link";

type SearchParams = Promise<{
  email?: string | string[];
}>;

export default async function SentPage({
  searchParams,
}: {
  searchParams?: SearchParams;
} = {}) {
  const params = (await searchParams) ?? {};
  const email = firstString(params.email);
  const maskedEmail = email ? maskEmail(email) : null;

  return (
    <main className="app-container">
      <h1>Check your inbox</h1>
      {maskedEmail ? (
        <p data-testid="sent-masked-email" className="sent-masked-email">
          We sent a sign-in link to <strong>{maskedEmail}</strong>.
        </p>
      ) : (
        <p data-testid="sent-masked-email" className="sent-masked-email">
          If an account exists for that email, we just sent a sign-in link.
        </p>
      )}
      <p
        className="sent-non-leaking"
        role="status"
        data-testid="sent-non-leaking"
      >
        If an account exists for that email, we just sent a sign-in link.
      </p>
      <p className="sent-help">
        The link expires in one hour. You can close this tab if you need to.
      </p>
      <p>
        <Link href="/sign-in" className="sent-use-different-email">
          Use a different email
        </Link>
      </p>
    </main>
  );
}

function firstString(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) {
    return email;
  }
  const local = email.slice(0, at);
  const domain = email.slice(at);
  if (local.length <= 1) {
    return `${local}${domain}`;
  }
  return `${local[0]}${"*".repeat(Math.max(local.length - 1, 3))}${domain}`;
}