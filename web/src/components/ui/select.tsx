import type { SelectHTMLAttributes } from 'react'

import { cn } from '../../lib/utils'

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'flex h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none transition-all focus:border-accent focus:ring-2 focus:ring-accent/30',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  )
}
