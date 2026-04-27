import type * as React from 'react'

import { cn } from '../../lib/utils'

type BadgeVariant = 'default' | 'secondary' | 'success' | 'warning' | 'danger'

const badgeClasses: Record<BadgeVariant, string> = {
  default: 'border-accent bg-accent text-surface',
  secondary: 'border-border bg-surface-secondary text-text-secondary',
  success: 'border-status-done bg-status-done text-surface',
  warning: 'border-status-waiting bg-status-waiting text-surface',
  danger: 'border-status-blocked bg-status-blocked text-surface',
}

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  readonly variant?: BadgeVariant
}

export function Badge({ className, variant = 'secondary', ...props }: BadgeProps) {
  return <span className={cn('inline-flex items-center rounded-none border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide', badgeClasses[variant], className)} {...props} />
}
