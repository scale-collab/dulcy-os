import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, type HqUserRow, type User, type UserEvent } from '../api';
import { Button, Card, cx, Empty, ErrorBox, Icon, Label, PageSkeleton, PageTitle, Pill, SectionHeader, setCount, timeAgo } from '../ui';

interface UsersData { users: HqUserRow[]; events: UserEvent[] }
export const field = 'min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-[16px] text-fg outline-none transition placeholder:text-faint focus:border-accent focus:ring-4 focus:ring-accent-soft';
const ACTION: Record<string, string> = { signup: 'asked for a login', approve: 'approved', deny: 'denied', role: 'changed the role of', disable: 'disabled', enable: 're-enabled', password: 'reset the password of', add: 'added' };

/** Users (owner only; the server refuses members with 403). */
export default function Users({ user }: { user: User }) {
  const [d, setD] = useState<UsersData | null>(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const load = useCallback(() => {
    setError('');
    api<UsersData>('/users').then((x) => { setD(x); setCount('signups', x.users.filter((u) => u.status === 'pending').length); }).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);
  const act = async (u: HqUserRow, action: string, body: Record<string, unknown> = {}) => {
    setError('');
    try { await api(`/users/${u.id}/${action}`, { body }); load(); return true; } catch (e) { setError((e as Error).message); return false; }
  };
  const title = <PageTitle title="Users" kicker="Who can sign in to HQ" sub="Members see everything except money and content." right={<Button tone="primary" icon="userPlus" onClick={() => setAdding((v) => !v)}>Add user</Button>} />;
  if (user.role !== 'owner') return <><PageTitle title="Users" /><ErrorBox error="Only the owner manages users." /></>;
  if (error && !d) return <>{title}<ErrorBox error={error} retry={load} /></>;
  if (!d) return <>{title}<PageSkeleton kind="list" /></>;
  const pending = d.users.filter((u) => u.status === 'pending');
  const others = d.users.filter((u) => u.status !== 'pending');
  const owners = others.filter((u) => u.role === 'owner' && u.status === 'active').length;
  return (
    <div>
      {title}
      {error && <div className="mb-4"><ErrorBox error={error} /></div>}
      {adding && <AddUser onDone={() => { setAdding(false); load(); }} />}

      <section className="mb-6">
        <SectionHeader title={`Sign-up requests · ${pending.length}`} icon="inbox" />
        {pending.length ? (
          <div className="grid gap-3 md:grid-cols-2">{pending.map((u) => <Request key={u.id} u={u} act={act} />)}</div>
        ) : <Card className="p-0"><Empty icon="check" tone="good" title="No requests" sub="People who sign up on the login page wait here for you." /></Card>}
      </section>

      <section className="mb-6">
        <SectionHeader title={`Logins · ${others.length}`} icon="users" />
        <Card className="divide-y divide-line p-0">
          {others.map((u) => <UserLine key={u.id} u={u} self={u.email === user.email} lastOwner={u.role === 'owner' && u.status === 'active' && owners <= 1} act={act} />)}
        </Card>
      </section>

      <section>
        <SectionHeader title="Log" icon="history" right={<span className="text-xs text-muted">last 30</span>} />
        <Card className="p-0">
          {d.events.length ? (
            <ul className="divide-y divide-line">
              {d.events.map((e) => (
                <li key={e.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-5 py-2.5 text-sm">
                  <span className="font-medium text-fg">{e.actor}</span><span className="text-fg-2">{ACTION[e.action] ?? e.action}</span><span className="font-medium text-fg">{e.target}</span>
                  {e.detail && <span className="text-muted">({e.detail})</span>}<span className="ml-auto text-xs text-muted">{timeAgo(e.created)}</span>
                </li>
              ))}
            </ul>
          ) : <div className="px-5 py-4 text-sm text-muted">Nothing yet.</div>}
        </Card>
      </section>
    </div>
  );
}

function Initial({ u }: { u: HqUserRow }) {
  return <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line bg-sunken text-sm font-semibold text-fg-2">{(u.name || u.email).slice(0, 1).toUpperCase()}</span>;
}

function Request({ u, act }: { u: HqUserRow; act: (u: HqUserRow, a: string, b?: Record<string, unknown>) => Promise<boolean> }) {
  const [role, setRole] = useState<'member' | 'owner'>('member');
  const [busy, setBusy] = useState(false);
  const run = async (a: string, b?: Record<string, unknown>) => { setBusy(true); await act(u, a, b); setBusy(false); };
  return (
    <Card className="anim-in">
      <div className="flex items-start gap-3">
        <Initial u={u} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-fg">{u.name}</div>
          <div className="truncate text-sm text-muted">{u.email}</div>
          <div className="mt-1 text-xs text-muted">asked {timeAgo(u.requested ?? u.created)} · {u.hasPassword ? 'password' : 'Google'}</div>
        </div>
        <Pill tone="warn">pending</Pill>
      </div>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div role="radiogroup" aria-label={`Role for ${u.name}`} className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-sunken p-1 sm:w-48">
          {(['member', 'owner'] as const).map((r) => (
            <button key={r} role="radio" aria-checked={role === r} onClick={() => setRole(r)} className={cx('min-h-9 rounded-lg text-sm font-medium capitalize transition', role === r ? 'bg-surface text-fg shadow-card' : 'text-muted hover:text-fg')}>{r}</button>
          ))}
        </div>
        <div className="grid flex-1 grid-cols-2 gap-2">
          <Button tone="danger" icon="x" disabled={busy} onClick={() => void run('deny')}>Deny</Button>
          <Button tone="accent" icon="check" disabled={busy} onClick={() => void run('approve', { role })}>Approve</Button>
        </div>
      </div>
      {role === 'owner' && <p className="mt-2 text-xs text-warn">Owners see money and content and can manage users.</p>}
    </Card>
  );
}

function UserLine({ u, self, lastOwner, act }: { u: HqUserRow; self: boolean; lastOwner: boolean; act: (u: HqUserRow, a: string, b?: Record<string, unknown>) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const locked = self || lastOwner;
  const run = async (a: string, b?: Record<string, unknown>) => { setBusy(true); const ok = await act(u, a, b); setBusy(false); return ok; };
  const reset = async (e: FormEvent) => { e.preventDefault(); if (await run('password', { password: pw })) { setPw(''); setOpen(false); } };
  return (
    <div className={cx('px-4 py-3 sm:px-5', u.status === 'disabled' && 'opacity-70')}>
      <div className="flex items-center gap-3">
        <Initial u={u} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate font-semibold text-fg">{u.name}</span>
            {self && <span className="text-xs text-muted">(you)</span>}
            <Pill tone={u.role === 'owner' ? 'accent' : 'plain'}>{u.role}</Pill>
            {u.status === 'disabled' && <Pill tone="bad">disabled</Pill>}
          </div>
          <div className="truncate text-sm text-muted">{u.email}</div>
          <div className="text-xs text-muted">{u.lastSeen ? `seen ${timeAgo(u.lastSeen)}` : 'never signed in'} · added {new Date(u.created).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}{u.hasPassword ? '' : ' · Google only'}</div>
        </div>
        <button onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={`Manage ${u.name}`} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-muted hover:bg-hover hover:text-fg">
          <Icon name="chevronDown" size={18} className={cx('transition', open && 'rotate-180')} />
        </button>
      </div>
      {open && (
        <div className="mt-3 space-y-3 rounded-xl border border-line bg-sunken p-3 anim-fade">
          {locked && <p className="text-xs text-muted">{self ? 'You cannot disable or demote yourself.' : 'The last owner cannot be disabled or demoted.'}</p>}
          <div className="grid grid-cols-2 gap-2">
            <Button disabled={busy || (u.role === 'owner' && locked)} onClick={() => void run('role', { role: u.role === 'owner' ? 'member' : 'owner' })}>{u.role === 'owner' ? 'Make member' : 'Make owner'}</Button>
            {u.status === 'disabled'
              ? <Button disabled={busy} onClick={() => void run('enable')}>Re-enable</Button>
              : <Button tone="danger" disabled={busy || locked} onClick={() => void run('disable')}>Disable</Button>}
          </div>
          <form onSubmit={reset} className="flex gap-2">
            <label className="sr-only" htmlFor={`pw-${u.id}`}>Temporary password for {u.name}</label>
            <input id={`pw-${u.id}`} className={cx(field, 'min-w-0 flex-1')} type="text" autoComplete="off" minLength={12} placeholder="Temporary password (12+)" value={pw} onChange={(e) => setPw(e.target.value)} />
            <Button type="submit" icon="key" disabled={busy || pw.length < 12}>Reset</Button>
          </form>
          <p className="text-xs text-muted">Disabling or a reset signs {self ? 'you' : u.name} out everywhere.</p>
        </div>
      )}
    </div>
  );
}

function AddUser({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ name: '', email: '', role: 'member', password: '', googleOnly: false });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try { await api('/users', { body: f.googleOnly ? { ...f, password: '' } : f }); onDone(); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };
  return (
    <Card className="mb-6 anim-in">
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Label>Add a user</Label></div>
        <label className="text-sm font-medium text-fg-2">Name<input className={cx(field, 'mt-1')} required maxLength={80} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label className="text-sm font-medium text-fg-2">Email<input className={cx(field, 'mt-1')} type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
        <label className="text-sm font-medium text-fg-2">Role
          <select className={cx(field, 'mt-1')} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}><option value="member">Member (no money or content)</option><option value="owner">Owner</option></select>
        </label>
        <label className="text-sm font-medium text-fg-2">Temporary password
          <input className={cx(field, 'mt-1')} type="text" autoComplete="off" minLength={12} disabled={f.googleOnly} placeholder={f.googleOnly ? 'Google sign-in only' : '12+ characters'} value={f.googleOnly ? '' : f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        </label>
        <label className="flex min-h-11 items-center gap-2.5 text-sm text-fg-2 sm:col-span-2"><input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked={f.googleOnly} onChange={(e) => setF({ ...f, googleOnly: e.target.checked })} />Google sign-in only (no password)</label>
        {error && <div className="sm:col-span-2"><ErrorBox error={error} /></div>}
        <div className="flex justify-end gap-2 sm:col-span-2"><Button onClick={onDone}>Cancel</Button><Button type="submit" tone="primary" disabled={busy}>Add user</Button></div>
      </form>
    </Card>
  );
}
