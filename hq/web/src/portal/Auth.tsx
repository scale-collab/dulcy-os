// Portal sign-in, sign-up, forgot password and the one-time set-password link (portal.dulcy.io).
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { api, type User } from '../api';
import { Button, ErrorBox, Icon, Logo } from '../ui';
import { Done, inputCls } from './kit';

export type AuthMode = 'login' | 'signup' | 'forgot' | 'set-password';
const query = () => new URLSearchParams(window.location.hash.split('?')[1] ?? '');
const setHash = (h: string) => window.history.replaceState(null, '', `#/${h}`);

export default function Auth({ mode: start, onIn }: { mode: AuthMode; onIn: (u: User) => void }) {
  const [mode, setMode] = useState<AuthMode>(start);
  const [cfg, setCfg] = useState<{ google: boolean; portal: boolean }>({ google: false, portal: false });
  const [notice, setNotice] = useState(() => query().get('notice') ?? '');
  useEffect(() => { api<{ google: boolean; portal: boolean }>('/auth/config').then(setCfg).catch(() => undefined); }, []);
  const to = (m: AuthMode) => { setMode(m); setNotice(''); setHash(m); };
  const head: Record<AuthMode, [string, string]> = {
    login: ['Sign in to your portal', 'Your campaigns, leads and meetings with Dulcy.'],
    signup: ['Create your portal account', 'Your Dulcy team links it to your company.'],
    forgot: ['Forgot your password?', 'Your Dulcy team sends you a link to set a new one.'],
    'set-password': ['Set your password', 'Choose a password for your Dulcy portal.'],
  };
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm anim-in">
        <div className="mb-8 text-center">
          <Logo className="mx-auto h-12 w-12" />
          <h1 className="mt-5 text-2xl font-bold tracking-tight">{head[mode][0]}</h1>
          <p className="mt-1.5 text-sm text-muted">{head[mode][1]}</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-pop">
          {notice ? <Done title={notice} sub="There is nothing else to do for now." />
            : mode === 'login' ? <SignIn onIn={onIn} google={cfg.google && cfg.portal} onForgot={() => to('forgot')} />
              : mode === 'signup' ? <SignUp google={cfg.google && cfg.portal} onSent={setNotice} />
                : mode === 'forgot' ? <Forgot onSent={setNotice} />
                  : <SetPassword onIn={onIn} />}
        </div>
        <p className="mt-5 text-center text-sm text-muted">
          {mode === 'login'
            ? <>New here? <Link onClick={() => to('signup')}>Create an account</Link></>
            : <>Have an account? <Link onClick={() => to('login')}>Sign in</Link></>}
        </p>
        <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-muted"><Icon name="lock" size={13} />Private. You only ever see your own company.</p>
      </div>
    </div>
  );
}
const Link = ({ onClick, children }: { onClick: () => void; children: ReactNode }) => <button onClick={onClick} className="min-h-11 px-1 font-semibold text-accent-ink underline-offset-2 hover:underline">{children}</button>;

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

function SignIn({ onIn, google, onForgot }: { onIn: (u: User) => void; google: boolean; onForgot: () => void }) {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(() => query().get('error') ?? '');
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const r = await api<{ user?: User; redirect?: string }>('/auth/login', { body: { email, password } });
      if (r.redirect) { window.location.assign(r.redirect); return; } // a Dulcy team login: HQ
      if (r.user) onIn(r.user);
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); setPassword(''); }
  };
  return (
    <>
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-sm font-medium text-fg-2">Email<input className={inputCls} type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="block text-sm font-medium text-fg-2">Password<input className={inputCls} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {error && <ErrorBox error={error} />}
        <Button type="submit" tone="accent" size="lg" disabled={busy} className="w-full">{busy ? 'Signing in…' : 'Sign in'}</Button>
        <button type="button" onClick={onForgot} className="block min-h-10 w-full text-center text-sm font-medium text-muted hover:text-fg">Forgot your password?</button>
      </form>
      {google && <GoogleButton href="/hq/api/auth/google/start" label="Sign in with Google" />}
    </>
  );
}

function SignUp({ google, onSent }: { google: boolean; onSent: (m: string) => void }) {
  const [f, setF] = useState({ name: '', email: '', password: '', password2: '' });
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (f.password.length < 12) { setError('The password needs at least 12 characters.'); return; }
    if (f.password !== f.password2) { setError('The two passwords are not the same.'); return; }
    setBusy(true); setError('');
    try { const r = await api<{ message: string }>('/auth/signup', { body: f }); onSent(r.message); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };
  return (
    <>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <label className="block text-sm font-medium text-fg-2">Your name<input className={inputCls} autoComplete="name" required maxLength={80} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label className="block text-sm font-medium text-fg-2">Work email<input className={inputCls} type="email" autoComplete="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
        <label className="block text-sm font-medium text-fg-2">Password<input className={inputCls} type="password" autoComplete="new-password" required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /><span className="mt-1 block text-xs text-muted">At least 12 characters.</span></label>
        <label className="block text-sm font-medium text-fg-2">Password again<input className={inputCls} type="password" autoComplete="new-password" required value={f.password2} onChange={(e) => setF({ ...f, password2: e.target.value })} /></label>
        {error && <ErrorBox error={error} />}
        <Button type="submit" tone="accent" size="lg" disabled={busy || !f.name || !f.email} className="w-full">{busy ? 'Sending…' : 'Create account'}</Button>
      </form>
      {google && <GoogleButton href="/hq/api/auth/google/start?mode=signup" label="Continue with Google" />}
    </>
  );
}

function Forgot({ onSent }: { onSent: (m: string) => void }) {
  const [email, setEmail] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try { const r = await api<{ message: string }>('/auth/forgot', { body: { email } }); onSent(r.message); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block text-sm font-medium text-fg-2">Email<input className={inputCls} type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      {error && <ErrorBox error={error} />}
      <Button type="submit" tone="accent" size="lg" disabled={busy || !email} className="w-full">{busy ? 'Sending…' : 'Ask for a new password'}</Button>
    </form>
  );
}

function SetPassword({ onIn }: { onIn: (u: User) => void }) {
  const [token] = useState(() => query().get('t') ?? '');
  const [f, setF] = useState({ password: '', password2: '' }); const [busy, setBusy] = useState(false); const [error, setError] = useState(token ? '' : 'This link is not complete. Ask your Dulcy team for a new one.');
  // The token stays out of the address bar (and so out of history) once read.
  useEffect(() => { if (token) setHash('set-password'); }, [token]);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try { const r = await api<{ user: User }>('/auth/set-password', { body: { token, ...f } }); onIn(r.user); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block text-sm font-medium text-fg-2">New password<input className={inputCls} type="password" autoComplete="new-password" required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /><span className="mt-1 block text-xs text-muted">At least 12 characters.</span></label>
      <label className="block text-sm font-medium text-fg-2">New password again<input className={inputCls} type="password" autoComplete="new-password" required value={f.password2} onChange={(e) => setF({ ...f, password2: e.target.value })} /></label>
      {error && <ErrorBox error={error} />}
      <Button type="submit" tone="accent" size="lg" disabled={busy || !token || f.password.length < 12 || f.password !== f.password2} className="w-full">{busy ? 'Saving…' : 'Set password and sign in'}</Button>
    </form>
  );
}
