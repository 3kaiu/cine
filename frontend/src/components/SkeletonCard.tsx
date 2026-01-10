import { Skeleton } from "@heroui/react"

interface SkeletonCardProps {
  count?: number
}

export default function SkeletonCard({ count = 1 }: SkeletonCardProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="p-4 border border-divider/10 bg-default-50/10 rounded-xl">
          <div className="flex items-center gap-3">
            <Skeleton className="w-10 h-10 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-24 rounded" />
              <Skeleton className="h-8 w-16 rounded" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export function SkeletonTable() {
  return (
    <div className="w-full space-y-3">
      <div className="h-12 bg-default-100/50 rounded-lg animate-pulse" />
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-4 border-b border-divider/5">
          <Skeleton className="w-5 h-5 rounded" />
          <Skeleton className="flex-1 h-4 rounded" />
          <Skeleton className="w-20 h-4 rounded" />
          <Skeleton className="w-16 h-4 rounded" />
          <Skeleton className="w-24 h-4 rounded" />
        </div>
      ))}
    </div>
  )
}

export function SkeletonList() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="p-4 border border-divider/10 bg-default-50/5 rounded-xl">
          <div className="flex items-center gap-4">
            <Skeleton className="w-12 h-12 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4 rounded" />
              <Skeleton className="h-3 w-1/2 rounded" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
