// Phone notifications (Web Push), Alex 2026-11-27. The Notifications screen (#/notifications): turn
// them on for this device (the permission request comes from the tap: iOS requires it), the four
// switches, a test, and this person's devices. Plus usePush(): registers the service worker
// (/hq/sw.js), keeps this device's push address fresh, tells the server which screen is open (so a
// chat answer you are looking at is not pushed), and opens the item when a notification is tapped.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, viewingAsMember, type User } from './api';
import { Button, Card, cx, ErrorBox, Icon, PageSkeleton, PageTitle, Pill, SectionHeader, showToast, timeAgo } from './ui';

const SW_URL = '/hq/sw.js';
const DEVICE_KEY = 'hq.pushDevice';
const SYNC_KEY = 'hq.pushSynced';
const ROUTE = /^#\/[A-Za-z0-9_\-./%?=&]*$/;

export type PushKind = 'decision' | 'agent' | 'urgent' | 'good';
export type PushSettings = Record<PushKind, boolean>;
interface Device { id: number; label: string; created: string; lastOk: string | null; failing: boolean }
interface SettingsData { settings: PushSettings; devices: Device[]; limits: { perMinute: number; perDay: number; groupMinutes: number }; role: string }

// ---------- browser helpers ----------
export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches === true || (navigator as unknown as { standalone?: boolean }).standalone === true;
const store = { get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* private window */ } } };

function keyBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
function sameKey(sub: PushSubscription, key: Uint8Array): boolean {
  const k = sub.options?.applicationServerKey;
  if (!k) return true; // the browser does not say: keep it
  const a = new Uint8Array(k);
  return a.length === key.length && a.every((x, i) => x === key[i]);
}
/** The service worker for the whole site (scope /: HQ runs at / on hq.dulcy.io and at /hq/). */
async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try { return await navigator.serviceWorker.register(SW_URL, { scope: '/' }); } catch { return null; }
}
/** This device's push address, made with the server's current key (an old key's address is replaced). */
async function subscribe(reg: ServiceWorkerRegistration, publicKey: string): Promise<PushSubscription> {
  const key = keyBytes(publicKey);
  const old = await reg.pushManager.getSubscription();
  if (old && sameKey(old, key)) return old;
  if (old) await old.unsubscribe().catch(() => false);
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
}
async function saveDevice(sub: PushSubscription): Promise<void> {
  const r = await api<{ id: number }>('/push/subscribe', { body: { subscription: sub.toJSON() } });
  store.set(DEVICE_KEY, String(r.id)); store.set(SYNC_KEY, String(Date.now()));
}

/**
 * App-wide (call once, before any early return): the service worker, this device's push address
 * kept fresh (twice a day at most), the open screen reported every 30 s while visible, and a tapped
 * notification moving an open HQ window to its item. route = null: not signed in (does nothing).
 */
export function usePush(route: string | null) {
  const on = route !== null;
  // Keep the push address fresh (permission given earlier on this device; no prompt here).
  useEffect(() => {
    if (!on || !pushSupported() || viewingAsMember() || Notification.permission !== 'granted') return;
    if (Date.now() - Number(store.get(SYNC_KEY) ?? 0) < 12 * 3600_000) return;
    void (async () => {
      const reg = await registration();
      if (!reg) return;
      try { const { publicKey } = await api<{ publicKey: string }>('/push/key'); await saveDevice(await subscribe(reg, publicKey)); } catch { /* next load tries again */ }
    })();
  }, [on]);
  // A tapped notification while HQ is open: go to the item.
  useEffect(() => {
    if (!on || !('serviceWorker' in navigator)) return;
    const onMsg = (e: MessageEvent) => { const d = e.data; if (d && d.type === 'hq:open' && typeof d.url === 'string' && ROUTE.test(d.url)) window.location.hash = d.url; };
    navigator.serviceWorker.addEventListener('message', onMsg);
    navigator.serviceWorker.startMessages?.();
    return () => navigator.serviceWorker.removeEventListener('message', onMsg);
  }, [on]);
  // Which screen is open (a chat answer you are looking at is not pushed).
  const last = useRef({ key: '', at: 0 });
  useEffect(() => {
    if (route === null || viewingAsMember()) return;
    const send = (visible: boolean, force: boolean) => {
      const key = `${route}|${visible}`;
      if (!force && key === last.current.key && Date.now() - last.current.at < 25_000) return;
      last.current = { key, at: Date.now() };
      fetch('/hq/api/push/presence', { method: 'POST', credentials: 'same-origin', keepalive: true, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ route, visible }) }).catch(() => undefined);
    };
    send(document.visibilityState === 'visible', true);
    const onVis = () => send(document.visibilityState === 'visible', true);
    const onHide = () => send(false, true);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onHide);
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') send(true, false); }, 30_000);
    return () => { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('pagehide', onHide); window.clearInterval(t); };
  }, [route]);
}

// ---------- the screen ----------
const KINDS: PushKind[] = ['decision', 'agent', 'urgent', 'good'];
const TEXT: Record<'owner' | 'member', Record<PushKind, { label: string; sub: string; icon: string }>> = {
  owner: {
    decision: { label: 'New decisions', sub: 'Each new card in Decisions. Several within 3 minutes come as one ("4 new decisions").', icon: 'inbox' },
    agent: { label: 'Agent messages to you', sub: 'A chat answer when you are not on that chat, and asks or tasks waiting on you.', icon: 'message' },
    urgent: { label: 'Urgent problems', sub: 'Bounce over 4% or a campaign paused, an inbox in spam, warm-up off, a failed run.', icon: 'alert' },
    good: { label: 'Good news', sub: 'A meeting booked, a client signed or paid.', icon: 'star' },
  },
  member: {
    decision: { label: 'New reply decisions', sub: 'Each new reply card waiting for an OK. Several within 3 minutes come as one.', icon: 'inbox' },
    agent: { label: 'Agent messages to you', sub: 'A chat answer when you are not on that chat, and asks for the team.', icon: 'message' },
    urgent: { label: 'Urgent problems', sub: 'These go to the owner.', icon: 'alert' },
    good: { label: 'Good news', sub: 'A meeting booked.', icon: 'star' },
  },
};

type DeviceState = 'checking' | 'unsupported' | 'install' | 'off' | 'on' | 'blocked';

export default function Notifications({ user }: { user: User }) {
  const role = user.role === 'owner' ? 'owner' : 'member';
  const readOnly = viewingAsMember();
  const [data, setData] = useState<SettingsData | null>(null);
  const [error, setError] = useState('');
  const [state, setState] = useState<DeviceState>('checking');
  const [busy, setBusy] = useState('');
  const reg = useRef<ServiceWorkerRegistration | null>(null);
  const key = useRef('');
  const myDevice = Number(store.get(DEVICE_KEY) ?? 0);

  const load = useCallback(() => { setError(''); api<SettingsData>('/push/settings').then(setData).catch((e) => setError(e.message)); }, []);
  useEffect(load, [load]);
  // Get everything ready before the tap, so the tap can ask for permission straight away (iOS).
  useEffect(() => {
    let live = true;
    void (async () => {
      if (!pushSupported()) { if (live) setState(isIos() && !isStandalone() ? 'install' : 'unsupported'); return; }
      if (isIos() && !isStandalone()) { if (live) setState('install'); return; }
      const [r, k] = await Promise.all([registration(), api<{ publicKey: string }>('/push/key').then((x) => x.publicKey).catch(() => '')]);
      reg.current = r; key.current = k;
      const sub = r ? await r.pushManager.getSubscription().catch(() => null) : null;
      if (!live) return;
      if (!r) { setState('unsupported'); return; }
      setState(Notification.permission === 'denied' ? 'blocked' : sub && Notification.permission === 'granted' ? 'on' : 'off');
    })();
    return () => { live = false; };
  }, []);

  const turnOn = async () => {
    setError(''); setBusy('on');
    try {
      // First thing on the tap: the permission prompt (iOS only shows it in answer to a tap).
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { setState(perm === 'denied' ? 'blocked' : 'off'); throw new Error(perm === 'denied' ? 'Notifications are blocked for HQ on this device. See below how to allow them.' : 'Notifications were not allowed. Tap again to try once more.'); }
      const r = reg.current ?? (await registration());
      if (!r) throw new Error('This browser cannot get notifications.');
      reg.current = r;
      if (!key.current) key.current = (await api<{ publicKey: string }>('/push/key')).publicKey;
      await saveDevice(await subscribe(r, key.current));
      setState('on'); load();
      showToast({ text: 'Notifications are on for this device.' });
    } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  };
  const turnOff = async () => {
    setError(''); setBusy('off');
    try {
      const sub = await reg.current?.pushManager.getSubscription();
      if (sub) { await api('/push/subscribe', { method: 'DELETE', body: { endpoint: sub.endpoint } }); await sub.unsubscribe().catch(() => false); }
      store.set(DEVICE_KEY, null); store.set(SYNC_KEY, null);
      setState('off'); load();
      showToast({ text: 'Notifications are off for this device.' });
    } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  };
  const test = async () => {
    setError(''); setBusy('test');
    try { const r = await api<{ sent: number; failed: number; removed: number }>('/push/test', { body: {} }); showToast({ text: r.sent ? `Test sent to ${r.sent} device${r.sent === 1 ? '' : 's'}. It should arrive in a few seconds.` : 'The test did not reach a device. Turn notifications off and on again.' }); load(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  };
  const flip = async (k: PushKind) => {
    if (!data) return;
    const next = !data.settings[k];
    setData({ ...data, settings: { ...data.settings, [k]: next } });
    try { const r = await api<{ settings: PushSettings }>('/push/settings', { method: 'PUT', body: { [k]: next } }); setData((d) => (d ? { ...d, settings: r.settings } : d)); }
    catch (e) { setError((e as Error).message); load(); }
  };
  const removeDevice = async (d: Device) => {
    setError('');
    try { await api(`/push/devices/${d.id}`, { method: 'DELETE', body: {} }); if (d.id === myDevice) { store.set(DEVICE_KEY, null); setState('off'); } load(); }
    catch (e) { setError((e as Error).message); }
  };

  const title = <PageTitle title="Notifications" kicker="Pings on your phone and computer" sub="HQ pings this device when something needs you. Slack pings stay as they are." />;
  if (error && !data) return <>{title}<ErrorBox error={error} retry={load} /></>;
  if (!data) return <>{title}<PageSkeleton kind="list" /></>;
  const text = TEXT[role];
  const kinds = KINDS.filter((k) => role === 'owner' || k !== 'urgent');

  return (
    <div className="mx-auto max-w-2xl">
      {title}
      {readOnly && <Card className="mb-4 border-warn/40 bg-warn-soft"><p className="text-sm text-fg">Viewing as a member: read only. Exit member view to change notifications.</p></Card>}
      {error && <div className="mb-4"><ErrorBox error={error} /></div>}

      <Card className="mb-5">
        <SectionHeader title="This device" icon="bell" right={<DevicePill state={state} />} />
        {state === 'install' && <InstallHint />}
        {state === 'unsupported' && <p className="text-sm text-muted">This browser cannot get notifications. On a computer, use Chrome, Edge or Safari. On iPhone, open HQ from its Home Screen icon.</p>}
        {state === 'blocked' && <BlockedHint />}
        {(state === 'off' || state === 'on' || state === 'blocked') && (
          <div className="mt-3 flex flex-wrap gap-2">
            {state !== 'on'
              ? <Button tone="accent" size="lg" icon="bell" onClick={turnOn} disabled={readOnly || busy !== ''}>{busy === 'on' ? 'Turning on…' : 'Turn on notifications on this device'}</Button>
              : <Button tone="quiet" icon="x" onClick={turnOff} disabled={readOnly || busy !== ''}>{busy === 'off' ? 'Turning off…' : 'Turn off on this device'}</Button>}
            <Button tone="quiet" icon="send" onClick={test} disabled={readOnly || busy !== '' || !data.devices.length}>{busy === 'test' ? 'Sending…' : 'Send a test'}</Button>
          </div>
        )}
        {state === 'checking' && <p className="text-sm text-muted">Checking this device…</p>}
      </Card>

      <Card className="mb-5 p-0">
        <div className="px-5 pt-5"><SectionHeader title="What pings you" icon="list" /></div>
        <ul className="divide-y divide-line">
          {kinds.map((k) => (
            <li key={k} className="flex items-center gap-3 px-5 py-3.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-line bg-sunken text-fg-2"><Icon name={text[k].icon} size={17} /></span>
              <div className="min-w-0 flex-1"><div className="text-[15px] font-medium text-fg">{text[k].label}</div><div className="text-sm text-muted">{text[k].sub}</div></div>
              <Switch on={data.settings[k]} label={text[k].label} onChange={() => flip(k)} disabled={readOnly} />
            </li>
          ))}
          {role === 'member' && <li className="px-5 py-3.5 text-sm text-muted">Urgent problems, money and the owner's own work go to the owner only.</li>}
        </ul>
        <p className="border-t border-line px-5 py-3 text-xs text-muted">Always on, no quiet hours. At most one ping a minute (more are grouped into one) and {data.limits.perDay} a day. Tapping a ping opens that item in HQ.</p>
      </Card>

      <Card className="p-0">
        <div className="px-5 pt-5"><SectionHeader title="Your devices" icon="monitor" right={<span className="text-sm text-muted">{data.devices.length}</span>} /></div>
        {!data.devices.length ? <p className="px-5 pb-5 text-sm text-muted">No device yet. Turn notifications on above, on each phone or computer you want pinged.</p> : (
          <ul className="divide-y divide-line">
            {data.devices.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-5 py-3">
                <Icon name={/iPhone|iPad|Android/.test(d.label) ? 'phone' : 'monitor'} size={18} className="shrink-0 text-muted" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-[15px] font-medium text-fg">{d.label}{d.id === myDevice && <Pill tone="accent">This device</Pill>}{d.failing && <Pill tone="warn">Last ping failed</Pill>}</div>
                  <div className="text-xs text-muted">Added {timeAgo(d.created)}{d.lastOk ? ` · last ping ${timeAgo(d.lastOk)}` : ' · no ping yet'}</div>
                </div>
                <Button tone="ghost" icon="x" onClick={() => removeDevice(d)} disabled={readOnly}>Remove</Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function DevicePill({ state }: { state: DeviceState }) {
  if (state === 'on') return <Pill tone="good" icon="check">On</Pill>;
  if (state === 'blocked') return <Pill tone="bad">Blocked</Pill>;
  if (state === 'install') return <Pill tone="warn">Add to Home Screen first</Pill>;
  if (state === 'unsupported') return <Pill>Not available</Pill>;
  if (state === 'checking') return <Pill>Checking</Pill>;
  return <Pill>Off</Pill>;
}

function InstallHint() {
  return (
    <div className="rounded-xl border border-warn/40 bg-warn-soft p-4 text-sm text-fg">
      <p className="font-semibold">On iPhone, notifications only work in the HQ app on your Home Screen.</p>
      <ol className="mt-2 list-decimal space-y-1 pl-5">
        <li>In Safari, tap Share (the square with the arrow).</li>
        <li>Tap Add to Home Screen, then Add.</li>
        <li>Open HQ from the new icon and come back to this screen (Notifications).</li>
      </ol>
      <p className="mt-2 text-muted">Added HQ before 27 Nov 2026? Delete that old icon first (press and hold it, Remove App), then add it again: only the new one can get notifications.</p>
    </div>
  );
}

function BlockedHint() {
  return (
    <div className="rounded-xl border border-bad-line bg-bad-soft p-4 text-sm text-fg">
      <p className="font-semibold">Notifications are blocked for HQ on this device.</p>
      <p className="mt-1">{isIos() ? 'iPhone: Settings → Notifications → HQ → Allow Notifications. Then come back and tap Turn on.' : 'Click the lock (or settings) icon left of the address, set Notifications to Allow, reload, then tap Turn on.'}</p>
    </div>
  );
}

function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: () => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onChange} disabled={disabled}
      className={cx("relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition before:absolute before:-inset-2 before:content-[''] disabled:opacity-45", on ? 'border-accent bg-accent' : 'border-line-strong bg-sunken')}>
      <span aria-hidden="true" className={cx('inline-block h-5 w-5 rounded-full bg-surface shadow-card transition', on ? 'translate-x-6' : 'translate-x-1')} />
    </button>
  );
}
