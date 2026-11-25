// Sienna, content (Alex 2026-11-24/25): Alex's week is Mon campaigns … Fri content day.
//   • sienna.ideas (Monday): researches what B2B founders and agency owners are asking right now
//     (web search across YouTube, LinkedIn, X, Reddit, forums; Reddit alone is not enough), then
//     adds ideas to the Content Center (Content Channels) with Status "Review" and Idea Decision
//     "Needs Review" for Alex to approve there (with a recording date).
//   • sienna.prep (Thursday): for every approved idea recording in the next 8 days with no script
//     yet (or the old "Record This Week" tick), writes a teleprompter script in Alex's voice, title
//     options, hook options, a thumbnail idea and a Gamma outline, and sets Production Stage "Script"
//     (the same stage the Content Center uses; one script writer, Alex 2026-11-25).
// Drafts only: Sienna never posts, schedules or publishes anything.
import { z } from 'zod';
import type { Stage } from '../stages/index.js';
import { PermanentError } from '../errors.js';
import { createAirtableClient, type AirtableClient } from '../providers/airtable.js';
import { createClaude } from '../providers/claude.js';
import { createSlackClient } from '../providers/slack.js';
import { readKnowledge } from './knowledge.js';

export const CONTENT = 'tblcSzvicm3wivvhh';
export const SETTINGS = 'tblbG7YbCpi84tQYM';
export const CF = {
  title: 'fld0dz5F0ROLEE4Wy', description: 'fld3Dynj1W5bNh5O7', script: 'fldFj3EasjFxxkwCn', platform: 'fld5Imj57Jokq4tri', style: 'fld6SJanf19cAlQTt',
  type: 'fldHg1dEikmbBG7JZ', status: 'fldWcMXU2M3xAwYjF', notes: 'fldd38VZyWwchpGjI', stage: 'fldQk3w4PUVrXwYaT', recordThisWeek: 'flddmHkAA7iDy5EQj',
  date: 'fldaLQaUuJz0Afu6h', source: 'fldveCswHhxiscD1I', channel: 'fldpcwymoqz8mtBh9', ytTitle: 'fld3xEJ5687C30cJL', transcript: 'fld13f1hP9c5zAxVS',
  ideaScore: 'fldooc7Qygr1b6Tz5', ideaUrl: 'fldrXemrcvGx4u0Mm', ideaCommunity: 'fld6ZkQRBdCHfV7Qp', ideaReason: 'fldhiGRSmlMdQxHYn', ideaKey: 'fldcSWXaLW8a9NYOq',
  ideaDecision: 'fld3M7y7fHCbahSxD', recordingDate: 'fldJwxvRX4WxfcASD',
} as const;

const v = (x: unknown): string => (Array.isArray(x) ? v(x[0]) : x === undefined || x === null ? '' : typeof x === 'object' ? String((x as any).name ?? (x as any).id ?? '') : String(x)).trim();
const DAY = 86_400_000;
const etYmd = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
/** The coming Friday (content day), as YYYY-MM-DD in ET. */
export function nextFriday(now: Date): string {
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const add = (5 - et.getDay() + 7) % 7 || 7;
  return etYmd(new Date(now.getTime() + add * DAY));
}
export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

export const Ideas = z.object({
  ideas: z.array(z.object({
    title: z.string().describe('YouTube title in Alex\'s plain style: specific, no clickbait, no emojis'),
    angle: z.string().describe('The one point of view Alex takes, from his own experience running Dulcy'),
    hook: z.string().describe('First 10 seconds, spoken'),
    why_now: z.string().describe('Why people want this now, from the research'),
    evidence: z.array(z.object({ url: z.string(), signal: z.string().describe('What shows demand: views, comments, upvotes, recency, repeated questions') })),
    pillar: z.enum(['cold outbound', 'agency operations', 'proof and experiments', 'founder lessons', 'AI and modern GTM']),
    type: z.enum(['Education', 'Value', 'Credibility']),
    score: z.number().int().describe('0-100: demand strength × fit with Dulcy × how well Alex can speak to it'),
  })),
});
export const Script = z.object({
  title_options: z.array(z.string()).describe('3 title options'),
  hook_options: z.array(z.string()).describe('3 spoken opening lines (first 3-10 seconds)'),
  script: z.string().describe('Full teleprompter script in Alex\'s voice, short lines, with [B-ROLL] / [SCREEN] cues where a demo helps'),
  thumbnail: z.string().describe('Thumbnail idea: image + 2-4 words of text'),
  gamma_outline: z.string().describe('Slide-by-slide outline for a Gamma doc to show on screen (5-8 slides)'),
  description: z.string().describe('YouTube description, first 2 lines strongest'),
  facts_to_check: z.array(z.string()).describe('Any number, result or claim in the script Alex must confirm before recording'),
});

const VOICE = `You are Sienna, content lead for Alex Woung (founder of Dulcy, a B2B growth agency: AI omnichannel outreach, cold email first).
Alex's voice: plain, direct, first person, operator lessons from actually running campaigns. Short sentences. No hype, no "game-changer", no emojis, no AI-sounding filler ("In today's fast-paced world", "Let's dive in"). Never invent results, client names, numbers or stories; if a point needs proof Alex must supply it, write [ALEX: add real example] and list it in facts_to_check.`;

function knowledge(dir: string): string {
  const k = (rel: string) => readKnowledge(dir, rel);
  return [k('skills/sienna-social-content/SKILL.md'), k('skills/sienna-social-content/references/organic-content-content-strategy.md'), k('skills/sienna-social-content/references/organic-content-platform-playbook.md')].join('\n\n').slice(0, 60_000);
}

export const siennaIdeasStage: Stage = async (ctx) => {
  const cfg = ctx.cfg;
  if (!cfg.airtableApiKey) throw new PermanentError('no AIRTABLE_API_KEY on the server');
  const at = createAirtableClient({ apiKey: cfg.airtableApiKey, baseId: cfg.airtableBaseId, baseUrl: cfg.airtableBaseUrl });
  const now = new Date();
  const settings = await at.list(SETTINGS, `AND({Enabled},{Channel}='Alex Woung')`, ['Channel', 'Videos Per Week'], 5, { byName: true });
  const perWeek = Number(v(settings[0]?.fields['Videos Per Week'])) || 2;
  const want = Number(ctx.job.input.count ?? perWeek * 2);
  const recent = await at.list(CONTENT, `IS_AFTER(CREATED_TIME(),DATEADD(NOW(),-120,'days'))`, [CF.title], 200, { sortField: 'Date', sortDesc: true });
  const titles = recent.map((r) => v(r.fields[CF.title])).filter(Boolean);
  if (ctx.dryRun) return { message: `Would research and add ${want} ideas (dry run: Claude not called)`, existing: titles.length };
  const claude = createClaude({ apiKey: cfg.anthropicApiKey, model: cfg.claudeModel, baseURL: cfg.anthropicBaseUrl });
  const research = await ctx.paid({
    callKey: `sienna-research:${etYmd(now)}`, provider: 'anthropic', units: 1, scope: 'record',
    run: () => claude.research(`${VOICE}\nYou research content demand. Search widely: YouTube (view counts, comments on recent videos), LinkedIn and X posts with strong engagement, Reddit and forums, Google results and "people also ask". Reddit alone is not enough.`,
      `Find ${want + 4} video topics that B2B agency owners and B2B service-business founders are actively asking about in the last 60 days, around: cold email and deliverability, outbound with AI, booking more sales meetings, agency operations and growth, founder-led sales. For each: the question people ask, where you saw demand (URL + the signal: views, comments, upvotes, date), and why it is rising now. Skip anything close to these existing titles:\n${titles.slice(0, 80).map((t) => `- ${t}`).join('\n')}`),
    dryRunResult: () => '',
  });
  const ideas = await ctx.paid({
    callKey: `sienna-ideas:${etYmd(now)}`, provider: 'anthropic', units: 1, scope: 'record',
    run: () => claude.structured(Ideas, [VOICE, knowledge(cfg.knowledgeDir)], `Return exactly ${want} ideas, best first. Every idea needs at least one evidence URL taken from the research notes (never invent a URL).`, `Research notes:\n${research}`, 'high'),
    dryRunResult: () => ({ ideas: [] }),
  });
  const friday = nextFriday(now); const made: string[] = [];
  const existingKeys = new Set((await at.list(CONTENT, `LEFT({Idea Source Key},7)='sienna:'`, [CF.ideaKey], 500)).map((r) => v(r.fields[CF.ideaKey])));
  for (const i of ideas.ideas.slice(0, want)) {
    const key = `sienna:${friday}:${slug(i.title)}`;
    if (existingKeys.has(key) || titles.some((t) => slug(t) === slug(i.title))) continue;
    await ctx.step(`idea:${key}`, async () => at.create(CONTENT, {
      [CF.title]: i.title, [CF.status]: 'Review', [CF.ideaDecision]: 'Needs Review', [CF.source]: 'Generated Idea', [CF.channel]: 'Alex Woung', [CF.platform]: ['YouTube'], [CF.style]: 'Long Form', [CF.type]: i.type,
      [CF.date]: friday, [CF.ideaScore]: Math.max(0, Math.min(100, Math.round(i.score))), [CF.ideaUrl]: i.evidence[0]?.url ?? '', [CF.ideaCommunity]: 'Sienna web research', [CF.ideaKey]: key,
      [CF.description]: `**Angle:** ${i.angle}\n\n**Hook:** ${i.hook}\n\n**Pillar:** ${i.pillar}`,
      [CF.ideaReason]: `${i.why_now}\n\nEvidence:\n${i.evidence.map((e) => `- ${e.url}: ${e.signal}`).join('\n')}`,
    }));
    made.push(`${i.title} (${Math.round(i.score)})`);
  }
  if (cfg.slackBotToken && made.length) {
    const slack = createSlackClient({ token: cfg.slackBotToken, baseUrl: cfg.slackBaseUrl });
    const text = `*Sienna: ${made.length} video ideas for Friday ${friday}* (in the Content Center, Status "Review")\n${made.map((m, n) => `${n + 1}. ${m}`).join('\n')}\nApprove the ones you want in the Content Center with a recording date. Thursday I'll write the scripts for those.`;
    await ctx.paid({ callKey: `sienna-ideas-post:${etYmd(now)}`, provider: 'slack', units: 0, scope: 'record', run: () => slack.post(cfg.siennaChannel, text), dryRunResult: () => ({ channel: '', ts: '' }) });
  }
  return { message: `${made.length} ideas added for ${friday}`, ideas: made };
};

async function voiceSamples(at: Pick<AirtableClient, 'list'>): Promise<string> {
  const recs = await at.list(CONTENT, `AND({Content Channel}='Alex Woung',OR({YouTube Transcript}!='',{Script}!=''))`, [CF.title, CF.transcript, CF.script], 3, { sortField: 'Date', sortDesc: true });
  return recs.map((r) => `## ${v(r.fields[CF.title])}\n${(v(r.fields[CF.transcript]) || v(r.fields[CF.script])).slice(0, 4000)}`).join('\n\n');
}

/**
 * Ideas Sienna writes a script for: approved in the Content Center (Idea Decision = Approved) with a
 * Recording Date from yesterday to 8 days out, or the old "Record This Week" tick. No script yet.
 */
export function prepFormula(): string {
  return `AND({Script}='',OR({Record This Week},AND({Idea Decision}='Approved',{Recording Date}!='',`
    + `IS_AFTER({Recording Date},DATEADD(TODAY(),-2,'days')),IS_BEFORE({Recording Date},DATEADD(TODAY(),9,'days')))))`;
}

export const siennaPrepStage: Stage = async (ctx) => {
  const cfg = ctx.cfg;
  if (!cfg.airtableApiKey) throw new PermanentError('no AIRTABLE_API_KEY on the server');
  const at = createAirtableClient({ apiKey: cfg.airtableApiKey, baseId: cfg.airtableBaseId, baseUrl: cfg.airtableBaseUrl });
  const picked = await at.list(CONTENT, prepFormula(), [CF.title, CF.description, CF.ideaReason, CF.style], 20);
  if (!picked.length) return { message: 'No approved ideas recording in the next 8 days without a script', written: 0 };
  if (ctx.dryRun) return { message: `Would write ${picked.length} script(s) (dry run: Claude not called)`, titles: picked.map((r) => v(r.fields[CF.title])) };
  const claude = createClaude({ apiKey: cfg.anthropicApiKey, model: cfg.claudeModel, baseURL: cfg.anthropicBaseUrl });
  const samples = await voiceSamples(at);
  const done: string[] = [];
  for (const r of picked) {
    const f = r.fields;
    const s = await ctx.paid({
      callKey: `sienna-script:${r.id}`, provider: 'anthropic', units: 1, scope: 'record',
      run: () => claude.structured(Script, [VOICE, knowledge(cfg.knowledgeDir), samples ? `# How Alex actually talks (recent videos)\n${samples}` : ''],
        `Format: ${v(f[CF.style]) || 'Long Form'} YouTube video, about 8-12 minutes for Long Form, under 60 seconds for Shorts.`,
        `Title: ${v(f[CF.title])}\n\n${v(f[CF.description])}\n\nWhy people want it:\n${v(f[CF.ideaReason])}`, 'high'),
      dryRunResult: () => ({}) as z.infer<typeof Script>,
    });
    await ctx.step(`script:${r.id}`, async () => at.update(CONTENT, r.id, {
      [CF.script]: s.script, [CF.stage]: 'Script',
      [CF.notes]: `**Title options**\n${s.title_options.map((t) => `- ${t}`).join('\n')}\n\n**Hook options**\n${s.hook_options.map((t) => `- ${t}`).join('\n')}\n\n**Thumbnail:** ${s.thumbnail}\n\n**Gamma outline**\n${s.gamma_outline}\n\n**YouTube description**\n${s.description}\n\n**Check before recording**\n${s.facts_to_check.map((t) => `- ${t}`).join('\n') || '- nothing flagged'}`,
    }));
    done.push(v(f[CF.title]));
  }
  if (cfg.slackBotToken && done.length) {
    const slack = createSlackClient({ token: cfg.slackBotToken, baseUrl: cfg.slackBaseUrl });
    const text = `*Sienna: Friday is ready* · ${done.length} script${done.length === 1 ? '' : 's'} written (Content Center → Script; title, hook, thumbnail and Gamma outline in Notes)\n${done.map((t, n) => `${n + 1}. ${t}`).join('\n')}\nCheck the "Check before recording" list in each one.`;
    await ctx.paid({ callKey: `sienna-prep-post:${etYmd(new Date())}`, provider: 'slack', units: 0, scope: 'record', run: () => slack.post(cfg.siennaChannel, text), dryRunResult: () => ({ channel: '', ts: '' }) });
  }
  return { message: `${done.length} script(s) written`, titles: done };
};
