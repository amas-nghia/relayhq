package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/amas-nghia/relayhq/backend/internal/projectregistry"
)

func NewRouter(store *projectregistry.Store) http.Handler {
	if store == nil {
		store = projectregistry.NewStore()
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", healthHandler)
	mux.HandleFunc("/readyz", readyHandler)
	mux.HandleFunc("/api/v1/projects", projectsHandler(store))
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

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}
