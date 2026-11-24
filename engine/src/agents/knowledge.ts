// The repo's knowledge files (mounted read-only into the container at KNOWLEDGE_DIR):
// skills, rules and one file per client. Read fresh each job, so a git pull updates them.
import fs from 'node:fs';
import path from 'node:path';

export function readKnowledge(dir: string, rel: string): string {
  try { return fs.readFileSync(path.join(dir, rel), 'utf8'); } catch { return ''; }
}

/** Client file for an EmailBison workspace ID (each file names its "workspace ID N"). */
export function clientFileFor(dir: string, workspaceId: number): { name: string; text: string } | null {
  let files: string[] = [];
  try { files = fs.readdirSync(path.join(dir, 'clients')).filter((f) => f.endsWith('.md') && !f.startsWith('_') && f !== 'INDEX.md'); } catch { return null; }
  for (const f of files) {
    const text = readKnowledge(dir, `clients/${f}`);
    const ids = [...text.matchAll(/workspace ID (\d+)/gi)].map((m) => Number(m[1]));
    if (ids.includes(workspaceId)) return { name: (/^#\s*(.+)$/m.exec(text)?.[1] ?? f.replace(/\.md$/, '')).trim(), text };
  }
  return null;
}
