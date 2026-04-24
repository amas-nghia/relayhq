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
  default: 'bg-accent text-white hover:bg-accent/90',
  outline: 'border border-border bg-surface text-text-secondary hover:bg-surface-secondary hover:text-text-primary',
  ghost: 'bg-transparent text-text-secondary hover:bg-surface-secondary hover:text-text-primary',
  secondary: 'bg-surface-secondary text-text-primary hover:bg-surface',
  danger: 'bg-status-blocked text-white hover:bg-red-700',
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
        'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  )
}
