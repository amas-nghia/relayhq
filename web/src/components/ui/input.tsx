import type { InputHTMLAttributes } from 'react'

import { cn } from '../../lib/utils'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'flex h-10 w-full rounded-none border border-accent bg-surface-secondary px-3 py-2 text-sm text-text-primary outline-none transition-all placeholder:text-text-tertiary focus:border-brand focus:bg-surface focus:shadow-[0_0_0_1px_rgba(245,158,11,0.45)]',
        className,
      )}
      {...props}
    />
  )
}
