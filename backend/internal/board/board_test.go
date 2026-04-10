package board

import (
	"testing"
	"time"

	"github.com/amas-nghia/relayhq/backend/internal/domain/task"
)

func TestColumnForStatus(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name   string
		status task.Status
		want   ColumnKey
	}{
		{name: "todo", status: task.StatusTodo, want: ColumnTodo},
		{name: "doing", status: task.StatusInProgress, want: ColumnDoing},
		{name: "blocked", status: task.StatusBlocked, want: ColumnDoing},
		{name: "review", status: task.StatusReview, want: ColumnReview},
		{name: "done", status: task.StatusDone, want: ColumnDone},
		{name: "cancelled", status: task.StatusCancelled, want: ColumnDone},
		{name: "unknown", status: task.Status("legacy"), want: ColumnTodo},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if got := columnForStatus(tc.status); got != tc.want {
				t.Fatalf("columnForStatus(%q) = %q, want %q", tc.status, got, tc.want)
			}
		})
	}
}

func TestBuildGroupsTasksIntoColumns(t *testing.T) {
	t.Parallel()

	base := time.Date(2026, 4, 10, 4, 0, 0, 0, time.UTC)
	tasks := []task.Task{
		{ID: "1", ProjectID: "proj_1", Title: "Todo task", Status: task.StatusTodo, CreatedAt: base},
		{ID: "2", ProjectID: "proj_1", Title: "Doing task", Status: task.StatusInProgress, CreatedAt: base.Add(time.Minute)},
		{ID: "3", ProjectID: "proj_1", Title: "Blocked task", Status: task.StatusBlocked, CreatedAt: base.Add(2 * time.Minute)},
		{ID: "4", ProjectID: "proj_1", Title: "Review task", Status: task.StatusReview, CreatedAt: base.Add(3 * time.Minute)},
		{ID: "5", ProjectID: "proj_1", Title: "Done task", Status: task.StatusDone, CreatedAt: base.Add(4 * time.Minute)},
		{ID: "6", ProjectID: "proj_1", Title: "Cancelled task", Status: task.StatusCancelled, CreatedAt: base.Add(5 * time.Minute)},
		{ID: "7", ProjectID: "proj_1", Title: "Legacy task", Status: task.Status("legacy"), CreatedAt: base.Add(6 * time.Minute)},
	}

	board := Build("proj_1", tasks)

	if board.ProjectID != "proj_1" {
		t.Fatalf("project id = %q, want proj_1", board.ProjectID)
	}
	if len(board.Columns) != 4 {
		t.Fatalf("columns = %d, want 4", len(board.Columns))
	}

	assertColumn := func(index int, wantKey ColumnKey, wantCount int, wantTitles ...string) {
		t.Helper()
		col := board.Columns[index]
		if col.Key != wantKey {
			t.Fatalf("column[%d].key = %q, want %q", index, col.Key, wantKey)
		}
		if col.Count != wantCount {
			t.Fatalf("column[%d].count = %d, want %d", index, col.Count, wantCount)
		}
		if len(col.Tasks) != len(wantTitles) {
			t.Fatalf("column[%d].tasks = %d, want %d", index, len(col.Tasks), len(wantTitles))
		}
		for i, wantTitle := range wantTitles {
			if col.Tasks[i].Title != wantTitle {
				t.Fatalf("column[%d].tasks[%d].title = %q, want %q", index, i, col.Tasks[i].Title, wantTitle)
			}
		}
	}

	assertColumn(0, ColumnTodo, 2, "Todo task", "Legacy task")
	assertColumn(1, ColumnDoing, 2, "Doing task", "Blocked task")
	assertColumn(2, ColumnReview, 1, "Review task")
	assertColumn(3, ColumnDone, 2, "Done task", "Cancelled task")
}

func TestBuildCreatesEmptyColumns(t *testing.T) {
	t.Parallel()

	board := Build("proj_1", nil)
	if len(board.Columns) != 4 {
		t.Fatalf("columns = %d, want 4", len(board.Columns))
	}
	for _, col := range board.Columns {
		if col.Count != 0 || len(col.Tasks) != 0 {
			t.Fatalf("column %+v should be empty", col)
		}
	}
}
