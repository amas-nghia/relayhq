interface AgentPixelAvatarProps {
  color: string
  size?: number
  blinking?: boolean
}

export function AgentPixelAvatar({ color, size = 32, blinking = false }: AgentPixelAvatarProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 8 8" style={{ imageRendering: 'pixelated' }}>
      <rect x="1" y="0" width="6" height="2" fill={color} opacity={0.9} />
      <rect x="1" y="2" width="6" height="4" fill="#fde68a" />
      <rect x="2" y="3" width="1" height={blinking ? 0 : 1} fill="#1c1917" />
      <rect x="5" y="3" width="1" height={blinking ? 0 : 1} fill="#1c1917" />
      <rect x="3" y="5" width="2" height="1" fill="#1c1917" />
      <rect x="2" y="6" width="4" height="2" fill={color} opacity={0.7} />
    </svg>
  )
}
