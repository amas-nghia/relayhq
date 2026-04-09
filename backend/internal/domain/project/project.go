package project

import "time"

type Status string

const (
	StatusActive   Status = "active"
	StatusPaused   Status = "paused"
	StatusArchived Status = "archived"
)

type Project struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Summary   string    `json:"summary,omitempty"`
	Owner     string    `json:"owner"`
	Status    Status    `json:"status"`
	CreatedAt time.Time `json:"created_at"`
}
