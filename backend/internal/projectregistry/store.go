package projectregistry

import (
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/amas-nghia/relayhq/backend/internal/domain/project"
)

type Store struct {
	mu       sync.RWMutex
	seq      int
	projects []project.Project
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

func NewStore() *Store {
	return &Store{}
}

func (s *Store) Create(name, summary, owner string) (project.Project, error) {
	name = strings.TrimSpace(name)
	owner = strings.TrimSpace(owner)
	summary = strings.TrimSpace(summary)

	if name == "" {
		return project.Project{}, ValidationError{Field: "name", Msg: "is required"}
	}

	if owner == "" {
		return project.Project{}, ValidationError{Field: "owner", Msg: "is required"}
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	s.seq++
	p := project.Project{
		ID:        fmt.Sprintf("proj_%d", s.seq),
		Name:      name,
		Summary:   summary,
		Owner:     owner,
		Status:    project.StatusActive,
		CreatedAt: time.Now().UTC(),
	}

	s.projects = append(s.projects, p)

	return p, nil
}

func (s *Store) List() []project.Project {
	s.mu.RLock()
	defer s.mu.RUnlock()

	items := make([]project.Project, len(s.projects))
	copy(items, s.projects)

	return items
}

func (s *Store) Exists(id string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()

	for _, p := range s.projects {
		if p.ID == id {
			return true
		}
	}

	return false
}
