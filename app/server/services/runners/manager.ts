import { spawn, type ChildProcess } from 'node:child_process';

export interface AgentRunner {
  id: string;
  agentName: string;
  taskId?: string;
  provider: string;
  status: 'starting' | 'running' | 'completed' | 'failed';
  command: string;
  args: string[];
  pid?: number;
  startTime: Date;
}

class RunnerManager {
  private runners: Map<string, { info: AgentRunner; process: ChildProcess }> = new Map();

  startRunner(config: { agentName: string; taskId?: string; provider: string, prompt: string }) {
    const runnerId = `runner-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    let command = config.provider;
    let args: string[] = [];

    // Fallback logic for known CLIs
    if (config.provider === 'claude') {
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
      shell: true // helps with finding CLI tools installed globally
    });

    const info: AgentRunner = {
      id: runnerId,
      agentName: config.agentName,
      taskId: config.taskId,
      provider: config.provider,
      status: 'running',
      command,
      args,
      pid: child.pid,
      startTime: new Date()
    };

    this.runners.set(runnerId, { info, process: child });

    // Handle process lifecycle
    child.on('close', (code) => {
      const entry = this.runners.get(runnerId);
      if (entry) {
        entry.info.status = code === 0 ? 'completed' : 'failed';
      }
    });

    child.on('error', (err) => {
      console.error(`Runner ${runnerId} failed to start:`, err);
      const entry = this.runners.get(runnerId);
      if (entry) {
        entry.info.status = 'failed';
      }
    });

    return info;
  }

  getRunners(): AgentRunner[] {
    return Array.from(this.runners.values()).map(r => r.info).sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
  }

  stopRunner(id: string) {
    const entry = this.runners.get(id);
    if (entry && entry.info.status === 'running') {
      entry.process.kill('SIGKILL');
      entry.info.status = 'failed'; // forcefully stopped
      return true;
    }
    return false;
  }
}

export const agentRunnerManager = new RunnerManager();
