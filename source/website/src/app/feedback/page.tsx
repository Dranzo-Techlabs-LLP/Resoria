import { Suspense } from "react";
import type { Metadata } from "next";
import FeedbackPage, { FeedbackLoading, FeedbackShell } from "@/components/feedback/FeedbackPage";
import { site } from "@/lib/content";

// Each guest's private link (/feedback?t=<token>): kept out of search results.
export const metadata: Metadata = {
  title: `Your stay · ${site.name}`,
  description: `Tell us how your stay at ${site.name} was.`,
  robots: { index: false, follow: false },
};

export default function Page() {
  // The token is read in the browser; the static export renders the loading frame.
  return (
    <Suspense
      fallback={
        <FeedbackShell>
          <FeedbackLoading />
        </FeedbackShell>
      }
    >
      <FeedbackPage />
    </Suspense>
  );
}
