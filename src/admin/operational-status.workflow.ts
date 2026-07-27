import type { Clock } from "../system/clock";

import {
  createPostgresOperationalStatusRepository,
  type CalendarConnectionSummary,
  type EmailDeliverySummary,
  type OperationalStatusRepository,
} from "./operational-status.repository";

const EMAIL_WINDOW_HOURS = 24;

export type AdminStatusLoadResult = {
  email: EmailDeliverySummary;
  calendar: CalendarConnectionSummary;
  windowHours: number;
  generatedAt: Date;
};

export type AdminStatusWorkflow = {
  load(): Promise<AdminStatusLoadResult>;
};

export type AdminStatusWorkflowDependencies = {
  statusRepository?: OperationalStatusRepository;
  clock: Clock;
};

export function createAdminStatusWorkflow(
  deps: AdminStatusWorkflowDependencies,
): AdminStatusWorkflow {
  const {
    statusRepository = createPostgresOperationalStatusRepository(),
    clock,
  } = deps;

  return {
    async load() {
      const generatedAt = clock.now();
      const since = new Date(
        generatedAt.getTime() - EMAIL_WINDOW_HOURS * 60 * 60 * 1000,
      );
      const [email, calendar] = await Promise.all([
        statusRepository.summarizeEmailDelivery({ since }),
        statusRepository.summarizeCalendarConnections({ now: generatedAt }),
      ]);
      return {
        email,
        calendar,
        windowHours: EMAIL_WINDOW_HOURS,
        generatedAt,
      };
    },
  };
}
