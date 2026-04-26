import type { HTMLAttributes, ReactNode } from 'react'

import { cn } from '../../lib/utils'

export function Sheet({ open, children }: { open: boolean; children: ReactNode }) {
  if (!open) return null
  return <>{children}</>
}

export function SheetOverlay({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('fixed inset-0 z-30 bg-slate-950/40 backdrop-blur-[2px]', className)} {...props} />
}

export function SheetContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('fixed right-0 top-0 z-40 h-full w-full max-w-[420px] border-l border-border bg-surface shadow-modal', className)} {...props} />
}
