import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sealSessionCookieValue } from "../../../src/auth/session";
import { FIXTURE_DATE, seedAll } from "../../fixtures/seeds";
import { getDb } from "../../../src/db/client";
import { users, sessions, invites } from "../../../src/db/schema";
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

const SESSION_IDS = [
  "00000000-0000-0000-0000-000000000060",
  "00000000-0000-0000-0000-000000000061",
  "00000000-0000-0000-0000-000000000062",
] as const;

async function globalSetup() {
  const authDir = join(process.cwd(), "playwright", ".auth");
  await mkdir(authDir, { recursive: true });

  const db = getDb();

  await seedAll(db);

  const inviteExpiry = new Date(FIXTURE_DATE);
  inviteExpiry.setDate(inviteExpiry.getDate() + 30);
  await db
    .insert(invites)
    .values({
      id: "00000000-0000-0000-0000-000000000070",
      email: "invited-user@example.com",
      role: "user",
      status: "pending",
      magicLinkGeneration: 0,
      expiresAt: inviteExpiry,
      createdAt: new Date(FIXTURE_DATE),
      updatedAt: new Date(FIXTURE_DATE),
    })
    .onConflictDoUpdate({
      target: invites.email,
      set: {
        status: "pending",
        magicLinkGeneration: 0,
        expiresAt: inviteExpiry,
        updatedAt: new Date(FIXTURE_DATE),
      },
    });

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
      throw new Error(`Fixture user ${role.email} not found after seeding`);
    }

    const roleIndex = roles.indexOf(role);
    const sessionId = SESSION_IDS[roleIndex];

    await db
      .insert(sessions)
      .values({
        id: sessionId,
        userId: userResult.id,
        csrfToken: `csrf-${role.name}-test`,
        expiresAt: sessionExpiry,
        createdAt: new Date(FIXTURE_DATE),
      })
      .onConflictDoUpdate({
        target: sessions.id,
        set: {
          userId: userResult.id,
          csrfToken: `csrf-${role.name}-test`,
          expiresAt: sessionExpiry,
        },
      });

    const sealedValue = await sealSessionCookieValue({ sessionId });

    const cookieObj = {
      name: "slotmerge_session",
      value: sealedValue,
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
