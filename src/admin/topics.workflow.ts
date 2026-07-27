import type { Clock } from "../system/clock";
import {
  getTopicAdminRepository,
  type AdminTopicListItem,
  type TopicAdminRepository,
} from "../topics/repository";

export type AdminTopicsLoadResult = {
  activeTopics: AdminTopicListItem[];
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
      const activeTopics = await topicRepository.listActiveAdminTopics();
      return { activeTopics };
    },
  };
}
