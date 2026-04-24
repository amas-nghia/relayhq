import type * as React from 'react'

import { cn } from '../../lib/utils'

type BadgeVariant = 'default' | 'secondary' | 'success' | 'warning' | 'danger'

const badgeClasses: Record<BadgeVariant, string> = {
  default: 'border-accent/15 bg-accent-light text-accent',
  secondary: 'border-border bg-surface-secondary text-text-secondary',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  warning: 'border-amber-200 bg-amber-50 text-status-waiting',
  danger: 'border-red-200 bg-red-50 text-status-blocked',
}

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  readonly variant?: BadgeVariant
}

export function Badge({ className, variant = 'secondary', ...props }: BadgeProps) {
  return <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide', badgeClasses[variant], className)} {...props} />
}
