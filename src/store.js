import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

// Append-only JSON Lines log of contact submissions and SMS consent records.
export function createStore(dataDir) {
  const file = path.join(dataDir, 'submissions.jsonl');
  let queue = mkdir(dataDir, { recursive: true });

  return {
    file,
    // Writes are chained so concurrent requests never interleave lines.
    append(record) {
      const write = queue.then(() => appendFile(file, `${JSON.stringify(record)}\n`, 'utf8'));
      queue = write.catch(() => {});
      return write;
    },
    async readAll() {
      try {
        const raw = await readFile(file, 'utf8');
        return raw.split('\n').filter(Boolean).map((line) => JSON.parse(line));
      } catch (err) {
        if (err.code === 'ENOENT') return [];
        throw err;
      }
    },
  };
}
