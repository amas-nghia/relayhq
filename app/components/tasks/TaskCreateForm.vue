<script setup lang="ts">
import { computed, ref, watch } from "vue";

interface TaskBoardOption {
  readonly id: string;
  readonly name: string;
}

interface TaskColumnOption {
  readonly id: string;
  readonly name: string;
  readonly boardId: string;
}

interface TaskCreateResponse {
  readonly taskId: string;
  readonly boardId: string;
  readonly sourcePath: string;
}

interface TaskCreateFormState {
  title: string;
  boardId: string;
  column: string;
  priority: string;
  assignee: string;
}

const props = defineProps<{
  readonly projectId: string;
  readonly projectName: string;
  readonly boards: ReadonlyArray<TaskBoardOption>;
  readonly columns: ReadonlyArray<TaskColumnOption>;
  readonly assignees: ReadonlyArray<string>;
  readonly initialBoardId?: string;
}>();

const emit = defineEmits<{
  created: [payload: TaskCreateResponse];
  cancel: [];
}>();

const isSubmitting = ref(false);
const errorMessage = ref<string | null>(null);
const successMessage = ref<string | null>(null);

function getDefaultBoardId(): string {
  if (props.initialBoardId !== undefined && props.boards.some((board) => board.id === props.initialBoardId)) {
    return props.initialBoardId;
  }

  return props.boards[0]?.id ?? "";
}

function createDefaultFormState(): TaskCreateFormState {
  return {
    title: "",
    boardId: getDefaultBoardId(),
    column: "",
    priority: "medium",
    assignee: props.assignees[0] ?? "",
  };
}

const form = ref<TaskCreateFormState>(createDefaultFormState());

const availableColumns = computed(() => props.columns.filter((column) => column.boardId === form.value.boardId));

watch(
  () => props.boards,
  (boards) => {
    if (boards.length === 0) {
      form.value.boardId = "";
      return;
    }

    if (!boards.some((board) => board.id === form.value.boardId)) {
      form.value.boardId = getDefaultBoardId();
    }
  },
  { immediate: true },
);

watch(
  () => props.initialBoardId,
  () => {
    form.value.boardId = getDefaultBoardId();
  },
);

watch(
  availableColumns,
  (columns) => {
    if (columns.length === 0) {
      form.value.column = "";
      return;
    }

    if (!columns.some((column) => column.id === form.value.column)) {
      form.value.column = columns[0]?.id ?? "";
    }
  },
  { immediate: true },
);

watch(
  () => props.assignees,
  (assignees) => {
    if (form.value.assignee.trim().length === 0 && assignees[0] !== undefined) {
      form.value.assignee = assignees[0];
    }
  },
  { immediate: true },
);

const isFormReady = computed(() => props.boards.length > 0 && availableColumns.value.length > 0);

function clearMessages(): void {
  errorMessage.value = null;
  successMessage.value = null;
}

function resetForm(): void {
  form.value = createDefaultFormState();
  clearMessages();
}

function handleCancel(): void {
  resetForm();
  emit("cancel");
}

async function submit(): Promise<void> {
  if (isSubmitting.value || !isFormReady.value) {
    return;
  }

  isSubmitting.value = true;
  clearMessages();

  try {
    const response = await $fetch<TaskCreateResponse>("/api/vault/tasks", {
      method: "POST",
      body: {
        title: form.value.title,
        projectId: props.projectId,
        boardId: form.value.boardId,
        column: form.value.column,
        priority: form.value.priority,
        assignee: form.value.assignee,
      },
    });

    resetForm();
    successMessage.value = `Created ${response.taskId} in the shared vault.`;
    emit("created", response);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "Task creation failed.";
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <section class="task-create-card" aria-labelledby="task-create-title">
    <div class="task-create-copy">
      <p class="section-kicker">Create task</p>
      <h2 id="task-create-title">Add a shared task record</h2>
      <p>
        This form writes a new canonical task file into <code>vault/shared/tasks</code> using the current
        project and board context.
      </p>
    </div>

    <p v-if="!isFormReady" class="task-create-empty">
      Seed at least one board and linked column in the shared vault before creating a task from this view.
    </p>

    <form v-else class="task-create-form" @submit.prevent="submit">
      <label class="field">
        <span>Project</span>
        <input :value="`${projectName} (${projectId})`" type="text" name="project" readonly />
      </label>

      <label class="field">
        <span>Title</span>
        <input v-model="form.title" type="text" name="title" maxlength="160" required />
      </label>

      <div class="field-grid">
        <label class="field">
          <span>Board</span>
          <select v-model="form.boardId" name="boardId" required>
            <option v-for="board in boards" :key="board.id" :value="board.id">{{ board.name }}</option>
          </select>
        </label>

        <label class="field">
          <span>Column</span>
          <select v-model="form.column" name="column" required>
            <option v-for="column in availableColumns" :key="column.id" :value="column.id">{{ column.name }}</option>
          </select>
        </label>
      </div>

      <div class="field-grid">
        <label class="field">
          <span>Priority</span>
          <select v-model="form.priority" name="priority" required>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </label>

        <label class="field">
          <span>Assignee</span>
          <input v-model="form.assignee" list="task-create-assignees" type="text" name="assignee" maxlength="80" required />
          <datalist id="task-create-assignees">
            <option v-for="assignee in assignees" :key="assignee" :value="assignee" />
          </datalist>
        </label>
      </div>

      <div class="task-create-actions">
        <button class="cancel-button" type="button" :disabled="isSubmitting" @click="handleCancel">
          Cancel
        </button>
        <button class="submit-button" type="submit" :disabled="isSubmitting">
          {{ isSubmitting ? "Creating…" : "Create task" }}
        </button>
        <p v-if="successMessage" class="message success" role="status">{{ successMessage }}</p>
        <p v-if="errorMessage" class="message error" role="alert">{{ errorMessage }}</p>
      </div>
    </form>
  </section>
</template>

<style scoped>
.task-create-card {
  display: grid;
  gap: 1rem;
  padding: 1.25rem;
  border: 1px solid rgba(148, 163, 184, 0.32);
  border-radius: 1.25rem;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 20px 48px rgba(15, 23, 42, 0.08);
}

.task-create-copy,
.task-create-form,
.field,
.task-create-actions {
  display: grid;
  gap: 0.75rem;
}

.section-kicker,
.field span {
  margin: 0;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #64748b;
}

.task-create-copy h2,
.submit-button {
  margin: 0;
  color: #0f172a;
}

.task-create-copy p,
.task-create-empty,
.message {
  margin: 0;
  color: #475569;
  line-height: 1.6;
}

code {
  padding: 0.1rem 0.35rem;
  border-radius: 0.4rem;
  background: rgba(15, 23, 42, 0.06);
  color: #312e81;
}

.field-grid {
  display: grid;
  gap: 0.75rem;
}

.task-create-actions {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: start;
}

.cancel-button,
.submit-button {
  width: 100%;
  min-height: 2.75rem;
  padding: 0.8rem 0.95rem;
  border-radius: 0.9rem;
  font-weight: 700;
}

.cancel-button {
  cursor: pointer;
  border: 1px solid rgba(203, 213, 225, 0.95);
  background: rgba(248, 250, 252, 0.95);
  color: #334155;
}

.field input,
.field select {
  width: 100%;
  min-height: 2.75rem;
  padding: 0.8rem 0.95rem;
  border: 1px solid rgba(203, 213, 225, 0.95);
  border-radius: 0.9rem;
  background: #ffffff;
  color: #0f172a;
}

.field input:focus,
.field select:focus,
.cancel-button:focus-visible,
.submit-button:focus-visible {
  outline: 2px solid rgba(124, 58, 237, 0.2);
  outline-offset: 2px;
}

.field input:focus,
.field select:focus {
  border-color: rgba(124, 58, 237, 0.45);
}

.submit-button {
  cursor: pointer;
  border: 1px solid transparent;
  background: linear-gradient(135deg, #7c3aed, #4f46e5);
  color: #ffffff;
}

.cancel-button:disabled,
.submit-button:disabled {
  cursor: wait;
  opacity: 0.72;
}

.message {
  grid-column: 1 / -1;
}

.message.success {
  color: #166534;
}

.message.error {
  color: #b91c1c;
}

@media (min-width: 768px) {
  .task-create-card {
    padding: 1.5rem;
  }

  .field-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .task-create-actions {
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
  }
}
</style>
