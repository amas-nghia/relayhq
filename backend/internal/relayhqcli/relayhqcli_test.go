package relayhqcli

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/amas-nghia/relayhq/backend/internal/httpapi"
	"github.com/amas-nghia/relayhq/backend/internal/projectregistry"
	"github.com/amas-nghia/relayhq/backend/internal/taskboard"
)

func newTestServer() *httptest.Server {
	projects := projectregistry.NewStore()
	tasks := taskboard.NewStore(projects)
	return httptest.NewServer(httpapi.NewRouter(projects, tasks))
}

func runCLI(t *testing.T, serverURL string, args ...string) (string, string, error) {
	t.Helper()

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	callArgs := append([]string{"--base-url", serverURL}, args...)
	err := Run(context.Background(), callArgs, &stdout, &stderr)
	return stdout.String(), stderr.String(), err
}

func TestProjectsAndTaskWorkflow(t *testing.T) {
	t.Parallel()

	server := newTestServer()
	t.Cleanup(server.Close)

	stdout, stderr, err := runCLI(t, server.URL, "projects", "create", "--name", "Alpha", "--owner", "team-a")
	if err != nil {
		t.Fatalf("create project: %v\nstderr: %s", err, stderr)
	}

	var project struct {
		ID    string `json:"id"`
		Name  string `json:"name"`
		Owner string `json:"owner"`
	}
	if err := json.Unmarshal([]byte(stdout), &project); err != nil {
		t.Fatalf("decode project output: %v\nstdout: %s", err, stdout)
	}
	if project.ID == "" || project.Name != "Alpha" || project.Owner != "team-a" {
		t.Fatalf("unexpected project payload: %+v", project)
	}

	stdout, stderr, err = runCLI(t, server.URL, "tasks", "create", "--project", project.ID, "--title", "First task")
	if err != nil {
		t.Fatalf("create task: %v\nstderr: %s", err, stderr)
	}

	var taskPayload struct {
		ID        string `json:"id"`
		ProjectID string `json:"project_id"`
		Title     string `json:"title"`
		Status    string `json:"status"`
	}
	if err := json.Unmarshal([]byte(stdout), &taskPayload); err != nil {
		t.Fatalf("decode task output: %v\nstdout: %s", err, stdout)
	}
	if taskPayload.ID == "" || taskPayload.Status != "todo" {
		t.Fatalf("unexpected task payload: %+v", taskPayload)
	}

	stdout, stderr, err = runCLI(t, server.URL, "tasks", "start", taskPayload.ID)
	if err != nil {
		t.Fatalf("start task: %v\nstderr: %s", err, stderr)
	}
	if err := json.Unmarshal([]byte(stdout), &taskPayload); err != nil {
		t.Fatalf("decode started task: %v\nstdout: %s", err, stdout)
	}
	if taskPayload.Status != "in_progress" {
		t.Fatalf("status = %q, want in_progress", taskPayload.Status)
	}

	stdout, stderr, err = runCLI(t, server.URL, "tasks", "list", "--project", project.ID)
	if err != nil {
		t.Fatalf("list tasks: %v\nstderr: %s", err, stderr)
	}
	if !strings.Contains(stdout, "First task") || !strings.Contains(stdout, "in_progress") {
		t.Fatalf("unexpected tasks list output:\n%s", stdout)
	}

	stdout, stderr, err = runCLI(t, server.URL, "board", "--project", project.ID)
	if err != nil {
		t.Fatalf("board: %v\nstderr: %s", err, stderr)
	}
	if !strings.Contains(stdout, "Doing (1)") || !strings.Contains(stdout, "First task") {
		t.Fatalf("unexpected board output:\n%s", stdout)
	}

	stdout, stderr, err = runCLI(t, server.URL, "next", "--project", project.ID)
	if err != nil {
		t.Fatalf("next: %v\nstderr: %s", err, stderr)
	}
	if err := json.Unmarshal([]byte(stdout), &taskPayload); err != nil {
		t.Fatalf("decode next output: %v\nstdout: %s", err, stdout)
	}
	if taskPayload.Title != "First task" || taskPayload.Status != "in_progress" {
		t.Fatalf("unexpected next payload: %+v", taskPayload)
	}
}
