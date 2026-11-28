// Content, the resource document (Alex, 2026-11-28: "For creating Gamma: can that not happen on a free plan?
// If not, just make it a Google Doc / a PDF"). Gamma's API needs a paid plan, so HQ turns Sienna's Gamma
// outline into a branded document here: #/content/items/<rec>/resource. It looks like Alex's own PDFs
// (Alex-Woung-Meeting-Booked-Examples.pdf): 16:9 landscape slides, a near-black green cover with a lime
// label, a lime pill and a huge white headline; cream inner pages with a top bar, a big dark headline,
// white cards with lime numbered circles, dark green blocks with lime labels, a lime callout and a footer
// with the page number. "Download PDF" is the browser's print-to-PDF of exactly these slides (13.333 × 7.5 in,
// one slide per page); "Copy as text" copies the plain text. Nothing is saved, sent or posted.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, type ContentResourceDoc } from '../../api';
import { BackLink, Button, Card, ErrorBox, go, PageSkeleton } from '../../ui';
import { copyText } from './shared';

// Sizes are in container units (cqw = 1% of the slide's width), so the screen preview and the printed
// 13.333in page are the same slide at two sizes.
export const CSS = `
.rs-deck{display:flex;flex-direction:column;gap:20px}
@media (max-width:639px){.rs-screen{overflow-x:auto;padding-bottom:8px}.rs-screen .rs-deck{width:720px}}
.rs-slide{position:relative;width:100%;aspect-ratio:16/9;container-type:inline-size;overflow:hidden;border-radius:14px;box-shadow:0 1px 3px rgba(0,0,0,.12),0 8px 24px rgba(0,0,0,.08);
  font-family:system-ui,-apple-system,"Segoe UI",Roboto,"DejaVu Sans","Helvetica Neue",Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact;color:#1b211f;background:#f3f1ec}
.rs-in{position:absolute;inset:0;padding:3.1cqw 4.2cqw 2.6cqw;display:flex;flex-direction:column}
.rs-cover{background:#1b211f;color:#fff}
.rs-cover .rs-in{padding:4.4cqw 5cqw 3.8cqw}
.rs-label{font-size:1.3cqw;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#d6ec7a}
.rs-cover h1{margin:6.4cqw 0 0;font-size:5.6cqw;line-height:1.08;font-weight:800;letter-spacing:-.01em;max-width:80cqw;overflow-wrap:break-word}
.rs-sub{margin-top:3cqw;font-size:2.05cqw;line-height:1.4;color:#c9cfcc;max-width:76cqw}
.rs-pill{display:inline-block;margin-top:3.4cqw;padding:1.35cqw 1.9cqw;border-radius:1cqw;background:#d6ec7a;color:#1b211f;font-size:1.5cqw;font-weight:800;letter-spacing:.04em;text-transform:uppercase;align-self:flex-start}
.rs-foot-cover{margin-top:auto;font-size:1.12cqw;line-height:1.5;color:#b8bfbb;max-width:88cqw}
.rs-top{display:flex;justify-content:space-between;align-items:baseline;gap:2cqw;padding-bottom:2cqw;border-bottom:1px solid #d9d6cf}
.rs-brand{font-size:1.1cqw;font-weight:800;letter-spacing:.05em;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rs-sec{font-size:1.1cqw;letter-spacing:.06em;text-transform:uppercase;color:#6b706d;white-space:nowrap}
.rs-h{margin:2.9cqw 0 0;font-size:3.5cqw;line-height:1.12;font-weight:800;letter-spacing:-.01em;overflow-wrap:break-word}
.rs-body{flex:1;min-height:0;margin-top:3cqw;display:flex;flex-direction:column}
.rs-cards{display:grid;gap:1.9cqw}
.rs-card{background:#fff;border-radius:1.4cqw;padding:1.8cqw 1.9cqw 2.2cqw;min-width:0}
.rs-num{width:3.1cqw;height:3.1cqw;border-radius:50%;background:#d6ec7a;color:#1b211f;display:grid;place-items:center;font-size:1.35cqw;font-weight:800}
.rs-ct{margin-top:1.9cqw;font-size:2cqw;line-height:1.2;font-weight:800;overflow-wrap:break-word}
.rs-cb{margin-top:1.3cqw;font-size:1.6cqw;line-height:1.42;overflow-wrap:break-word}
.rs-cb.solo{margin-top:1.9cqw;font-size:1.75cqw}
.rs-grid .rs-card{display:flex;gap:1.5cqw;align-items:flex-start;padding:1.6cqw 1.8cqw}
.rs-grid .rs-num{flex:none}
.rs-grid .rs-ct{margin-top:.25cqw;font-size:1.7cqw}
.rs-grid .rs-cb{margin-top:.6cqw;font-size:1.45cqw}
.rs-grid .rs-cb.solo{margin-top:.35cqw;font-size:1.6cqw}
.rs-list{display:grid;grid-template-columns:1fr 1fr;gap:1.1cqw 1.9cqw;align-content:start}
.rs-li{display:flex;gap:1.2cqw;align-items:flex-start;background:#fff;border-radius:1.1cqw;padding:1.1cqw 1.4cqw;font-size:1.4cqw;line-height:1.35;min-width:0;overflow-wrap:break-word}
.rs-li .rs-num{width:2.4cqw;height:2.4cqw;font-size:1.1cqw;flex:none}
.rs-statement{margin-top:auto;margin-bottom:auto;background:#21392f;color:#fff;border-radius:1.4cqw;padding:2.6cqw 3cqw;font-size:2.4cqw;line-height:1.35;font-weight:700}
.rs-callout{max-width:62cqw;align-self:flex-start}
.rs-callout .rs-big{font-size:2.6cqw;line-height:1.28}
.rs-cta{display:grid;grid-template-columns:1.35fr 1fr;gap:1.9cqw;align-items:stretch}
.rs-dark{background:#21392f;color:#fff;border-radius:1.4cqw;padding:2.4cqw 2.6cqw;min-width:0}
.rs-lime{background:#d6ec7a;color:#1b211f;border-radius:1.4cqw;padding:2.4cqw 2.6cqw;min-width:0}
.rs-tag{font-size:1.1cqw;font-weight:800;letter-spacing:.06em;text-transform:uppercase}
.rs-dark .rs-tag{color:#d6ec7a}
.rs-big{margin-top:1.6cqw;font-size:2.3cqw;line-height:1.3;font-weight:800;overflow-wrap:break-word}
.rs-url{margin-top:1.4cqw;font-size:1.5cqw;font-weight:700;overflow-wrap:anywhere}
.rs-foot{display:flex;justify-content:space-between;gap:2cqw;padding-top:1.4cqw;font-size:1cqw;color:#6b706d}
.rs-foot span:first-child{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#resource-print-root{display:none}
`;
// While the page is open: Letter-free 16:9 pages, and only the deck prints (HQ's menus never do).
export const PRINT_CSS = `
@page{size:13.333in 7.5in;margin:0}
@media print{
  html,body{margin:0!important;padding:0!important;background:#fff!important}
  body>*:not(#resource-print-root){display:none!important}
  #resource-print-root{display:block!important}
  #resource-print-root .rs-deck{display:block}
  #resource-print-root .rs-slide{width:13.333in;height:7.5in;aspect-ratio:auto;border-radius:0;box-shadow:none;break-after:page;page-break-after:always;break-inside:avoid}
  #resource-print-root .rs-slide:last-child{break-after:auto;page-break-after:auto}
}
`;

const pad = (n: number) => String(n).padStart(2, '0');

function Top({ d, right }: { d: ContentResourceDoc; right: string }) {
  return <div className="rs-top"><span className="rs-brand">Alex Woung &nbsp;/&nbsp; {d.topic}</span><span className="rs-sec">{right}</span></div>;
}
function Foot({ d, page }: { d: ContentResourceDoc; page: number }) {
  return <div className="rs-foot"><span>{d.cover.footnote}</span><span>{pad(page)}</span></div>;
}

/** The slides: cover, one page per outline slide, and the closing page. */
export function Deck({ d }: { d: ContentResourceDoc }) {
  const total = d.sections.length;
  return (
    <div className="rs-deck">
      <section className="rs-slide rs-cover" aria-label="Cover">
        <div className="rs-in">
          <div className="rs-label">Alex Woung &nbsp;/&nbsp; {d.topic}</div>
          <h1>{d.cover.headline}</h1>
          {d.cover.subtitle && <div className="rs-sub">{d.cover.subtitle}</div>}
          <div className="rs-pill">{d.cover.pill}</div>
          <div className="rs-foot-cover">{d.cover.footnote}</div>
        </div>
      </section>
      {d.sections.map((x, i) => (
        <section key={x.n} className="rs-slide" aria-label={`Part ${x.n}`}>
          <div className="rs-in">
            <Top d={d} right={`Part ${pad(x.n)} / ${pad(total)}`} />
            <h2 className="rs-h">{x.headline}</h2>
            <div className="rs-body">
              {x.layout === 'callout' && x.points[0] && (
                <div className="rs-lime rs-callout"><div className="rs-tag">{x.points[0].title || 'The key point'}</div><div className="rs-big">{x.points[0].body}</div></div>
              )}
              {x.layout === 'cards' && (
                <div className="rs-cards" style={{ gridTemplateColumns: `repeat(${Math.max(1, x.points.length)}, minmax(0,1fr))` }}>
                  {x.points.map((p, k) => (
                    <div key={k} className="rs-card"><div className="rs-num">{k + 1}</div>{p.title ? <><div className="rs-ct">{p.title}</div><div className="rs-cb">{p.body}</div></> : <div className="rs-cb solo">{p.body}</div>}</div>
                  ))}
                </div>
              )}
              {x.layout === 'grid' && (
                <div className="rs-cards rs-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))' }}>
                  {x.points.map((p, k) => (
                    <div key={k} className="rs-card"><div className="rs-num">{k + 1}</div><div className="min-w-0">{p.title ? <><div className="rs-ct">{p.title}</div><div className="rs-cb">{p.body}</div></> : <div className="rs-cb solo">{p.body}</div>}</div></div>
                  ))}
                </div>
              )}
              {x.layout === 'list' && (
                <div className="rs-list">
                  {x.points.map((p, k) => <div key={k} className="rs-li"><div className="rs-num">{k + 1}</div><div>{p.title ? <><b>{p.title}:</b> {p.body}</> : p.body}</div></div>)}
                </div>
              )}
            </div>
            <Foot d={d} page={i + 2} />
          </div>
        </section>
      ))}
      <section className="rs-slide" aria-label="Next step">
        <div className="rs-in">
          <Top d={d} right="Next step" />
          <h2 className="rs-h">Put it to work.</h2>
          <div className="rs-body">
            <div className="rs-cta">
              <div className="rs-dark">
                <div className="rs-tag">Watch the full video</div>
                <div className="rs-big">{d.cta.video}</div>
                <div className="rs-url">{d.cta.videoUrl || (d.channel === 'Alex Woung Raw' ? 'youtube.com/@alexwoungraw' : 'youtube.com/@alexwoung')}</div>
              </div>
              <div className="rs-lime">
                <div className="rs-tag">{d.cta.label}</div>
                <div className="rs-big">{d.cta.text}</div>
                <div className="rs-url">{d.cta.url.replace(/^https:\/\//, '')}</div>
              </div>
            </div>
          </div>
          <Foot d={d} page={total + 2} />
        </div>
      </section>
    </div>
  );
}

/** #/content/items/<rec>/resource */
export default function ContentResource({ id }: { id: string }) {
  const [d, setD] = useState<ContentResourceDoc | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const [root, setRoot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    api<ContentResourceDoc>(`/content/items/${id}/resource`).then(setD).catch((e) => setError((e as Error).message));
  }, [id]);
  // The print copy lives directly under <body> so print CSS can hide everything else.
  useEffect(() => {
    const el = document.createElement('div'); el.id = 'resource-print-root'; document.body.appendChild(el);
    const st = document.createElement('style'); st.textContent = PRINT_CSS; document.head.appendChild(st);
    setRoot(el);
    return () => { el.remove(); st.remove(); };
  }, []);
  const copy = async () => setCopied(d && (await copyText(d.text)) ? 'Copied as text.' : 'Copy did not work here.');
  return (
    <div>
      <style>{CSS}</style>
      <BackLink label="Back to the video" onClick={() => go(`content/items/${id}`)} />
      {error && <ErrorBox error={error} />}
      {!d && !error && <PageSkeleton kind="list" />}
      {d && (
        <>
          <Card className="mb-4 p-4 sm:p-5">
            <h2 className="break-words text-lg font-bold text-fg">{d.title}</h2>
            <p className="mt-1 text-sm text-fg-2">Made from Sienna's slide outline: {d.sections.length + 2} pages. Read it through before you share it. Nothing is saved or sent.</p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:flex">
              <Button tone="primary" icon="file" onClick={() => window.print()}>Download PDF</Button>
              <Button tone="quiet" icon="layers" onClick={() => void copy()}>Copy as text</Button>
            </div>
            <p className="mt-2 text-xs text-muted">Download PDF opens your browser's print window: choose "Save as PDF". The pages are already 16:9.</p>
            {copied && <p role="status" className="mt-1 text-sm text-good">{copied}</p>}
          </Card>
          <div className="rs-screen"><Deck d={d} /></div>
          {root && createPortal(<Deck d={d} />, root)}
        </>
      )}
    </div>
  );
}
