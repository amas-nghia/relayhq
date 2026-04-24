import type { HTMLAttributes, ReactNode } from 'react'

import { cn } from '../../lib/utils'

export function Dialog({ open, children }: { open: boolean; children: ReactNode }) {
  if (!open) return null
  return children
}

export function DialogOverlay({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-sm', className)} {...props} />
}

export function DialogContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('fixed inset-0 z-50 flex items-center justify-center p-4', className)} {...props} />
}

export function DialogPanel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('w-full overflow-hidden rounded-2xl border border-border bg-surface shadow-modal', className)} {...props} />
}

export function DialogHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center justify-between gap-3 border-b border-border px-5 py-4', className)} {...props} />
}

export function DialogTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('text-lg font-semibold text-text-primary', className)} {...props} />
}

export function DialogDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-text-secondary', className)} {...props} />
}

export function DialogBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5', className)} {...props} />
}

export function DialogFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-wrap items-center justify-end gap-3 border-t border-border px-5 py-4', className)} {...props} />
}
