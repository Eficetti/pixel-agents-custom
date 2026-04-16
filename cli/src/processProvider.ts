/**
 * CLI implementation of ProcessProvider — spawns Claude (or any command) as
 * a child process via node:child_process. Each CliAgentProcess owns one
 * subprocess and forwards exit events through onExit callbacks.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';

import type { AgentProcess, ProcessProvider } from '../../core/src/interfaces.js';

class CliAgentProcess implements AgentProcess {
  readonly id: string;
  readonly name: string;
  private readonly proc: ChildProcess;
  private _exited = false;
  private readonly exitCallbacks: Array<(code: number | undefined) => void> = [];

  get pid(): number | undefined {
    return this.proc.pid;
  }

  get exited(): boolean {
    return this._exited;
  }

  constructor(name: string, command: string, args: string[], cwd: string) {
    this.id = randomUUID();
    this.name = name;
    // shell:false so args aren't interpreted by a shell — safer and matches
    // VS Code's terminal dispatch where args are whitespace-separated literals.
    this.proc = spawn(command, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
    });
    this.proc.on('exit', (code) => {
      this._exited = true;
      for (const cb of this.exitCallbacks) cb(code ?? undefined);
    });
    this.proc.on('error', (err) => {
      console.error(`[pixel-agents] Child process "${name}" error:`, err);
    });
  }

  show(): void {
    // No terminal UI to focus in CLI mode; log a breadcrumb so ops can correlate.
    console.log(`[pixel-agents] Agent "${this.name}" (PID: ${this.pid ?? '?'})`);
  }

  kill(): void {
    if (!this._exited) {
      this.proc.kill('SIGTERM');
    }
  }

  onExit(callback: (code: number | undefined) => void): void {
    if (this._exited) {
      callback(undefined);
      return;
    }
    this.exitCallbacks.push(callback);
  }
}

/** ProcessProvider that spawns agents via child_process. */
export class CliProcessProvider implements ProcessProvider {
  private readonly processes = new Map<string, CliAgentProcess>();
  private activeId: string | undefined;
  private readonly activeChangedCallbacks: Array<(p: AgentProcess | undefined) => void> = [];

  spawn(name: string, command: string, args: string[], cwd: string): AgentProcess {
    const proc = new CliAgentProcess(name, command, args, cwd);
    this.processes.set(proc.id, proc);
    this.activeId = proc.id;
    for (const cb of this.activeChangedCallbacks) cb(proc);

    proc.onExit(() => {
      this.processes.delete(proc.id);
      if (this.activeId === proc.id) {
        this.activeId = undefined;
        for (const cb of this.activeChangedCallbacks) cb(undefined);
      }
    });

    return proc;
  }

  listAll(): AgentProcess[] {
    return [...this.processes.values()];
  }

  getActive(): AgentProcess | undefined {
    return this.activeId ? this.processes.get(this.activeId) : undefined;
  }

  onActiveChanged(callback: (process: AgentProcess | undefined) => void): void {
    this.activeChangedCallbacks.push(callback);
  }
}
