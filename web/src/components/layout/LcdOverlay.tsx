export function LcdOverlay() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[5] overflow-hidden lcd-overlay">
      <div className="lcd-overlay__noise" />
      <div className="lcd-overlay__scanlines" />
      <div className="lcd-overlay__glow lcd-overlay__glow--left" />
      <div className="lcd-overlay__glow lcd-overlay__glow--right" />
      <div className="lcd-overlay__flicker" />
      <div className="lcd-overlay__vignette" />
    </div>
  )
}
