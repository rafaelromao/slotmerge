import { requirePageContext } from "../../../src/lib/page-context";

export default async function SearchesPage() {
  await requirePageContext({ roles: ["organizer", "admin"] });
  return (
    <main className="app-container">
      <h1>Search</h1>
      <p>Search form placeholder.</p>
    </main>
  );
}
