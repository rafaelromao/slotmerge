import { getCalendarConnectionRepository } from "../calendar/repository";
import { getAvailabilityOverrideRepository } from "../profile/availability-overrides";
import { getWeeklyAvailabilityWindowRepository } from "../profile/availability-windows";
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
      findByUserId: getProfileByUserId,
    },
    discoverabilityConsentRepository: getDiscoverabilityConsentRepository(),
    topicRepository: getTopicCatalogueRepository(),
    topicProposalRepository: getTopicProposalRepository(),
    weeklyAvailabilityWindowRepository: getWeeklyAvailabilityWindowRepository(),
    availabilityOverrideRepository: getAvailabilityOverrideRepository(),
    calendarConnectionRepository: getCalendarConnectionRepository(clock),
  });
}
