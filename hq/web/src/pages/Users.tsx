import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, type Client, type HqUserRow, type SoftrUser, type User, type UserEvent } from '../api';
import { Button, Card, cx, Empty, ErrorBox, Icon, Label, PageSkeleton, PageTitle, Pill, SectionHeader, setCount, timeAgo } from '../ui';

interface UsersData { users: HqUserRow[]; events: UserEvent[] }
export const field = 'min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-[16px] text-fg outline-none transition placeholder:text-faint focus:border-accent focus:ring-4 focus:ring-accent-soft';
const ACTION: Record<string, string> = { signup: 'asked for a login', 'portal signup': 'asked for a client portal account', approve: 'approved', deny: 'denied', role: 'changed the role of', disable: 'disabled', enable: 're-enabled', password: 'reset the password of', add: 'added', link: 'linked', 'setup link': 'made a setup link for', 'auto-link': 'was linked (Google) as', 'password set': 'set a password:', account: 'changed their account:' };

/** Users (owner only; the server refuses members with 403). */
export default function Users({ user }: { user: User }) {
  const [d, setD] = useState<UsersData | null>(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState<'' | 'user' | 'client'>('');
  const load = useCallback(() => {
    setError('');
    api<UsersData>('/users').then((x) => { setD(x); setCount('signups', x.users.filter((u) => u.status === 'pending').length); }).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);
  const act = async (u: HqUserRow, action: string, body: Record<string, unknown> = {}) => {
    setError('');
    try { await api(`/users/${u.id}/${action}`, { body }); load(); return true; } catch (e) { setError((e as Error).message); return false; }
  };
  const right = (
    <>
      <Button icon="briefcase" onClick={() => setAdding((v) => (v === 'client' ? '' : 'client'))}>Add client login</Button>
      <Button tone="primary" icon="userPlus" onClick={() => setAdding((v) => (v === 'user' ? '' : 'user'))}>Add user</Button>
    </>
  );
  const title = <PageTitle title="Users" kicker="Who can sign in to HQ" sub="Members see everything except money and content. A client login sees only its own results." right={right} />;
  if (user.role !== 'owner') return <><PageTitle title="Users" /><ErrorBox error="Only the owner manages users." /></>;
  if (error && !d) return <>{title}<ErrorBox error={error} retry={load} /></>;
  if (!d) return <>{title}<PageSkeleton kind="list" /></>;
  const portalReqs = d.users.filter((u) => u.status === 'pending' && u.portalRequest);
  const pending = d.users.filter((u) => u.status === 'pending' && !u.portalRequest);
  const others = d.users.filter((u) => u.status !== 'pending' && u.role !== 'client');
  const clients = d.users.filter((u) => u.status !== 'pending' && u.role === 'client');
  const owners = others.filter((u) => u.role === 'owner' && u.status === 'active').length;
  return (
    <div>
      {title}
      {error && <div className="mb-4"><ErrorBox error={error} /></div>}
      {adding === 'user' && <AddUser onDone={() => { setAdding(''); load(); }} />}
      {adding === 'client' && <AddClientLogin onDone={() => { setAdding(''); load(); }} />}

      <section className="mb-6">
        <SectionHeader title={`Client portal requests · ${portalReqs.length}`} icon="briefcase" />
        {portalReqs.length ? (
          <div className="grid gap-3 md:grid-cols-2">{portalReqs.map((u) => <PortalRequest key={u.id} u={u} act={act} />)}</div>
        ) : <Card className="p-0"><Empty icon="check" tone="good" title="No client portal requests" sub="People who create an account on the client portal wait here until you link them to their company." /></Card>}
      </section>

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

      <section className="mb-6">
        <SectionHeader title={`Client logins · ${clients.length}`} icon="briefcase" />
        <Card className="divide-y divide-line p-0">
          {clients.length
            ? clients.map((u) => <UserLine key={u.id} u={u} self={false} lastOwner={false} act={act} />)
            : <Empty icon="briefcase" title="No client logins yet" sub="Add one to let a client see their own results: leads, meetings and live campaigns. Never money, notes or other clients." />}
        </Card>
      </section>

      <SoftrUsers onChange={load} />

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

/** A client portal sign-up: link it to its company (Airtable Portal Users suggests one), or deny it. */
function PortalRequest({ u, act }: { u: HqUserRow; act: (u: HqUserRow, a: string, b?: Record<string, unknown>) => Promise<boolean> }) {
  const [clients, setClients] = useState<Client[] | null>(null);
  const [rec, setRec] = useState(u.suggest?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState(!u.suggest);
  useEffect(() => { if (pick && !clients) api<{ clients: Client[] }>('/clients?all=1').then((x) => setClients([...x.clients].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name)))).catch(() => setClients([])); }, [pick, clients]);
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
        <Pill tone="info">client portal</Pill>
      </div>
      {u.suggest && !pick && <p className="mt-3 text-sm text-fg-2">Airtable Portal Users links this email to <strong className="font-semibold text-fg">{u.suggest.name}</strong>. <button className="min-h-8 font-medium text-accent-ink underline-offset-2 hover:underline" onClick={() => setPick(true)}>Pick another</button></p>}
      {!u.suggest && <p className="mt-3 text-xs text-muted">No match in Airtable Portal Users. Check who they are before you link them.</p>}
      {pick && (
        <label className="mt-3 block text-sm font-medium text-fg-2">Company
          <select className={cx(field, 'mt-1')} value={rec} onChange={(e) => setRec(e.target.value)} disabled={!clients}>
            <option value="">{clients ? 'Pick the client' : 'Loading clients…'}</option>
            {clients?.map((c) => <option key={c.id} value={c.id}>{c.name}{c.active ? '' : ' (inactive)'}</option>)}
          </select>
        </label>
      )}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button tone="danger" icon="x" disabled={busy} onClick={() => void run('deny')}>Deny</Button>
        <Button tone="accent" icon="check" disabled={busy || !rec} onClick={() => void run('link', { clientRec: rec })}>{u.suggest && rec === u.suggest.id ? <><span className="sm:hidden">Link</span><span className="hidden truncate sm:inline">Link to {u.suggest.name}</span></> : 'Link'}</Button>
      </div>
    </Card>
  );
}

/** A one-time set-password link, shown once, to copy and send (HQ sends no email). */
function LinkBox({ url, expires }: { url: string; expires: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-2 rounded-xl border border-accent/40 bg-accent-soft p-3">
      <div className="text-xs font-medium text-fg-2">One-time link, valid until {new Date(expires).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}. Copy it and send it to them yourself.</div>
      <div className="flex gap-2">
        <input readOnly className={cx(field, 'min-w-0 flex-1 font-mono text-xs')} value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Setup link" />
        <Button icon={copied ? 'check' : 'link'} onClick={() => { void navigator.clipboard?.writeText(url).then(() => setCopied(true)).catch(() => undefined); }}>{copied ? 'Copied' : 'Copy'}</Button>
      </div>
    </div>
  );
}

/** The Softr portal's users (Airtable Portal Users): who to invite to the new portal. */
function SoftrUsers({ onChange }: { onChange: () => void }) {
  const [d, setD] = useState<{ users: SoftrUser[]; counts: { total: number; linked: number; activeClients: number; withLogin: number } } | null>(null);
  const [open, setOpen] = useState(false); const [all, setAll] = useState(false);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(''); const [links, setLinks] = useState<Record<string, { url: string; expires: string }>>({});
  const load = useCallback(() => { setError(''); api<NonNullable<typeof d>>('/users/softr').then(setD).catch((e) => setError(e.message)); }, []);
  useEffect(() => { if (open && !d) load(); }, [open, d, load]);
  const invite = async (s: SoftrUser) => {
    setBusy(s.rec); setError('');
    try {
      const r = await api<{ url: string; expires: string }>(s.hq === 'client' && s.hqId ? `/users/${s.hqId}/setup-link` : `/users/softr/${s.rec}/invite`, { body: {} });
      setLinks((x) => ({ ...x, [s.rec]: r })); load(); onChange();
    } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  };
  const rows = (d?.users ?? []).filter((u) => all || u.clientActive);
  return (
    <section className="mb-6">
      <SectionHeader title="Softr portal users" icon="users" right={<Button onClick={() => setOpen((v) => !v)}>{open ? 'Hide' : 'Show who to invite'}</Button>} />
      {open && (
        <Card className="p-0">
          {error && <div className="p-4"><ErrorBox error={error} /></div>}
          {!d ? <div className="p-5"><PageSkeleton kind="list" /></div> : (
            <>
              <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3 text-sm text-fg-2">
                <span>{d.counts.total} in Softr · {d.counts.activeClients} for active clients · {d.counts.withLogin} with a new portal login</span>
                <label className="ml-auto flex min-h-10 items-center gap-2"><input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked={all} onChange={(e) => setAll(e.target.checked)} />Show inactive clients too</label>
              </div>
              <p className="border-b border-line px-5 py-2 text-xs text-muted">Softr passwords cannot be moved. "Make login + link" creates their portal login (no password) and a one-time link to set one. Send it to them yourself.</p>
              <ul className="divide-y divide-line">
                {rows.map((s) => (
                  <li key={s.rec} className="px-5 py-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5"><span className="truncate font-semibold text-fg">{s.name}</span>{s.client ? <span className="text-xs font-medium text-fg-2">{s.client}</span> : <Pill tone="warn">no client</Pill>}{!s.clientActive && s.client && <Pill>inactive</Pill>}</div>
                        <div className="truncate text-sm text-muted">{s.email}{s.lastSeen ? ` · last in Softr ${timeAgo(s.lastSeen)}` : ''}</div>
                      </div>
                      {s.hq === 'other' ? <Pill>has an HQ login</Pill> : s.hq === 'pending' ? <Pill tone="info">asked on the portal</Pill>
                        : !s.client || s.client === 'More than one client' ? <span className="text-xs text-muted">Fix the client link in Airtable</span>
                          : <Button icon="link" disabled={busy === s.rec} onClick={() => void invite(s)}>{s.hq === 'client' ? 'New setup link' : 'Make login + link'}</Button>}
                    </div>
                    {links[s.rec] && <div className="mt-2"><LinkBox url={links[s.rec].url} expires={links[s.rec].expires} /></div>}
                  </li>
                ))}
                {!rows.length && <li className="px-5 py-4 text-sm text-muted">No Softr users{all ? '' : ' for active clients'}.</li>}
              </ul>
            </>
          )}
        </Card>
      )}
    </section>
  );
}

function UserLine({ u, self, lastOwner, act }: { u: HqUserRow; self: boolean; lastOwner: boolean; act: (u: HqUserRow, a: string, b?: Record<string, unknown>) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState<{ url: string; expires: string } | null>(null);
  const [linkError, setLinkError] = useState('');
  const makeLink = async () => { setLinkError(''); try { setLink(await api<{ url: string; expires: string }>(`/users/${u.id}/setup-link`, { body: {} })); } catch (e) { setLinkError((e as Error).message); } };
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
            <Pill tone={u.role === 'owner' ? 'accent' : u.role === 'client' ? 'info' : 'plain'}>{u.role}</Pill>
            {u.role === 'client' && u.clientName && <span className="truncate text-xs font-medium text-fg-2">{u.clientName}</span>}
            {u.status === 'disabled' && <Pill tone="bad">disabled</Pill>}
            {u.resetAsked && <Pill tone="warn">asked for a new password</Pill>}
          </div>
          <div className="truncate text-sm text-muted">{u.email}</div>
          <div className="text-xs text-muted">{u.lastSeen ? `seen ${timeAgo(u.lastSeen)}` : 'never signed in'} · added {new Date(u.created).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}{u.hasPassword ? '' : ' · Google only'}</div>
        </div>
        {u.resetAsked && !open && <Button tone="accent" icon="link" onClick={() => { setOpen(true); void makeLink(); }}>Send link</Button>}
        <button onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={`Manage ${u.name}`} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-muted hover:bg-hover hover:text-fg">
          <Icon name="chevronDown" size={18} className={cx('transition', open && 'rotate-180')} />
        </button>
      </div>
      {open && (
        <div className="mt-3 space-y-3 rounded-xl border border-line bg-sunken p-3 anim-fade">
          {locked && <p className="text-xs text-muted">{self ? 'You cannot disable or demote yourself.' : 'The last owner cannot be disabled or demoted.'}</p>}
          <div className="grid grid-cols-2 gap-2">
            {u.role === 'client'
              ? <p className="self-center text-xs text-muted">Sees only {u.clientName || 'their client'}'s portal.</p>
              : <Button disabled={busy || (u.role === 'owner' && locked)} onClick={() => void run('role', { role: u.role === 'owner' ? 'member' : 'owner' })}>{u.role === 'owner' ? 'Make member' : 'Make owner'}</Button>}
            {u.status === 'disabled'
              ? <Button disabled={busy} onClick={() => void run('enable')}>Re-enable</Button>
              : <Button tone="danger" disabled={busy || locked} onClick={() => void run('disable')}>Disable</Button>}
          </div>
          {u.role === 'client' && u.status === 'active' && (
            <div className="space-y-2">
              <Button icon="link" onClick={() => void makeLink()} className="w-full">{u.resetAsked ? 'Make a new-password link' : 'Make a setup / reset link'}</Button>
              {linkError && <ErrorBox error={linkError} />}
              {link && <LinkBox url={link.url} expires={link.expires} />}
            </div>
          )}
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

/** Add client login: a client from Airtable, a name and email, a temporary password or Google only. */
function AddClientLogin({ onDone }: { onDone: () => void }) {
  const [clients, setClients] = useState<Client[] | null>(null);
  const [f, setF] = useState({ clientRec: '', name: '', email: '', password: '', googleOnly: false });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<{ clients: Client[] }>('/clients?all=1')
      .then((x) => setClients([...x.clients].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name))))
      .catch((e) => setError(e.message));
  }, []);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try { await api('/users', { body: { ...f, role: 'client', password: f.googleOnly ? '' : f.password } }); onDone(); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };
  return (
    <Card className="mb-6 anim-in">
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label>Add a client login</Label>
          <p className="mt-1 text-sm text-muted">They sign in at the same address and see only their own results: leads, meetings and live campaigns. Never money, notes, drafts or other clients.</p>
        </div>
        <label className="text-sm font-medium text-fg-2 sm:col-span-2">Client
          <select className={cx(field, 'mt-1')} required value={f.clientRec} onChange={(e) => setF({ ...f, clientRec: e.target.value })} disabled={!clients}>
            <option value="">{clients ? 'Pick a client' : 'Loading clients…'}</option>
            {clients?.map((c) => <option key={c.id} value={c.id}>{c.name}{c.active ? '' : ' (inactive)'}{c.internal ? ' (Dulcy)' : ''}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-fg-2">Their name<input className={cx(field, 'mt-1')} required maxLength={80} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label className="text-sm font-medium text-fg-2">Their email<input className={cx(field, 'mt-1')} type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
        <label className="text-sm font-medium text-fg-2 sm:col-span-2">Temporary password
          <input className={cx(field, 'mt-1')} type="text" autoComplete="off" minLength={12} disabled={f.googleOnly} placeholder={f.googleOnly ? 'Google sign-in only' : '12+ characters; send it to them yourself'} value={f.googleOnly ? '' : f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        </label>
        <label className="flex min-h-11 items-center gap-2.5 text-sm text-fg-2 sm:col-span-2"><input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked={f.googleOnly} onChange={(e) => setF({ ...f, googleOnly: e.target.checked })} />Google sign-in only (no password)</label>
        {error && <div className="sm:col-span-2"><ErrorBox error={error} /></div>}
        <div className="flex justify-end gap-2 sm:col-span-2"><Button onClick={onDone}>Cancel</Button><Button type="submit" tone="primary" disabled={busy || !f.clientRec}>Add client login</Button></div>
      </form>
    </Card>
  );
}
