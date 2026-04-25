package vault

import (
	"testing"
	"time"
)

func TestCanonicalPaths(t *testing.T) {
	t.Parallel()

	paths := CanonicalPaths()
	want := []string{
		"shared/workspaces/",
		"shared/projects/",
		"shared/boards/",
		"shared/columns/",
		"shared/issues/",
		"shared/agents/",
		"shared/runs/",
		"shared/audit/",
		"shared/threads/",
		"users/<user>/provider.md",
		"users/<user>/prefs.md",
		"users/<user>/scratch/",
		"system/schemas/",
		"system/templates/",
	}

	if len(paths) != len(want) {
		t.Fatalf("path count mismatch: got %d want %d", len(paths), len(want))
	}

	for i := range want {
		if paths[i] != want[i] {
			t.Fatalf("path[%d] mismatch: got %q want %q", i, paths[i], want[i])
		}
	}
}

func TestValidateTaskFrontmatter(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, time.April, 14, 10, 0, 0, 0, time.UTC)
	task := TaskFrontmatter{
		ID:              "task-001",
		Type:            "task",
		Version:         1,
		WorkspaceID:     "ws-acme",
		ProjectID:       "project-auth",
		BoardID:         "board-auth-main",
		Column:          TaskColumnTodo,
		Status:          TaskStatusTodo,
		Priority:        TaskPriorityHigh,
		Title:           "Implement password reset API",
		Assignee:        "agent-backend-dev",
		CreatedBy:       "@alice",
		CreatedAt:       now,
		UpdatedAt:       now,
		Progress:        0,
		ApprovalOutcome: ApprovalOutcomePending,
	}

	if err := ValidateTaskFrontmatter(task); err != nil {
		t.Fatalf("expected valid task, got error: %v", err)
	}

	task.Status = "broken"
	if err := ValidateTaskFrontmatter(task); err == nil {
		t.Fatal("expected error for invalid status, got nil")
	}
}

func TestValidateAgentFrontmatter(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, time.April, 14, 10, 0, 0, 0, time.UTC)
	agent := AgentFrontmatter{
		ID:          "agent-backend-dev",
		Type:        "agent",
		Name:        "Backend Developer",
		AccountID:   ptrString("claude-account-1"),
		Role:        "implementation",
		Provider:    "claude",
		APIKeyRef:   ptrString("env:ANTHROPIC_API_KEY_ACCOUNT_1"),
		Model:       "claude-sonnet-4-6",
		MonthlyBudgetUSD: ptrFloat64(25),
		SkillFile:   "skills/relayhq-backend-dev.md",
		Status:      "available",
		WorkspaceID: "ws-acme",
		CreatedAt:   now,
		UpdatedAt:   now,
	}

	if err := ValidateAgentFrontmatter(agent); err != nil {
		t.Fatalf("expected valid agent, got error: %v", err)
	}
}

func ptrString(value string) *string { return &value }
func ptrFloat64(value float64) *float64 { return &value }

func TestValidateProviderOverlayFrontmatter(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, time.April, 14, 10, 0, 0, 0, time.UTC)
	overlay := ProviderOverlayFrontmatter{
		Type:      "provider-overlay",
		UserID:    "@alice",
		Provider:  "claude",
		Model:     "claude-sonnet-4-6",
		APIKeyRef: "env:ANTHROPIC_API_KEY",
		UpdatedAt: now,
	}

	if err := ValidateProviderOverlay(overlay); err != nil {
		t.Fatalf("expected valid overlay, got error: %v", err)
	}
}

func TestValidateWorkspaceFrontmatter(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, time.April, 14, 10, 0, 0, 0, time.UTC)
	workspace := WorkspaceFrontmatter{
		ID:        "ws-acme",
		Type:      "workspace",
		Name:      "Acme Corp",
		CreatedAt: now,
		UpdatedAt: now,
	}

	if err := ValidateWorkspaceFrontmatter(workspace); err != nil {
		t.Fatalf("expected valid workspace, got error: %v", err)
	}
}

func TestValidateProjectFrontmatter(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, time.April, 14, 10, 0, 0, 0, time.UTC)
	legacyRoot := "/repo/main"

	tests := []struct {
		name    string
		project ProjectFrontmatter
		wantErr bool
	}{
		{
			name: "accepts old codebase_root format",
			project: ProjectFrontmatter{
				ID:           "project-auth",
				Type:         "project",
				WorkspaceID:  "ws-acme",
				Name:         "Authentication",
				CodebaseRoot: &legacyRoot,
				CreatedAt:    now,
				UpdatedAt:    now,
			},
			wantErr: false,
		},
		{
			name: "accepts single codebase entry",
			project: ProjectFrontmatter{
				ID:          "project-auth",
				Type:        "project",
				WorkspaceID: "ws-acme",
				Name:        "Authentication",
				Codebases: []CodebaseEntry{{Name: "frontend", Path: "/repo/frontend", Primary: true}},
				CreatedAt:   now,
				UpdatedAt:   now,
			},
			wantErr: false,
		},
		{
			name: "accepts multiple codebase entries",
			project: ProjectFrontmatter{
				ID:          "project-auth",
				Type:        "project",
				WorkspaceID: "ws-acme",
				Name:        "Authentication",
				Codebases: []CodebaseEntry{{Name: "frontend", Path: "/repo/frontend", Tech: "Next.js", Primary: true}, {Name: "backend", Path: "/repo/backend", Tech: "NestJS"}},
				CreatedAt:   now,
				UpdatedAt:   now,
			},
			wantErr: false,
		},
		{
			name: "rejects empty codebases without legacy root",
			project: ProjectFrontmatter{
				ID:          "project-auth",
				Type:        "project",
				WorkspaceID: "ws-acme",
				Name:        "Authentication",
				Codebases:   []CodebaseEntry{},
				CreatedAt:   now,
				UpdatedAt:   now,
			},
			wantErr: true,
		},
		{
			name: "rejects non-slug codebase name",
			project: ProjectFrontmatter{
				ID:          "project-auth",
				Type:        "project",
				WorkspaceID: "ws-acme",
				Name:        "Authentication",
				Codebases:   []CodebaseEntry{{Name: "Front End", Path: "/repo/frontend"}},
				CreatedAt:   now,
				UpdatedAt:   now,
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		caseData := tt
		t.Run(caseData.name, func(t *testing.T) {
			t.Parallel()
			err := ValidateProjectFrontmatter(caseData.project)
			if caseData.wantErr && err == nil {
				t.Fatal("expected error, got nil")
			}
			if !caseData.wantErr && err != nil {
				t.Fatalf("expected valid project, got error: %v", err)
			}
		})
	}
}

func TestValidateAuditNoteFrontmatter(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, time.April, 14, 10, 0, 0, 0, time.UTC)
	note := AuditNoteFrontmatter{
		ID:         "audit-001",
		Type:       "audit-note",
		TaskID:     "task-001",
		Message:    "Approved deployment after security review",
		Source:     "human",
		Confidence: 1,
		CreatedAt:  now,
	}

	if err := ValidateAuditNoteFrontmatter(note); err != nil {
		t.Fatalf("expected valid audit note, got error: %v", err)
	}
}

func TestValidateDocFrontmatter(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, time.April, 14, 10, 0, 0, 0, time.UTC)
	projectID := "project-docs"
	doc := DocFrontmatter{
		ID:          "doc-001",
		Type:        "doc",
		DocType:     DocTypeBudget,
		WorkspaceID: "ws-acme",
		ProjectID:   &projectID,
		Title:       "Budget Plan",
		Status:      "draft",
		Visibility:  DocVisibilityPrivate,
		AccessRoles: []string{"role:pm"},
		Sensitive:   true,
		CreatedAt:   now,
		UpdatedAt:   now,
		Tags:        []string{"finance"},
	}

	if err := ValidateDocFrontmatter(doc); err != nil {
		t.Fatalf("expected valid doc, got error: %v", err)
	}

	doc.DocType = "broken"
	if err := ValidateDocFrontmatter(doc); err == nil {
		t.Fatal("expected error for invalid doc type, got nil")
	}
}

func TestValidateProjectFrontmatterWithExtendedFields(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, time.April, 14, 10, 0, 0, 0, time.UTC)
	deadline := now.Add(24 * time.Hour)
	status := ProjectStatusActive
	root := "/repo/main"
	project := ProjectFrontmatter{
		ID:           "project-auth",
		Type:         "project",
		WorkspaceID:  "ws-acme",
		Name:         "Authentication",
		Description:  ptrString("Internal delivery workspace"),
		Budget:       ptrString("$12,000/mo"),
		Deadline:     &deadline,
		Status:       &status,
		Links:        []ProjectLinkEntry{{Label: "PRD", URL: "https://notion.so/prd"}},
		Attachments:  []ProjectAttachmentEntry{{Label: "Kickoff doc", URL: "https://drive.google.com/doc", Type: ProjectAttachmentTypeDoc, AddedAt: now}},
		CodebaseRoot: &root,
		CreatedAt:    now,
		UpdatedAt:    now,
	}

	if err := ValidateProjectFrontmatter(project); err != nil {
		t.Fatalf("expected valid project with extended fields, got error: %v", err)
	}
}
