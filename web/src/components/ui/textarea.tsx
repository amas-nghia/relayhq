import type { TextareaHTMLAttributes } from 'react'

import { cn } from '../../lib/utils'

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'flex w-full rounded-sm border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none transition-all placeholder:text-text-tertiary focus:border-accent focus:ring-2 focus:ring-accent/30',
        className,
      )}
      {...props}
    />
  )
}
