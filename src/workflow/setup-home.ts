import type { CalendarConnectionRepository } from "../calendar/connection";
import type { AvailabilityOverrideRepository } from "../profile/availability-overrides";
import type { WeeklyAvailabilityWindowRepository } from "../profile/availability-windows";
import type {
  DiscoverabilityConsentRepository,
  DiscoverabilityConsentState,
} from "../profile/discoverability-consent";
import type { UserProfile } from "../profile/repository";
import type { TopicCatalogueRepository } from "../topics/repository";
import type { TopicProposalUserRepository } from "../topics/proposals.repository";
import type {
  SetupStatusItem,
  SetupStatusSummary,
} from "../api/serializers";
import type { Result } from "../lib/result";

export type SetupHomeWorkflowDeps = {
  profileRepository: {
    findByUserId(userId: string): Promise<UserProfile | null>;
  };
  discoverabilityConsentRepository: DiscoverabilityConsentRepository;
  topicRepository: Pick<TopicCatalogueRepository, "listSelectedTopicIds">;
  topicProposalRepository: Pick<
    TopicProposalUserRepository,
    "listUserProposals"
  >;
  weeklyAvailabilityWindowRepository: Pick<
    WeeklyAvailabilityWindowRepository,
    "listByUserId"
  >;
  availabilityOverrideRepository: Pick<
    AvailabilityOverrideRepository,
    "listByUserId"
  >;
  calendarConnectionRepository: Pick<
    CalendarConnectionRepository,
    "listByUserId"
  >;
};

export type LoadSummaryOutcome = Result<
  SetupStatusSummary,
  { reason: "summary_unavailable" }
>;

export type SetupHomeWorkflow = {
  loadSummary(input: { userId: string }): Promise<LoadSummaryOutcome>;
};

type ItemSeed = Omit<SetupStatusItem, "complete">;

const ITEM_SEEDS: ReadonlyArray<ItemSeed> = [
  { key: "profile", label: "Profile", required: true },
  { key: "discoverability", label: "Discoverability", required: true },
  { key: "topics", label: "Topics", required: true },
  { key: "availability", label: "Availability", required: true },
  { key: "calendarConnection", label: "Calendar Connection", required: false },
];

export function createSetupHomeWorkflow(
  deps: SetupHomeWorkflowDeps,
): SetupHomeWorkflow {
  return {
    async loadSummary({ userId }) {
      try {
        const [
          profile,
          discoverability,
          selectedTopicIds,
          userProposals,
          windows,
          overrides,
          connections,
        ] = await Promise.all([
          deps.profileRepository.findByUserId(userId),
          deps.discoverabilityConsentRepository.findByUserId(userId),
          deps.topicRepository.listSelectedTopicIds(userId),
          deps.topicProposalRepository.listUserProposals(userId),
          deps.weeklyAvailabilityWindowRepository.listByUserId(userId),
          deps.availabilityOverrideRepository.listByUserId(userId),
          deps.calendarConnectionRepository.listByUserId(userId),
        ]);

        const items: SetupStatusItem[] = [
          {
            ...ITEM_SEEDS[0],
            complete: profileHasDisplayName(profile),
          },
          {
            ...ITEM_SEEDS[1],
            complete: discoverabilityIsGranted(discoverability),
          },
          {
            ...ITEM_SEEDS[2],
            complete:
              selectedTopicIds.length > 0 ||
              userProposals.some(
                (proposal) => proposal.status === "pending",
              ) ||
              userProposals.some(
                (proposal) => proposal.status === "approved",
              ),
          },
          {
            ...ITEM_SEEDS[3],
            complete:
              windows.length > 0 ||
              overrides.length > 0 ||
              connections.length > 0,
          },
          {
            ...ITEM_SEEDS[4],
            complete: connections.length > 0,
          },
        ];

        const complete = items
          .filter((item) => item.required)
          .every((item) => item.complete);

        return { ok: true, value: { complete, items } };
      } catch (caught) {
        if (caught instanceof Error && caught.name === "AbortError") {
          throw caught;
        }
        return { ok: false, error: { reason: "summary_unavailable" } };
      }
    },
  };
}

function profileHasDisplayName(profile: UserProfile | null): boolean {
  return Boolean(profile?.displayName?.trim());
}

function discoverabilityIsGranted(
  state: DiscoverabilityConsentState | null,
): boolean {
  return state?.state === "granted";
}