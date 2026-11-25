import { useEffect, useState, type FormEvent } from 'react';
import { api, type User } from '../api';
import { Button, ErrorBox } from '../ui';

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
  const input = 'mt-1.5 w-full min-h-12 rounded-xl border border-stone-300 bg-white px-4 text-[16px] outline-none focus:border-stone-500 dark:border-white/15 dark:bg-white/5 dark:focus:border-white/40';
  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <div className="mb-8">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-stone-900 font-bold text-emerald-200 dark:bg-white dark:text-stone-900">D</div>
        <h1 className="mt-5 text-2xl font-bold tracking-tight">Dulcy HQ</h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">Private. Sign in to see today.</p>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-sm font-medium">Email<input className={input} type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="block text-sm font-medium">Password<input className={input} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {error && <ErrorBox error={error} />}
        <Button type="submit" tone="primary" disabled={busy} className="w-full">{busy ? 'Signing in…' : 'Sign in'}</Button>
      </form>
      {google && (
        <>
          <div className="my-6 flex items-center gap-3 text-xs text-stone-400"><div className="h-px flex-1 bg-stone-200 dark:bg-white/10" />or<div className="h-px flex-1 bg-stone-200 dark:bg-white/10" /></div>
          <a href="/hq/api/auth/google/start" className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-stone-300 font-semibold hover:bg-stone-100 dark:border-white/15 dark:hover:bg-white/5">
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
            Sign in with Google
          </a>
        </>
      )}
    </div>
  );
}
