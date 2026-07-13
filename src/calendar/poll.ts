import { parseCronItems, type CronItem } from "graphile-worker";

export const pollCalendarConnectionsTaskName = "poll_calendar_connections";

export function createPollCalendarConnectionsTask(
  cronExpression: string,
): CronItem {
  return {
    task: pollCalendarConnectionsTaskName,
    match: cronExpression,
    payload: {},
    identifier: "poll-calendar-connections",
    options: {
      backfillPeriod: 0,
    },
  };
}

export function createPollCronItems(cronExpression: string) {
  return parseCronItems([createPollCalendarConnectionsTask(cronExpression)]);
}
