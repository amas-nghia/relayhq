package project

type Status string

const (
	StatusActive   Status = "active"
	StatusPaused   Status = "paused"
	StatusArchived Status = "archived"
)

type Project struct {
	ID      string
	Name    string
	Summary string
	OwnerID string
	Status  Status
}
