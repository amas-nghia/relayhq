package approval

type Status string

const (
	StatusRequested Status = "requested"
	StatusApproved  Status = "approved"
	StatusRejected  Status = "rejected"
	StatusRevised   Status = "revised"
)

type Approval struct {
	ID      string
	TaskID  string
	Action  string
	Status  Status
	Reason  string
	ActorID string
}
