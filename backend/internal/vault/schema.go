package vault

import (
	"fmt"
	"strings"
	"time"
)

const SchemaVersion = 1

type Layout struct {
	Shared  []string
	Private []string
	System  []string
}

func CanonicalLayout() Layout {
	return Layout{
		Shared: []string{
			"shared/workspaces/",
			"shared/projects/",
			"shared/boards/",
			"shared/columns/",
			"shared/issues/",
			"shared/agents/",
			"shared/runs/",
			"shared/audit/",
			"shared/threads/",
		},
		Private: []string{
			"users/<user>/provider.md",
			"users/<user>/prefs.md",
			"users/<user>/scratch/",
		},
		System: []string{
			"system/schemas/",
			"system/templates/",
		},
	}
}

func CanonicalPaths() []string {
	layout := CanonicalLayout()
	paths := make([]string, 0, len(layout.Shared)+len(layout.Private)+len(layout.System))
	paths = append(paths, layout.Shared...)
	paths = append(paths, layout.Private...)
	paths = append(paths, layout.System...)
	return paths
}

type TaskStatus string

const (
	TaskStatusTodo            TaskStatus = "todo"
	TaskStatusInProgress      TaskStatus = "in-progress"
	TaskStatusBlocked         TaskStatus = "blocked"
	TaskStatusWaitingApproval TaskStatus = "waiting-approval"
	TaskStatusDone            TaskStatus = "done"
	TaskStatusCancelled       TaskStatus = "cancelled"
)

func (s TaskStatus) Valid() bool {
	switch s {
	case TaskStatusTodo, TaskStatusInProgress, TaskStatusBlocked, TaskStatusWaitingApproval, TaskStatusDone, TaskStatusCancelled:
		return true
	default:
		return false
	}
}

type TaskColumn string

const (
	TaskColumnTodo       TaskColumn = "todo"
	TaskColumnInProgress TaskColumn = "in-progress"
	TaskColumnReview     TaskColumn = "review"
	TaskColumnDone       TaskColumn = "done"
)

func (c TaskColumn) Valid() bool {
	switch c {
	case TaskColumnTodo, TaskColumnInProgress, TaskColumnReview, TaskColumnDone:
		return true
	default:
		return false
	}
}

type TaskPriority string

const (
	TaskPriorityCritical TaskPriority = "critical"
	TaskPriorityHigh     TaskPriority = "high"
	TaskPriorityMedium   TaskPriority = "medium"
	TaskPriorityLow      TaskPriority = "low"
)

func (p TaskPriority) Valid() bool {
	switch p {
	case TaskPriorityCritical, TaskPriorityHigh, TaskPriorityMedium, TaskPriorityLow:
		return true
	default:
		return false
	}
}

type ApprovalOutcome string

const (
	ApprovalOutcomeApproved ApprovalOutcome = "approved"
	ApprovalOutcomeRejected ApprovalOutcome = "rejected"
	ApprovalOutcomePending  ApprovalOutcome = "pending"
)

func (o ApprovalOutcome) Valid() bool {
	switch o {
	case ApprovalOutcomeApproved, ApprovalOutcomeRejected, ApprovalOutcomePending:
		return true
	default:
		return false
	}
}

type TaskLink struct {
	Project string
	Thread  string
}

type TaskFrontmatter struct {
	ID                  string
	Type                string
	Version             int
	WorkspaceID         string
	ProjectID           string
	BoardID             string
	Column              TaskColumn
	Status              TaskStatus
	Priority            TaskPriority
	Title               string
	Assignee            string
	CreatedBy           string
	CreatedAt           time.Time
	UpdatedAt           time.Time
	HeartbeatAt         *time.Time
	ExecutionStartedAt  *time.Time
	ExecutionNotes      *string
	Progress            int
	ApprovalNeeded      bool
	ApprovalRequestedBy *string
	ApprovalReason      *string
	ApprovedBy          *string
	ApprovedAt          *time.Time
	ApprovalOutcome     ApprovalOutcome
	BlockedReason       *string
	BlockedSince        *time.Time
	Result              *string
	CompletedAt         *time.Time
	TokensUsed          *int
	Model               *string
	CostUSD             *float64
	ParentTaskID        *string
	GitHubIssueID       *string
	DependsOn           []string
	Tags                []string
	Links               []TaskLink
	LockedBy            *string
	LockedAt            *time.Time
	LockExpiresAt       *time.Time
}

type AgentFrontmatter struct {
	ID                  string
	Type                string
	Name                string
	AccountID           *string
	Role                string
	Provider            string
	APIKeyRef           *string
	Model               string
	Capabilities        []string
	TaskTypesAccepted   []string
	ApprovalRequiredFor []string
	CannotDo            []string
	AccessibleBy        []string
	SkillFile           string
	Status              string
	WorkspaceID         string
	CreatedAt           time.Time
	UpdatedAt           time.Time
}

type ProviderOverlayFrontmatter struct {
	Type                  string
	UserID                string
	Provider              string
	Model                 string
	APIKeyRef             string
	DefaultAgent          string
	PreferAgents          []string
	AllowBash             bool
	AllowFileWrite        bool
	AllowNetwork          bool
	Language              string
	ResponseStyle         string
	AutoHeartbeat         bool
	HeartbeatIntervalSecs int
	UpdatedAt             time.Time
}

type WorkspaceFrontmatter struct {
	ID        string
	Type      string
	Name      string
	OwnerIDs  []string
	MemberIDs []string
	CreatedAt time.Time
	UpdatedAt time.Time
}

type CodebaseEntry struct {
	Name    string
	Path    string
	Tech    string
	Primary bool
}

type ProjectFrontmatter struct {
	ID           string
	Type         string
	WorkspaceID  string
	Name         string
	CodebaseRoot *string
	Codebases    []CodebaseEntry
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

type AuditNoteFrontmatter struct {
	ID         string
	Type       string
	TaskID     string
	Message    string
	Source     string
	Confidence float64
	CreatedAt  time.Time
}

type DocType string

const (
	DocTypeFeatureSpec    DocType = "feature-spec"
	DocTypeDesign         DocType = "design"
	DocTypeRunbook        DocType = "runbook"
	DocTypeGeneral        DocType = "general"
	DocTypeFeature        DocType = "feature"
	DocTypeDecision       DocType = "decision"
	DocTypeResearch       DocType = "research"
	DocTypeRetro          DocType = "retro"
	DocTypeBrief          DocType = "brief"
	DocTypePlan           DocType = "plan"
	DocTypeMeetingMinutes DocType = "meeting-minutes"
	DocTypeBudget         DocType = "budget"
	DocTypeExpense        DocType = "expense"
	DocTypeSOP            DocType = "sop"
	DocTypePolicy         DocType = "policy"
	DocTypeADR            DocType = "adr"
)

func (d DocType) Valid() bool {
	switch d {
	case DocTypeFeatureSpec, DocTypeDesign, DocTypeRunbook, DocTypeGeneral, DocTypeFeature, DocTypeDecision, DocTypeResearch, DocTypeRetro, DocTypeBrief, DocTypePlan, DocTypeMeetingMinutes, DocTypeBudget, DocTypeExpense, DocTypeSOP, DocTypePolicy, DocTypeADR:
		return true
	default:
		return false
	}
}

type DocVisibility string

const (
	DocVisibilityProject   DocVisibility = "project"
	DocVisibilityWorkspace DocVisibility = "workspace"
	DocVisibilityPrivate   DocVisibility = "private"
)

func (v DocVisibility) Valid() bool {
	switch v {
	case DocVisibilityProject, DocVisibilityWorkspace, DocVisibilityPrivate:
		return true
	default:
		return false
	}
}

type DocFrontmatter struct {
	ID          string
	Type        string
	DocType     DocType
	WorkspaceID string
	ProjectID   *string
	Title       string
	Status      string
	Visibility  DocVisibility
	AccessRoles []string
	Sensitive   bool
	CreatedAt   time.Time
	UpdatedAt   time.Time
	Tags        []string
}

type ValidationError struct {
	Fields []string
}

func (e ValidationError) Error() string {
	return "validation failed: " + strings.Join(e.Fields, "; ")
}

func appendError(errs []string, field, msg string) []string {
	return append(errs, fmt.Sprintf("%s: %s", field, msg))
}

func ValidateTaskFrontmatter(task TaskFrontmatter) error {
	var errs []string
	if task.ID == "" {
		errs = appendError(errs, "id", "required")
	}
	if task.Type != "task" {
		errs = appendError(errs, "type", "must be task")
	}
	if task.Version <= 0 {
		errs = appendError(errs, "version", "must be positive")
	}
	if task.WorkspaceID == "" {
		errs = appendError(errs, "workspace_id", "required")
	}
	if task.ProjectID == "" {
		errs = appendError(errs, "project_id", "required")
	}
	if task.BoardID == "" {
		errs = appendError(errs, "board_id", "required")
	}
	if !task.Column.Valid() {
		errs = appendError(errs, "column", "invalid")
	}
	if !task.Status.Valid() {
		errs = appendError(errs, "status", "invalid")
	}
	if !task.Priority.Valid() {
		errs = appendError(errs, "priority", "invalid")
	}
	if task.Title == "" {
		errs = appendError(errs, "title", "required")
	}
	if task.CreatedBy == "" {
		errs = appendError(errs, "created_by", "required")
	}
	if task.CreatedAt.IsZero() {
		errs = appendError(errs, "created_at", "required")
	}
	if task.UpdatedAt.IsZero() {
		errs = appendError(errs, "updated_at", "required")
	}
	if task.Progress < 0 || task.Progress > 100 {
		errs = appendError(errs, "progress", "must be between 0 and 100")
	}
	if !task.ApprovalOutcome.Valid() {
		errs = appendError(errs, "approval_outcome", "invalid")
	}
	if task.Assignee == "" {
		errs = appendError(errs, "assignee", "required")
	}
	if task.LockedAt != nil && task.LockExpiresAt == nil {
		errs = appendError(errs, "lock_expires_at", "required when locked_at is set")
	}
	if len(errs) > 0 {
		return ValidationError{Fields: errs}
	}
	return nil
}

func ValidateAgentFrontmatter(agent AgentFrontmatter) error {
	var errs []string
	if agent.ID == "" {
		errs = appendError(errs, "id", "required")
	}
	if agent.Type != "agent" {
		errs = appendError(errs, "type", "must be agent")
	}
	if agent.Name == "" {
		errs = appendError(errs, "name", "required")
	}
	if agent.APIKeyRef != nil {
		ref := strings.TrimSpace(*agent.APIKeyRef)
		if ref == "" {
			errs = appendError(errs, "api_key_ref", "must not be empty when set")
		} else if !(strings.HasPrefix(ref, "env:") || strings.HasPrefix(ref, "secret:") || strings.HasPrefix(ref, "vault:")) {
			errs = appendError(errs, "api_key_ref", "must reference env:, secret:, or vault:")
		}
	}
	if agent.Role == "" {
		errs = appendError(errs, "role", "required")
	}
	if agent.Provider == "" {
		errs = appendError(errs, "provider", "required")
	}
	if agent.Model == "" {
		errs = appendError(errs, "model", "required")
	}
	if agent.SkillFile == "" {
		errs = appendError(errs, "skill_file", "required")
	}
	if agent.Status == "" {
		errs = appendError(errs, "status", "required")
	}
	if agent.WorkspaceID == "" {
		errs = appendError(errs, "workspace_id", "required")
	}
	if agent.CreatedAt.IsZero() {
		errs = appendError(errs, "created_at", "required")
	}
	if agent.UpdatedAt.IsZero() {
		errs = appendError(errs, "updated_at", "required")
	}
	if len(errs) > 0 {
		return ValidationError{Fields: errs}
	}
	return nil
}

func ValidateProviderOverlay(frontmatter ProviderOverlayFrontmatter) error {
	var errs []string
	if frontmatter.Type != "provider-overlay" {
		errs = appendError(errs, "type", "must be provider-overlay")
	}
	if frontmatter.UserID == "" {
		errs = appendError(errs, "user_id", "required")
	}
	if frontmatter.Provider == "" {
		errs = appendError(errs, "provider", "required")
	}
	if frontmatter.Model == "" {
		errs = appendError(errs, "model", "required")
	}
	if frontmatter.APIKeyRef == "" {
		errs = appendError(errs, "api_key_ref", "required")
	}
	if frontmatter.UpdatedAt.IsZero() {
		errs = appendError(errs, "updated_at", "required")
	}
	if len(errs) > 0 {
		return ValidationError{Fields: errs}
	}
	return nil
}

func ValidateWorkspaceFrontmatter(workspace WorkspaceFrontmatter) error {
	var errs []string
	if workspace.ID == "" {
		errs = appendError(errs, "id", "required")
	}
	if workspace.Type != "workspace" {
		errs = appendError(errs, "type", "must be workspace")
	}
	if workspace.Name == "" {
		errs = appendError(errs, "name", "required")
	}
	if workspace.CreatedAt.IsZero() {
		errs = appendError(errs, "created_at", "required")
	}
	if workspace.UpdatedAt.IsZero() {
		errs = appendError(errs, "updated_at", "required")
	}
	if len(errs) > 0 {
		return ValidationError{Fields: errs}
	}
	return nil
}

func ValidateProjectFrontmatter(project ProjectFrontmatter) error {
	var errs []string
	if project.ID == "" {
		errs = appendError(errs, "id", "required")
	}
	if project.Type != "project" {
		errs = appendError(errs, "type", "must be project")
	}
	if project.WorkspaceID == "" {
		errs = appendError(errs, "workspace_id", "required")
	}
	if project.Name == "" {
		errs = appendError(errs, "name", "required")
	}
	if project.CreatedAt.IsZero() {
		errs = appendError(errs, "created_at", "required")
	}
	if project.UpdatedAt.IsZero() {
		errs = appendError(errs, "updated_at", "required")
	}

	codebases := project.Codebases
	if len(codebases) == 0 && project.CodebaseRoot != nil && strings.TrimSpace(*project.CodebaseRoot) != "" {
		codebases = []CodebaseEntry{{Name: "main", Path: strings.TrimSpace(*project.CodebaseRoot), Primary: true}}
	}

	if len(codebases) == 0 {
		errs = appendError(errs, "codebases", "must contain at least one entry")
	}

	for index, codebase := range codebases {
		if codebase.Name == "" {
			errs = appendError(errs, fmt.Sprintf("codebases[%d].name", index), "required")
		} else {
			for _, r := range codebase.Name {
				valid := (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-'
				if !valid {
					errs = appendError(errs, fmt.Sprintf("codebases[%d].name", index), "must be a lowercase slug")
					break
				}
			}
		}
		if strings.TrimSpace(codebase.Path) == "" {
			errs = appendError(errs, fmt.Sprintf("codebases[%d].path", index), "required")
		}
	}

	if len(errs) > 0 {
		return ValidationError{Fields: errs}
	}
	return nil
}

func ValidateAuditNoteFrontmatter(note AuditNoteFrontmatter) error {
	var errs []string
	if note.ID == "" {
		errs = appendError(errs, "id", "required")
	}
	if note.Type != "audit-note" {
		errs = appendError(errs, "type", "must be audit-note")
	}
	if note.TaskID == "" {
		errs = appendError(errs, "task_id", "required")
	}
	if note.Message == "" {
		errs = appendError(errs, "message", "required")
	}
	if note.Source == "" {
		errs = appendError(errs, "source", "required")
	}
	if note.Confidence < 0 || note.Confidence > 1 {
		errs = appendError(errs, "confidence", "must be between 0 and 1")
	}
	if note.CreatedAt.IsZero() {
		errs = appendError(errs, "created_at", "required")
	}
	if len(errs) > 0 {
		return ValidationError{Fields: errs}
	}
	return nil
}

func ValidateDocFrontmatter(doc DocFrontmatter) error {
	var errs []string
	if doc.ID == "" {
		errs = appendError(errs, "id", "required")
	}
	if doc.Type != "doc" {
		errs = appendError(errs, "type", "must be doc")
	}
	if !doc.DocType.Valid() {
		errs = appendError(errs, "doc_type", "invalid")
	}
	if doc.WorkspaceID == "" {
		errs = appendError(errs, "workspace_id", "required")
	}
	if doc.Title == "" {
		errs = appendError(errs, "title", "required")
	}
	if doc.Status == "" {
		errs = appendError(errs, "status", "required")
	}
	if !doc.Visibility.Valid() {
		errs = appendError(errs, "visibility", "invalid")
	}
	if len(doc.AccessRoles) == 0 {
		errs = appendError(errs, "access_roles", "required")
	}
	if doc.CreatedAt.IsZero() {
		errs = appendError(errs, "created_at", "required")
	}
	if doc.UpdatedAt.IsZero() {
		errs = appendError(errs, "updated_at", "required")
	}
	if len(errs) > 0 {
		return ValidationError{Fields: errs}
	}
	return nil
}
