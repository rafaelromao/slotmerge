import { requirePageContext } from "../../../src/lib/page-context";

export default async function AdminPage() {
  await requirePageContext({ roles: ["admin"] });
  return (
    <main className="app-container">
      <h1>Admin</h1>
      <p>Admin operations surface placeholder.</p>
    </main>
  );
}
