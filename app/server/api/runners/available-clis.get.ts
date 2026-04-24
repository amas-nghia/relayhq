import { defineEventHandler } from "h3";
import { execSync } from "node:child_process";

export interface AvailableCLI {
  id: string;
  name: string;
  command: string;
  installed: boolean;
  path?: string;
  description: string;
}

const KNOWN_CLIS = [
  { id: 'claude', name: 'Anthropic Claude CLI', command: 'claude', description: 'Official Anthropic CLI for Claude.' },
  { id: 'opencode', name: 'OpenCode Runner', command: 'opencode', description: 'Open-source code interpreting agent.' },
  { id: 'interpreter', name: 'Open Interpreter', command: 'interpreter', description: 'Open Interpreter agent that executes code.' },
  { id: 'aider', name: 'Aider AI', command: 'aider', description: 'AI pair programming in your terminal.' },
  { id: 'cline', name: 'Cline', command: 'cline', description: 'Autonomous coding agent.' },
  { id: 'ollama', name: 'Ollama Run', command: 'ollama', description: 'Local LLM runner.' },
  { id: 'npx', name: 'NPX (Node)', command: 'npx', description: 'Node package executor, useful to run remote agents.' }
];

export default defineEventHandler(() => {
  const results: AvailableCLI[] = [];

  for (const cli of KNOWN_CLIS) {
    try {
      // Use command -v to check if it exists in PATH
      const pathBuf = execSync(`command -v ${cli.command}`, { stdio: 'pipe' });
      const path = pathBuf.toString().trim();
      results.push({
        ...cli,
        installed: true,
        path: path.length > 0 ? path : undefined
      });
    } catch (e) {
      // command -v fails with exit code if not found
      results.push({
        ...cli,
        installed: false
      });
    }
  }

  return results;
});
