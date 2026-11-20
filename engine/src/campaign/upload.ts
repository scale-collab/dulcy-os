// Shared by campaign.build and campaign.topup: make sure custom variables exist, then upload
// leads in 5,000-row chunks, check each import until EmailBison has processed it (exact
// counts, no fixed waits) and attach it to the campaign. Every write goes through a
// record-scoped receipt, so a re-run never uploads or attaches twice.
import type { JobContext } from '../context.js';
import { NeedsReviewError, WaitError } from '../errors.js';
import type { BisonClient } from '../providers/emailbison.js';
import { chunks, toCsv, type PreparedLeads } from './rules.js';

/** Wait for something EmailBison is still doing, but never longer than `limitMs` from the first check. */
export async function waitOrReview(ctx: JobContext, key: string, limitMs: number, progress: string, review: string): Promise<never> {
  const started = await ctx.step(`wait-start:${key}`, async () => Date.now());
  if (Date.now() - started > limitMs) throw new NeedsReviewError(review);
  throw new WaitError(progress, ctx.cfg.bisonPollMs);
}

export function summarizeErrors(e: unknown): string {
  if (!e || typeof e !== 'object') return 'no error details';
  const parts = Object.entries(e as Record<string, unknown>).slice(0, 5).map(([k, v]) => `${k}${typeof v === 'number' ? ` (${v})` : ''}`);
  return parts.length ? `EmailBison says: ${parts.join('; ')}`.replace(/([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@/g, '$1***@') : 'no error details';
}

export async function ensureCustomVariables(ctx: JobContext, bison: BisonClient, names: string[]) {
  return ctx.step('custom-variables', async () => {
    const have = await bison.customVariables();
    const created: string[] = [];
    for (const name of names) {
      if (have.has(name.toLowerCase())) continue;
      try { await bison.createCustomVariable(name); created.push(name); } catch (e) {
        // Another run may have created it at the same moment: re-read before failing.
        if (!(await bison.customVariables()).has(name.toLowerCase())) throw e;
      }
    }
    return { created };
  });
}

/**
 * Upload + import check + attach. Returns the campaign's lead total before the first upload
 * (remembered per record) and how many leads EmailBison accepted across all imports.
 */
export async function uploadAndAttach(ctx: JobContext, bison: BisonClient, o: { campaignId: number; listName: string; leads: PreparedLeads }) {
  await ensureCustomVariables(ctx, bison, o.leads.customVariables);
  const parts = chunks(o.leads.rows);
  // Remembered per record (not per job), so a re-run compares against the same starting point.
  // Receipt names must stay stable: changing them would make a re-run upload again.
  const before = (await ctx.step('leads-before', () => ctx.paid({
    scope: 'record', provider: 'emailbison', callKey: `leads-before:${o.campaignId}`, units: 0,
    run: async () => ({ total: await bison.campaignLeadTotal(o.campaignId) }),
    dryRunResult: () => ({ total: 0 }),
  }))).total;

  let accepted = 0;
  let skippedOnImport = 0;
  const imports: number[] = [];
  for (let i = 0; i < parts.length; i++) {
    const listName = `${o.listName} [${o.leads.hash}] part ${i + 1} of ${parts.length}`;
    const list = await ctx.step(`upload-${i + 1}`, () => ctx.paid({
      scope: 'record', provider: 'emailbison', callKey: `upload:${o.leads.hash}:${i + 1}`, units: 0,
      run: () => bison.uploadLeadsCsv(listName, o.leads.columnsToMap, toCsv(o.leads.headers, parts[i])),
      reconcile: async () => {
        const found = await bison.findLeadListsByName(listName);
        if (found.length === 1) return { id: found[0].id, name: listName };
        if (found.length === 0) return null;
        throw new NeedsReviewError(`${found.length} lead lists named "${listName}" exist; keep one before continuing`);
      },
      dryRunResult: () => ({ id: 0, name: listName }),
    }), { timeoutMs: 5 * 60_000 });

    // Check the import until EmailBison has processed it (no fixed waits).
    const imported = await ctx.step(`import-${i + 1}`, async () => {
      const l = await bison.getLeadList(list.id);
      if (String(l.status) !== 'Processed') {
        return await waitOrReview(ctx, `import-${i + 1}`, 60 * 60_000,
          `lead import ${list.id} (part ${i + 1} of ${parts.length}): ${l.status ?? 'unknown'}`,
          `lead import ${list.id} was not processed within 60 minutes; check it in EmailBison, do not upload again`);
      }
      const processed = Number(l.leads_processed), succeeded = Number(l.leads_succeeded), failed = Number(l.leads_failed);
      // EmailBison sometimes leaves a few rows out of a finished import with no error and no
      // failed count (seen live 2026-11-20: 951 sent, 901 processed, 0 failed). Up to 10% is
      // accepted and reported; failed rows, more than sent, or a bigger gap still go to review.
      const skipped = parts[i].length - processed;
      const ok = failed === 0 && succeeded === processed && skipped >= 0 && skipped <= Math.floor(parts[i].length * 0.1);
      if (!ok) {
        throw new NeedsReviewError(`lead import ${list.id}: sent ${parts[i].length}, processed ${processed}, succeeded ${succeeded}, failed ${failed}; ${summarizeErrors(l.error_messages)}`);
      }
      if (skipped) await ctx.log('lead import: EmailBison left some rows out without an error', { list: list.id, sent: parts[i].length, processed, skipped });
      return { id: list.id, succeeded, skippedByEmailBison: skipped };
    });
    accepted += imported.succeeded;
    skippedOnImport += Number((imported as { skippedByEmailBison?: number }).skippedByEmailBison ?? 0);
    imports.push(imported.id);

    await ctx.step(`attach-${i + 1}`, () => ctx.paid({
      scope: 'record', provider: 'emailbison', callKey: `attach:${o.campaignId}:${list.id}`, units: 0,
      run: async () => { await bison.attachLeadList(o.campaignId, list.id); return { attached: list.id }; },
      dryRunResult: () => ({ attached: 0 }),
    }));
  }
  return { before, accepted, imports, parts: parts.length, skippedOnImport };
}
