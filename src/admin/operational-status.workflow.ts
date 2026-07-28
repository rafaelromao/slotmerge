import type { Clock } from "../system/clock";

import {
  createPostgresOperationalStatusRepository,
  type CalendarConnectionSummary,
  type EmailDeliverySummary,
  type OperationalStatusRepository,
} from "./operational-status.repository";

const EMAIL_WINDOW_HOURS = 24;

export type StatusTone = "green" | "amber" | "red";

export type StatusToneConfig = {
  greenMax: number;
  amberMax: number;
};

export type HealthInputs = {
  emailFailureRate: number;
  needsReconnectCount: number;
  tokensCount: number;
};

export type EmailFailureRateInput = {
  sent?: number;
  failed?: number;
  queued?: number;
  sending?: number;
};

// Email threshold is "< 5% green, 5-10% amber, > 10% red" — greenMax
// uses 4.99 so the boundary at exactly 5% rolls into amber.
// Calendar needs_reconnect threshold is "0 green, 1 amber, > 1 red" —
// greenMax=0 makes 0 inclusive green; amberMax=1 makes 1 inclusive amber.
// Tokens threshold is "empty green, 1-3 amber, > 3 red" — greenMax=0
// makes 0 inclusive green; amberMax=3 makes 1-3 inclusive amber.
const EMAIL_THRESHOLDS: StatusToneConfig = { greenMax: 4.99, amberMax: 10 };
const CALENDAR_THRESHOLDS: StatusToneConfig = { greenMax: 0, amberMax: 1 };
const TOKENS_THRESHOLDS: StatusToneConfig = { greenMax: 0, amberMax: 3 };

export function deriveEmailFailureRate(
  input: EmailFailureRateInput,
): number {
  const sent = input.sent ?? 0;
  const failed = input.failed ?? 0;
  const denominator = sent + failed;
  if (denominator <= 0) {
    return 0;
  }
  return (failed / denominator) * 100;
}

export function deriveStatusTone(
  value: number,
  config: StatusToneConfig,
): StatusTone {
  if (value <= config.greenMax) {
    return "green";
  }
  if (value <= config.amberMax) {
    return "amber";
  }
  return "red";
}

export function deriveHealthFromInputs(inputs: HealthInputs): {
  email: StatusTone;
  calendar: StatusTone;
  tokens: StatusTone;
} {
  return {
    email: deriveStatusTone(inputs.emailFailureRate, EMAIL_THRESHOLDS),
    calendar: deriveStatusTone(
      inputs.needsReconnectCount,
      CALENDAR_THRESHOLDS,
    ),
    tokens: deriveStatusTone(inputs.tokensCount, TOKENS_THRESHOLDS),
  };
}

export type AdminStatusLoadResult = {
  email: EmailDeliverySummary;
  calendar: CalendarConnectionSummary;
  windowHours: number;
  generatedAt: Date;
  emailFailureRate: number;
  pendingEmailCount: number;
  needsReconnectCount: number;
  tokensCount: number;
  health: { email: StatusTone; calendar: StatusTone; tokens: StatusTone };
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
      const emailFailureRate = deriveEmailFailureRate(email.counts);
      const pendingEmailCount = email.counts.queued + email.counts.sending;
      const needsReconnectCount = calendar.counts.needsReconnect;
      const tokensCount = calendar.tokensNeedingRefresh.length;
      const health = deriveHealthFromInputs({
        emailFailureRate,
        needsReconnectCount,
        tokensCount,
      });
      return {
        email,
        calendar,
        windowHours: EMAIL_WINDOW_HOURS,
        generatedAt,
        emailFailureRate,
        pendingEmailCount,
        needsReconnectCount,
        tokensCount,
        health,
      };
    },
  };
}
