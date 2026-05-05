import { spawn, type ChildProcess } from 'node:child_process';

export type AgentRunnerStatus = 'starting' | 'running' | 'handed-off' | 'completed' | 'failed' | 'stopped';
export const DEFAULT_RUNNER_STALE_AFTER_MS = 10 * 60 * 1000;

export interface AgentRunner {
  id: string;
  sessionId: string;
  agentName: string;
  taskId?: string;
  provider: string;
  runtimeKind: string;
  launchSurface: 'background' | 'visible-terminal';
  launchMode: 'fresh' | 'resume';
  resumedFromSessionId: string | null;
  status: AgentRunnerStatus;
  command: string;
  args: string[];
  cwd: string | null;
  pid?: number;
  startTime: string;
  lastEventAt: string;
  stopReason?: string | null;
}

export interface AgentRunnerSummary {
	id: string;
	sessionId: string;
	agentName: string;
	taskId?: string;
	provider: string;
	runtimeKind: string;
	launchSurface: 'background' | 'visible-terminal';
	launchMode: 'fresh' | 'resume';
	resumedFromSessionId: string | null;
	status: AgentRunnerStatus;
	command: string;
	cwd: string | null;
	pid?: number;
	startTime: string;
	lastEventAt: string;
}

export interface AgentRunnerInputResult {
	readonly success: boolean;
	readonly sessionId: string;
}

interface RunnerHooks {
	readonly onStdout?: (chunk: string) => void
	readonly onStderr?: (chunk: string) => void
	readonly onClose?: (code: number | null, signal: NodeJS.Signals | null) => void
	readonly onError?: (error: Error) => void
}

interface StartRunnerConfig extends RunnerHooks {
	sessionId?: string;
	agentName: string;
	taskId?: string;
	provider: string;
	prompt: string;
	initialInput?: string;
	command?: string;
	args?: string[];
	cwd?: string;
	env?: NodeJS.ProcessEnv;
	runtimeKind?: string;
	launchSurface?: 'background' | 'visible-terminal';
	launchMode?: 'fresh' | 'resume';
	resumedFromSessionId?: string | null;
}

function terminateProcessTree(process: ChildProcess, launchSurface: 'background' | 'visible-terminal') {
	if (launchSurface === 'background' && typeof process.pid === 'number' && process.pid > 0) {
		try {
			globalThis.process.kill(-process.pid, 'SIGKILL')
			return
		} catch {
			// Fall back to the direct child pid when the platform or process group does not support negative pid kills.
		}
	}

	process.kill('SIGKILL')
}

export function isRunnerSessionLive(
	info: Pick<AgentRunnerSummary, 'status' | 'lastEventAt'>,
	nowMs: number = Date.now(),
	staleAfterMs: number = DEFAULT_RUNNER_STALE_AFTER_MS,
) {
	if (info.status !== 'running' && info.status !== 'handed-off') return false
	const lastEventAtMs = Date.parse(info.lastEventAt)
	if (Number.isNaN(lastEventAtMs)) return false
	return nowMs - lastEventAtMs <= staleAfterMs
}

export function isRunnerSessionReusable(
	info: Pick<AgentRunnerSummary, 'status'>,
) {
	return info.status === 'running' || info.status === 'handed-off'
}

class RunnerManager {
  private runners: Map<string, { info: AgentRunner; process: ChildProcess }> = new Map();

  private toSummary(info: AgentRunner): AgentRunnerSummary {
    return {
      id: info.id,
      sessionId: info.sessionId,
      agentName: info.agentName,
      ...(info.taskId ? { taskId: info.taskId } : {}),
      provider: info.provider,
      runtimeKind: info.runtimeKind,
      launchSurface: info.launchSurface,
      launchMode: info.launchMode,
      resumedFromSessionId: info.resumedFromSessionId,
      status: info.status,
      command: info.command,
      cwd: info.cwd,
      ...(info.pid === undefined ? {} : { pid: info.pid }),
      startTime: info.startTime,
      lastEventAt: info.lastEventAt,
    }
  }

  startRunner(config: StartRunnerConfig) {
    const runnerId = config.sessionId ?? `runner-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    let command = config.command ?? config.provider;
    let args: string[] = [];

    if (config.args !== undefined) {
      args = [...config.args]
    } else if (config.provider === 'claude') {
      args = ['-p', config.prompt];
    } else if (config.provider === 'opencode') {
      args = ['run', config.prompt];
    } else if (config.provider === 'aider') {
      args = ['--message', config.prompt];
    } else if (config.provider === 'npx') {
      // Example npx fallback pattern
      args = ['-y', '@anthropic-ai/claude-cli', '-p', config.prompt];
    } else {
      args = ['--run', config.prompt];
    }

    const child = spawn(command, args, {
      stdio: 'pipe',
      shell: false,
      detached: (config.launchSurface ?? 'background') === 'background',
      ...(config.cwd ? { cwd: config.cwd } : {}),
      ...(config.env ? { env: config.env } : {}),
    });

    if (config.initialInput && config.initialInput.trim().length > 0) {
      child.stdin?.write(config.initialInput.endsWith('\n') ? config.initialInput : `${config.initialInput}\n`)
    }

    const nowIso = new Date().toISOString();

    const info: AgentRunner = {
      id: runnerId,
      sessionId: runnerId,
      agentName: config.agentName,
      taskId: config.taskId,
      provider: config.provider,
      runtimeKind: config.runtimeKind ?? config.provider,
      launchSurface: config.launchSurface ?? 'background',
      launchMode: config.launchMode ?? 'fresh',
      resumedFromSessionId: config.resumedFromSessionId ?? null,
      status: 'running',
      command,
      args,
      cwd: config.cwd ?? null,
      pid: child.pid,
      startTime: nowIso,
      lastEventAt: nowIso,
      stopReason: null,
    };

    this.runners.set(runnerId, { info, process: child });

    // Handle process lifecycle
    child.on('close', (code, signal) => {
      const entry = this.runners.get(runnerId);
      if (entry) {
        entry.info.status = entry.info.status === 'stopped'
          ? 'stopped'
          : entry.info.launchSurface === 'visible-terminal'
            ? 'handed-off'
            : code === 0 ? 'completed' : 'failed';
        entry.info.lastEventAt = new Date().toISOString();
      }
      config.onClose?.(code, signal)
    });

    child.on('error', (err) => {
      console.error(`Runner ${runnerId} failed to start:`, err);
      const entry = this.runners.get(runnerId);
      if (entry) {
        entry.info.status = 'failed';
        entry.info.lastEventAt = new Date().toISOString();
      }
      config.onError?.(err)
    });

    child.stdout?.on('data', (chunk) => {
      const entry = this.runners.get(runnerId);
      if (entry) {
        entry.info.lastEventAt = new Date().toISOString();
      }
      config.onStdout?.(chunk.toString())
    })
    child.stderr?.on('data', (chunk) => {
      const entry = this.runners.get(runnerId);
      if (entry) {
        entry.info.lastEventAt = new Date().toISOString();
      }
      config.onStderr?.(chunk.toString())
    })

    return info;
  }

  getRunners(): AgentRunnerSummary[] {
    return Array.from(this.runners.values()).map(r => this.toSummary(r.info)).sort((a, b) => b.startTime.localeCompare(a.startTime));
  }

  getRunner(id: string): AgentRunner | null {
    return this.runners.get(id)?.info ?? null
  }

  getAgentRunners(agentName: string): AgentRunnerSummary[] {
    return this.getRunners().filter((runner) => runner.agentName === agentName)
  }

  getReusableTaskRunner(agentName: string, taskId: string): AgentRunner | null {
    const runner = this.getRunners().find((entry) => (
      entry.agentName === agentName
      && entry.taskId === taskId
      && isRunnerSessionReusable(entry)
    ))
    if (!runner) return null
    return this.getRunner(runner.sessionId)
  }

  stopRunner(id: string, reason?: string) {
    const entry = this.runners.get(id);
    if (entry && entry.info.status === 'running') {
      entry.info.stopReason = reason ?? 'Session stopped by operator.'
      terminateProcessTree(entry.process, entry.info.launchSurface)
      entry.info.status = 'stopped';
      entry.info.lastEventAt = new Date().toISOString();
      return true;
    }
    return false;
  }

  sendInput(id: string, input: string): AgentRunnerInputResult | null {
    const entry = this.runners.get(id)
    if (!entry) return null
    if (entry.info.status !== 'running') return null
    if (!entry.process.stdin || entry.process.stdin.destroyed) return null

    entry.process.stdin.write(input.endsWith('\n') ? input : `${input}\n`)
    entry.info.lastEventAt = new Date().toISOString()
    return { success: true, sessionId: id }
  }
}

export const agentRunnerManager = new RunnerManager();
