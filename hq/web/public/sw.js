// Dulcy HQ service worker: phone notifications only (Web Push). No caching, no fetch handler: every
// screen still loads fresh from the server. Served at /hq/sw.js with scope "/" (the engine sends
// Service-Worker-Allowed: /), so it works for HQ at hq.dulcy.io/ and at /hq/.
// A tap opens the exact item: the push carries an HQ route (#/decisions/<id>, #/chat/<agent>/<id>, ...).
const APP = new URL('./', self.location.href).href; // https://host/hq/
const ROUTE = /^#\/[A-Za-z0-9_\-./%?=&]*$/;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { title: 'Dulcy HQ', body: event.data ? event.data.text() : '' }; }
  const title = String(d.title || 'Dulcy HQ').slice(0, 120);
  const url = typeof d.url === 'string' && ROUTE.test(d.url) ? d.url : '#/today';
  // Every push shows a notification (iOS and Chrome require it).
  event.waitUntil(self.registration.showNotification(title, {
    body: String(d.body || '').slice(0, 300),
    tag: typeof d.tag === 'string' && d.tag ? d.tag.slice(0, 64) : undefined,
    renotify: Boolean(d.tag),
    icon: `${APP}apple-touch-icon.png`,
    badge: `${APP}favicon.png`,
    timestamp: Number(d.ts) || Date.now(),
    data: { url },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const hash = (event.notification.data && ROUTE.test(event.notification.data.url)) ? event.notification.data.url : '#/today';
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const hq = wins.find((w) => { try { const u = new URL(w.url); return u.origin === self.location.origin && !u.pathname.startsWith('/hq/api/'); } catch { return false; } });
    if (hq) {
      // An HQ window is open: bring it up and move it to the item (the page listens for this).
      hq.postMessage({ type: 'hq:open', url: hash });
      try { await hq.focus(); } catch { /* not allowed: the message still moves it */ }
      return;
    }
    await self.clients.openWindow(`${APP}${hash}`);
  })());
});

// The browser replaced this device's push address: save the new one (same session cookie).
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    try {
      const r = await fetch('/hq/api/push/key', { credentials: 'same-origin' });
      if (!r.ok) return;
      const { publicKey } = await r.json();
      const pad = '='.repeat((4 - (publicKey.length % 4)) % 4);
      const raw = atob((publicKey + pad).replace(/-/g, '+').replace(/_/g, '/'));
      const key = Uint8Array.from(raw, (c) => c.charCodeAt(0));
      const sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      await fetch('/hq/api/push/subscribe', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ subscription: sub.toJSON() }) });
    } catch { /* turned on again from the Notifications screen */ }
  })());
});
