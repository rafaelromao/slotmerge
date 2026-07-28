import type { Clock } from "../system/clock";
import {
  getTopicAdminRepository,
  type AdminTopicListItem,
  type AdminTopicProposalListItem,
  type TopicAdminRepository,
} from "../topics/repository";

export type AdminTopicsLoadResult = {
  activeTopics: AdminTopicListItem[];
  pendingProposals: AdminTopicProposalListItem[];
  pendingCount: number;
  activeCount: number;
};

export type AdminTopicsWorkflow = {
  load(): Promise<AdminTopicsLoadResult>;
};

export type AdminTopicsWorkflowDependencies = {
  topicRepository?: TopicAdminRepository;
  clock: Clock;
};

export function createAdminTopicsWorkflow(
  deps: AdminTopicsWorkflowDependencies,
): AdminTopicsWorkflow {
  const { topicRepository = getTopicAdminRepository(), clock } = deps;

  return {
    async load() {
      void clock;
      const [activeTopics, pendingProposals] = await Promise.all([
        topicRepository.listActiveAdminTopics(),
        topicRepository.listPendingTopicProposals(),
      ]);
      return {
        activeTopics,
        pendingProposals,
        activeCount: activeTopics.length,
        pendingCount: pendingProposals.length,
      };
    },
  };
}
