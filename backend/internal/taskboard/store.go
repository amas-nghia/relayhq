package taskboard

import (
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/amas-nghia/relayhq/backend/internal/domain/task"
	"github.com/amas-nghia/relayhq/backend/internal/projectregistry"
)

type Store struct {
	mu       sync.RWMutex
	seq      int
	tasks    []task.Task
	index    map[string]int
	projects *projectregistry.Store
}

type ValidationError struct {
	Field string
	Msg   string
}

func (e ValidationError) Error() string {
	if e.Field == "" {
		return e.Msg
	}

	return fmt.Sprintf("%s %s", e.Field, e.Msg)
}

func NewStore(projects *projectregistry.Store) *Store {
	return &Store{projects: projects, index: make(map[string]int)}
}

func (s *Store) Create(projectID, title, details string, status task.Status) (task.Task, error) {
	projectID = strings.TrimSpace(projectID)
	title = strings.TrimSpace(title)
	details = strings.TrimSpace(details)

	if projectID == "" {
		return task.Task{}, ValidationError{Field: "project_id", Msg: "is required"}
	}
	if title == "" {
		return task.Task{}, ValidationError{Field: "title", Msg: "is required"}
	}
	if s.projects != nil && !s.projects.Exists(projectID) {
		return task.Task{}, ValidationError{Field: "project_id", Msg: "does not exist"}
	}
	if status == "" {
		status = task.StatusTodo
	}
	if !isAllowedStatus(status) {
		return task.Task{}, ValidationError{Field: "status", Msg: "is invalid"}
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	s.seq++
	createdAt := time.Now().UTC()
	t := task.Task{
		ID:        fmt.Sprintf("task_%d", s.seq),
		ProjectID: projectID,
		Title:     title,
		Details:   details,
		Status:    status,
		CreatedAt: createdAt,
		UpdatedAt: createdAt,
	}

	s.tasks = append(s.tasks, t)
	s.index[t.ID] = len(s.tasks) - 1

	return t, nil
}

func (s *Store) List(projectID string) []task.Task {
	projectID = strings.TrimSpace(projectID)

	s.mu.RLock()
	defer s.mu.RUnlock()

	items := make([]task.Task, 0, len(s.tasks))
	for _, item := range s.tasks {
		if projectID == "" || item.ProjectID == projectID {
			items = append(items, item)
		}
	}

	return items
}

func (s *Store) UpdateStatus(id string, status task.Status) (task.Task, error) {
	id = strings.TrimSpace(id)
	if id == "" {
		return task.Task{}, ValidationError{Field: "id", Msg: "is required"}
	}
	if !isAllowedStatus(status) {
		return task.Task{}, ValidationError{Field: "status", Msg: "is invalid"}
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	idx, ok := s.index[id]
	if !ok {
		return task.Task{}, ValidationError{Field: "id", Msg: "not found"}
	}

	s.tasks[idx].Status = status
	s.tasks[idx].UpdatedAt = time.Now().UTC()

	return s.tasks[idx], nil
}

func isAllowedStatus(status task.Status) bool {
	switch status {
	case task.StatusTodo, task.StatusInProgress, task.StatusBlocked, task.StatusReview, task.StatusDone, task.StatusCancelled:
		return true
	default:
		return false
	}
}
