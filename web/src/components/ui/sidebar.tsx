import type { HTMLAttributes } from 'react'

import { cn } from '../../lib/utils'

export function Sidebar({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <aside className={cn('flex h-full flex-col border-r border-border bg-surface-sidebar text-text-primary', className)} {...props} />
}

export function SidebarHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-2 border-b border-border px-3 py-3', className)} {...props} />
}

export function SidebarContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 py-3', className)} {...props} />
}

export function SidebarFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('border-t border-border px-3 py-3', className)} {...props} />
}

export function SidebarGroup({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-2', className)} {...props} />
}

export function SidebarGroupLabel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-1 text-xs font-semibold uppercase tracking-[0.18em] text-text-tertiary', className)} {...props} />
}

export function SidebarMenu({ className, ...props }: HTMLAttributes<HTMLUListElement>) {
  return <ul className={cn('flex flex-col gap-1', className)} {...props} />
}

export function SidebarMenuItem({ className, ...props }: HTMLAttributes<HTMLLIElement>) {
  return <li className={cn('relative', className)} {...props} />
}

export function SidebarMenuButton({ className, ...props }: HTMLAttributes<HTMLButtonElement>) {
  return <button className={cn('flex w-full items-center gap-2 rounded-sm px-3 py-2 text-sm transition-colors hover:bg-surface-secondary', className)} {...props} />
}
