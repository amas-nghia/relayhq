package relayhqcli

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/amas-nghia/relayhq/backend/internal/board"
	"github.com/amas-nghia/relayhq/backend/internal/domain/project"
	"github.com/amas-nghia/relayhq/backend/internal/domain/task"
)

const defaultAPIBaseURL = "http://127.0.0.1:8081"

type ExitError struct {
	Code    int
	Message string
}

func (e ExitError) Error() string {
	return e.Message
}

type Client struct {
	baseURL    string
	httpClient *http.Client
}

func Run(ctx context.Context, args []string, stdout, stderr io.Writer) error {
	global := flag.NewFlagSet("relayhq", flag.ContinueOnError)
	global.SetOutput(stderr)
	global.Usage = func() {
		printRootUsage(stderr)
	}

	baseURL := global.String("base-url", envOrDefault("RELAYHQ_API_BASE_URL", defaultAPIBaseURL), "RelayHQ API base URL")
	if err := global.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return nil
		}
		return ExitError{Code: 2, Message: err.Error()}
	}

	remaining := global.Args()
	if len(remaining) == 0 {
		printRootUsage(stderr)
		return ExitError{Code: 2, Message: "missing command"}
	}

	client, err := newClient(*baseURL)
	if err != nil {
		return ExitError{Code: 2, Message: err.Error()}
	}

	switch remaining[0] {
	case "help", "-h", "--help":
		printRootUsage(stderr)
		return nil
	case "projects":
		return runProjects(ctx, client, remaining[1:], stdout, stderr)
	case "tasks":
		return runTasks(ctx, client, remaining[1:], stdout, stderr)
	case "board":
		return runBoard(ctx, client, remaining[1:], stdout, stderr)
	case "next":
		return runNext(ctx, client, remaining[1:], stdout, stderr)
	default:
		printRootUsage(stderr)
		return ExitError{Code: 2, Message: fmt.Sprintf("unknown command %q", remaining[0])}
	}
}

func newClient(baseURL string) (*Client, error) {
	baseURL = strings.TrimSpace(baseURL)
	if baseURL == "" {
		return nil, errors.New("base URL is required")
	}

	parsed, err := url.Parse(baseURL)
	if err != nil {
		return nil, fmt.Errorf("invalid base URL: %w", err)
	}
	if parsed.Scheme == "" || parsed.Host == "" {
		return nil, fmt.Errorf("invalid base URL: %q", baseURL)
	}

	return &Client{
		baseURL:    strings.TrimRight(parsed.String(), "/"),
		httpClient: &http.Client{Timeout: 10 * time.Second},
	}, nil
}

func runProjects(ctx context.Context, client *Client, args []string, stdout, stderr io.Writer) error {
	if len(args) == 0 || args[0] == "list" {
		if len(args) == 2 && (args[1] == "-h" || args[1] == "--help") {
			printProjectsUsage(stderr)
			return nil
		}
		if len(args) > 1 {
			return ExitError{Code: 2, Message: "projects list takes no extra arguments"}
		}
		return printProjects(ctx, client, stdout)
	}

	switch args[0] {
	case "create":
		return createProject(ctx, client, args[1:], stdout, stderr)
	case "help", "-h", "--help":
		printProjectsUsage(stderr)
		return nil
	default:
		printProjectsUsage(stderr)
		return ExitError{Code: 2, Message: fmt.Sprintf("unknown projects command %q", args[0])}
	}
}

func runTasks(ctx context.Context, client *Client, args []string, stdout, stderr io.Writer) error {
	if len(args) == 0 || args[0] == "list" {
		if len(args) == 2 && (args[1] == "-h" || args[1] == "--help") {
			printTasksUsage(stderr)
			return nil
		}
		rest := []string(nil)
		if len(args) > 1 {
			rest = args[1:]
		}
		return listTasks(ctx, client, rest, stdout, stderr)
	}

	switch args[0] {
	case "create":
		return createTask(ctx, client, args[1:], stdout, stderr)
	case "start":
		return updateTaskStatus(ctx, client, args[1:], task.StatusInProgress, stdout, stderr)
	case "block":
		return updateTaskStatus(ctx, client, args[1:], task.StatusBlocked, stdout, stderr)
	case "review":
		return updateTaskStatus(ctx, client, args[1:], task.StatusReview, stdout, stderr)
	case "done":
		return updateTaskStatus(ctx, client, args[1:], task.StatusDone, stdout, stderr)
	case "help", "-h", "--help":
		printTasksUsage(stderr)
		return nil
	default:
		printTasksUsage(stderr)
		return ExitError{Code: 2, Message: fmt.Sprintf("unknown tasks command %q", args[0])}
	}
}

func runBoard(ctx context.Context, client *Client, args []string, stdout, stderr io.Writer) error {
	if len(args) == 1 && (args[0] == "-h" || args[0] == "--help") {
		printBoardUsage(stderr)
		return nil
	}

	projectID, err := projectIDFromArgsOrEnv(args)
	if err != nil {
		return ExitError{Code: 2, Message: err.Error()}
	}
	if projectID == "" {
		return ExitError{Code: 2, Message: "project id is required; pass --project or set RELAYHQ_PROJECT_ID"}
	}

	boardData, err := fetchBoard(ctx, client, projectID)
	if err != nil {
		return err
	}

	printBoard(stdout, boardData)
	return nil
}

func runNext(ctx context.Context, client *Client, args []string, stdout, stderr io.Writer) error {
	if len(args) == 1 && (args[0] == "-h" || args[0] == "--help") {
		printNextUsage(stderr)
		return nil
	}

	projectID, err := projectIDFromArgsOrEnv(args)
	if err != nil {
		return ExitError{Code: 2, Message: err.Error()}
	}
	if projectID == "" {
		return ExitError{Code: 2, Message: "project id is required; pass --project or set RELAYHQ_PROJECT_ID"}
	}

	boardData, err := fetchBoard(ctx, client, projectID)
	if err != nil {
		return err
	}

	item, ok := nextTask(boardData)
	if !ok {
		return ExitError{Code: 1, Message: "no actionable tasks found"}
	}

	return writeJSON(stdout, item)
}

func printProjects(ctx context.Context, client *Client, stdout io.Writer) error {
	projects, err := client.listProjects(ctx)
	if err != nil {
		return err
	}

	fmt.Fprintln(stdout, "ID\tSTATUS\tOWNER\tNAME")
	for _, p := range projects {
		fmt.Fprintf(stdout, "%s\t%s\t%s\t%s\n", p.ID, p.Status, p.Owner, p.Name)
	}
	return nil
}

func createProject(ctx context.Context, client *Client, args []string, stdout, stderr io.Writer) error {
	fs := flag.NewFlagSet("projects create", flag.ContinueOnError)
	fs.SetOutput(stderr)
	fs.Usage = func() { printCreateProjectUsage(stderr) }

	name := fs.String("name", "", "project name")
	summary := fs.String("summary", "", "project summary")
	owner := fs.String("owner", envOrDefault("RELAYHQ_DEFAULT_OWNER", ""), "project owner")
	if err := fs.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return nil
		}
		return ExitError{Code: 2, Message: err.Error()}
	}

	if strings.TrimSpace(*name) == "" || strings.TrimSpace(*owner) == "" {
		printCreateProjectUsage(stderr)
		return ExitError{Code: 2, Message: "--name and --owner are required"}
	}
	if extra := fs.Args(); len(extra) != 0 {
		return ExitError{Code: 2, Message: fmt.Sprintf("unexpected arguments: %v", extra)}
	}

	created, err := client.createProject(ctx, projectCreateRequest{Name: *name, Summary: *summary, Owner: *owner})
	if err != nil {
		return err
	}

	return writeJSON(stdout, created)
}

func createTask(ctx context.Context, client *Client, args []string, stdout, stderr io.Writer) error {
	fs := flag.NewFlagSet("tasks create", flag.ContinueOnError)
	fs.SetOutput(stderr)
	fs.Usage = func() { printCreateTaskUsage(stderr) }

	projectID := fs.String("project", envOrDefault("RELAYHQ_PROJECT_ID", ""), "project id")
	title := fs.String("title", "", "task title")
	details := fs.String("details", "", "task details")
	status := fs.String("status", string(task.StatusTodo), "task status")
	if err := fs.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return nil
		}
		return ExitError{Code: 2, Message: err.Error()}
	}

	if strings.TrimSpace(*projectID) == "" || strings.TrimSpace(*title) == "" {
		printCreateTaskUsage(stderr)
		return ExitError{Code: 2, Message: "--project and --title are required"}
	}
	if extra := fs.Args(); len(extra) != 0 {
		return ExitError{Code: 2, Message: fmt.Sprintf("unexpected arguments: %v", extra)}
	}

	created, err := client.createTask(ctx, taskCreateRequest{
		ProjectID: *projectID,
		Title:     *title,
		Details:   *details,
		Status:    *status,
	})
	if err != nil {
		return err
	}

	return writeJSON(stdout, created)
}

func listTasks(ctx context.Context, client *Client, args []string, stdout, stderr io.Writer) error {
	if len(args) == 1 && (args[0] == "-h" || args[0] == "--help") {
		printTasksUsage(stderr)
		return nil
	}

	projectID, err := projectIDFromArgsOrEnv(args)
	if err != nil {
		return ExitError{Code: 2, Message: err.Error()}
	}
	if projectID == "" {
		return ExitError{Code: 2, Message: "project id is required; pass --project or set RELAYHQ_PROJECT_ID"}
	}

	tasks, err := client.listTasks(ctx, projectID)
	if err != nil {
		return err
	}

	fmt.Fprintln(stdout, "ID\tSTATUS\tTITLE")
	for _, item := range tasks {
		fmt.Fprintf(stdout, "%s\t%s\t%s\n", item.ID, item.Status, item.Title)
	}
	return nil
}

func updateTaskStatus(ctx context.Context, client *Client, args []string, status task.Status, stdout, stderr io.Writer) error {
	fs := flag.NewFlagSet("tasks status", flag.ContinueOnError)
	fs.SetOutput(stderr)
	fs.Usage = func() { printUpdateTaskUsage(stderr, status) }

	if err := fs.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return nil
		}
		return ExitError{Code: 2, Message: err.Error()}
	}
	if fs.NArg() != 1 {
		printUpdateTaskUsage(stderr, status)
		return ExitError{Code: 2, Message: "task id is required"}
	}

	updated, err := client.updateTaskStatus(ctx, fs.Arg(0), status)
	if err != nil {
		return err
	}

	return writeJSON(stdout, updated)
}

func fetchBoard(ctx context.Context, client *Client, projectID string) (board.Board, error) {
	boardData, err := client.getBoard(ctx, projectID)
	if err != nil {
		return board.Board{}, err
	}
	return boardData, nil
}

func nextTask(boardData board.Board) (task.Task, bool) {
	priority := []board.ColumnKey{board.ColumnTodo, board.ColumnDoing, board.ColumnReview, board.ColumnDone}
	for _, key := range priority[:3] {
		for _, col := range boardData.Columns {
			if col.Key == key && len(col.Tasks) > 0 {
				return col.Tasks[0], true
			}
		}
	}
	return task.Task{}, false
}

func printBoard(stdout io.Writer, boardData board.Board) {
	fmt.Fprintf(stdout, "Project %s\n", boardData.ProjectID)

	for _, col := range boardData.Columns {
		fmt.Fprintf(stdout, "\n%s (%d)\n", col.Title, col.Count)
		for _, item := range col.Tasks {
			fmt.Fprintf(stdout, "- %s [%s] %s\n", item.ID, item.Status, item.Title)
		}
	}
}

func writeJSON(stdout io.Writer, payload any) error {
	enc := json.NewEncoder(stdout)
	enc.SetIndent("", "  ")
	return enc.Encode(payload)
}

func printRootUsage(w io.Writer) {
	fmt.Fprintln(w, "Usage: relayhq [--base-url URL] <command>")
	fmt.Fprintln(w, "")
	fmt.Fprintln(w, "Commands:")
	fmt.Fprintln(w, "  projects list|create")
	fmt.Fprintln(w, "  tasks list|create|start|block|review|done")
	fmt.Fprintln(w, "  board")
	fmt.Fprintln(w, "  next")
	fmt.Fprintln(w, "")
	fmt.Fprintln(w, "Environment:")
	fmt.Fprintln(w, "  RELAYHQ_API_BASE_URL  API base URL")
	fmt.Fprintln(w, "  RELAYHQ_PROJECT_ID    Default project id")
	fmt.Fprintln(w, "  RELAYHQ_DEFAULT_OWNER Default project owner")
}

func printProjectsUsage(w io.Writer) {
	fmt.Fprintln(w, "Usage: relayhq projects list")
	fmt.Fprintln(w, "       relayhq projects create --name NAME --owner OWNER [--summary SUMMARY]")
}

func printTasksUsage(w io.Writer) {
	fmt.Fprintln(w, "Usage: relayhq tasks list --project PROJECT_ID")
	fmt.Fprintln(w, "       relayhq tasks create --project PROJECT_ID --title TITLE [--details DETAILS] [--status STATUS]")
	fmt.Fprintln(w, "       relayhq tasks start TASK_ID")
	fmt.Fprintln(w, "       relayhq tasks block TASK_ID")
	fmt.Fprintln(w, "       relayhq tasks review TASK_ID")
	fmt.Fprintln(w, "       relayhq tasks done TASK_ID")
}

func printBoardUsage(w io.Writer) {
	fmt.Fprintln(w, "Usage: relayhq board --project PROJECT_ID")
	fmt.Fprintln(w, "Environment: RELAYHQ_PROJECT_ID")
}

func printNextUsage(w io.Writer) {
	fmt.Fprintln(w, "Usage: relayhq next --project PROJECT_ID")
	fmt.Fprintln(w, "Environment: RELAYHQ_PROJECT_ID")
}

func printCreateProjectUsage(w io.Writer) {
	fmt.Fprintln(w, "Usage: relayhq projects create --name NAME --owner OWNER [--summary SUMMARY]")
}

func printCreateTaskUsage(w io.Writer) {
	fmt.Fprintln(w, "Usage: relayhq tasks create --project PROJECT_ID --title TITLE [--details DETAILS] [--status STATUS]")
}

func printUpdateTaskUsage(w io.Writer, status task.Status) {
	fmt.Fprintf(w, "Usage: relayhq tasks %s TASK_ID\n", status)
}

func envOrDefault(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}

	return fallback
}

func projectIDFromArgsOrEnv(args []string) (string, error) {
	if len(args) == 0 {
		return envOrDefault("RELAYHQ_PROJECT_ID", ""), nil
	}

	fs := flag.NewFlagSet("project", flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	projectID := fs.String("project", envOrDefault("RELAYHQ_PROJECT_ID", ""), "project id")
	fs.Usage = func() {}
	if err := fs.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return "", err
		}
		return "", err
	}
	if fs.NArg() != 0 {
		return "", fmt.Errorf("unexpected arguments: %v", fs.Args())
	}

	return *projectID, nil
}

type projectCreateRequest struct {
	Name    string `json:"name"`
	Summary string `json:"summary"`
	Owner   string `json:"owner"`
}

type taskCreateRequest struct {
	ProjectID string `json:"project_id"`
	Title     string `json:"title"`
	Details   string `json:"details"`
	Status    string `json:"status"`
}

func (c *Client) do(ctx context.Context, method, path string, reqBody any, respBody any) error {
	var body io.Reader
	if reqBody != nil {
		payload, err := json.Marshal(reqBody)
		if err != nil {
			return err
		}
		body = strings.NewReader(string(payload))
	}

	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, body)
	if err != nil {
		return err
	}
	if reqBody != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		return c.decodeAPIError(resp)
	}

	if respBody == nil {
		return nil
	}
	return json.NewDecoder(resp.Body).Decode(respBody)
}

func (c *Client) decodeAPIError(resp *http.Response) error {
	var payload struct {
		Error string `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err == nil && payload.Error != "" {
		return ExitError{Code: 1, Message: payload.Error}
	}
	return ExitError{Code: 1, Message: resp.Status}
}

func (c *Client) listProjects(ctx context.Context) ([]project.Project, error) {
	var payload []project.Project
	if err := c.do(ctx, http.MethodGet, "/api/v1/projects", nil, &payload); err != nil {
		return nil, err
	}
	return payload, nil
}

func (c *Client) createProject(ctx context.Context, req projectCreateRequest) (project.Project, error) {
	var payload project.Project
	if err := c.do(ctx, http.MethodPost, "/api/v1/projects", req, &payload); err != nil {
		return project.Project{}, err
	}
	return payload, nil
}

func (c *Client) listTasks(ctx context.Context, projectID string) ([]task.Task, error) {
	var payload []task.Task
	if err := c.do(ctx, http.MethodGet, "/api/v1/tasks?project_id="+url.QueryEscape(projectID), nil, &payload); err != nil {
		return nil, err
	}
	return payload, nil
}

func (c *Client) createTask(ctx context.Context, req taskCreateRequest) (task.Task, error) {
	var payload task.Task
	if err := c.do(ctx, http.MethodPost, "/api/v1/tasks", req, &payload); err != nil {
		return task.Task{}, err
	}
	return payload, nil
}

func (c *Client) updateTaskStatus(ctx context.Context, id string, status task.Status) (task.Task, error) {
	var payload task.Task
	if err := c.do(ctx, http.MethodPatch, "/api/v1/tasks/"+url.PathEscape(id)+"/status", map[string]string{"status": string(status)}, &payload); err != nil {
		return task.Task{}, err
	}
	return payload, nil
}

func (c *Client) getBoard(ctx context.Context, projectID string) (board.Board, error) {
	var payload board.Board
	if err := c.do(ctx, http.MethodGet, "/api/v1/boards?project_id="+url.QueryEscape(projectID), nil, &payload); err != nil {
		return board.Board{}, err
	}
	return payload, nil
}

func sortedKeys(m map[board.ColumnKey]int) []board.ColumnKey {
	keys := make([]board.ColumnKey, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Slice(keys, func(i, j int) bool { return keys[i] < keys[j] })
	return keys
}
