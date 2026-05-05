import type { AgentFrontmatter, ApprovalOutcome, AuditNoteFrontmatter, CoordinatorThreadFrontmatter, DocFrontmatter, IssueFrontmatter, ProjectSceneConfig, TaskFrontmatter, WorkspaceFrontmatter } from "../../../shared/vault/schema";

export type { AgentFrontmatter, ApprovalOutcome, AuditNoteFrontmatter, CoordinatorThreadFrontmatter, DocFrontmatter, IssueFrontmatter, ProjectSceneConfig, TaskFrontmatter, WorkspaceFrontmatter } from "../../../shared/vault/schema";

export const VAULT_RECORD_TYPES = ["workspace", "project", "board", "column", "task", "issue", "doc", "approval", "audit-note", "agent", "coordinator-thread"] as const;
export type VaultRecordType = (typeof VAULT_RECORD_TYPES)[number];

export const VAULT_COLLECTION_NAMES = ["workspaces", "projects", "boards", "columns", "tasks", "issues", "docs", "approvals", "auditNotes", "agents", "coordinatorThreads"] as const;
export type VaultCollectionName = (typeof VAULT_COLLECTION_NAMES)[number];

export interface ProjectFrontmatter {
  readonly id: string;
  readonly type: "project";
  readonly workspace_id: string;
  readonly name: string;
  readonly coordinator_agent_id?: string | null;
  readonly description?: string;
  readonly budget?: string;
  readonly deadline?: string;
  readonly status?: string;
  readonly links?: ReadonlyArray<{ readonly label: string; readonly url: string }>;
  readonly attachments?: ReadonlyArray<{ readonly label: string; readonly url: string; readonly type: string; readonly addedAt: string }>;
  readonly scene?: ProjectSceneConfig;
  readonly codebase_root?: string | null;
  readonly codebases?: ReadonlyArray<{ readonly name: string; readonly path: string; readonly tech?: string; readonly primary?: boolean }>;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface BoardFrontmatter {
  readonly id: string;
  readonly type: "board";
  readonly workspace_id: string;
  readonly project_id: string;
  readonly name: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface ColumnFrontmatter {
  readonly id: string;
  readonly type: "column";
  readonly workspace_id: string;
  readonly project_id: string;
  readonly board_id: string;
  readonly name: string;
  readonly position: number;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface ApprovalFrontmatter {
  readonly id: string;
  readonly type: "approval";
  readonly workspace_id: string;
  readonly project_id: string;
  readonly board_id: string;
  readonly task_id: string;
  readonly status: string;
  readonly outcome: ApprovalOutcome;
  readonly requested_by: string | null;
  readonly requested_at: string | null;
  readonly decided_by: string | null;
  readonly decided_at: string | null;
  readonly reason: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export type VaultFrontmatter =
  | WorkspaceFrontmatter
  | ProjectFrontmatter
  | BoardFrontmatter
  | ColumnFrontmatter
  | TaskFrontmatter
  | IssueFrontmatter
  | DocFrontmatter
  | ApprovalFrontmatter
  | AuditNoteFrontmatter
  | AgentFrontmatter
  | CoordinatorThreadFrontmatter;

export interface VaultDocument<TFrontmatter extends VaultFrontmatter = VaultFrontmatter> {
  readonly sourcePath: string;
  readonly body: string;
  readonly frontmatter: TFrontmatter;
}

export type VaultTaskDocument = VaultDocument<TaskFrontmatter>;

export interface VaultRecordIdentity {
  readonly id: string;
  readonly type: VaultRecordType;
}

export interface WorkspaceIdentity extends VaultRecordIdentity {
  readonly type: "workspace";
}

export interface ProjectIdentity extends VaultRecordIdentity {
  readonly type: "project";
  readonly workspace_id: string;
}

export interface BoardIdentity extends VaultRecordIdentity {
  readonly type: "board";
  readonly workspace_id: string;
  readonly project_id: string;
}

export interface ColumnIdentity extends VaultRecordIdentity {
  readonly type: "column";
  readonly workspace_id: string;
  readonly project_id: string;
  readonly board_id: string;
}

export interface TaskIdentity extends VaultRecordIdentity {
  readonly type: "task";
  readonly workspace_id: string;
  readonly project_id: string;
  readonly board_id: string;
  readonly column_id: string;
}

export interface ApprovalIdentity extends VaultRecordIdentity {
  readonly type: "approval";
  readonly workspace_id: string;
  readonly project_id: string;
  readonly board_id: string;
  readonly task_id: string;
}

export interface IssueIdentity extends VaultRecordIdentity {
  readonly type: "issue";
  readonly workspace_id: string;
  readonly project_id: string;
}

export interface DocIdentity extends VaultRecordIdentity {
  readonly type: "doc";
  readonly workspace_id: string;
  readonly project_id: string | null;
}

export interface AuditIdentity extends VaultRecordIdentity {
  readonly type: "audit-note";
  readonly task_id: string;
}

export interface AgentIdentity extends VaultRecordIdentity {
  readonly type: "agent";
  readonly workspace_id: string;
}

export interface CoordinatorThreadIdentity extends VaultRecordIdentity {
  readonly type: "coordinator-thread";
  readonly workspace_id: string;
  readonly project_id: string;
  readonly coordinator_agent_id: string;
}

export type VaultIdentity =
  | WorkspaceIdentity
  | ProjectIdentity
  | BoardIdentity
  | ColumnIdentity
  | TaskIdentity
  | IssueIdentity
  | DocIdentity
  | ApprovalIdentity
  | AuditIdentity
  | AgentIdentity
  | CoordinatorThreadIdentity;

export interface VaultIdentityMap {
  readonly workspace: WorkspaceIdentity;
  readonly project: ProjectIdentity;
  readonly board: BoardIdentity;
  readonly column: ColumnIdentity;
  readonly task: TaskIdentity;
  readonly issue: IssueIdentity;
  readonly doc: DocIdentity;
  readonly approval: ApprovalIdentity;
  readonly auditNote: AuditIdentity;
  readonly agent: AgentIdentity;
  readonly coordinatorThread: CoordinatorThreadIdentity;
}

export interface VaultRecordMap {
  readonly workspace: WorkspaceFrontmatter;
  readonly project: ProjectFrontmatter;
  readonly board: BoardFrontmatter;
  readonly column: ColumnFrontmatter;
  readonly task: TaskFrontmatter;
  readonly issue: IssueFrontmatter;
  readonly doc: DocFrontmatter;
  readonly approval: ApprovalFrontmatter;
  readonly auditNote: AuditNoteFrontmatter;
  readonly agent: AgentFrontmatter;
  readonly coordinatorThread: CoordinatorThreadFrontmatter;
}

export const VAULT_COLLECTION_DIRECTORIES = {
  workspaces: "vault/shared/workspaces",
  projects: "vault/shared/projects",
  boards: "vault/shared/boards",
  columns: "vault/shared/columns",
  tasks: "vault/shared/tasks",
  issues: "vault/shared/issues",
  docs: "vault/shared/docs",
  approvals: "vault/shared/approvals",
  auditNotes: "vault/shared/audit",
  agents: "vault/shared/agents",
  coordinatorThreads: "vault/shared/coordinator-threads",
} as const satisfies Record<VaultCollectionName, string>;

export const VAULT_RECORD_TYPES_BY_COLLECTION = {
  workspaces: "workspace",
  projects: "project",
  boards: "board",
  columns: "column",
  tasks: "task",
  issues: "issue",
  docs: "doc",
  approvals: "approval",
  auditNotes: "audit-note",
  agents: "agent",
  coordinatorThreads: "coordinator-thread",
} as const satisfies Record<VaultCollectionName, VaultRecordType>;

export const VAULT_COLLECTIONS_BY_RECORD_TYPE = {
  workspace: "workspaces",
  project: "projects",
  board: "boards",
  column: "columns",
  task: "tasks",
  issue: "issues",
  doc: "docs",
  approval: "approvals",
  "audit-note": "auditNotes",
  agent: "agents",
  "coordinator-thread": "coordinatorThreads",
} as const satisfies Record<VaultRecordType, VaultCollectionName>;

export interface VaultReadCollections {
  readonly workspaces: ReadonlyArray<VaultDocument<WorkspaceFrontmatter>>;
  readonly projects: ReadonlyArray<VaultDocument<ProjectFrontmatter>>;
  readonly boards: ReadonlyArray<VaultDocument<BoardFrontmatter>>;
  readonly columns: ReadonlyArray<VaultDocument<ColumnFrontmatter>>;
  readonly tasks: ReadonlyArray<VaultDocument<TaskFrontmatter>>;
  readonly issues: ReadonlyArray<VaultDocument<IssueFrontmatter>>;
  readonly docs: ReadonlyArray<VaultDocument<DocFrontmatter>>;
  readonly approvals: ReadonlyArray<VaultDocument<ApprovalFrontmatter>>;
  readonly auditNotes: ReadonlyArray<VaultDocument<AuditNoteFrontmatter>>;
  readonly agents: ReadonlyArray<VaultDocument<AgentFrontmatter>>;
  readonly coordinatorThreads?: ReadonlyArray<VaultDocument<CoordinatorThreadFrontmatter>>;
}

export function getVaultRecordType(collection: VaultCollectionName): VaultRecordType {
  return VAULT_RECORD_TYPES_BY_COLLECTION[collection];
}

export function getVaultCollectionName(recordType: VaultRecordType): VaultCollectionName {
  return VAULT_COLLECTIONS_BY_RECORD_TYPE[recordType];
}
