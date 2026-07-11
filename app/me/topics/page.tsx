import { getActiveTopics } from "../../../src/topics/catalogue";

export default function TopicsPage() {
  const activeTopics = getActiveTopics();

  return (
    <main style={styles.main}>
      <header style={styles.header}>
        <h1 style={styles.title}>My Topics</h1>
        <p style={styles.description}>
          Browse the active Topic catalogue to choose what you want on your
          profile.
        </p>
      </header>

      <section aria-labelledby="active-topics" style={styles.section}>
        <h2 id="active-topics" style={styles.sectionTitle}>
          Active Topics
        </h2>
        <ul style={styles.list}>
          {activeTopics.map((topic) => (
            <li key={topic.name} style={styles.listItem}>
              {topic.name}
            </li>
          ))}
        </ul>
      </section>
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
} as const;
