import { Skeleton } from "@portfolio/ui/skeleton";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading ticket">
      <Skeleton className="mb-4 h-4 w-24" />
      <Skeleton className="h-4 w-12" />
      <Skeleton className="mt-2 h-8 w-2/3" />
      <Skeleton className="mt-3 h-5 w-80" />
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_18rem]">
        <div className="space-y-4">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="size-8 rounded-full" />
              <Skeleton className="h-28 flex-1 rounded-xl" />
            </div>
          ))}
          <Skeleton className="h-48 rounded-xl" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
