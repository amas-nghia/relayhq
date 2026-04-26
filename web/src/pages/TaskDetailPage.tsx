import { ArrowLeft } from 'lucide-react'
import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { DetailPanel } from '../components/task/DetailPanel'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { useAppStore } from '../store/appStore'

export function TaskDetailPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const loadData = useAppStore(state => state.loadData)
  const taskExists = useAppStore(state => state.tasks.some(task => task.id === id))

  useEffect(() => {
    if (!taskExists) {
      void loadData()
    }
  }, [loadData, taskExists])

  if (!id) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-text-tertiary">
        Task not found.
      </div>
    )
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex items-center gap-3">
        <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-text-primary">Task detail</h1>
          <p className="text-sm text-text-secondary">Review the full task record and activity log.</p>
        </div>
      </div>

      <Card className="overflow-hidden border-border bg-surface shadow-card">
        <DetailPanel taskId={id} mode="page" />
      </Card>
    </div>
  )
}
