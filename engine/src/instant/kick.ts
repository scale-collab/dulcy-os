// In-process loops that are not queue jobs (the Airtable bridge, the Decisions loop) start on events too.
// kick(name) runs the loop's tick now; while one is running, every kick in between becomes ONE more tick
// right after it (a burst of 10 Slack ✅ = at most 2 ticks). Not registered (tests, CLI) = nothing happens.
type Loop = { run: () => Promise<void>; busy: Promise<void> | null; again: boolean };
const loops = new Map<string, Loop>();

export function registerLoop(name: string, run: () => Promise<void>): void {
  loops.set(name, { run, busy: null, again: false });
}
export function unregisterLoop(name: string): void { loops.delete(name); }
export const loopRegistered = (name: string) => loops.has(name);

/** Run the loop's tick as soon as possible. Resolves when the tick (and any catch-up tick) is done; never throws. */
export function kick(name: string): Promise<void> {
  const l = loops.get(name);
  if (!l) return Promise.resolve();
  if (l.busy) { l.again = true; return l.busy; }
  const go = async (): Promise<void> => {
    try {
      do {
        l.again = false;
        try { await l.run(); } catch (e) { console.error(JSON.stringify({ level: 'error', message: `${name} tick failed`, err: String(e) })); }
      } while (l.again);
    } finally { l.busy = null; }
  };
  l.busy = go();
  return l.busy;
}
