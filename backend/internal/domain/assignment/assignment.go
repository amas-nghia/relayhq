package assignment

type Kind string

const (
	KindHuman Kind = "human"
	KindAgent Kind = "agent"
)

type Assignment struct {
	ID        string
	TaskID    string
	ActorID   string
	ActorKind Kind
	Reason    string
}
