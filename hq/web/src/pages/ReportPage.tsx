import { useEffect, useState } from 'react';
import { api, type Report } from '../api';
import { Avatar, BackLink, Card, cx, ErrorBox, ExtLink, Icon, Label, Markdown, PageSkeleton, Pill, timeAgo } from '../ui';
import { scoreTone } from './Reports';

export default function ReportPage({ id }: { id: number }) {
  const [r, setR] = useState<Report | null>(null);
  const [error, setError] = useState('');
  const [full, setFull] = useState(false);
  useEffect(() => { api<{ report: Report }>(`/reports/${id}`).then((x) => setR(x.report)).catch((e) => setError(e.message)); }, [id]);
  const back = <BackLink label="Back" onClick={() => history.back()} />;
  if (error) return <div className="mx-auto max-w-3xl">{back}<ErrorBox error={error} /></div>;
  if (!r) return <div className="mx-auto max-w-3xl">{back}<PageSkeleton kind="deck" /></div>;
  const review = r.kind === 'call_review' && r.data ? r.data : null;
  return (
    <div className="mx-auto max-w-3xl">
      {back}
      <div className="flex items-center gap-3">
        <Avatar name={r.agent} />
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted"><span className="font-medium text-fg-2">{r.agent}</span><span aria-hidden="true">·</span><span>{timeAgo(r.created)}</span>{r.urgent && <Pill tone="bad">urgent</Pill>}{r.dryRun && <Pill>dry run</Pill>}</div>
      </div>
      <h1 className="mt-3 text-[26px] font-bold leading-tight tracking-tight sm:text-[28px]">{r.title}</h1>
      {r.link && !/^https:\/\/([a-z0-9-]+\.)*airtable\.com(\/|$)/i.test(r.link) && <div className="mt-3"><ExtLink href={r.link} className="inline-flex min-h-11 items-center gap-1.5"><Icon name="external" size={15} />Open the recording / source</ExtLink></div>}

      {review ? (
        <>
          <Card className="mt-6">
            <div className="flex items-center gap-5">
              <div className={cx('tabular flex h-20 w-20 shrink-0 items-baseline justify-center rounded-2xl pt-5 text-3xl font-bold', scoreTone(Number(review.score)))}>{review.score}<span className="text-sm font-semibold opacity-70">/10</span></div>
              <div className="min-w-0 text-[15px] leading-relaxed text-fg-2">{review.verdict}{review.temperature && <div className="mt-2"><Pill>{review.temperature}</Pill></div>}</div>
            </div>
          </Card>
          <Label className="mb-3 mt-8">3 things to fix</Label>
          <div className="space-y-3">
            {(review.fixes ?? []).map((f: any, i: number) => (
              <Card key={i}>
                <div className="text-xs font-semibold text-muted">{f.t ? `At ${f.t}` : `Fix ${i + 1}`}</div>
                <div className="mt-3 rounded-xl bg-sunken px-4 py-3 text-sm text-muted line-through decoration-faint">“{f.said}”</div>
                <div className="mt-2 rounded-xl border-l-2 border-accent bg-accent-soft px-4 py-3 text-[15px] font-medium leading-relaxed text-fg">“{f.better}”</div>
                <div className="mt-3 text-sm leading-relaxed text-fg-2">{f.why}</div>
              </Card>
            ))}
          </div>
          {review.nextStep && <div className="mt-6"><Label>Next step agreed</Label><div className="mt-1.5 text-[15px] text-fg-2">{review.nextStep}</div></div>}
          {review.drill && <div className="mt-5"><Label>Drill before the next call</Label><div className="mt-1.5 text-[15px] text-fg-2">{review.drill}</div></div>}
          <button onClick={() => setFull((v) => !v)} aria-expanded={full} className="mt-6 inline-flex min-h-12 items-center gap-1.5 text-sm font-semibold text-accent-ink">
            {full ? 'Hide the full review' : 'Show the full review and follow-up draft'}<Icon name="chevronDown" size={16} className={cx('transition', full && 'rotate-180')} />
          </button>
          {full && <Card className="mt-2 anim-fade"><Markdown text={r.body ?? ''} /></Card>}
        </>
      ) : (
        <Card className="mt-6"><Markdown text={r.body ?? ''} /></Card>
      )}
    </div>
  );
}
