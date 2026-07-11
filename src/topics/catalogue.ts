export type TopicCatalogueEntry = {
  name: string;
  status: "active" | "retired";
};

export const topicCatalogue: TopicCatalogueEntry[] = [
  { name: "Product strategy", status: "active" },
  { name: "AI engineering", status: "active" },
  { name: "Design systems", status: "retired" },
  { name: "Sales enablement", status: "retired" },
];

export function getActiveTopics(): TopicCatalogueEntry[] {
  return topicCatalogue.filter((topic) => topic.status === "active");
}
