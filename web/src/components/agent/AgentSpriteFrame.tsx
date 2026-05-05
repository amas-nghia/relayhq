import clsx from 'clsx'

import { AgentPixelAvatar } from './AgentPixelAvatar'

interface AgentSpriteFrameProps {
  imageSrc?: string | null
  name?: string
  color: string
  size: number
  pixelSize?: number
  className?: string
  imageClassName?: string
}

export function AgentSpriteFrame({
  imageSrc,
  name = '',
  color,
  size,
  pixelSize,
  className,
  imageClassName,
}: AgentSpriteFrameProps) {
  return (
    <div
      className={clsx('flex shrink-0 items-center justify-center overflow-hidden border border-border bg-surface', className)}
      style={{ width: size, height: size }}
    >
      {imageSrc ? (
        <img
          src={imageSrc}
          alt={name}
          className={clsx('h-full w-full object-contain p-1', imageClassName)}
          style={{ imageRendering: 'pixelated' }}
        />
      ) : (
        <AgentPixelAvatar color={color} size={pixelSize ?? Math.max(12, size - 8)} />
      )}
    </div>
  )
}
