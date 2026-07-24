"use client";

import { useEffect } from "react";

type SectionDeepLinkProps = {
  sections: ReadonlyArray<{
    id: string;
    targetIds?: ReadonlyArray<string>;
  }>;
};

function isSectionOpen(details: HTMLDetailsElement): boolean {
  return details.open;
}

function openSection(id: string): void {
  const node = document.getElementById(id);
  if (node instanceof HTMLDetailsElement && !node.open) {
    node.open = true;
  }
}

function closeOtherSections(keepOpenId: string): void {
  const all = document.querySelectorAll<HTMLDetailsElement>(
    "details.admin-section",
  );
  for (const details of all) {
    if (details.id !== keepOpenId && isSectionOpen(details)) {
      details.open = false;
    }
  }
}

export function SectionDeepLink({ sections }: SectionDeepLinkProps) {
  useEffect(() => {
    function applyFromHash(): void {
      const hash = window.location.hash.replace(/^#/, "");
      if (!hash) return;
      const match = sections.find(
        (section) =>
          section.id === hash || (section.targetIds ?? []).includes(hash),
      );
      if (!match) return;
      openSection(match.id);
      closeOtherSections(match.id);
    }

    applyFromHash();
    window.addEventListener("hashchange", applyFromHash);
    return () => window.removeEventListener("hashchange", applyFromHash);
  }, [sections]);

  return null;
}

SectionDeepLink.displayName = "SectionDeepLink";
