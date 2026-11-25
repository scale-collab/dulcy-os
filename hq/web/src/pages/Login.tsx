import { useEffect, useState, type FormEvent } from 'react';
import { api, type User } from '../api';
import { Button, ErrorBox, Icon, Logo } from '../ui';

type Mode = 'signin' | 'signup' | 'sent';
const query = () => new URLSearchParams(window.location.hash.split('?')[1] ?? '');
const input = 'mt-1.5 w-full min-h-12 rounded-xl border border-line-strong bg-surface px-4 text-[16px] text-fg outline-none transition placeholder:text-faint focus:border-accent focus:ring-4 focus:ring-accent-soft';

function GoogleButton({ href, label }: { href: string; label: string }) {
  return (
    <>
      <div className="my-5 flex items-center gap-3 text-xs text-muted"><div className="h-px flex-1 bg-line" />or<div className="h-px flex-1 bg-line" /></div>
      <a href={href} className="flex min-h-12 w-full items-center justify-center gap-2.5 rounded-xl border border-line-strong bg-surface font-semibold text-fg transition hover:bg-hover">
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
        {label}
      </a>
    </>
  );
}

export default function Login({ onIn }: { onIn: (u: User) => void }) {
  const [mode, setMode] = useState<Mode>(() => (query().get('notice') ? 'sent' : query().get('mode') === 'signup' ? 'signup' : 'signin'));
  const [notice] = useState(() => query().get('notice') ?? '');
  const [google, setGoogle] = useState(false);
  useEffect(() => { api<{ google: boolean }>('/auth/config').then((r) => setGoogle(r.google)).catch(() => undefined); }, []);
  const go = (m: Mode) => { setMode(m); window.history.replaceState(null, '', `#/login${m === 'signup' ? '?mode=signup' : ''}`); };

  const heading = mode === 'signin' ? 'Sign in to Dulcy HQ' : mode === 'signup' ? 'Ask for a login' : 'Request sent';
  const sub = mode === 'signin' ? 'Decisions, to-dos and the team, in one place.' : mode === 'signup' ? 'Alex approves every new login.' : 'You can sign in once Alex approves it.';
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm anim-in">
        <div className="mb-8 text-center">
          <Logo className="mx-auto h-12 w-12" />
          <h1 className="mt-5 text-2xl font-bold tracking-tight">{heading}</h1>
          <p className="mt-1.5 text-sm text-muted">{sub}</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-pop">
          {mode === 'signin' && <SignIn onIn={onIn} google={google} />}
          {mode === 'signup' && <SignUp google={google} onSent={() => setMode('sent')} />}
          {mode === 'sent' && (
            <div role="status" className="flex flex-col items-center py-2 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-accent-soft text-accent-ink"><Icon name="check" size={28} strokeWidth={2.4} /></span>
              <p className="mt-4 text-[15px] font-medium text-fg">{notice || 'Request sent. Alex will approve it.'}</p>
              <p className="mt-1 text-sm text-muted">There is nothing else to do for now.</p>
            </div>
          )}
        </div>
        <p className="mt-5 text-center text-sm text-muted">
          {mode === 'signin'
            ? <>No login yet? <button onClick={() => go('signup')} className="min-h-11 px-1 font-semibold text-accent-ink underline-offset-2 hover:underline">Sign up</button></>
            : <>Have a login? <button onClick={() => go('signin')} className="min-h-11 px-1 font-semibold text-accent-ink underline-offset-2 hover:underline">Sign in</button></>}
        </p>
        <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-muted"><Icon name="lock" size={13} />Private. Approved logins only.</p>
      </div>
    </div>
  );
}

function SignIn({ onIn, google }: { onIn: (u: User) => void; google: boolean }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(() => query().get('error') ?? '');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try { onIn((await api<{ user: User }>('/auth/login', { body: { email, password } })).user); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); setPassword(''); }
  };
  return (
    <>
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-sm font-medium text-fg-2">Email<input className={input} type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="block text-sm font-medium text-fg-2">Password<input className={input} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {error && <ErrorBox error={error} />}
        <Button type="submit" tone="primary" size="lg" disabled={busy} className="w-full">{busy ? 'Signing in…' : 'Sign in'}</Button>
      </form>
      {google && <GoogleButton href="/hq/api/auth/google/start" label="Sign in with Google" />}
    </>
  );
}

function SignUp({ google, onSent }: { google: boolean; onSent: () => void }) {
  const [f, setF] = useState({ name: '', email: '', password: '', password2: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const short = f.password.length > 0 && f.password.length < 12;
  const differ = f.password2.length > 0 && f.password !== f.password2;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (f.password.length < 12) { setError('The password needs at least 12 characters.'); return; }
    if (f.password !== f.password2) { setError('The two passwords are not the same.'); return; }
    setBusy(true); setError('');
    try { await api('/auth/signup', { body: f }); setF({ name: '', email: '', password: '', password2: '' }); onSent(); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <label className="block text-sm font-medium text-fg-2">Name<input className={input} autoComplete="name" required maxLength={80} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label className="block text-sm font-medium text-fg-2">Email<input className={input} type="email" autoComplete="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
        <label className="block text-sm font-medium text-fg-2">Password
          <input className={input} type="password" autoComplete="new-password" required minLength={12} aria-describedby="pw-hint" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
          <span id="pw-hint" className={short ? 'mt-1 block text-xs text-warn' : 'mt-1 block text-xs text-muted'}>At least 12 characters.</span>
        </label>
        <label className="block text-sm font-medium text-fg-2">Password again
          <input className={input} type="password" autoComplete="new-password" required value={f.password2} onChange={(e) => setF({ ...f, password2: e.target.value })} />
          {differ && <span className="mt-1 block text-xs text-warn">Not the same as above.</span>}
        </label>
        {error && <ErrorBox error={error} />}
        <Button type="submit" tone="primary" size="lg" disabled={busy || !f.name || !f.email} className="w-full">{busy ? 'Sending…' : 'Ask for a login'}</Button>
      </form>
      {google && <GoogleButton href="/hq/api/auth/google/start?mode=signup" label="Sign up with Google" />}
    </>
  );
}
