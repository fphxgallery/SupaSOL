import type { CSSProperties } from 'react';

interface SkeletonProps {
  className?: string;
  rows?: number;
  style?: CSSProperties;
}

export function Skeleton({ className = '', style }: SkeletonProps) {
  return (
    <div className={`animate-pulse rounded-lg bg-surface-2 ${className}`} style={style} />
  );
}

export function SkeletonCard() {
  return (
    <div className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3">
      <Skeleton className="h-3 w-1/3" />
      <Skeleton className="h-7 w-1/2" />
      <Skeleton className="h-3 w-2/5" />
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-border last:border-0">
      <div className="flex items-center gap-3">
        <Skeleton className="w-8 h-8 rounded-full" />
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-2.5 w-14" />
        </div>
      </div>
      <div className="flex flex-col gap-1.5 items-end">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-2.5 w-12" />
      </div>
    </div>
  );
}

export function SkeletonTable({ rows = 4 }: SkeletonProps) {
  return (
    <div>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  );
}
