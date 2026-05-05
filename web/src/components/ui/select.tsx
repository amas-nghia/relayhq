import type { SelectHTMLAttributes } from 'react'

import { cn } from '../../lib/utils'

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'block h-10 w-full min-w-0 rounded-none border border-accent bg-surface-secondary px-3 py-2 text-sm text-text-primary transition-[background-color,border-color,box-shadow] duration-150 ease-out focus-visible:border-brand focus-visible:bg-surface focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-brand/60 focus-visible:shadow-[0_0_0_1px_rgba(245,158,11,0.45)]',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  )
}
