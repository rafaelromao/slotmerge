export type TopicsPageViewProps = {
  catalogue: Array<{ id: string; name: string }>;
  selectedTopicIds: string[];
  csrfToken: string;
};

export function TopicsPageView({
  catalogue,
  selectedTopicIds,
  csrfToken,
}: TopicsPageViewProps) {
  return (
    <main style={styles.main}>
      <header style={styles.header}>
        <h1 style={styles.title}>My Topics</h1>
        <p style={styles.description}>
          Browse the active Topic catalogue and choose which Topics belong on
          your profile.
        </p>
      </header>

      <form action="/me/topics" method="post" style={styles.section}>
        <input type="hidden" name="csrfToken" value={csrfToken} />
        <h2 id="active-topics" style={styles.sectionTitle}>
          Active Topics
        </h2>
        <ul style={styles.list}>
          {catalogue.map((topic) => (
            <li key={topic.id} style={styles.listItem}>
              <label style={styles.label}>
                <input
                  type="checkbox"
                  name="topicIds"
                  defaultChecked={selectedTopicIds.includes(topic.id)}
                  value={topic.id}
                />
                <span>{topic.name}</span>
              </label>
            </li>
          ))}
        </ul>

        <button style={styles.button} type="submit">
          Save topics
        </button>
      </form>
    </main>
  );
}

const styles = {
  main: {
    margin: "0 auto",
    maxWidth: "42rem",
    padding: "2rem 1.25rem",
    lineHeight: 1.5,
    fontFamily:
      'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  header: {
    marginBottom: "1.5rem",
  },
  title: {
    margin: 0,
    fontSize: "2rem",
  },
  description: {
    margin: "0.5rem 0 0",
    color: "#4b5563",
  },
  section: {
    borderTop: "1px solid #e5e7eb",
    paddingTop: "1rem",
  },
  sectionTitle: {
    margin: "0 0 0.75rem",
    fontSize: "1.125rem",
  },
  list: {
    margin: 0,
    paddingLeft: "1.25rem",
  },
  listItem: {
    marginBottom: "0.5rem",
  },
  label: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
  },
  button: {
    marginTop: "1rem",
    padding: "0.625rem 1rem",
  },
} as const;
