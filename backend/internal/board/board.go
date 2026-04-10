package board

import (
	"sort"

	"github.com/amas-nghia/relayhq/backend/internal/domain/task"
)

type ColumnKey string

const (
	ColumnTodo   ColumnKey = "todo"
	ColumnDoing  ColumnKey = "doing"
	ColumnReview ColumnKey = "review"
	ColumnDone   ColumnKey = "done"
)

type Column struct {
	Key   ColumnKey   `json:"key"`
	Title string      `json:"title"`
	Count int         `json:"count"`
	Tasks []task.Task `json:"tasks"`
}

type Board struct {
	ProjectID string   `json:"project_id"`
	Columns   []Column `json:"columns"`
}

func Build(projectID string, tasks []task.Task) Board {
	columns := []Column{
		{Key: ColumnTodo, Title: "Todo"},
		{Key: ColumnDoing, Title: "Doing"},
		{Key: ColumnReview, Title: "Review"},
		{Key: ColumnDone, Title: "Done"},
	}

	index := map[ColumnKey]int{
		ColumnTodo:   0,
		ColumnDoing:  1,
		ColumnReview: 2,
		ColumnDone:   3,
	}

	for _, item := range tasks {
		key := columnForStatus(item.Status)
		col := &columns[index[key]]
		col.Tasks = append(col.Tasks, item)
		col.Count++
	}

	for i := range columns {
		columns[i].Tasks = sortTasks(columns[i].Tasks)
	}

	return Board{ProjectID: projectID, Columns: columns}
}

func columnForStatus(status task.Status) ColumnKey {
	switch status {
	case task.StatusTodo:
		return ColumnTodo
	case task.StatusInProgress, task.StatusBlocked:
		return ColumnDoing
	case task.StatusReview:
		return ColumnReview
	case task.StatusDone, task.StatusCancelled:
		return ColumnDone
	default:
		return ColumnTodo
	}
}

func sortTasks(tasks []task.Task) []task.Task {
	if len(tasks) < 2 {
		return tasks
	}

	sorted := make([]task.Task, len(tasks))
	copy(sorted, tasks)
	sort.SliceStable(sorted, func(i, j int) bool {
		if sorted[i].CreatedAt.Equal(sorted[j].CreatedAt) {
			return sorted[i].ID < sorted[j].ID
		}
		return sorted[i].CreatedAt.Before(sorted[j].CreatedAt)
	})

	return sorted
}
