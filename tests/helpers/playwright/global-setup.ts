import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sealSessionCookie } from "../../../src/auth/session";
import { FIXTURE_DATE } from "../../fixtures/seeds";
import { getDb } from "../../../src/db/client";
import { users, sessions } from "../../../src/db/schema";
import { eq } from "drizzle-orm";

type StorageState = {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: "Lax" | "Strict" | "None";
  }>;
  origins: Array<{
    origin: string;
    localStorage: Array<{ name: string; value: string }>;
  }>;
};

async function globalSetup() {
  const authDir = join(process.cwd(), "playwright", ".auth");
  await mkdir(authDir, { recursive: true });

  const db = getDb();

  const roles = [
    { name: "user", email: "user@example.com" },
    { name: "organizer", email: "organizer@example.com" },
    { name: "admin", email: "admin@example.com" },
  ] as const;

  const sessionExpiry = new Date(FIXTURE_DATE);
  sessionExpiry.setDate(sessionExpiry.getDate() + 30);

  for (const role of roles) {
    const [userResult] = await db
      .select({
        id: users.id,
        email: users.email,
      })
      .from(users)
      .where(eq(users.email, role.email))
      .limit(1);

    if (!userResult) {
      console.warn(`User ${role.email} not found, skipping storageState for ${role.name}`);
      continue;
    }

    const sessionId = `00000000-0000-0000-0000-00000000006${roles.indexOf(role) + 1}`;

    await db.insert(sessions).values({
      id: sessionId,
      userId: userResult.id,
      csrfToken: `csrf-${role.name}-test`,
      expiresAt: sessionExpiry,
      createdAt: new Date(FIXTURE_DATE),
    }).onConflictDoNothing();

    const cookieHeader = await sealSessionCookie({ sessionId });
    const cookieParts = cookieHeader.split(";").map((p) => p.trim());
    const [nameValue] = cookieParts[0].split("=");
    const cookieValue = nameValue === "slotmerge_session" ? decodeURIComponent(cookieParts[0].split("=")[1] ?? "") : "";

    const cookieObj = {
      name: "slotmerge_session",
      value: cookieValue || decodeURIComponent(cookieParts[0].split("=")[1] ?? ""),
      domain: "localhost",
      path: "/",
      expires: Math.floor(sessionExpiry.getTime() / 1000),
      httpOnly: true,
      secure: false,
      sameSite: "Lax" as const,
    };

    const storageState: StorageState = {
      cookies: [cookieObj],
      origins: [
        {
          origin: "http://localhost:3000",
          localStorage: [],
        },
      ],
    };

    const filePath = join(authDir, `${role.name}.json`);
    await writeFile(filePath, JSON.stringify(storageState, null, 2));

    console.log(`Created storageState for ${role.name} at ${filePath}`);
  }
}

export default globalSetup;
