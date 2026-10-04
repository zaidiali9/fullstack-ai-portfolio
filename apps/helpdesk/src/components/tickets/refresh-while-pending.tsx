"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-fetch server data every few seconds while background triage is running (stops after ~2 minutes). */
export function RefreshWhilePending({ pending }: { pending: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!pending) return;
    let n = 0;
    const id = setInterval(() => {
      if (++n > 40) return clearInterval(id);
      router.refresh();
    }, 3000);
    return () => clearInterval(id);
  }, [pending, router]);
  return null;
}
