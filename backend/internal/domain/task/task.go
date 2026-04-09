package task

type Status string

const (
	StatusTodo       Status = "todo"
	StatusInProgress Status = "in_progress"
	StatusBlocked    Status = "blocked"
	StatusReview     Status = "review"
	StatusDone       Status = "done"
	StatusCancelled  Status = "cancelled"
)

type Task struct {
	ID        string
	ProjectID string
	Title     string
	Details   string
	Status    Status
}
