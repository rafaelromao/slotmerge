import { requirePageContext } from "../../../../src/lib/page-context";
import { createTopicWorkflow } from "../../../../src/topics/topic-workflow";
import { buildTopicsPageRepositories } from "../../../../src/topics/page-repositories";
import { ProposeForm } from "../_components/ProposeForm";
import { saveTopicSelectionAction } from "../_actions/topics";

type SearchParams = Promise<{
  saved?: string | string[];
}>;

export default async function TopicsPage({
  searchParams,
}: {
  searchParams?: SearchParams;
} = {}) {
  const context = await requirePageContext({
    roles: ["user", "organizer", "admin"],
  });

  const params = (await searchParams) ?? {};
  const firstSaved = Array.isArray(params.saved)
    ? params.saved[0]
    : params.saved;
  const showSavedIndicator = firstSaved === "1";

  const workflow = createTopicWorkflow({
    catalogue: buildTopicsPageRepositories().catalogue,
    proposals: buildTopicsPageRepositories().proposals,
    clock: { now: () => new Date() },
  });

  const pageStateResult = await workflow.loadPageState({
    userId: context.user.id,
  });

  if (!pageStateResult.ok) {
    throw new Error("loadPageState unexpectedly returned error: never");
  }
  const pageState = pageStateResult.value;

  return (
    <main className="app-container" data-testid="topics-page">
      <h1 data-testid="topics-page-heading">My Topics</h1>
      <p className="topics-page-intro">
        Choose the Topics you want associated with your profile and propose a
        new Topic for Admin review.
      </p>

      {showSavedIndicator ? (
        <p
          className="topics-saved-indicator"
          role="status"
          data-testid="topics-saved-indicator"
        >
          Saved
        </p>
      ) : null}

      <section
        className="topics-section"
        aria-labelledby="topics-catalogue-heading"
        data-testid="topics-catalogue-section"
      >
        <h2 id="topics-catalogue-heading">Active Topics</h2>

        {pageState.catalogue.length === 0 ? (
          <div className="empty-state" data-testid="topics-catalogue-empty">
            <p className="empty-state-title">
              No active Topics are available yet.
            </p>
            <p>
              Once Admins publish Topics, you can choose which ones show on your
              profile.
            </p>
            <a
              href="/me"
              className="btn"
              data-testid="topics-catalogue-empty-back"
            >
              Back to setup
            </a>
          </div>
        ) : (
          <form
            method="POST"
            action={saveTopicSelectionAction}
            className="topics-catalogue-form"
            data-testid="topics-catalogue-form"
          >
            <input type="hidden" name="_csrf" value={context.csrfToken} />
            <ul
              className="topics-catalogue-list"
              data-testid="topics-catalogue-list"
            >
              {pageState.catalogue.map((topic) => {
                const isChecked = pageState.selectedTopicIds.includes(topic.id);
                return (
                  <li
                    key={topic.id}
                    className="topics-catalogue-item"
                    data-testid={`topics-catalogue-item-${topic.id}`}
                  >
                    <label htmlFor={`topic-${topic.id}`}>
                      <input
                        id={`topic-${topic.id}`}
                        type="checkbox"
                        name="topicIds"
                        value={topic.id}
                        defaultChecked={isChecked}
                        data-testid={`topics-catalogue-checkbox-${topic.id}`}
                      />
                      <span className="topics-catalogue-name">
                        {topic.name}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <div className="topics-catalogue-actions">
              <button
                type="submit"
                className="btn btn-primary"
                data-testid="topics-catalogue-save"
              >
                Save Topics
              </button>
            </div>
          </form>
        )}
      </section>

      <section
        className="topics-section"
        aria-labelledby="topics-propose-heading"
        data-testid="topics-propose-section"
      >
        <h2 id="topics-propose-heading">Propose a new Topic</h2>
        <ProposeForm csrfToken={context.csrfToken} />
      </section>

      <section
        className="topics-section"
        aria-labelledby="topics-my-proposals-heading"
        data-testid="topics-my-proposals-section"
      >
        <h2 id="topics-my-proposals-heading">My Proposals</h2>
        {pageState.proposals.length === 0 ? (
          <div className="empty-state" data-testid="topics-my-proposals-empty">
            <p className="empty-state-title">
              You have not proposed any Topics yet.
            </p>
            <p>
              Use the form above to suggest a Topic. Admins will review it
              before adding it to the catalogue.
            </p>
          </div>
        ) : (
          <ul
            className="topics-proposals-list"
            data-testid="topics-proposals-list"
          >
            {pageState.proposals.map((proposal) => (
              <li
                key={proposal.id}
                className={`topics-proposal-row topics-proposal-row--${proposal.displayStatus}`}
                data-testid={`topics-proposal-row-${proposal.id}`}
                data-status={proposal.displayStatus}
              >
                <span
                  className={`topics-proposal-badge topics-proposal-badge--${proposal.displayStatus}`}
                  data-testid={`topics-proposal-badge-${proposal.id}`}
                >
                  {labelForStatus(proposal.displayStatus)}
                </span>
                <span className="topics-proposal-name">
                  {proposal.candidateName}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function labelForStatus(
  status: "pending" | "active" | "rejected" | "retired",
): string {
  switch (status) {
    case "pending":
      return "Pending review";
    case "active":
      return "Active";
    case "rejected":
      return "Rejected";
    case "retired":
      return "Retired";
  }
}
