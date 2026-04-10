package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/amas-nghia/relayhq/backend/internal/projectregistry"
	"github.com/amas-nghia/relayhq/backend/internal/taskboard"
)

func newTestRouter() (*projectregistry.Store, http.Handler) {
	projects := projectregistry.NewStore()
	tasks := taskboard.NewStore(projects)
	return projects, NewRouter(projects, tasks)
}

func createProject(t *testing.T, router http.Handler, name, owner string) string {
	t.Helper()

	body := bytes.NewBufferString(`{"name":"` + name + `","summary":"","owner":"` + owner + `"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/projects", body)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("create project status = %d, want %d", rec.Code, http.StatusCreated)
	}

	var got map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("unmarshal created project: %v", err)
	}

	id, _ := got["id"].(string)
	if id == "" {
		t.Fatal("project id is empty")
	}

	return id
}

func TestHealthz(t *testing.T) {
	t.Parallel()

	_, router := newTestRouter()
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}

	if got := rec.Header().Get("Content-Type"); got != "application/json" {
		t.Fatalf("content-type = %q, want application/json", got)
	}
}

func TestReadyz(t *testing.T) {
	t.Parallel()

	_, router := newTestRouter()
	req := httptest.NewRequest(http.MethodGet, "/readyz", nil)
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}
}

func TestProjects(t *testing.T) {
	t.Parallel()

	_, router := newTestRouter()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/projects", nil)
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}

	if got := rec.Body.String(); got != "[]\n" {
		t.Fatalf("body = %q, want []\\n", got)
	}
}

func TestRoot(t *testing.T) {
	t.Parallel()

	_, router := newTestRouter()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}
}

func TestCreateProject(t *testing.T) {
	t.Parallel()

	_, router := newTestRouter()
	body := bytes.NewBufferString(`{"name":"Alpha","summary":"First project","owner":"team-a"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/projects", body)
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusCreated)
	}

	var got map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}

	if got["id"] == "" {
		t.Fatal("id is empty")
	}
	if got["name"] != "Alpha" {
		t.Fatalf("name = %v, want Alpha", got["name"])
	}
	if got["owner"] != "team-a" {
		t.Fatalf("owner = %v, want team-a", got["owner"])
	}
}

func TestCreateProjectInvalidInput(t *testing.T) {
	t.Parallel()

	projects, router := newTestRouter()
	body := bytes.NewBufferString(`{"summary":"No name","owner":""}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/projects", body)
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}

	if got := projects.List(); len(got) != 0 {
		t.Fatalf("store size = %d, want 0", len(got))
	}

	var payload map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("unmarshal error body: %v", err)
	}
	if payload["error"] == "" {
		t.Fatal("error message is empty")
	}
}

func TestProjectOrder(t *testing.T) {
	t.Parallel()

	_, router := newTestRouter()

	for _, payload := range []string{
		`{"name":"One","owner":"a"}`,
		`{"name":"Two","owner":"b"}`,
	} {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/projects", bytes.NewBufferString(payload))
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		if rec.Code != http.StatusCreated {
			t.Fatalf("create status = %d, want %d", rec.Code, http.StatusCreated)
		}
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/projects", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	var got []struct {
		Name string `json:"name"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("unmarshal list: %v", err)
	}

	if len(got) != 2 || got[0].Name != "One" || got[1].Name != "Two" {
		t.Fatalf("order = %#v, want [One Two]", got)
	}
}

func TestBoard(t *testing.T) {
	t.Parallel()

	projects, router := newTestRouter()
	projectID := createProject(t, router, "Alpha", "team-a")
	if !projects.Exists(projectID) {
		t.Fatal("project should exist")
	}

	for _, payload := range []string{
		`{"project_id":"` + projectID + `","title":"Todo task","status":"todo"}`,
		`{"project_id":"` + projectID + `","title":"Doing task","status":"in_progress"}`,
		`{"project_id":"` + projectID + `","title":"Review task","status":"review"}`,
		`{"project_id":"` + projectID + `","title":"Done task","status":"done"}`,
		`{"project_id":"` + projectID + `","title":"Cancelled task","status":"cancelled"}`,
	} {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/tasks", bytes.NewBufferString(payload))
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		if rec.Code != http.StatusCreated {
			t.Fatalf("create task status = %d, want %d", rec.Code, http.StatusCreated)
		}
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/boards?project_id="+projectID, nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}

	var payload struct {
		ProjectID string `json:"project_id"`
		Columns   []struct {
			Key   string `json:"key"`
			Count int    `json:"count"`
			Tasks []struct {
				Title  string `json:"title"`
				Status string `json:"status"`
			} `json:"tasks"`
		} `json:"columns"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("unmarshal board: %v", err)
	}

	if payload.ProjectID != projectID {
		t.Fatalf("project_id = %q, want %q", payload.ProjectID, projectID)
	}
	if len(payload.Columns) != 4 {
		t.Fatalf("columns = %d, want 4", len(payload.Columns))
	}

	expect := map[string]int{
		"todo":   1,
		"doing":  1,
		"review": 1,
		"done":   2,
	}
	for _, col := range payload.Columns {
		if want := expect[col.Key]; col.Count != want {
			t.Fatalf("column %s count = %d, want %d", col.Key, col.Count, want)
		}
	}
}

func TestBoardMissingProject(t *testing.T) {
	t.Parallel()

	_, router := newTestRouter()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/boards?project_id=missing", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusNotFound)
	}
}

func TestBoardMissingProjectID(t *testing.T) {
	t.Parallel()

	_, router := newTestRouter()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/boards", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}
}

func TestCreateTask(t *testing.T) {
	t.Parallel()

	projects, router := newTestRouter()
	projectID := createProject(t, router, "Alpha", "team-a")
	if !projects.Exists(projectID) {
		t.Fatal("project should exist")
	}

	body := bytes.NewBufferString(`{"project_id":"` + projectID + `","title":"First task","details":"Do the thing","status":"todo"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/tasks", body)
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusCreated)
	}

	var got map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}

	if got["project_id"] != projectID {
		t.Fatalf("project_id = %v, want %s", got["project_id"], projectID)
	}
	if got["title"] != "First task" {
		t.Fatalf("title = %v, want First task", got["title"])
	}
	if got["status"] != "todo" {
		t.Fatalf("status = %v, want todo", got["status"])
	}
}

func TestListTasksByProject(t *testing.T) {
	t.Parallel()

	_, router := newTestRouter()
	alphaID := createProject(t, router, "Alpha", "team-a")
	betaID := createProject(t, router, "Beta", "team-b")

	for _, payload := range []string{
		`{"project_id":"` + alphaID + `","title":"Task A","status":"todo"}`,
		`{"project_id":"` + betaID + `","title":"Task B","status":"todo"}`,
	} {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/tasks", bytes.NewBufferString(payload))
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		if rec.Code != http.StatusCreated {
			t.Fatalf("create task status = %d, want %d", rec.Code, http.StatusCreated)
		}
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/tasks?project_id="+alphaID, nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}

	var got []struct {
		Title string `json:"title"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("unmarshal list: %v", err)
	}

	if len(got) != 1 || got[0].Title != "Task A" {
		t.Fatalf("tasks = %#v, want one Task A", got)
	}
}

func TestUpdateTaskStatus(t *testing.T) {
	t.Parallel()

	_, router := newTestRouter()
	projectID := createProject(t, router, "Alpha", "team-a")

	createReq := httptest.NewRequest(http.MethodPost, "/api/v1/tasks", bytes.NewBufferString(`{"project_id":"`+projectID+`","title":"Task A","status":"todo"}`))
	createRec := httptest.NewRecorder()
	router.ServeHTTP(createRec, createReq)
	if createRec.Code != http.StatusCreated {
		t.Fatalf("create status = %d, want %d", createRec.Code, http.StatusCreated)
	}

	var created map[string]any
	if err := json.Unmarshal(createRec.Body.Bytes(), &created); err != nil {
		t.Fatalf("unmarshal task: %v", err)
	}
	id, _ := created["id"].(string)
	if id == "" {
		t.Fatal("task id is empty")
	}

	patchReq := httptest.NewRequest(http.MethodPatch, "/api/v1/tasks/"+id+"/status", bytes.NewBufferString(`{"status":"in_progress"}`))
	patchRec := httptest.NewRecorder()
	router.ServeHTTP(patchRec, patchReq)

	if patchRec.Code != http.StatusOK {
		t.Fatalf("patch status = %d, want %d", patchRec.Code, http.StatusOK)
	}

	var updated map[string]any
	if err := json.Unmarshal(patchRec.Body.Bytes(), &updated); err != nil {
		t.Fatalf("unmarshal updated task: %v", err)
	}

	if updated["status"] != "in_progress" {
		t.Fatalf("status = %v, want in_progress", updated["status"])
	}
}
