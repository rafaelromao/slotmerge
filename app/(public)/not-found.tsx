import Link from "next/link";

export default function PublicNotFound() {
  return (
    <main className="app-container">
      <div className="empty-state">
        <h1>Page not found</h1>
        <p>The page you are looking for does not exist.</p>
        <Link href="/" className="btn btn-primary">
          Go to Home
        </Link>
      </div>
    </main>
  );
}
