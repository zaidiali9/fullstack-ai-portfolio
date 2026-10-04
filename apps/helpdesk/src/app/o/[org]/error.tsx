"use client";
import { AlertTriangle } from "lucide-react";
import { Button } from "@portfolio/ui/button";
import { EmptyState } from "@portfolio/ui/empty-state";

/** Friendly error boundary for the app area. Error details stay server-side; users see a reference id. */
export default function OrgError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <EmptyState
      icon={AlertTriangle}
      title="Something went wrong"
      description={`We couldn't load this page. Please try again.${error.digest ? ` (Reference: ${error.digest})` : ""}`}
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}
