import type { HTMLAttributes, PropsWithChildren } from 'react'
import { createContext, useContext, useMemo, useState } from 'react'
import { Menu } from 'lucide-react'

import { cn } from '../../lib/utils'
import { Button } from './button'

type SidebarContextValue = {
  open: boolean
  mobileOpen: boolean
  setOpen: (value: boolean) => void
  setMobileOpen: (value: boolean) => void
  toggleSidebar: () => void
  toggleMobileSidebar: () => void
}

const SidebarContext = createContext<SidebarContextValue | null>(null)

export function SidebarProvider({ children, defaultOpen = true }: PropsWithChildren<{ defaultOpen?: boolean }>) {
  const [open, setOpen] = useState(defaultOpen)
  const [mobileOpen, setMobileOpen] = useState(false)

  const value = useMemo<SidebarContextValue>(() => ({
    open,
    mobileOpen,
    setOpen,
    setMobileOpen,
    toggleSidebar: () => setOpen(current => !current),
    toggleMobileSidebar: () => setMobileOpen(current => !current),
  }), [mobileOpen, open])

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
}

export function useSidebar() {
  const value = useContext(SidebarContext)
  if (value === null) {
    throw new Error('useSidebar must be used within a SidebarProvider')
  }

  return value
}

export function SidebarTrigger({ className, ...props }: HTMLAttributes<HTMLButtonElement>) {
  const { toggleMobileSidebar } = useSidebar()

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-label="Toggle sidebar"
      className={cn('fixed left-3 top-3 z-50 md:hidden', className)}
      onClick={toggleMobileSidebar}
      {...props}
    >
      <Menu className="h-4 w-4" />
    </Button>
  )
}

export function SidebarInset({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <main className={cn('flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden', className)} {...props} />
}

export function Sidebar({ className, ...props }: HTMLAttributes<HTMLElement>) {
  const { open, mobileOpen, setMobileOpen } = useSidebar()

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        data-state={open ? 'expanded' : 'collapsed'}
        className={cn(
        'relative z-40 flex h-full shrink-0 flex-col border-r border-border bg-surface-sidebar text-text-primary transition-all duration-200 ease-out',
          'fixed inset-y-0 left-0 w-64 -translate-x-full md:static md:translate-x-0 md:h-full',
          mobileOpen && 'translate-x-0',
          open ? 'md:w-64' : 'md:w-16',
          className,
        )}
        {...props}
      />
    </>
  )
}

export function SidebarRail({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('absolute inset-y-0 right-0 hidden w-1 cursor-col-resize bg-border/60 md:block', className)} {...props} />
}

export function SidebarHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-3 border-b border-border px-3 py-3', className)} {...props} />
}

export function SidebarContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 py-3', className)} {...props} />
}

export function SidebarFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mt-auto border-t border-border px-3 py-3', className)} {...props} />
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
  return <button className={cn('flex w-full items-center gap-2 rounded-none px-3 py-2 text-sm transition-colors hover:bg-brand-muted hover:text-brand', className)} {...props} />
}
