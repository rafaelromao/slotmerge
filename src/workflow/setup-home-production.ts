import { getCalendarConnectionRepository } from "../calendar/repository";
import { getAvailabilityOverrideRepository } from "../profile/availability-overrides";
import { createPostgresWeeklyAvailabilityWindowRepository } from "../profile/availability-windows";
import { getDiscoverabilityConsentRepository } from "../profile/discoverability-consent";
import { getProfileByUserId } from "../profile/repository";
import type { Clock } from "../system/clock";
import { getTopicCatalogueRepository } from "../topics/repository";
import { getTopicProposalRepository } from "../topics/proposals.repository";

import { createSetupHomeWorkflow, type SetupHomeWorkflow } from "./setup-home";

export function createProductionSetupHomeWorkflow(
  clock: Clock,
): SetupHomeWorkflow {
  return createSetupHomeWorkflow({
    profileRepository: {
      findByUserId: (userId) => getProfileByUserId(userId, clock),
    },
    discoverabilityConsentRepository:
      getDiscoverabilityConsentRepository(clock),
    topicRepository: getTopicCatalogueRepository(),
    topicProposalRepository: getTopicProposalRepository(),
    weeklyAvailabilityWindowRepository:
      createPostgresWeeklyAvailabilityWindowRepository(clock),
    availabilityOverrideRepository: getAvailabilityOverrideRepository(),
    calendarConnectionRepository: getCalendarConnectionRepository(clock),
  });
}
