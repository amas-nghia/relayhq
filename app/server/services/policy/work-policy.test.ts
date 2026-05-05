import { describe, expect, test } from "bun:test"

import { evaluateWorkPolicy } from "./work-policy"

const workerAgent = {
  id: "worker-1",
  aliases: [],
  role: "worker",
  roles: ["worker"],
}

const coordinatorAgent = {
  id: "coordinator-1",
  aliases: [],
  role: "coordinator",
  roles: ["coordinator"],
}

function readModel() {
  return {
    agents: [workerAgent, coordinatorAgent],
  } as never
}

function task(overrides: Record<string, unknown> = {}) {
  return {
    id: "task-1",
    status: "todo",
    assignee: "worker-1",
    approvalNeeded: false,
    approvalOutcome: "pending",
    tags: ["feature-implementation"],
    ...overrides,
  } as never
}

describe("work policy", () => {
  test("allows humans to assign normal implementation tasks to workers", () => {
    const decision = evaluateWorkPolicy({
      actorId: "human-user",
      action: "assign",
      readModel: readModel(),
      task: task(),
      assignee: workerAgent as never,
    })

    expect(decision.allowed).toBe(true)
  })

  test("covers the human, coordinator, and worker action matrix", () => {
    const normalTask = task()
    const coordinationTask = task({ assignee: "coordinator-1", tags: ["coordination", "orchestration", "project-coordinator"] })
    const cases = [
      { actorId: "human-user", action: "assign", task: normalTask, assignee: workerAgent, allowed: true },
      { actorId: "human-user", action: "execute", task: normalTask, allowed: false },
      { actorId: "human-user", action: "approve", task: normalTask, allowed: true },
      { actorId: "human-user", action: "finalize", task: normalTask, allowed: true },
      { actorId: "worker-1", action: "execute", task: normalTask, allowed: true },
      { actorId: "worker-1", action: "request-approval", task: normalTask, allowed: true },
      { actorId: "worker-1", action: "approve", task: normalTask, allowed: false },
      { actorId: "worker-1", action: "finalize", task: normalTask, allowed: false },
      { actorId: "coordinator-1", action: "execute", task: normalTask, allowed: false },
      { actorId: "coordinator-1", action: "execute", task: coordinationTask, allowed: true },
      { actorId: "coordinator-1", action: "auto-dispatch", task: coordinationTask, allowed: false },
      { actorId: "coordinator-1", action: "coordinate", task: null, allowed: true },
    ] as const

    for (const entry of cases) {
      const decision = evaluateWorkPolicy({
        actorId: entry.actorId,
        action: entry.action,
        readModel: readModel(),
        task: entry.task,
        assignee: "assignee" in entry ? entry.assignee as never : undefined,
      })

      expect(decision.allowed).toBe(entry.allowed)
    }
  })

  test("denies assigning normal implementation tasks to coordinators", () => {
    const decision = evaluateWorkPolicy({
      actorId: "human-user",
      action: "assign",
      readModel: readModel(),
      task: task(),
      assignee: coordinatorAgent as never,
    })

    expect(decision.allowed).toBe(false)
    expect(decision.statusCode).toBe(409)
    expect(decision.statusMessage).toContain("cannot be assigned")
    expect(decision.statusMessage).toContain("Assign a worker agent")
  })

  test("denies assigning normal implementation tasks to legacy coordinator ids", () => {
    const decision = evaluateWorkPolicy({
      actorId: "human-user",
      action: "assign",
      readModel: readModel(),
      task: task(),
      assigneeId: "agent-project-coordinator",
      assignee: null,
    })

    expect(decision.allowed).toBe(false)
    expect(decision.statusCode).toBe(409)
    expect(decision.statusMessage).toContain("Coordinator agent agent-project-coordinator cannot be assigned")
    expect(decision.statusMessage).toContain("Assign a worker agent")
  })

  test("allows assigning normal implementation tasks to unregistered legacy worker ids", () => {
    const decision = evaluateWorkPolicy({
      actorId: "human-user",
      action: "assign",
      readModel: readModel(),
      task: task(),
      assigneeId: "agent-backend-worker",
      assignee: null,
    })

    expect(decision.allowed).toBe(true)
  })

  test("allows coordinators to receive coordination-only tasks", () => {
    const decision = evaluateWorkPolicy({
      actorId: "human-user",
      action: "assign",
      readModel: readModel(),
      task: task({ tags: ["coordination", "orchestration", "project-coordinator"] }),
      assignee: coordinatorAgent as never,
    })

    expect(decision.allowed).toBe(true)
  })

  test("allows assigned workers to execute normal tasks", () => {
    const decision = evaluateWorkPolicy({
      actorId: "worker-1",
      action: "execute",
      readModel: readModel(),
      task: task(),
    })

    expect(decision.allowed).toBe(true)
  })

  test("denies workers executing tasks assigned to another agent", () => {
    const decision = evaluateWorkPolicy({
      actorId: "worker-1",
      action: "execute",
      readModel: readModel(),
      task: task({ assignee: "worker-2" }),
    })

    expect(decision.allowed).toBe(false)
    expect(decision.statusMessage).toContain("assigned to worker-2")
  })

  test("denies coordinators executing normal implementation tasks", () => {
    const decision = evaluateWorkPolicy({
      actorId: "coordinator-1",
      action: "execute",
      readModel: readModel(),
      task: task({ assignee: "coordinator-1" }),
    })

    expect(decision.allowed).toBe(false)
    expect(decision.statusCode).toBe(409)
    expect(decision.statusMessage).toContain("cannot receive or execute")
  })

  test("denies humans executing agent work", () => {
    const decision = evaluateWorkPolicy({
      actorId: "human-user",
      action: "execute",
      readModel: readModel(),
      task: task(),
    })

    expect(decision.allowed).toBe(false)
    expect(decision.statusCode).toBe(403)
    expect(decision.statusMessage).toContain("cannot execute")
  })

  test("denies unknown agent actors instead of treating them as humans", () => {
    const decision = evaluateWorkPolicy({
      actorId: "missing-agent",
      actorIntent: "agent",
      action: "execute",
      readModel: readModel(),
      task: task({ assignee: "missing-agent" }),
    })

    expect(decision.allowed).toBe(false)
    expect(decision.statusCode).toBe(404)
    expect(decision.statusMessage).toContain("Agent missing-agent was not found")
  })

  test("treats unregistered assigned worker ids as workers for agent lifecycle callbacks", () => {
    const execute = evaluateWorkPolicy({
      actorId: "coder",
      action: "execute",
      readModel: readModel(),
      task: task({ assignee: "coder" }),
    })
    const finalize = evaluateWorkPolicy({
      actorId: "coder",
      action: "finalize",
      readModel: readModel(),
      task: task({ assignee: "coder", status: "review" }),
    })

    expect(execute.allowed).toBe(true)
    expect(finalize.allowed).toBe(false)
    expect(finalize.statusMessage).toContain("Agent coder cannot finalize")
  })

  test("treats unregistered legacy agent ids as workers", () => {
    const decision = evaluateWorkPolicy({
      actorId: "agent-backend-dev",
      action: "execute",
      readModel: readModel(),
      task: task({ assignee: "agent-backend-dev" }),
    })

    expect(decision.allowed).toBe(true)
  })

  test("treats unregistered legacy coordinator ids as coordinators", () => {
    const decision = evaluateWorkPolicy({
      actorId: "agent-project-coordinator",
      action: "execute",
      readModel: readModel(),
      task: task({ assignee: "agent-project-coordinator" }),
    })

    expect(decision.allowed).toBe(false)
    expect(decision.statusMessage).toContain("cannot receive or execute")
  })

  test("denies coordinator auto-dispatch even for coordination tasks", () => {
    const decision = evaluateWorkPolicy({
      actorId: "coordinator-1",
      action: "auto-dispatch",
      readModel: readModel(),
      task: task({ assignee: "coordinator-1", tags: ["coordination", "orchestration", "project-coordinator"] }),
    })

    expect(decision.allowed).toBe(false)
    expect(decision.statusMessage).toContain("started on demand")
  })

  test("allows coordinators to manually execute coordination tasks", () => {
    const decision = evaluateWorkPolicy({
      actorId: "coordinator-1",
      action: "execute",
      readModel: readModel(),
      task: task({ assignee: "coordinator-1", tags: ["coordination", "orchestration", "project-coordinator"] }),
    })

    expect(decision.allowed).toBe(true)
  })

  test("denies workers finalizing done", () => {
    const decision = evaluateWorkPolicy({
      actorId: "worker-1",
      action: "finalize",
      readModel: readModel(),
      task: task({ status: "review" }),
    })

    expect(decision.allowed).toBe(false)
    expect(decision.statusCode).toBe(403)
    expect(decision.statusMessage).toContain("cannot finalize")
    expect(decision.statusMessage).toContain("human must mark it done")
  })

  test("allows humans to finalize done", () => {
    const decision = evaluateWorkPolicy({
      actorId: "human-user",
      action: "finalize",
      readModel: readModel(),
      task: task({ status: "review" }),
    })

    expect(decision.allowed).toBe(true)
  })

  test("denies human finalization while required approval is still pending", () => {
    const decision = evaluateWorkPolicy({
      actorId: "human-user",
      action: "finalize",
      readModel: readModel(),
      task: task({ status: "waiting-approval", approvalNeeded: true, approvalOutcome: "pending" }),
    })

    expect(decision.allowed).toBe(false)
    expect(decision.statusCode).toBe(409)
    expect(decision.statusMessage).toContain("requires human approval")
  })

  test("denies system actors finalizing done", () => {
    const decision = evaluateWorkPolicy({
      actorId: "@relayhq-web",
      action: "finalize",
      readModel: readModel(),
      task: task({ status: "review" }),
    })

    expect(decision.allowed).toBe(false)
    expect(decision.statusCode).toBe(403)
    expect(decision.statusMessage).toContain("System actor @relayhq-web cannot finalize")
  })

  test("denies workers approving or rejecting tasks", () => {
    const approval = evaluateWorkPolicy({ actorId: "worker-1", action: "approve", readModel: readModel(), task: task() })
    const rejection = evaluateWorkPolicy({ actorId: "worker-1", action: "reject", readModel: readModel(), task: task() })

    expect(approval.allowed).toBe(false)
    expect(approval.statusMessage).toContain("cannot approve")
    expect(rejection.allowed).toBe(false)
    expect(rejection.statusMessage).toContain("cannot reject")
  })

  test("allows workers to request approval but denies humans requesting agent approval", () => {
    const workerRequest = evaluateWorkPolicy({ actorId: "worker-1", action: "request-approval", readModel: readModel(), task: task() })
    const humanRequest = evaluateWorkPolicy({ actorId: "human-user", action: "request-approval", readModel: readModel(), task: task() })
    const systemRequest = evaluateWorkPolicy({ actorId: "@relayhq-dispatcher", action: "request-approval", readModel: readModel(), task: task() })

    expect(workerRequest.allowed).toBe(true)
    expect(humanRequest.allowed).toBe(false)
    expect(humanRequest.statusMessage).toContain("human approval path")
    expect(systemRequest.allowed).toBe(false)
    expect(systemRequest.statusMessage).toContain("worker agent must request approval")
  })

  test("denies human request-approval calls even when routed through an agent intent path", () => {
    const decision = evaluateWorkPolicy({
      actorId: "human-user",
      actorIntent: "agent",
      action: "request-approval",
      readModel: readModel(),
      task: task(),
    })

    expect(decision.allowed).toBe(false)
    expect(decision.statusCode).toBe(403)
    expect(decision.statusMessage).toContain("human approval path")
  })

  test("allows only coordinator agents to execute coordinator chat", () => {
    const coordinator = evaluateWorkPolicy({ actorId: "coordinator-1", actorIntent: "agent", action: "coordinate", readModel: readModel() })
    const worker = evaluateWorkPolicy({ actorId: "worker-1", actorIntent: "agent", action: "coordinate", readModel: readModel() })
    const human = evaluateWorkPolicy({ actorId: "human-user", action: "coordinate", readModel: readModel() })

    expect(coordinator.allowed).toBe(true)
    expect(worker.allowed).toBe(false)
    expect(worker.statusMessage).toContain("cannot execute coordinator chat")
    expect(human.allowed).toBe(false)
    expect(human.statusMessage).toContain("project chat UI")
  })

  test("allows humans to approve and reject tasks", () => {
    expect(evaluateWorkPolicy({ actorId: "human-user", action: "approve", readModel: readModel(), task: task() }).allowed).toBe(true)
    expect(evaluateWorkPolicy({ actorId: "human-user", action: "reject", readModel: readModel(), task: task() }).allowed).toBe(true)
  })

  test("denies system actors approving or rejecting tasks", () => {
    const approval = evaluateWorkPolicy({ actorId: "@relayhq-web", action: "approve", readModel: readModel(), task: task() })
    const rejection = evaluateWorkPolicy({ actorId: "@relayhq-web", action: "reject", readModel: readModel(), task: task() })

    expect(approval.allowed).toBe(false)
    expect(approval.statusMessage).toContain("System actor @relayhq-web cannot approve")
    expect(rejection.allowed).toBe(false)
    expect(rejection.statusMessage).toContain("System actor @relayhq-web cannot reject")
  })

  test("allows workers to stop only their own sessions", () => {
    const ownSession = evaluateWorkPolicy({ actorId: "worker-1", action: "stop", readModel: readModel(), sessionAgentId: "worker-1" })
    const otherSession = evaluateWorkPolicy({ actorId: "worker-1", action: "stop", readModel: readModel(), sessionAgentId: "coordinator-1" })

    expect(ownSession.allowed).toBe(true)
    expect(otherSession.allowed).toBe(false)
    expect(otherSession.statusMessage).toContain("Ask a human to stop it")
  })

  test("allows humans to stop any session", () => {
    expect(evaluateWorkPolicy({ actorId: "human-user", action: "stop", readModel: readModel(), sessionAgentId: "coordinator-1" }).allowed).toBe(true)
  })
})
