import { Agent, Project, Task, AuditLog } from '../types';

export const mockProjects: Project[] = [
  { id: 'proj-1', name: 'Meow Land', lastActive: true },
  { id: 'proj-2', name: 'Auth API', lastActive: true },
  { id: 'proj-3', name: 'Infra', lastActive: false },
];

export const mockAgents: Agent[] = [
  { id: 'agent-1', name: 'agent-backend', state: 'active', lastHeartbeat: '2 minutes ago' },
  { id: 'agent-2', name: 'agent-cleanup', state: 'waiting', lastHeartbeat: '1h ago' },
  { id: 'agent-3', name: 'agent-frontend', state: 'stale', lastHeartbeat: '3h ago' },
  { id: 'agent-4', name: 'agent-test', state: 'active', lastHeartbeat: '5 minutes ago' },
  { id: 'agent-5', name: 'agent-docs', state: 'idle', lastHeartbeat: '1d ago' },
];

export const mockTasks: Task[] = [
  {
    id: 'task-007',
    title: 'Deploy to Production',
    description: 'Deploy the latest Auth API to production environment.',
    status: 'waiting-approval',
    priority: 'high',
    projectId: 'proj-2',
    boardId: 'board-1',
    assigneeId: 'agent-1',
    progress: 80,
    requestedApprovalTime: '15 minutes ago',
    approvalReason: 'Needs production DB access',
    tags: ['auth', 'api', 'deploy'],
  },
  {
    id: 'task-012',
    title: 'Delete Legacy Data',
    description: 'Removing 50,000 rows from users_v1 table',
    status: 'waiting-approval',
    priority: 'high',
    projectId: 'proj-3',
    boardId: 'board-1',
    assigneeId: 'agent-2',
    progress: 50,
    requestedApprovalTime: '1 hour ago',
    approvalReason: 'About to delete large amount of data',
    tags: ['cleanup'],
  },
  {
    id: 'task-003',
    title: 'Login UI Redesign',
    status: 'blocked',
    priority: 'critical',
    projectId: 'proj-2',
    boardId: 'board-1',
    assigneeId: 'agent-3',
    progress: 40,
    blockedReason: 'Cannot connect to Figma API',
    blockedTime: '2h ago',
    tags: ['ui', 'frontend'],
  },
  {
    id: 'task-005',
    title: 'Implement API endpoints',
    status: 'in-progress',
    priority: 'medium',
    projectId: 'proj-2',
    boardId: 'board-1',
    assigneeId: 'agent-1',
    progress: 80,
    lastSeen: '2 minutes ago',
    tags: ['api'],
  },
  {
    id: 'task-001',
    title: 'Write tests',
    status: 'todo',
    priority: 'low',
    projectId: 'proj-2',
    boardId: 'board-1',
    progress: 0,
    tags: ['test'],
  },
  {
    id: 'task-009',
    title: 'DB Schema Migration',
    status: 'done',
    priority: 'high',
    projectId: 'proj-2',
    boardId: 'board-1',
    assigneeId: 'agent-1',
    progress: 100,
    tags: ['db'],
  },
];

export const mockAuditLogs: AuditLog[] = [
  {
    id: 'log-1',
    time: '14:32',
    agentId: 'agent-1',
    action: 'requested approval',
    description: '"Needs production DB access"',
    taskId: 'task-007'
  },
  {
    id: 'log-2',
    time: '13:45',
    userId: 'user-1',
    action: 'approved',
    description: 'Result: "Deployment successful, PR #42 merged"',
    taskId: 'task-005'
  },
];
