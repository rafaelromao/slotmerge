import { z } from "zod";

import { getSessionFromRequest, type Session } from "../auth/session";
import { createMagicLinkTokenIssuer } from "../auth/magic-link";
import { loadRuntimeConfig } from "../config/runtime";
import { createEmailDeliveryService } from "../email/service";
import { createPostgresEmailEventRepository } from "../email/repository";
import { enqueueInviteEmailJob } from "../email/invite-jobs";
import {
  adminAccessDeniedResponse,
  escapeHtml,
  htmlResponse,
  isAdminSession,
  renderAdminShell,
} from "./page";
import {
  createPostgresInviteRepository,
  type InviteListItem,
  type InviteRepository,
} from "./invites.repository";
import type { InviteRole, InviteStatus } from "../db/schema";

export type {
  CreateInviteResult,
  InviteListItem,
  InviteRecord,
} from "./invites.repository";
export type { InviteRepository } from "./invites.repository";

export type AdminInvitesDependencies = {
  getSession?: (request: Request) => Promise<Session | null>;
  inviteRepository?: InviteRepository;
  magicLinkTokenIssuer?: ReturnType<typeof createMagicLinkTokenIssuer>;
  emailDeliveryService?: ReturnType<typeof createEmailDeliveryService>;
  clock?: () => Date;
};

const inviteSubmissionSchema = z.object({
  email: z.string().trim().email(),
  role: z.enum(["user", "organizer", "admin"]).default("user"),
});

const inviteLifetimeDays = 30;

export function createAdminInvitesHandlers({
  getSession = getSessionFromRequest,
  inviteRepository = createPostgresInviteRepository(),
  magicLinkTokenIssuer,
  emailDeliveryService,
  clock = () => new Date(),
}: AdminInvitesDependencies = {}) {
  const repository = inviteRepository;
  return {
    GET: async (request: Request): Promise<Response> => {
      const session = await getSession(request);
      if (!isAdminSession(session)) {
        return adminAccessDeniedResponse(session);
      }

      const invites = await repository.listInvites();
      return htmlResponse(
        renderAdminShell({
          title: "Invite users",
          body: renderAdminInvitesBody({
            inviteRows: invites,
            csrfToken: session.csrfToken,
          }),
        }),
      );
    },
    POST: async (request: Request): Promise<Response> => {
      const session = await getSession(request);
      if (!isAdminSession(session)) {
        return adminAccessDeniedResponse(session);
      }

      const formData = await request.formData();
      const csrfToken = formData.get("_csrf");
      if (typeof csrfToken !== "string" || csrfToken !== session.csrfToken) {
        return htmlResponse(
          renderAdminShell({
            title: "Invite users",
            body: renderAdminInvitesBody({
              inviteRows: await repository.listInvites(),
              csrfToken: session.csrfToken,
            }),
            alert: { message: "Invalid CSRF token." },
          }),
          403,
        );
      }

      const submission = inviteSubmissionSchema.safeParse({
        email: formData.get("email"),
        role: formData.get("role") ?? undefined,
      });

      if (!submission.success) {
        return htmlResponse(
          renderAdminShell({
            title: "Invite users",
            body: renderAdminInvitesBody({
              inviteRows: await repository.listInvites(),
              csrfToken: session.csrfToken,
            }),
            alert: {
              message: "Enter a valid email address and choose a role.",
            },
          }),
          400,
        );
      }

      const now = clock();
      const result = await repository.createInvite({
        email: normalizeEmail(submission.data.email),
        role: submission.data.role,
        invitedByAdminId: session.user.id,
        now,
        expiresAt: getDefaultInviteExpiration(now),
      });

      if (!result.ok) {
        return htmlResponse(
          renderAdminShell({
            title: "Invite users",
            body: renderAdminInvitesBody({
              inviteRows: await repository.listInvites(),
              csrfToken: session.csrfToken,
            }),
            alert: { message: "An invite already exists for that email." },
          }),
          409,
        );
      }

      const magicLink = (
        magicLinkTokenIssuer ?? createDefaultMagicLinkTokenIssuer()
      ).issueMagicLinkToken({
        inviteId: result.invite.id,
        email: result.invite.email,
        expiresAt: result.invite.expiresAt,
        generation: result.invite.magicLinkGeneration ?? 0,
      });

      const service =
        emailDeliveryService ?? loadDefaultEmailDeliveryService({ clock });
      try {
        await service.sendEmail({
          recipient: result.invite.email,
          type: "invite",
          payload: {
            inviteId: result.invite.id,
            email: result.invite.email,
            role: result.invite.role,
            invitedByAdminId: result.invite.invitedByAdminId,
            magicLinkGeneration: result.invite.magicLinkGeneration ?? 0,
            magicLinkUrl: magicLink.magicLinkUrl,
            magicLinkToken: magicLink.token,
            expiresAt: magicLink.expiresAt.toISOString(),
          },
        });
      } catch (error) {
        return htmlResponse(
          renderAdminShell({
            title: "Invite users",
            body: renderAdminInvitesBody({
              inviteRows: await repository.listInvites(),
              csrfToken: session.csrfToken,
            }),
            alert: {
              message: `Invitation created but the email failed to enqueue: ${
                error instanceof Error ? error.message : "unknown error"
              }`,
            },
          }),
          502,
        );
      }

      return Response.redirect(new URL("/admin/invites", request.url), 303);
    },
  };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function getDefaultInviteExpiration(now: Date): Date {
  return new Date(now.getTime() + inviteLifetimeDays * 24 * 60 * 60 * 1000);
}

function createDefaultMagicLinkTokenIssuer(): ReturnType<
  typeof createMagicLinkTokenIssuer
> {
  const config = loadRuntimeConfig();
  return createMagicLinkTokenIssuer({
    baseUrl: config.appBaseUrl,
    secret: config.magicLinkSecret,
  });
}

function loadDefaultEmailDeliveryService({
  clock,
}: {
  clock: () => Date;
}): ReturnType<typeof createEmailDeliveryService> {
  return createEmailDeliveryService({
    clock,
    eventRepository: createPostgresEmailEventRepository(),
    queueJob: (job) => enqueueInviteEmailJob(job),
  });
}

function renderAdminInvitesBody({
  inviteRows,
  csrfToken,
}: {
  inviteRows: InviteListItem[];
  csrfToken: string;
}): string {
  const rows =
    inviteRows.length > 0
      ? inviteRows
          .map(
            (invite) => `
              <tr>
                <td>${escapeHtml(invite.email)}</td>
                <td>${escapeHtml(labelInviteRole(invite.role))}</td>
                <td>${escapeHtml(labelInviteStatus(invite.status))}</td>
                <td>${escapeHtml(invite.invitedByAdminEmail ?? "(deleted Admin)")}</td>
              </tr>`,
          )
          .join("")
      : `<tr><td colspan="4">No invites yet.</td></tr>`;

  return `<form method="post">
    <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
    <label>
      Email
      <input name="email" type="email" required />
    </label>
    <label>
      Role
      <select name="role">
        <option value="user" selected>User</option>
        <option value="organizer">Organizer</option>
        <option value="admin">Admin</option>
      </select>
    </label>
    <button type="submit">Invite user</button>
  </form>
  <section>
    <h2>Invites</h2>
    <table>
      <thead>
        <tr>
          <th>Email</th>
          <th>Role</th>
          <th>Status</th>
          <th>Invited by</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </section>`;
}

function labelInviteRole(role: InviteRole): string {
  return role === "user"
    ? "User"
    : role === "organizer"
      ? "Organizer"
      : "Admin";
}

function labelInviteStatus(status: InviteStatus): string {
  return status === "pending"
    ? "Pending"
    : status === "accepted"
      ? "Accepted"
      : "Revoked";
}
