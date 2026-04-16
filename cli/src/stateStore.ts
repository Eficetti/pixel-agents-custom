/**
 * File-backed StateStore for the CLI host. Stores key-value pairs as JSON,
 * writes atomically via .tmp + rename. Same pattern as layoutPersistence's
 * writeLayoutToFile.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import type { StateStore } from '../../core/src/interfaces.js';

export class FileStateStore implements StateStore {
  private data: Record<string, unknown> = {};

  constructor(private readonly filePath: string) {
    this.load();
  }

  private load(): void {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      this.data = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      this.data = {};
    }
  }

  get<T>(key: string, defaultValue: T): T {
    return (this.data[key] as T) ?? defaultValue;
  }

  async update(key: string, value: unknown): Promise<void> {
    this.data[key] = value;
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      await fs.promises.mkdir(dir, { recursive: true });
    }
    const tmp = this.filePath + '.tmp';
    await fs.promises.writeFile(tmp, JSON.stringify(this.data, null, 2));
    await fs.promises.rename(tmp, this.filePath);
  }
}
