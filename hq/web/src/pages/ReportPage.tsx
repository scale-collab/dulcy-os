import { useEffect, useState } from 'react';
import { api, type Report } from '../api';
import { AGENT_EMOJI, Card, ErrorBox, ExtLink, Label, Loading, Markdown, Pill, timeAgo } from '../ui';

export default function ReportPage({ id }: { id: number }) {
  const [r, setR] = useState<Report | null>(null);
  const [error, setError] = useState('');
  const [full, setFull] = useState(false);
  useEffect(() => { api<{ report: Report }>(`/reports/${id}`).then((x) => setR(x.report)).catch((e) => setError(e.message)); }, [id]);
  if (error) return <ErrorBox error={error} />;
  if (!r) return <Loading />;
  const review = r.kind === 'call_review' && r.data ? r.data : null;
  return (
    <div>
      <button onClick={() => history.back()} className="mb-4 text-sm text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-white">← Back</button>
      <div className="flex items-center gap-2 text-sm text-stone-500 dark:text-stone-400"><span>{AGENT_EMOJI[r.agent]} {r.agent}</span><span>·</span><span>{timeAgo(r.created)}</span>{r.urgent && <Pill tone="bad">urgent</Pill>}{r.dryRun && <Pill>dry run</Pill>}</div>
      <h1 className="mt-1 text-2xl font-bold tracking-tight">{r.title}</h1>
      {r.link && <div className="mt-2 text-sm"><ExtLink href={r.link}>Open the recording / source</ExtLink></div>}

      {review ? (
        <>
          <Card className="mt-5">
            <div className="flex items-center gap-4">
              <div className="text-4xl font-bold tabular-nums">{review.score}<span className="text-lg text-stone-400">/10</span></div>
              <div className="text-[15px] leading-6">{review.verdict}{review.temperature && <div className="mt-1"><Pill>{review.temperature}</Pill></div>}</div>
            </div>
          </Card>
          <div className="mt-6"><Label>3 things to fix</Label></div>
          <div className="mt-2 space-y-3">
            {(review.fixes ?? []).map((f: any, i: number) => (
              <Card key={i}>
                <div className="text-xs text-stone-500 dark:text-stone-400">{f.t ? `At ${f.t}` : `Fix ${i + 1}`}</div>
                <div className="mt-2 text-sm text-stone-500 line-through decoration-stone-300 dark:text-stone-400">“{f.said}”</div>
                <div className="mt-1 border-l-4 border-accent pl-3 text-[15px] font-medium leading-6">“{f.better}”</div>
                <div className="mt-2 text-sm text-stone-600 dark:text-stone-300">{f.why}</div>
              </Card>
            ))}
          </div>
          {review.nextStep && <div className="mt-5 text-[15px]"><Label>Next step agreed</Label><div className="mt-1">{review.nextStep}</div></div>}
          {review.drill && <div className="mt-4 text-[15px]"><Label>Drill before the next call</Label><div className="mt-1">{review.drill}</div></div>}
          <button onClick={() => setFull((v) => !v)} className="mt-6 min-h-12 text-sm font-semibold text-accent">{full ? 'Hide the full review' : 'Show the full review and follow-up draft'}</button>
          {full && <Card className="mt-2"><Markdown text={r.body ?? ''} /></Card>}
        </>
      ) : (
        <Card className="mt-5"><Markdown text={r.body ?? ''} /></Card>
      )}
    </div>
  );
}
