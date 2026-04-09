package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/amas-nghia/relayhq/backend/internal/projectregistry"
)

func TestHealthz(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	rec := httptest.NewRecorder()

	NewRouter(projectregistry.NewStore()).ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}

	if got := rec.Header().Get("Content-Type"); got != "application/json" {
		t.Fatalf("content-type = %q, want application/json", got)
	}
}

func TestReadyz(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodGet, "/readyz", nil)
	rec := httptest.NewRecorder()

	NewRouter(projectregistry.NewStore()).ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}
}

func TestProjects(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodGet, "/api/v1/projects", nil)
	rec := httptest.NewRecorder()

	NewRouter(projectregistry.NewStore()).ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}

	if got := rec.Body.String(); got != "[]\n" {
		t.Fatalf("body = %q, want []\\n", got)
	}
}

func TestRoot(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()

	NewRouter(projectregistry.NewStore()).ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}
}

func TestCreateProject(t *testing.T) {
	t.Parallel()

	body := bytes.NewBufferString(`{"name":"Alpha","summary":"First project","owner":"team-a"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/projects", body)
	rec := httptest.NewRecorder()

	NewRouter(projectregistry.NewStore()).ServeHTTP(rec, req)

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

	store := projectregistry.NewStore()
	body := bytes.NewBufferString(`{"summary":"No name","owner":""}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/projects", body)
	rec := httptest.NewRecorder()

	NewRouter(store).ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}

	if got := store.List(); len(got) != 0 {
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

	store := projectregistry.NewStore()
	router := NewRouter(store)

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
