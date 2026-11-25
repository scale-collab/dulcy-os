import { useEffect, useState, type FormEvent } from 'react';
import { api, type User } from '../api';
import { Button, ErrorBox, Icon, Logo } from '../ui';

export default function Login({ onIn }: { onIn: (u: User) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(() => new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('error') ?? '');
  const [google, setGoogle] = useState(false);
  useEffect(() => { api<{ google: boolean }>('/auth/config').then((r) => setGoogle(r.google)).catch(() => undefined); }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try { onIn((await api<{ user: User }>('/auth/login', { body: { email, password } })).user); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); setPassword(''); }
  };
  const input = 'mt-1.5 w-full min-h-12 rounded-xl border border-line-strong bg-surface px-4 text-[16px] text-fg outline-none transition placeholder:text-faint focus:border-accent focus:ring-4 focus:ring-accent-soft';
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm anim-in">
        <div className="mb-8 text-center">
          <Logo className="mx-auto h-12 w-12" />
          <h1 className="mt-5 text-2xl font-bold tracking-tight">Sign in to Dulcy HQ</h1>
          <p className="mt-1.5 text-sm text-muted">Decisions, to-dos and the team, in one place.</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-pop">
          <form onSubmit={submit} className="space-y-4">
            <label className="block text-sm font-medium text-fg-2">Email<input className={input} type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            <label className="block text-sm font-medium text-fg-2">Password<input className={input} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
            {error && <ErrorBox error={error} />}
            <Button type="submit" tone="primary" size="lg" disabled={busy} className="w-full">{busy ? 'Signing in…' : 'Sign in'}</Button>
          </form>
          {google && (
            <>
              <div className="my-5 flex items-center gap-3 text-xs text-muted"><div className="h-px flex-1 bg-line" />or<div className="h-px flex-1 bg-line" /></div>
              <a href="/hq/api/auth/google/start" className="flex min-h-12 w-full items-center justify-center gap-2.5 rounded-xl border border-line-strong bg-surface font-semibold text-fg transition hover:bg-hover">
                <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
                Sign in with Google
              </a>
            </>
          )}
        </div>
        <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-muted"><Icon name="lock" size={13} />Private. Invited logins only.</p>
      </div>
    </div>
  );
}
