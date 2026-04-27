import type { SelectHTMLAttributes } from 'react'

import { cn } from '../../lib/utils'

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'block h-10 w-full min-w-0 rounded-none border border-accent bg-surface-secondary px-3 py-2 text-sm text-text-primary outline-none transition-all focus:border-brand focus:bg-surface focus:shadow-[0_0_0_1px_rgba(245,158,11,0.45)]',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  )
}
