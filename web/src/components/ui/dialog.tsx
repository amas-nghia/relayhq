import * as DialogPrimitive from '@radix-ui/react-dialog'
import type { ComponentPropsWithoutRef, HTMLAttributes } from 'react'

import { cn } from '../../lib/utils'

export const Dialog = DialogPrimitive.Root

export function DialogOverlay({ className, ...props }: ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className={cn('fixed inset-0 z-50 bg-black/80', className)}
        {...props}
      />
    </DialogPrimitive.Portal>
  )
}

export function DialogContent({ className, ...props }: ComponentPropsWithoutRef<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Content
        className={cn('fixed inset-0 z-50 flex items-center justify-center p-4 outline-none', className)}
        {...props}
      />
    </DialogPrimitive.Portal>
  )
}

export function DialogPanel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('w-full rounded-none border border-accent bg-surface shadow-modal', className)} {...props} />
}

export function DialogHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-start justify-between gap-4 border-b border-accent px-5 py-4', className)} {...props} />
}

export function DialogBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('max-h-[calc(100vh-10rem)] overflow-y-auto px-5 py-4', className)} {...props} />
}

export function DialogFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center justify-end gap-2 border-t border-accent px-5 py-4', className)} {...props} />
}

export function DialogTitle({ className, ...props }: ComponentPropsWithoutRef<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn('text-base font-semibold text-text-primary', className)} {...props} />
}

export function DialogDescription({ className, ...props }: ComponentPropsWithoutRef<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn('text-sm text-text-secondary', className)} {...props} />
}
