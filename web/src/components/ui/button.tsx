import type * as React from 'react'

import { cn } from '../../lib/utils'

type ButtonVariant = 'default' | 'outline' | 'ghost' | 'secondary' | 'danger'
type ButtonSize = 'sm' | 'default' | 'icon'

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly variant?: ButtonVariant
  readonly size?: ButtonSize
  readonly children?: React.ReactNode
}

const variantClasses: Record<ButtonVariant, string> = {
  default: 'border border-accent bg-accent text-surface hover:bg-brand-light',
  outline: 'border border-accent bg-transparent text-accent hover:border-brand-bright hover:text-brand-bright hover:bg-transparent hover:shadow-[0_0_12px_rgba(255,215,0,0.4)]',
  ghost: 'bg-transparent text-text-secondary hover:bg-transparent hover:text-brand-bright hover:shadow-[0_0_12px_rgba(255,215,0,0.4)]',
  secondary: 'border border-accent bg-transparent text-accent hover:border-brand-bright hover:text-brand-bright hover:bg-brand-muted',
  danger: 'border border-status-blocked bg-status-blocked text-surface hover:bg-red-600',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-sm',
  default: 'h-10 px-4 text-sm',
  icon: 'h-10 w-10 p-0',
}

export function Button({ className, variant = 'default', size = 'default', type = 'button', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'lcd-button inline-flex items-center justify-center gap-2 rounded-none font-medium uppercase tracking-[0.14em] transition-all disabled:cursor-not-allowed disabled:opacity-60',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  )
}
