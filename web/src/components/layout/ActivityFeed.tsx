import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, CircleCheckBig, Clock3, RefreshCw, ShieldAlert } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { useAppStore } from '../../store/appStore'

function formatRelativeTime(value: string) {
  const diffMs = Date.now() - new Date(value).getTime()
  const seconds = Math.max(0, Math.round(diffMs / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.round(hours / 24)
  return `${days}d`
}

function iconForAction(action: string) {
  if (action.includes('claimed')) return <ArrowRight className="h-3.5 w-3.5 text-brand" />
  if (action.includes('approved') || action.includes('done')) return <CircleCheckBig className="h-3.5 w-3.5 text-status-done" />
  if (action.includes('blocked') || action.includes('rejected')) return <ShieldAlert className="h-3.5 w-3.5 text-status-blocked" />
  if (action.includes('heartbeat')) return <Clock3 className="h-3.5 w-3.5 text-status-active" />
  return <RefreshCw className="h-3.5 w-3.5 text-text-tertiary" />
}

export function ActivityFeed() {
  const navigate = useNavigate()
  const auditLogs = useAppStore(state => state.auditLogs)
  const openTaskDetail = useAppStore(state => state.openTaskDetail)
  const [isVisible, setIsVisible] = useState(() => typeof window !== 'undefined' ? window.innerHeight >= 700 : true)

  useEffect(() => {
    function syncVisibility() {
      setIsVisible(window.innerHeight >= 700)
    }

    syncVisibility()
    window.addEventListener('resize', syncVisibility)
    return () => window.removeEventListener('resize', syncVisibility)
  }, [])

  const items = useMemo(() => auditLogs.slice(0, 5), [auditLogs])

  if (!isVisible) return null

  return (
    <div className="mt-auto w-full px-2 pb-2">
      <div className="rounded-lg border border-border bg-surface-secondary/90 p-2 shadow-card">
        <div className="mb-2 flex items-center justify-between gap-2 px-1">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-tertiary">Live Activity</div>
            <div className="text-[10px] text-text-tertiary">Latest task events</div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/audit')}
            className="text-[10px] font-medium text-brand hover:text-brand-dark"
          >
            View all →
          </button>
        </div>

        <div className="space-y-1.5">
          {items.length === 0 ? (
            <div className="rounded-md border border-dashed border-border px-2 py-3 text-[11px] text-text-tertiary">
              No recent activity yet.
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {items.map((entry) => (
                <motion.button
                  key={entry.id}
                  type="button"
                  layout
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.15 }}
                  onClick={() => entry.taskId && openTaskDetail(entry.taskId)}
                  className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface"
                >
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                    {iconForAction(entry.action)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[11px] text-text-primary">{entry.description}</div>
                    <div className="text-[10px] text-text-tertiary">{entry.time} ago</div>
                  </div>
                </motion.button>
              ))}
            </AnimatePresence>
          )}
        </div>
      </div>
    </div>
  )
}
