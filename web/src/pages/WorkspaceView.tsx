import { useState } from 'react'

import { Activity, KanbanSquare, List } from 'lucide-react'

import { BoardView } from './BoardView'
import { TasksView } from './TasksView'
import { AuditView } from './AuditView'
import { Button } from '../components/ui/button'

type ViewMode = 'board' | 'list' | 'activity'

export default function WorkspaceView() {
  const [viewMode, setViewMode] = useState<ViewMode>('board')

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden w-full">
      <div className="shrink-0 flex items-center gap-2 rounded-xl border border-border bg-surface p-1">
        <Button type="button" variant={viewMode === 'board' ? 'secondary' : 'ghost'} className="gap-2" onClick={() => setViewMode('board')}>
          <KanbanSquare className="h-4 w-4" /> Board
        </Button>
        <Button type="button" variant={viewMode === 'list' ? 'secondary' : 'ghost'} className="gap-2" onClick={() => setViewMode('list')}>
          <List className="h-4 w-4" /> List
        </Button>
        <Button type="button" variant={viewMode === 'activity' ? 'secondary' : 'ghost'} className="gap-2" onClick={() => setViewMode('activity')}>
          <Activity className="h-4 w-4" /> Activity
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <div className={viewMode === 'board' ? 'h-full w-full' : 'hidden h-full w-full'}>
          <BoardView />
        </div>
        <div className={viewMode === 'list' ? 'h-full w-full overflow-y-auto' : 'hidden h-full w-full'}>
          <TasksView />
        </div>
        <div className={viewMode === 'activity' ? 'h-full w-full overflow-y-auto' : 'hidden h-full w-full'}>
          <AuditView />
        </div>
      </div>
    </div>
  )
}
