package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/amas-nghia/relayhq/backend/internal/domain/task"
	"github.com/amas-nghia/relayhq/backend/internal/projectregistry"
	"github.com/amas-nghia/relayhq/backend/internal/taskboard"
)

func NewRouter(projects *projectregistry.Store, tasks *taskboard.Store) http.Handler {
	if projects == nil {
		projects = projectregistry.NewStore()
	}
	if tasks == nil {
		tasks = taskboard.NewStore(projects)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", healthHandler)
	mux.HandleFunc("/readyz", readyHandler)
	mux.HandleFunc("/api/v1/projects", projectsHandler(projects))
	mux.HandleFunc("/api/v1/tasks", tasksHandler(tasks))
	mux.HandleFunc("/api/v1/tasks/", taskStatusHandler(tasks))
	mux.HandleFunc("/", rootHandler)
	return mux
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func readyHandler(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ready"})
}

func rootHandler(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{
		"name":    "RelayHQ API",
		"message": "control plane scaffold",
	})
}

func projectsHandler(store *projectregistry.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			writeJSON(w, http.StatusOK, store.List())
		case http.MethodPost:
			var req struct {
				Name    string `json:"name"`
				Summary string `json:"summary"`
				Owner   string `json:"owner"`
			}

			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				writeError(w, http.StatusBadRequest, "invalid JSON body")
				return
			}

			created, err := store.Create(req.Name, req.Summary, req.Owner)
			if err != nil {
				var validationErr projectregistry.ValidationError
				if errors.As(err, &validationErr) {
					writeError(w, http.StatusBadRequest, validationErr.Error())
					return
				}

				writeError(w, http.StatusInternalServerError, "could not create project")
				return
			}

			writeJSON(w, http.StatusCreated, created)
		default:
			w.Header().Set("Allow", "GET, POST")
			writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		}
	}
}

func tasksHandler(store *taskboard.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			projectID := strings.TrimSpace(r.URL.Query().Get("project_id"))
			if projectID == "" {
				writeError(w, http.StatusBadRequest, "project_id is required")
				return
			}

			writeJSON(w, http.StatusOK, store.List(projectID))
		case http.MethodPost:
			var req struct {
				ProjectID string `json:"project_id"`
				Title     string `json:"title"`
				Details   string `json:"details"`
				Status    string `json:"status"`
			}

			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				writeError(w, http.StatusBadRequest, "invalid JSON body")
				return
			}

			created, err := store.Create(req.ProjectID, req.Title, req.Details, task.Status(req.Status))
			if err != nil {
				var validationErr taskboard.ValidationError
				if errors.As(err, &validationErr) {
					writeError(w, http.StatusBadRequest, validationErr.Error())
					return
				}

				writeError(w, http.StatusInternalServerError, "could not create task")
				return
			}

			writeJSON(w, http.StatusCreated, created)
		default:
			w.Header().Set("Allow", "GET, POST")
			writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		}
	}
}

func taskStatusHandler(store *taskboard.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPatch {
			w.Header().Set("Allow", "PATCH")
			writeError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}

		if !strings.HasSuffix(r.URL.Path, "/status") {
			writeError(w, http.StatusNotFound, "not found")
			return
		}

		id := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/api/v1/tasks/"), "/status")
		var req struct {
			Status string `json:"status"`
		}

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON body")
			return
		}

		updated, err := store.UpdateStatus(id, task.Status(req.Status))
		if err != nil {
			var validationErr taskboard.ValidationError
			if errors.As(err, &validationErr) {
				if strings.Contains(validationErr.Error(), "not found") {
					writeError(w, http.StatusNotFound, validationErr.Error())
					return
				}

				writeError(w, http.StatusBadRequest, validationErr.Error())
				return
			}

			writeError(w, http.StatusInternalServerError, "could not update task")
			return
		}

		writeJSON(w, http.StatusOK, updated)
	}
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}
