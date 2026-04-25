import type { HTMLAttributes, ReactNode } from 'react'

import { cn } from '../../lib/utils'

export function Sheet({ open, children }: { open: boolean; children: ReactNode }) {
  if (!open) return null
  return children
}

export function SheetOverlay({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('fixed inset-0 z-30 bg-slate-950/20 backdrop-blur-sm', className)} {...props} />
}

export function SheetContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('fixed top-14 bottom-0 right-0 z-40 w-full border-l border-border bg-surface shadow-panel md:w-[min(92vw,72rem)]', className)} {...props} />
}
