import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "SlotMerge",
  description: "Topic-aware group availability MVP",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
