import type { ReactNode } from "react";
import "./globals.css";
import "./polish.css";

export const metadata = {
  title: "SlotMerge",
  description: "Topic-aware group availability MVP",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try { document.documentElement.dataset.theme = localStorage.getItem('slotmerge-theme') === 'dark' ? 'dark' : 'light'; } catch {}",
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
