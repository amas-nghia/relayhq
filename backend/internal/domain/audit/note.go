package audit

type Note struct {
	ID        string
	ProjectID string
	TaskID    string
	AuthorID  string
	Body      string
	CreatedAt string
}
