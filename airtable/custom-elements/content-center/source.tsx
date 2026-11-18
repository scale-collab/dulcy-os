import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
    expandRecord,
    initializeBlock,
    useBase,
    useCustomProperties,
    useRecords,
} from '@airtable/blocks/interface/ui';
import {
    ArrowRightIcon,
    CalendarBlankIcon,
    CheckCircleIcon,
    ClockIcon,
    FilmStripIcon,
    GearSixIcon,
    MagnifyingGlassIcon,
    PlayCircleIcon,
    TrashIcon,
    UploadSimpleIcon,
    WarningCircleIcon,
} from '@phosphor-icons/react';

type AnyField = any;
type AnyRecord = any;
type AnyTable = any;

const CONTENT_TABLE_ID = 'tblcSzvicm3wivvhh';
const DISTRIBUTION_TABLE_ID = 'tblDWJrmIcBJDykIP';
const AUTOMATION_SETTINGS_TABLE_ID = 'tblbG7YbCpi84tQYM';
const AUTOMATION_SETTINGS_FIELD_IDS = {
    channel: 'fldp2ykUFPYYFXPlu',
    enabled: 'fldzz1f3NRV2keDdM',
    videosPerWeek: 'fldhV1C8j1LDsCoVJ',
    clipsPerWeek: 'fldMuMZED81iWQWg4',
    autoScheduleThreshold: 'fldDIUjHLoKL6WXg2',
    reviewThreshold: 'fldqKEJL8Ya5sdja1',
    minimumSpacingDays: 'fldaAPHI6CNgIfMsO',
    minimumClipScore: 'fld288MIFRl52mjpc',
};
const DISTRIBUTION_FIELD_IDS = {
    parentContent: 'fldUdKNjcqwvqBzxY',
    contentClip: 'fldriLaqCUX3haL1f',
    deduplicationKey: 'fld0oIDz5WT2Q7vjm',
    platform: 'fldewqlnxtWis5Q5w',
    outputType: 'fld6lY8PlmVQNZpQS',
    draftTitle: 'fldT93ZRdvNr3rs5H',
    draftBody: 'fldH9ERJJHO2OkMA7',
    mediaUrl: 'fldtRc7ET8RnG3N63',
    approvalStatus: 'fld0WhqvYvMkFukhh',
    publishingStatus: 'fld6epkJRCbu0QAaz',
    scheduledAt: 'fldMNlwmFKOLBcCUl',
    postUrl: 'fldFZjCNtv9VmPTnI',
    account: 'fld8uc1h8BYjHHjjg',
    queueReceipt: 'fld1BFhcLfquycPTC',
};
const FIELD_IDS = {
    title: 'fld0dz5F0ROLEE4Wy',
    description: 'fld3Dynj1W5bNh5O7',
    script: 'fldFj3EasjFxxkwCn',
    status: 'fldWcMXU2M3xAwYjF',
    stage: 'fldQk3w4PUVrXwYaT',
    rawFolderUrl: 'fldQMrNJf43tVfcja',
    finalFolderUrl: 'fldNf75BRKcHTYDpS',
    finalAssetUrl: 'fld9Q5xoY2RMnpI9j',
    finalAssetId: 'fld0uQG1C6JjC4hIs',
    opusProjectId: 'fldP1oNGOVEkAeULJ',
    opusStatus: 'fld5jzGsZAhq5278P',
    shortProjectId: 'fldiiho0E7IRWZbT9',
    shortSourceAssetId: 'fldXxLLMPqM8T72KV',
    shortJobState: 'fldqZyPMUzLu0lb2g',
    message: 'fldmOfFh1HnCVbhVP',
    error: 'fldzm6HMUBG4aY8mr',
    action: 'fldwaCz7Bnob2jIqZ',
    transcript: 'fld13f1hP9c5zAxVS',
    distributionStatus: 'fldlyDobu5EyzJxqX',
    distributionRecords: 'fld2YGy5vpKWisE5d',
    thumbnailStatus: 'fldLrqDqzj8RpJXHS',
    publishingStatus: 'fldPmbanBb8IAkdZx',
    youtubePublishedAt: 'fldeep1b7vD1Vk9PE',
    youtubeUrl: 'fldLwtuaidYVD0K8n',
    clips: 'fldIMEC5xz2UvbrFj',
    recordingDate: 'fldJwxvRX4WxfcASD',
    publishDate: 'fld33u5iDFqKNP4DM',
    editingRoute: 'fldQYgyv6isqSusXe',
    contentSource: 'fldveCswHhxiscD1I',
    finalThumbnailUrl: 'fld7D4SawTmHSJ1HV',
    contentChannel: 'fldpcwymoqz8mtBh9',
    youtubeTitle: 'fld3xEJ5687C30cJL',
    youtubeDescription: 'fldoHO3clLWKw2Gns',
    youtubeChapters: 'fld7hWhOY2lNk0AfR',
    requestedClipCount: 'fldFyh2QYx2W9NXnM',
    minimumClipScore: 'fldmKqA7cCbgPUiti',
    distributionChannels: 'fldgNrmXVNpFFs9jH',
    ideaScore: 'fldooc7Qygr1b6Tz5',
    ideaSourceUrl: 'fldrXemrcvGx4u0Mm',
    ideaSourceCommunity: 'fld6ZkQRBdCHfV7Qp',
    ideaDecision: 'fld3M7y7fHCbahSxD',
    ideaQualificationReason: 'fldhiGRSmlMdQxHYn',
};

const STAGES = ['Idea', 'Script', 'Record', 'Edit', 'Finalize', 'Thumbnail', 'Upload', 'Clips', 'Distribute', 'Published'];
const CONTENT_CUTOFF_DATE = '2026-07-09'; // "yash la dom" baseline
// Persist these exact values to Airtable so n8n can route every item without
// trying to infer the intended channel from its title or other content.
const CONTENT_CHANNELS = ['Alex Woung', 'Alex Woung Raw'] as const;
type ContentChannel = (typeof CONTENT_CHANNELS)[number];
const DEFAULT_CONTENT_CHANNEL: ContentChannel = 'Alex Woung';
const DISTRIBUTION_CHANNELS = ['Instagram', 'YouTube Shorts', 'Reddit', 'X / Twitter', 'LinkedIn', 'Blog', 'Resource', 'Newsletter'] as const;
type DistributionChannel = (typeof DISTRIBUTION_CHANNELS)[number];
// The Gamma workflow is preserved, but Resource stays unavailable until a
// paid Gamma API plan and credential are connected.
const RESOURCE_AUTOMATION_ENABLED = false;
const REDDIT_COMMUNITIES = ['Coldemailing', 'ColdEmailsForLiving', 'EmailOutreach'] as const;
type ChannelIdeaSettings = {videosPerWeek: number; clipsPerWeek: number; autoScheduleThreshold: number; reviewThreshold: number; minimumSpacingDays: number; minimumClipScore: number};
type IdeaAutomationSettings = Record<ContentChannel, ChannelIdeaSettings>;
const DEFAULT_IDEA_AUTOMATION_SETTINGS: IdeaAutomationSettings = {
    'Alex Woung': {videosPerWeek: 2, clipsPerWeek: 3, autoScheduleThreshold: 85, reviewThreshold: 75, minimumSpacingDays: 2, minimumClipScore: 85},
    'Alex Woung Raw': {videosPerWeek: 5, clipsPerWeek: 3, autoScheduleThreshold: 80, reviewThreshold: 70, minimumSpacingDays: 1, minimumClipScore: 85},
};


// Idea approval is independent from thumbnail/distribution approval.
function ideaIsArchived(record: AnyRecord, fields: any): boolean {
    return /^(Rejected|Duplicate|Archived)$/i.test(text(record, fields.ideaDecision));
}
function ideaNeedsApproval(record: AnyRecord, fields: any): boolean {
    const decision = text(record, fields.ideaDecision);
    if (/^Approved$/i.test(decision)) return false;
    if (/^(Needs Review|Auto Scheduled|Rejected|Duplicate|Archived)$/i.test(decision)) return true;
    // Preserve legacy content already in production. Newly created ideas carry Needs Review.
    return !option(record, fields.stage) && !text(record, fields.script) && !text(record, fields.youtubeUrl);
}
function nextIdeaDates(occupied: Array<{recording: string; publish: string}>, settings: ChannelIdeaSettings, now = new Date(), channel: ContentChannel = 'Alex Woung Raw'): {recording: string; publish: string} {
    const parts = new Intl.DateTimeFormat('en-CA', {timeZone: 'America/New_York', year:'numeric', month:'2-digit', day:'2-digit'}).formatToParts(now);
    const part = (name: string) => parts.find(p => p.type === name)!.value;
    const today = new Date(`${part('year')}-${part('month')}-${part('day')}T12:00:00Z`);
    const day = 86400000;
    if (channel === 'Alex Woung') {
        // One publication each Tuesday/Thursday. Record the pair on the Sunday
        // one week before its publication week. Catch-up work is due today.
        const booked = new Set(occupied.map(item => item.publish).filter(Boolean));
        for (let offset = 1; offset < 1825; offset++) {
            const publish = new Date(today.getTime() + offset * day);
            if (![2, 4].includes(publish.getUTCDay())) continue;
            const key = publish.toISOString().slice(0, 10);
            if (booked.has(key)) continue;
            const plannedRecording = publish.getTime() - (publish.getUTCDay() + 7) * day;
            const recording = new Date(Math.max(today.getTime(), plannedRecording));
            return {recording: recording.toISOString().slice(0, 10), publish: key};
        }
        throw new Error('No Tuesday or Thursday publishing slot is available.');
    }
    const first = new Date(today.getTime() + day);
    first.setUTCDate(first.getUTCDate() + ((7 - first.getUTCDay()) % 7));
    const spacing = Math.max(1, Math.round(settings.minimumSpacingDays || 1));
    const weekly = Math.max(1, Math.min(7, Math.round(settings.videosPerWeek || 1)));
    const parse = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(value+'T12:00:00Z').getTime() : NaN;
    // Raw ideas approved in the same editorial week share its Friday recording batch.
    // Preserve the planned Friday even on a late Saturday/Sunday approval; lateness
    // must not silently roll the batch into another week. Publishing stays separate.
    const batchFriday = new Date(today);
    batchFriday.setUTCDate(batchFriday.getUTCDate() - ((batchFriday.getUTCDay() + 6) % 7) + 4);
    const recordingKey = batchFriday.toISOString().slice(0, 10);
    const publishing = occupied.map(x=>parse(x.publish)).filter(Number.isFinite);
    const available = (candidate: number, dates: number[]) => {
        if(dates.some(x=>Math.abs(x-candidate)<spacing*day)) return false;
        // Enforce the weekly limit in every rolling seven-day window containing this candidate.
        for(let offset=0;offset<7;offset++) {
            const start=candidate-offset*day;
            if(dates.filter(x=>x>=start && x<start+7*day).length>=weekly) return false;
        }
        return true;
    };
    for(let offset=0;offset<1825;offset++) {
        const record=first.getTime()+offset*day, publish=record+2*day;
        if(available(publish,publishing)) return {recording:recordingKey,publish:new Date(publish).toISOString().slice(0,10)};
    }
    throw new Error('No schedule slot found. Review the channel cadence and existing dates.');
}

function toLocalDateTimeInput(value: string): string {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
}

function suggestedDistributionTime(platform: string, index: number, publishDate: string, clipsPerWeek: number): string {
    const now = new Date();
    const parentDate = publishDate ? new Date(`${publishDate}T12:00:00`) : now;
    const start = new Date(Math.max(now.getTime() + 86400000, parentDate.getTime() + 86400000));
    const weeklyLimit = Math.max(1, Math.min(7, Math.round(clipsPerWeek) || 3));
    const weekIndex = Math.floor(index / weeklyLimit);
    const positionInWeek = index % weeklyLimit;
    const dayWithinWeek = Math.floor(positionInWeek * 7 / weeklyLimit);
    start.setDate(start.getDate() + weekIndex * 7 + dayWithinWeek);
    start.setHours(/youtube/i.test(platform) ? 13 : 11, /youtube/i.test(platform) ? 0 : 30, 0, 0);
    return toLocalDateTimeInput(start.toISOString());
}

function redditCommunityForRecord(record: AnyRecord): string {
    const seed = String(record?.id ?? '');
    let hash = 0;
    for (const character of seed) hash = ((hash * 31) + character.charCodeAt(0)) >>> 0;
    return REDDIT_COMMUNITIES[hash % REDDIT_COMMUNITIES.length];
}

function existingSelectChoice(fieldValue: AnyField | null, preferredNames: string[]): string {
    const choices = Array.isArray(fieldValue?.options?.choices) ? fieldValue.options.choices : [];
    for (const preferred of preferredNames) {
        const match = choices.find((choice: any) => String(choice?.name ?? '').toLowerCase() === preferred.toLowerCase());
        if (match?.name) return String(match.name);
    }
    return preferredNames[0];
}

function getCustomProperties(base: ReturnType<typeof useBase>) {
    const content = base.getTableByIdIfExists?.(CONTENT_TABLE_ID)
        ?? base.tables.find(table => table.name === 'Content Channels (Alex Woung)');
    const distribution = base.getTableByIdIfExists?.(DISTRIBUTION_TABLE_ID)
        ?? base.tables.find(table => table.name === 'Content Distribution');
    const clips = base.getTableByIdIfExists?.('tblg1Tj9atyxN0piT') ?? base.tables.find(table => table.name === 'Content Clips');
    const clipsProperty: any = {key: 'clipsTable', label: 'Clips table', type: 'table' as const};
    if (clips) clipsProperty.defaultValue = clips;
    const distributionProperty: any = {key: 'distributionTable', label: 'Distribution table', type: 'table' as const};
    if (distribution) distributionProperty.defaultValue = distribution;
    return [
        {key: 'contentTable', label: 'Content table', type: 'table' as const, defaultValue: content},
        distributionProperty,
        clipsProperty,
    ];
}

function field(table: AnyTable | undefined, id: string, names: string[] = []): AnyField | null {
    if (!table) return null;
    return table.fields?.find((candidate: AnyField) => candidate.id === id)
        ?? names.map(name => table.getFieldIfExists?.(name)).find(Boolean)
        ?? null;
}

function raw(record: AnyRecord | null, target: AnyField | null): any {
    if (!record || !target) return null;
    try { return record.getCellValue(target); } catch { return null; }
}

function text(record: AnyRecord | null, target: AnyField | null): string {
    if (!record || !target) return '';
    try { return record.getCellValueAsString(target)?.trim() ?? ''; } catch { return ''; }
}

function option(record: AnyRecord | null, target: AnyField | null): string {
    const value = raw(record, target);
    return value && typeof value === 'object' && !Array.isArray(value)
        ? String(value.name ?? '')
        : text(record, target);
}

// The long-form editing project is not proof of a short-clipping pass.
// Keep uncertain submissions locked until their provider outcome is reconciled.
function shortClipJob(record: AnyRecord | null, f: any) {
    const projectId = text(record, f.shortProjectId);
    const state = text(record, f.shortJobState);
    const sourceId = text(record, f.shortSourceAssetId);
    const finalId = text(record, f.finalAssetId);
    const submitted = Boolean(projectId || state || sourceId);
    const available = Boolean(f.shortProjectId && f.shortSourceAssetId && f.shortJobState);
    const sourceMatches = Boolean(finalId && sourceId && finalId === sourceId);
    return {projectId, state, sourceId, finalId, submitted, available, sourceMatches,
        blocked: submitted && (!sourceMatches || !projectId || /submitting|error|failed|uncertain/i.test(state))};
}

function hasText(...values: string[]) {
    return values.some(value => value.trim().length > 0);
}

function escapeNewsletterHtml(value: string): string {
    return value.replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
    }[character] || character));
}

function newsletterHtml(title: string, body: string): string {
    const paragraphs = body.split(/\n{2,}/).map(part => part.trim()).filter(Boolean);
    const content = paragraphs.map((paragraph, index) => {
        const safe = escapeNewsletterHtml(paragraph).replace(/\n/g, '<br/>');
        return index === 0
            ? `<p style="margin:0 0 22px;font-size:19px;line-height:1.65;color:#1e293b;font-weight:600">${safe}</p>`
            : `<p style="margin:0 0 20px;font-size:16px;line-height:1.75;color:#334155">${safe}</p>`;
    }).join('');
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f4f1ff;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"><div style="display:none;max-height:0;overflow:hidden">A practical breakdown from Alexander Woung.</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f1ff;padding:34px 14px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 18px 50px rgba(46,16,101,.12)"><tr><td style="padding:30px 38px;background:linear-gradient(135deg,#6d28d9,#9333ea);color:#fff"><div style="font-size:13px;letter-spacing:2px;text-transform:uppercase;font-weight:800;opacity:.85">Alexander Woung</div><h1 style="margin:14px 0 0;font-size:34px;line-height:1.18;letter-spacing:-1px">${escapeNewsletterHtml(title || 'A practical growth breakdown')}</h1></td></tr><tr><td style="padding:38px">${content || '<p style="font-size:16px;line-height:1.75;color:#334155">Newsletter copy is being prepared.</p>'}<table role="presentation" cellspacing="0" cellpadding="0" style="margin:30px 0"><tr><td style="border-radius:12px;background:#7c3aed"><a href="https://dulcy.io" style="display:inline-block;padding:15px 22px;color:#fff;text-decoration:none;font-weight:800;font-size:15px">Build a predictable outbound system →</a></td></tr></table><p style="margin:28px 0 0;font-size:15px;line-height:1.7;color:#475569">Talk soon,<br><strong>Alex</strong></p></td></tr><tr><td style="padding:24px 38px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.6;color:#64748b">You received this because you subscribed to the Dulcy newsletter.<br><a href="{{unsubscribe_url}}" style="color:#6d28d9">Unsubscribe</a> · Dulcy Media LLC</td></tr></table></td></tr></table></body></html>`;
}

function normalizedStage(savedStage: string): string {
    const value = savedStage.toLowerCase();
    if (value === 'published' || value.includes('complete')) return 'Published';
    if (value.includes('ready to publish') || value.includes('youtube') || value.includes('upload')) return 'Upload';
    if (value.includes('distribution') || value.includes('distribut')) return 'Distribute';
    if (value.includes('clip') || value.includes('short')) return 'Clips';
    if (value.includes('thumbnail')) return 'Thumbnail';
    if (value.includes('final')) return 'Finalize';
    if (value.includes('edit') || value === 'recorded') return 'Edit';
    if (value.includes('record')) return 'Record';
    if (value.includes('script')) return 'Script';
    return 'Idea';
}

// Display-only completion. Never calls a provider or mutates an Airtable record.
// A browser-automation lease is NOT a native schedule or proof of publication.
type CompletionRow = {id: string; platform: string; outputType: string; title: string; body: string; media: string; account: string; approval: string; status: string; scheduledAt: string; postUrl: string; parentIds: string[]; queueReceipt: string};
type CompletionInput = {id: string; finalAssetUrl: string; youtubeUrl: string; publishingStatus: string; publishDate: string; requiredIds: string[]; channels: string[]; rows: CompletionRow[]; now: number};
const QUEUE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
function completionUrl(value: string): boolean {
    try { const url = new URL(value); return url.protocol === 'https:' && Boolean(url.hostname); } catch { return false; }
}
function queueContentKey(row: CompletionRow): string {
    return JSON.stringify([row.platform, row.outputType, row.title, row.body, row.media, row.account]);
}
function verifiedAutomationQueue(row: CompletionRow, parentId: string, now: number): boolean {
    try {
        const q = JSON.parse(row.queueReceipt);
        const checked = Date.parse(q.verifiedAt), expires = Date.parse(q.validUntil), scheduled = Date.parse(q.scheduledAt);
        return row.platform === 'Reddit' && row.status === 'Draft' && !/denied|rejected|failed|cancelled|canceled|blocked/i.test(row.approval)
            && q.version === 1 && q.kind === 'browser-automation' && q.enabled === true && q.userApproved === true
            && typeof q.automationId === 'string' && q.automationId.length > 10
            && typeof q.contextVersion === 'string' && q.contextVersion.length > 10
            && q.recordId === row.id && q.parentId === parentId && q.contentKey === queueContentKey(row)
            && typeof q.destination === 'string' && /^r\/[A-Za-z0-9_]+$/.test(q.destination)
            && Number.isFinite(checked) && Number.isFinite(expires) && Number.isFinite(scheduled)
            && checked <= now && expires > now && expires > checked && expires - checked <= QUEUE_MAX_AGE_MS
            && scheduled > now && expires <= scheduled
            && (!row.scheduledAt || Date.parse(row.scheduledAt) === scheduled);
    } catch { return false; }
}
function distributionCompletion(input: CompletionInput) {
    const result = {complete: false, scheduled: 0, published: 0, automationQueued: 0, total: input.requiredIds.length, reason: ''};
    const fail = (reason: string) => ({...result, reason});
    if (!completionUrl(input.finalAssetUrl) || !completionUrl(input.youtubeUrl)) return fail('Finished video or YouTube destination is missing.');
    const longFormReady = input.publishingStatus === 'Published'
        || (input.publishingStatus === 'Scheduled' && Number.isFinite(Date.parse(input.publishDate)));
    if (!longFormReady) return fail('Verify the long-form publication or schedule.');
    if (!input.requiredIds.length || !input.channels.length) return fail('The required distribution outputs are not established.');
    if (new Set(input.requiredIds).size !== input.requiredIds.length) return fail('Reconcile duplicate distribution links.');
    const rows: CompletionRow[] = [];
    for (const id of input.requiredIds) {
        const matches = input.rows.filter(row => row.id === id && row.parentIds.includes(input.id));
        if (matches.length !== 1) return fail('A required distribution record is missing or ambiguous.');
        rows.push(matches[0]);
    }
    const channelPlatform: Record<string, string> = {'Instagram': 'Instagram', 'YouTube Shorts': 'YouTube', 'X / Twitter': 'X', 'Reddit': 'Reddit', 'LinkedIn': 'LinkedIn', 'Blog': 'Blog', 'Resource': 'Resource', 'Newsletter': 'Newsletter'};
    if (input.channels.some(channel => !channelPlatform[channel] || !rows.some(row => row.platform === channelPlatform[channel]))) return fail('A selected distribution channel has no output.');
    // Do not silently ignore an additional linked child that is absent from the expected manifest.
    if (input.rows.some(row => row.parentIds.includes(input.id) && !input.requiredIds.includes(row.id))) return fail('Reconcile the distribution manifest.');
    for (const row of rows) {
        if (/denied|rejected|failed|cancelled|canceled|blocked/i.test(row.approval) || /failed|cancelled|canceled|blocked/i.test(row.status)) return fail('A required output is blocked or failed.');
        if (row.status === 'Published' && completionUrl(row.postUrl)) { result.published++; continue; }
        if (row.status === 'Scheduled' && row.approval === 'Approved' && Number.isFinite(Date.parse(row.scheduledAt))) { result.scheduled++; continue; }
        if (verifiedAutomationQueue(row, input.id, input.now)) { result.automationQueued++; continue; }
        return fail(row.platform === 'Reddit' ? 'Reddit queue verification is missing, expired or changed.' : 'A required output still needs a verified schedule or published URL.');
    }
    return {...result, complete: true, reason: ''};
}
function completionDetail(value: ReturnType<typeof distributionCompletion>): string {
    return `${value.scheduled} scheduled, ${value.published} published${value.automationQueued ? `, ${value.automationQueued} Reddit queued via automation (not natively scheduled or published)` : ''}. Individual publication statuses remain unchanged.`;
}


function recordCompletion(record: AnyRecord, fields: any, rows: AnyRecord[], df: any, now: number) {
    const ids = raw(record, fields.distributionRecords);
    const channels = raw(record, fields.distributionChannels);
    return distributionCompletion({
        id: record.id, finalAssetUrl: text(record, fields.finalAssetUrl), youtubeUrl: text(record, fields.youtubeUrl),
        publishingStatus: option(record, fields.publishingStatus), publishDate: String(raw(record, fields.publishDate) || ''),
        requiredIds: Array.isArray(ids) ? ids.map((item: any) => item.id) : [],
        channels: Array.isArray(channels) ? channels.map((item: any) => item.name) : [], now,
        rows: rows.map(row => ({id: row.id, platform: option(row, df.platform), outputType: option(row, df.outputType),
            title: text(row, df.draftTitle), body: text(row, df.draftBody), media: text(row, df.mediaUrl), account: text(row, df.account),
            approval: option(row, df.approvalStatus), status: option(row, df.publishingStatus), scheduledAt: String(raw(row, df.scheduledAt) || ''),
            postUrl: text(row, df.postUrl), queueReceipt: text(row, df.queueReceipt),
            parentIds: Array.isArray(raw(row, df.parentContent)) ? raw(row, df.parentContent).map((item: any) => item.id) : []})),
    });
}
function displayedContentStage(record: AnyRecord | null, fields: any, complete: boolean): string {
    if (complete) return 'Published';
    if (text(record, fields.youtubeUrl)) return Array.isArray(raw(record, fields.clips)) && raw(record, fields.clips).length > 0 ? 'Distribute' : 'Clips';
    if (/approved|complete/i.test(option(record, fields.thumbnailStatus))) return 'Upload';
    const stage = normalizedStage(option(record, fields.stage));
    return stage === 'Published' ? 'Distribute' : stage;
}

function conciseVideoSummary(title: string, source: string): string {
    const cleaned = source.replace(/\s+/g, ' ').trim();
    if (cleaned) {
        const sentences = cleaned.match(/[^.!?]+[.!?]+/g)?.slice(0, 3).join(' ').trim();
        return (sentences || cleaned).slice(0, 700).trim();
    }
    return `In this video, I break down ${title || 'the topic'} and show you how to apply it. You will learn the practical steps, avoid the common mistakes, and turn the lesson into a repeatable system that creates better results with less guesswork.`;
}

function buildYouTubeDescription(channel: ContentChannel | '', title: string, source: string, chapters: string): string {
    const summary = conciseVideoSummary(title, source);
    const chapterBlock = chapters.trim() ? `\n\n***\n\nChapters:\n${chapters.trim()}` : '';
    if (channel === 'Alex Woung Raw') {
        return `${summary}${chapterBlock}\n\n***\n\nConnect with me:\n\nInstagram: https://www.instagram.com/alexander.woung\nTwitter: https://x.com/alexwoung\nLinkedIn: https://www.linkedin.com/in/alexanderwoung/\nYoutube Main: https://www.youtube.com/@alexwoung`;
    }
    const bridge = `This is one part of building a predictable growth system. See how it fits into the best way to grow an online business as a beginner: https://www.youtube.com/watch?v=PhPoRP3eyMc`;
    return `${bridge}\n\n***\n\nDo you want done-for-you cold email:\nhttps://dulcy.io\n\nJoin Agency Ignition:\nhttps://agencyignition.io/ (7-day free trial)\n\nWant help to hit a $100k/mo (1:1):\nhttps://dealflux.io/\n\n***\n\n${summary}${chapterBlock}\n\n***\n\nConnect with me:\nInstagram: https://www.instagram.com/alexander.woung\nTwitter: https://x.com/alexwoung\nLinkedIn: https://www.linkedin.com/in/alexanderwoung/`;
}

function nextStep(record: AnyRecord, f: Record<string, AnyField | null>, completion: ReturnType<typeof distributionCompletion>) {
    if (completion.complete) return {title: 'Distribution complete', detail: completionDetail(completion), action: '', button: 'View record', href: text(record, f.youtubeUrl)};
    if (ideaNeedsApproval(record, f)) return {title: 'Review this idea', detail: 'Approve this idea in Content schedule to assign dates and begin production.', action: '', button: '', href: ''};
    const script = text(record, f.script);
    const rawFolder = text(record, f.rawFolderUrl);
    const finalFolder = text(record, f.finalFolderUrl);
    const finalAsset = text(record, f.finalAssetUrl);
    const opusId = text(record, f.opusProjectId);
    const opusStatus = option(record, f.opusStatus).toLowerCase();
    const clips = raw(record, f.clips);
    const clipCount = Array.isArray(clips) ? clips.length : 0;
    const selectedDistributionChannels = raw(record, f.distributionChannels);
    const distributionChannelCount = Array.isArray(selectedDistributionChannels) ? selectedDistributionChannels.length : 0;
    const distribution = option(record, f.distributionStatus).toLowerCase();
    const publishing = option(record, f.publishingStatus).toLowerCase();
    const editingRoute = option(record, f.editingRoute);
    const frameMessage = text(record, f.message);
    const youtubeUrl = text(record, f.youtubeUrl);
    const recordingSynced = /recorded footage found|recording found|raw video found/i.test(frameMessage);
    const longFormSubmitted = /long-form edit project (?:created|submitted)|long-form edit (?:submitted|processing)/i.test(frameMessage);
    const shortJob = shortClipJob(record, f);
    const thumbnailUrl = text(record, f.finalThumbnailUrl);
    const thumbnailApproved = /approved|complete/i.test(option(record, f.thumbnailStatus));
    const youtubeTitle = text(record, f.youtubeTitle);
    const youtubeDescription = text(record, f.youtubeDescription);

    if (!script) return {title: 'Generate the recording script', detail: 'Create a fresh, teleprompter-ready script shaped around this topic instead of repeating the same formula.', action: 'Generate Script', button: 'Generate script', href: ''};
    if (!rawFolder) return {title: 'Create the recording folder', detail: 'Set up the Frame.io folders for this video.', action: 'Sync Frame.io', button: 'Set up Frame.io', href: ''};
    // A finished video has already passed editing. The route chooser is hidden
    // once a final is linked, so an empty legacy route must not block thumbnails.
    if (!finalAsset && !editingRoute) return {title: 'Choose how this video will be edited', detail: 'Use OpusClip for the automated path, or choose DaVinci Resolve to edit the full video yourself.', action: '', button: 'Choose editing route below', href: ''};
    if (!finalAsset && /manual editor|davinci resolve/i.test(editingRoute)) return {title: 'Edit in DaVinci Resolve', detail: 'Download the recording, complete the edit in DaVinci Resolve, then upload the finished video into the Final folder.', action: '', button: 'Open final upload folder', href: finalFolder || rawFolder};
    if (!finalAsset && editingRoute === 'OpusClip' && !recordingSynced) return {title: 'Sync the uploaded recording', detail: 'Refresh Frame.io so the system can find the uploaded video before sending it to OpusClip.', action: 'Sync Frame.io', button: 'Sync Frame.io', href: ''};
    if (!finalAsset && editingRoute === 'OpusClip' && !longFormSubmitted) return {title: 'Start the full-video edit', detail: 'Import the raw recording into OpusClip without creating shorts yet. Edit and export the complete long-form video first.', action: 'Submit to OpusClip', button: 'Edit full video', href: ''};
    if (!finalAsset && editingRoute === 'OpusClip') return {title: 'Finalize the long-form video', detail: 'Complete the edit in OpusClip, export it, then upload the finalized video into the Final folder.', action: '', button: 'Upload finalized video', href: finalFolder || ''};
    if (!thumbnailUrl) return {title: 'Generate and review the thumbnail', detail: 'Create an original 16:9 YouTube thumbnail from the title, description, current topic patterns, and your approved Frame.io portrait library.', action: 'Generate Thumbnail', button: 'Generate thumbnail', href: ''};
    if (!thumbnailApproved) return {title: 'Approve the YouTube thumbnail', detail: 'Review the generated thumbnail in Frame.io, then approve it below before uploading the long-form video.', action: '', button: 'Review thumbnail', href: thumbnailUrl};
    if (!youtubeTitle || !youtubeDescription) return {title: 'Prepare the YouTube upload', detail: 'Generate the channel-specific title and description, then review them with the approved thumbnail before opening YouTube Studio.', action: 'Prepare YouTube Details', button: 'Prepare YouTube details', href: ''};
    if (!youtubeUrl) return {title: 'Upload the long-form video to YouTube', detail: 'Copy the prepared title and description below, upload the finalized video and approved thumbnail in YouTube Studio, then save its YouTube URL here.', action: '', button: 'Open YouTube Studio', href: 'https://studio.youtube.com/'};
    if (!shortJob.available) return {title: 'Short-clip tracking needs setup', detail: 'Expose the short-project, source-asset, and job-state fields in this interface before starting clips.', action: '', button: '', href: ''};
    if (!shortJob.finalId) return {title: 'Sync the finalized source', detail: 'Sync Frame.io to register the exact finished video before starting short clips.', action: 'Sync Frame.io', button: 'Sync Frame.io', href: ''};
    if (shortJob.blocked) return {title: 'Reconcile the short-clips job', detail: 'The short-clips submission needs verification or belongs to a different final asset. Preserve the existing job; do not submit another.', action: '', button: '', href: ''};
    if (!shortJob.submitted) return {title: 'Create short clips from the finalized video', detail: 'The completed long-form video is ready. Create a separate ClipBasic project for shorts and reels.', action: 'Submit to OpusClip', button: 'Create short clips', href: ''};
    if (clipCount === 0) return {title: 'Clips are being created', detail: 'Check the verified short-clipping project for completed clips.', action: 'Refresh Opus Clips', button: 'Check clip status', href: ''};
    if (clipCount > 0 && !['drafts ready', 'scheduled', 'published'].includes(distribution) && !distribution.includes('complete') && !(Array.isArray(raw(record, f.distributionRecords)) && raw(record, f.distributionRecords).length > 0)) {
        if (distributionChannelCount === 0) return {title: 'Choose the distribution outputs', detail: 'Select how many clips you want and which channels should receive repurposed content.', action: '', button: 'Configure below', href: ''};
        return {title: 'Create the distribution pack', detail: 'Turn the approved video into posts, captions, Reddit drafts, and newsletter material.', action: 'Generate Distribution Pack', button: 'Generate posts', href: ''};
    }
    return {title: 'Review distribution completion', detail: completion.reason || 'Verify all required schedules or publication receipts.', action: '', button: 'Review drafts', href: ''};
}

const card = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm';

class ContentCenterErrorBoundary extends React.Component<{children: React.ReactNode}, {error: Error | null}> {
    state = {error: null as Error | null};
    static getDerivedStateFromError(error: Error) { return {error}; }
    render() {
        if (!this.state.error) return this.props.children;
        return <div className="min-h-screen bg-slate-50 p-10"><div className="mx-auto max-w-3xl rounded-3xl border border-red-200 bg-white p-8 shadow-lg"><div className="text-xs font-bold uppercase tracking-widest text-red-600">Content Center error</div><h1 className="mt-3 text-2xl font-black">The interface could not load</h1><p className="mt-4 rounded-xl bg-red-50 p-4 font-mono text-sm text-red-800">{this.state.error.message}</p><button className="mt-5 rounded-xl bg-purple-600 px-5 py-3 font-bold text-white" onClick={() => this.setState({error: null})}>Try again</button></div></div>;
    }
}

// Thumbnail requests are isolated from approval/publishing and never mutate Airtable here.
function useThumbnailRequests(recordId: string, thumbnailUrl: string, status: string, youtubeUrl: string) {
    const [open, setOpen] = useState(false);
    const [changes, setChanges] = useState('');
    const [feedback, setFeedback] = useState('');
    const [requestError, setRequestError] = useState('');
    const [requestVersion, refresh] = useState(0);
    const locks = useRef(new Map<string, {url: string; accepted: boolean; sawGenerating: boolean}>());
    const selection = useRef({recordId, epoch: 0});
    if (selection.current.recordId !== recordId) selection.current = {recordId, epoch: selection.current.epoch + 1};
    useEffect(() => {
        setOpen(false); setChanges(''); setFeedback(''); setRequestError('');
    }, [recordId]);
    const generating = /^generating$/i.test(status.trim());
    useEffect(() => {
        const lock = locks.current.get(recordId);
        if (!lock) return;
        if (generating) lock.sawGenerating = true;
        if (lock.accepted && (thumbnailUrl !== lock.url || /error|failed/i.test(status) || (lock.sawGenerating && !generating))) {
            locks.current.delete(recordId); refresh(value => value + 1);
            setFeedback('');
        }
    }, [recordId, thumbnailUrl, status, generating, requestVersion]);
    const pending = locks.current.has(recordId);
    const blocked = generating || pending;
    const validationError = !changes.trim() ? 'Describe the thumbnail changes (1–2,000 characters).' : changes.trim().length > 2000 ? 'Keep changes to 2,000 characters or fewer.' : '';
    function cancel() { setOpen(false); setChanges(''); setRequestError(''); }
    async function submit(action: 'Generate Thumbnail' | 'Revise Thumbnail') {
        if (!recordId || youtubeUrl || generating || locks.current.has(recordId)) return;
        if (action === 'Revise Thumbnail' && (!thumbnailUrl || validationError)) {
            setRequestError(!thumbnailUrl ? 'Generate a thumbnail before requesting changes.' : validationError); return;
        }
        const epoch = selection.current.epoch;
        const isCurrent = () => selection.current.recordId === recordId && selection.current.epoch === epoch;
        const requestId = globalThis.crypto.randomUUID();
        locks.current.set(recordId, {url: thumbnailUrl, accepted: false, sawGenerating: false});
        refresh(value => value + 1); setRequestError(''); setFeedback('Submitting thumbnail request…');
        try {
            const response = await fetch(action === 'Revise Thumbnail' ? 'https://n8n.dulcy.io/webhook/REDACTED_PATH' : 'https://n8n.dulcy.io/webhook/REDACTED_PATH', {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(action === 'Revise Thumbnail' ? {recordId, action, changes: changes.trim(), requestId, expectedThumbnailUrl: thumbnailUrl} : {recordId, action}),
            });
            const data = await response.json().catch(() => null);
            if (action === 'Revise Thumbnail' ? (response.status !== 202 || data?.accepted !== true || data?.requestId !== requestId) : !response.ok) {
                throw new Error(data?.message || `Thumbnail request was not accepted (${response.status}).`);
            }
            const lock = locks.current.get(recordId);
            if (lock) lock.accepted = true;
            if (isCurrent()) {
                setOpen(false); setChanges('');
                setFeedback(action === 'Revise Thumbnail' ? 'Request accepted. Generation is in progress; the new thumbnail will appear here for review when ready.' : 'Thumbnail generation started. This screen will update when the image is ready for review.');
            }
        } catch (err: any) {
            locks.current.delete(recordId);
            if (isCurrent()) { setFeedback(''); setRequestError(err?.message || 'The thumbnail request failed. Your changes have been kept.'); }
        } finally { if (isCurrent()) refresh(value => value + 1); }
    }
    return {open, setOpen, changes, setChanges, feedback, requestError, validationError, generating, pending, blocked, cancel, submit};
}

function ContentCenter(): React.ReactElement {
    const base = useBase();
    const {customPropertyValueByKey} = useCustomProperties(getCustomProperties);
    const table = (customPropertyValueByKey.contentTable as AnyTable | undefined)
        ?? base.getTableByIdIfExists?.(CONTENT_TABLE_ID);
    const records = (useRecords(table ?? null) ?? []).filter((record: AnyRecord) => Boolean(record?.id));
    const distributionTable = (customPropertyValueByKey.distributionTable as AnyTable | undefined)
        ?? base.getTableByIdIfExists?.(DISTRIBUTION_TABLE_ID)
        ?? base.tables.find(candidate => candidate.name === 'Content Distribution');
    // useRecords requires a real table object. Falling back to the already
    // configured content table keeps the extension loadable while Airtable is
    // refreshing or before the Distribution table setting has been selected.
    const distributionRecords = (useRecords(distributionTable ?? table) ?? []).filter((record: AnyRecord) => Boolean(record?.id));
    const clipsTable = (customPropertyValueByKey.clipsTable as AnyTable | undefined)
        ?? base.getTableByIdIfExists?.('tblg1Tj9atyxN0piT')
        ?? base.tables.find(candidate => candidate.name === 'Content Clips');
    const clipRecords = (useRecords(clipsTable ?? table) ?? []).filter((record: AnyRecord) => Boolean(record?.id));
    const cf = useMemo(() => ({
        name: field(clipsTable, 'fldaBp4mojdTWCTLk'),
        opusId: field(clipsTable, 'fldzR1TM7K288Dsto'),
        media: field(clipsTable, 'flddpK92veotSNWxV'),
        refreshIntent: field(clipsTable, 'fldHPQdkRjYozUdGp'),
        snapshot: field(clipsTable, 'fldG9gklzS07bEbrz'),
        score: field(clipsTable, 'fldb8Z6t9ASVd3Jtx'),
        status: field(clipsTable, 'fldYjoD70SRrSlBox'),
        parent: field(clipsTable, 'fldU7Rtnsm0zjnLHp'),
        transcript: field(clipsTable, 'fldL2TMrJ9rnwXltx'),
        notes: field(clipsTable, 'fldbMj0DrFB8QmLNC'),
    }), [clipsTable]);
    const [reviewSection, setReviewSection] = useState<'clips' | 'posts'>('clips');
    const previewRefreshInFlight = useRef(new Set<string>());
    const [previewRefreshBusy, setPreviewRefreshBusy] = useState<Record<string, boolean>>({});
    const [previewRefreshNotice, setPreviewRefreshNotice] = useState<Record<string, string>>({});
    const [selectedFinalIds, setSelectedFinalIds] = useState<Record<string, string>>({});
    function currentReview(clip: AnyRecord) {
        try {
            const c = JSON.parse(text(clip, cf.snapshot) || 'null');
            const original = text(clip, cf.opusId);
            const parents = clip.getCellValue(cf.parent) || [];
            return c && c.mode === 'current-render-v1' && c.id === clip.id && parents.length === 1 &&
                c.parentId === parents[0].id && original === `${c.projectId}.${c.originalClipId}` &&
                Number.isSafeInteger(c.version) && c.version > 0 && c.final?.renderReady === true &&
                typeof c.final.reviewGeneration === 'string' && /^[A-Za-z0-9]+$/.test(c.final.clipId) &&
                /^https:\/\/signed-ext\.cdn\.opus\.pro\//.test(c.final.url || '') ? c : null;
        } catch { return null; }
    }
    function finalSelection(clip: AnyRecord) {
        return selectedFinalIds[clip.id] ?? currentReview(clip)?.final.clipId ?? text(clip, cf.opusId).split('.')[1] ?? '';
    }
    async function requestCurrentReview(clip: AnyRecord, action: 'refresh-current' | 'approve-current' | 'reject-current') {
        if (previewRefreshInFlight.current.has(clip.id)) return;
        previewRefreshInFlight.current.add(clip.id);
        setPreviewRefreshBusy(current => ({...current, [clip.id]: true}));
        let requestSaved = false;
        let timeout: ReturnType<typeof setTimeout> | undefined;
        try {
            if (!clipsTable || !cf.refreshIntent || !cf.snapshot) throw new Error('Managed review is not configured.');
            const original = /^(P[A-Za-z0-9]+)\.([A-Za-z0-9]+)$/.exec(text(clip, cf.opusId));
            const parents = clip.getCellValue(cf.parent) || [];
            const snapshot = currentReview(clip);
            const finalClipId = finalSelection(clip).trim();
            if (!original || parents.length !== 1 || !/^[A-Za-z0-9]+$/.test(finalClipId)) throw new Error('Choose the exact final clip ID within this original project.');
            if (text(clip, cf.snapshot) && !snapshot) throw new Error('Review snapshot is inconsistent. Reconcile it before requesting changes.');
            if (action !== 'refresh-current' && (!snapshot || finalClipId !== snapshot.final.clipId)) throw new Error('Refresh and review this selected copy before deciding.');
            const intent = {schemaVersion: 1, action, recordId: clip.id, parentId: parents[0].id,
                projectId: original[1], originalClipId: original[2], finalClipId,
                expectedVersion: snapshot?.version ?? 0, reviewGeneration: snapshot?.final.reviewGeneration ?? null, nonce: crypto.randomUUID()};
            const fields = {[cf.refreshIntent.id]: JSON.stringify(intent)};
            if (!clipsTable.hasPermissionToUpdateRecord(clip, fields)) throw new Error('You do not have permission to request review.');
            await clipsTable.updateRecordAsync(clip.id, fields);
            requestSaved = true;
            const controller = new AbortController();
            timeout = setTimeout(() => controller.abort(), 30000);
            const response = await fetch('https://n8n.dulcy.io/webhook/REDACTED_PATH', {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({recordId: clip.id}), signal: controller.signal,
            });
            if (!response.ok) throw new Error('Review request not acknowledged.');
            setPreviewRefreshNotice(current => ({...current, [clip.id]: 'Request accepted. Wait for the verified review status below to update. This request does not schedule or publish anything.'}));
        } catch (error) {
            setPreviewRefreshNotice(current => ({...current, [clip.id]: requestSaved
                ? 'Request saved; outcome not confirmed. Check the verified review status before retrying. Do not assume approval or completion.'
                : (error instanceof Error ? error.message : 'Review request failed.')}));
        } finally {
            if (timeout) clearTimeout(timeout);
            previewRefreshInFlight.current.delete(clip.id);
            setPreviewRefreshBusy(current => ({...current, [clip.id]: false}));
        }
    }

    const automationSettingsTable = base.getTableByIdIfExists?.(AUTOMATION_SETTINGS_TABLE_ID)
        ?? base.tables.find(candidate => candidate.name === 'Content Automation Settings');
    const automationSettingsRecords = (useRecords(automationSettingsTable ?? table) ?? []).filter((record: AnyRecord) => Boolean(record?.id));
    const df = useMemo(() => ({
        parentContent: field(distributionTable, DISTRIBUTION_FIELD_IDS.parentContent, ['Parent Content']),
        contentClip: field(distributionTable, DISTRIBUTION_FIELD_IDS.contentClip, ['Content Clip']),
        deduplicationKey: field(distributionTable, DISTRIBUTION_FIELD_IDS.deduplicationKey, ['Deduplication Key']),
        platform: field(distributionTable, DISTRIBUTION_FIELD_IDS.platform, ['Platform']),
        outputType: field(distributionTable, DISTRIBUTION_FIELD_IDS.outputType, ['Output Type']),
        draftTitle: field(distributionTable, DISTRIBUTION_FIELD_IDS.draftTitle, ['Draft Title']),
        draftBody: field(distributionTable, DISTRIBUTION_FIELD_IDS.draftBody, ['Draft Body']),
        mediaUrl: field(distributionTable, DISTRIBUTION_FIELD_IDS.mediaUrl, ['Media URL']),
        approvalStatus: field(distributionTable, DISTRIBUTION_FIELD_IDS.approvalStatus, ['Approval Status']),
        publishingStatus: field(distributionTable, DISTRIBUTION_FIELD_IDS.publishingStatus, ['Publishing Status']),
        scheduledAt: field(distributionTable, DISTRIBUTION_FIELD_IDS.scheduledAt, ['Scheduled At']),
        postUrl: field(distributionTable, DISTRIBUTION_FIELD_IDS.postUrl, ['Published URL', 'Post URL', 'External Post URL']),
        account: field(distributionTable, DISTRIBUTION_FIELD_IDS.account, ['Content Channel']),
        queueReceipt: field(distributionTable, DISTRIBUTION_FIELD_IDS.queueReceipt, ['Automation Queue Receipt']),
    }), [distributionTable]);

    const f = useMemo(() => ({
        title: field(table, FIELD_IDS.title, ['Title']),
        description: field(table, FIELD_IDS.description, ['Description']),
        script: field(table, FIELD_IDS.script, ['Script']),
        status: field(table, FIELD_IDS.status, ['Status']),
        stage: field(table, FIELD_IDS.stage, ['Production Stage']),
        rawFolderUrl: field(table, FIELD_IDS.rawFolderUrl, ['Frame.io Raw Folder URL']),
        finalFolderUrl: field(table, FIELD_IDS.finalFolderUrl, ['Frame.io Final Folder URL']),
        finalAssetUrl: field(table, FIELD_IDS.finalAssetUrl, ['Frame.io Final Asset URL']),
        finalAssetId: field(table, FIELD_IDS.finalAssetId, ['Frame.io Final Asset ID']),
        opusProjectId: field(table, FIELD_IDS.opusProjectId, ['OpusClip Project ID']),
        opusStatus: field(table, FIELD_IDS.opusStatus, ['OpusClip Status']),
        shortProjectId: field(table, FIELD_IDS.shortProjectId, ['OpusClip Short Project ID']),
        shortSourceAssetId: field(table, FIELD_IDS.shortSourceAssetId, ['OpusClip Short Source Asset ID']),
        shortJobState: field(table, FIELD_IDS.shortJobState, ['OpusClip Short Job State']),
        message: field(table, FIELD_IDS.message, ['Last Automation Message']),
        error: field(table, FIELD_IDS.error, ['Automation Error']),
        action: field(table, FIELD_IDS.action, ['Content Automation Action']),
        transcript: field(table, FIELD_IDS.transcript, ['YouTube Transcript']),
        distributionStatus: field(table, FIELD_IDS.distributionStatus, ['Distribution Status']),
        distributionRecords: field(table, FIELD_IDS.distributionRecords, ['Content Distribution']),
        thumbnailStatus: field(table, FIELD_IDS.thumbnailStatus, ['Thumbnail Status']),
        publishingStatus: field(table, FIELD_IDS.publishingStatus, ['Publishing Status']),
        youtubePublishedAt: field(table, FIELD_IDS.youtubePublishedAt, ['YouTube Published At']),
        youtubeUrl: field(table, FIELD_IDS.youtubeUrl, ['YouTube URL']),
        clips: field(table, FIELD_IDS.clips, ['Content Clips']),
        recordingDate: field(table, FIELD_IDS.recordingDate, ['Recording Date']),
        publishDate: field(table, FIELD_IDS.publishDate, ['Publish Date']),
    editingRoute: field(table, FIELD_IDS.editingRoute, ['Editing Route', 'Editing Path', 'Editor Route']),
        contentSource: field(table, FIELD_IDS.contentSource, ['Content Source']),
        finalThumbnailUrl: field(table, FIELD_IDS.finalThumbnailUrl, ['Final Thumbnail URL']),
        previousThumbnailUrl: field(table, '', ['Previous Thumbnail URL']),
        contentChannel: field(table, FIELD_IDS.contentChannel, ['Content Channel']),
        // Airtable can keep an already-open interface on the previous table schema
        // after new fields are added. Use the original content fields as a temporary
        // compatibility path until the interface reloads and exposes the dedicated
        // YouTube fields.
        youtubeTitle: field(table, FIELD_IDS.youtubeTitle, ['YouTube Title', 'Title']),
        youtubeDescription: field(table, FIELD_IDS.youtubeDescription, ['YouTube Description', 'Description']),
        youtubeChapters: field(table, FIELD_IDS.youtubeChapters, ['YouTube Chapters']),
        requestedClipCount: field(table, FIELD_IDS.requestedClipCount, ['Requested Clip Count']),
        minimumClipScore: field(table, FIELD_IDS.minimumClipScore, ['Minimum Clip Score']),
        distributionChannels: field(table, FIELD_IDS.distributionChannels, ['Distribution Channels']),
        ideaScore: field(table, FIELD_IDS.ideaScore, ['Idea Score']),
        ideaSourceUrl: field(table, FIELD_IDS.ideaSourceUrl, ['Idea Source URL']),
        ideaSourceCommunity: field(table, FIELD_IDS.ideaSourceCommunity, ['Idea Source Community']),
        ideaDecision: field(table, FIELD_IDS.ideaDecision, ['Idea Decision']),
        ideaQualificationReason: field(table, FIELD_IDS.ideaQualificationReason, ['Idea Qualification Reason']),
    }), [table]);

    const [completionNow, setCompletionNow] = useState(() => Date.now());
    useEffect(() => {
        const refresh = () => setCompletionNow(Date.now());
        const timer = window.setInterval(refresh, 30_000);
        window.addEventListener('focus', refresh);
        document.addEventListener('visibilitychange', refresh);
        return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
    }, []);
    const completions = useMemo(() => new Map<string, ReturnType<typeof distributionCompletion>>(records.map((record: AnyRecord) => [record.id, recordCompletion(record, f, distributionRecords, df, completionNow)])), [records, f, distributionRecords, df, completionNow]);
    const [recordingWeek, setRecordingWeek] = useState(() => currentRecordingWeek());
    useEffect(() => {
        // Refresh after the week changes, including tabs left open overnight.
        const refreshWeek = () => {
            const next = currentRecordingWeek();
            setRecordingWeek(previous => previous.start === next.start ? previous : next);
        };
        const timer = window.setInterval(refreshWeek, 60_000);
        window.addEventListener('focus', refreshWeek);
        document.addEventListener('visibilitychange', refreshWeek);
        return () => {
            window.clearInterval(timer);
            window.removeEventListener('focus', refreshWeek);
            document.removeEventListener('visibilitychange', refreshWeek);
        };
    }, []);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [activeOnly, setActiveOnly] = useState(true);
    const [view, setView] = useState<'pipeline' | 'calendar'>('pipeline');
    const [busy, setBusy] = useState(false);
    const decisionInFlight = useRef(false);
    const [notice, setNotice] = useState('');
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [showAddIdea, setShowAddIdea] = useState(false);
    const [ideaTitle, setIdeaTitle] = useState('');
    const [ideaDescription, setIdeaDescription] = useState('');
    const [ideaRecordingDate, setIdeaRecordingDate] = useState('');
    const [ideaPublishDate, setIdeaPublishDate] = useState('');
    const [ideaContentChannel, setIdeaContentChannel] = useState<ContentChannel>(DEFAULT_CONTENT_CHANNEL);
    const [recordingDateDraft, setRecordingDateDraft] = useState('');
    const [publishDateDraft, setPublishDateDraft] = useState('');
    const [contentChannelDraft, setContentChannelDraft] = useState<ContentChannel | ''>('');
    const [channelSaving, setChannelSaving] = useState(false);
    const [editingRouteDraft, setEditingRouteDraft] = useState<'OpusClip' | 'DaVinci Resolve'>('OpusClip');
    const [routeSaving, setRouteSaving] = useState(false);
    const [youtubeTitleDraft, setYoutubeTitleDraft] = useState('');
    const [youtubeDescriptionDraft, setYoutubeDescriptionDraft] = useState('');
    const [youtubeChaptersDraft, setYoutubeChaptersDraft] = useState('');
    const [youtubeUrlDraft, setYoutubeUrlDraft] = useState('');
    const [requestedClipCountDraft, setRequestedClipCountDraft] = useState('3');
    const [minimumClipScoreDraft, setMinimumClipScoreDraft] = useState('85');
    const [distributionChannelsDraft, setDistributionChannelsDraft] = useState<DistributionChannel[]>([]);
    const [showDraftReview, setShowDraftReview] = useState(false);
    const [draftPlatformTab, setDraftPlatformTab] = useState('');
    const [draftScheduleValues, setDraftScheduleValues] = useState<Record<string, string>>({});
    const [draftPublishedUrlValues, setDraftPublishedUrlValues] = useState<Record<string, string>>({});
    const [savingDraftId, setSavingDraftId] = useState<string | null>(null);
    const [draftApprovalOverrides, setDraftApprovalOverrides] = useState<Record<string, string>>({});
    const [draftReviewNotice, setDraftReviewNotice] = useState('');
    const [showIdeaSettings, setShowIdeaSettings] = useState(false);
    const [ideaSettingsChannel, setIdeaSettingsChannel] = useState<ContentChannel>('Alex Woung');
    const [ideaAutomationSettings, setIdeaAutomationSettings] = useState<IdeaAutomationSettings>(DEFAULT_IDEA_AUTOMATION_SETTINGS);

    useEffect(() => {
        if (!automationSettingsTable || automationSettingsRecords.length === 0) return;
        const next: IdeaAutomationSettings = {...DEFAULT_IDEA_AUTOMATION_SETTINGS};
        for (const record of automationSettingsRecords) {
            const channel = text(record, field(automationSettingsTable, AUTOMATION_SETTINGS_FIELD_IDS.channel, ['Channel'])) as ContentChannel;
            if (!CONTENT_CHANNELS.includes(channel)) continue;
            const numberValue = (fieldId: string, fallback: number) => {
                const value = Number(raw(record, field(automationSettingsTable, fieldId)));
                return Number.isFinite(value) ? value : fallback;
            };
            next[channel] = {
                videosPerWeek: numberValue(AUTOMATION_SETTINGS_FIELD_IDS.videosPerWeek, next[channel].videosPerWeek),
                clipsPerWeek: numberValue(AUTOMATION_SETTINGS_FIELD_IDS.clipsPerWeek, next[channel].clipsPerWeek),
                autoScheduleThreshold: numberValue(AUTOMATION_SETTINGS_FIELD_IDS.autoScheduleThreshold, next[channel].autoScheduleThreshold),
                reviewThreshold: numberValue(AUTOMATION_SETTINGS_FIELD_IDS.reviewThreshold, next[channel].reviewThreshold),
                minimumSpacingDays: numberValue(AUTOMATION_SETTINGS_FIELD_IDS.minimumSpacingDays, next[channel].minimumSpacingDays),
                minimumClipScore: numberValue(AUTOMATION_SETTINGS_FIELD_IDS.minimumClipScore, next[channel].minimumClipScore),
            };
        }
        setIdeaAutomationSettings(next);
    }, [automationSettingsTable, automationSettingsRecords]);

    async function saveIdeaAutomationSettings(): Promise<void> {
        if (!automationSettingsTable) throw new Error('Content Automation Settings table is unavailable. Reload Airtable and try again.');
        const updates = CONTENT_CHANNELS.map(channel => {
            const record = automationSettingsRecords.find(candidate => text(candidate, field(automationSettingsTable, AUTOMATION_SETTINGS_FIELD_IDS.channel, ['Channel'])) === channel);
            if (!record) throw new Error(`Missing automation settings record for ${channel}.`);
            const settings = channel === 'Alex Woung' ? {...ideaAutomationSettings[channel], videosPerWeek: 2, minimumSpacingDays: 2} : ideaAutomationSettings[channel];
            return {id: record.id, fields: {
                [AUTOMATION_SETTINGS_FIELD_IDS.enabled]: true,
                [AUTOMATION_SETTINGS_FIELD_IDS.videosPerWeek]: settings.videosPerWeek,
                [AUTOMATION_SETTINGS_FIELD_IDS.clipsPerWeek]: settings.clipsPerWeek,
                [AUTOMATION_SETTINGS_FIELD_IDS.autoScheduleThreshold]: settings.autoScheduleThreshold,
                [AUTOMATION_SETTINGS_FIELD_IDS.reviewThreshold]: settings.reviewThreshold,
                [AUTOMATION_SETTINGS_FIELD_IDS.minimumSpacingDays]: settings.minimumSpacingDays,
                [AUTOMATION_SETTINGS_FIELD_IDS.minimumClipScore]: settings.minimumClipScore,
            }};
        });
        setBusy(true);
        try {
            await automationSettingsTable.updateRecordsAsync(updates);
            setShowIdeaSettings(false);
            setNotice('Automation settings saved to Airtable and are available to n8n.');
        } finally { setBusy(false); }
    }

    const sorted = useMemo(() => [...records].sort((a, b) => {
        const aDate = earliestScheduleTime(a, f.recordingDate, f.publishDate);
        const bDate = earliestScheduleTime(b, f.recordingDate, f.publishDate);
        return aDate - bDate || String(text(a, f.title) || 'Untitled content').localeCompare(String(text(b, f.title) || 'Untitled content'));
    }), [records, f.title, f.recordingDate, f.publishDate]);

    const eligible = useMemo(() => activeOnly
        ? sorted.filter(record => isOnOrAfterContentCutoff(record, f.recordingDate, f.publishDate))
        : sorted, [sorted, activeOnly, f.recordingDate, f.publishDate]);

    const visible = useMemo(() => eligible.filter(record => {
        if (activeOnly && ideaIsArchived(record, f)) return false;
        if (activeOnly && completions.get(record.id)?.complete) return false;
        return (text(record, f.title) || 'Untitled content').toLowerCase().includes(search.trim().toLowerCase());
    }), [eligible, activeOnly, search, f.stage, f.title, f.ideaDecision, completions]);

    useEffect(() => {
        if (!selectedId || !visible.some(record => record.id === selectedId)) setSelectedId(visible[0]?.id ?? null);
    }, [eligible, visible, selectedId]);

    const selected = records.find(record => record.id === selectedId) ?? null;
    const thumbnailRequest = useThumbnailRequests(selected?.id || '', text(selected, f.finalThumbnailUrl), option(selected, f.thumbnailStatus), text(selected, f.youtubeUrl));
    const linkedDistributionRecords = useMemo(() => distributionRecords.filter(record => {
        const parents = raw(record, df.parentContent);
        return Boolean(selectedId) && Array.isArray(parents) && parents.some((parent: any) => parent?.id === selectedId);
    }), [distributionRecords, selectedId, df.parentContent]);
    const selectedDistributionRecords = useMemo(() => {
        const unique = new Map<string, AnyRecord>();
        for (const record of linkedDistributionRecords) {
            const linkedClips = raw(record, df.contentClip);
            const clipId = Array.isArray(linkedClips) ? linkedClips[0]?.id ?? '' : '';
            const stableKey = clipId
                ? [option(record, df.platform), option(record, df.outputType), clipId].join('|')
                : (text(record, df.deduplicationKey) || [option(record, df.platform), option(record, df.outputType), text(record, df.draftTitle)].join('|'));
            const existing = unique.get(stableKey);
            // Prefer the already-approved or scheduled row when duplicates exist.
            if (!existing || (/approved/i.test(option(record, df.approvalStatus)) && !/approved/i.test(option(existing, df.approvalStatus))) || (text(record, df.scheduledAt) && !text(existing, df.scheduledAt))) {
                unique.set(stableKey, record);
            }
        }
        return [...unique.values()];
    }, [linkedDistributionRecords, df.contentClip, df.deduplicationKey, df.platform, df.outputType, df.draftTitle, df.approvalStatus, df.scheduledAt]);
    const selectedClips = useMemo(() => !clipsTable || !selected ? [] : clipRecords
        .filter(record => { const parents = raw(record, cf.parent); return Array.isArray(parents) && parents.some((parent: any) => parent.id === selected.id); })
        .sort((a, b) => Number(raw(b, cf.score) || 0) - Number(raw(a, cf.score) || 0)), [clipRecords, clipsTable, selected?.id, cf]);
    const draftPlatforms = useMemo(() => Array.from(new Set(selectedDistributionRecords.map(record => option(record, df.platform) || 'Other'))), [selectedDistributionRecords, df.platform]);
    const selectedRecordingDate = selected ? recordDateKey(selected, f.recordingDate) : '';
    const selectedPublishDate = selected ? recordDateKey(selected, f.publishDate) : '';
    const savedContentChannel = option(selected, f.contentChannel);
    const selectedContentChannel: ContentChannel | '' = CONTENT_CHANNELS.includes(savedContentChannel as ContentChannel)
        ? savedContentChannel as ContentChannel
        : '';
    // Older records can have no channel selected. Settings must always resolve
    // to a valid channel so the interface can still load and use safe defaults.
    const selectedSettingsChannel: ContentChannel = selectedContentChannel || DEFAULT_CONTENT_CHANNEL;
    const selectedEditingRoute: 'OpusClip' | 'DaVinci Resolve' =
        /davinci|manual|editor/i.test(option(selected, f.editingRoute)) ? 'DaVinci Resolve' : 'OpusClip';

  useEffect(() => {
    setRecordingDateDraft(selectedRecordingDate);
    setPublishDateDraft(selectedPublishDate);
  }, [selected?.id, selectedRecordingDate, selectedPublishDate]);

  useEffect(() => {
    setContentChannelDraft(selectedContentChannel);
  }, [selected?.id]);

  // Load the saved editing route when switching content records. Do not keep
  // reapplying the current Airtable snapshot while the same record is open:
  // Airtable can briefly return the previous value after a save, which made a
  // valid OpusClip/DaVinci selection appear to snap back immediately.
  useEffect(() => {
    setEditingRouteDraft(selectedEditingRoute);
  }, [selected?.id]);

  useEffect(() => {
    setYoutubeTitleDraft(text(selected, f.youtubeTitle) || text(selected, f.title));
    setYoutubeDescriptionDraft(text(selected, f.youtubeDescription));
    setYoutubeChaptersDraft(text(selected, f.youtubeChapters));
    setYoutubeUrlDraft(text(selected, f.youtubeUrl));
  }, [selected?.id, f.youtubeTitle, f.youtubeDescription, f.youtubeChapters, f.youtubeUrl, f.title]);

  useEffect(() => {
    const savedCount = Number(raw(selected, f.requestedClipCount) ?? 3);
    setRequestedClipCountDraft(String(Number.isFinite(savedCount) && savedCount > 0 ? Math.round(savedCount) : 3));
    const channelMinimumScore = ideaAutomationSettings[selectedSettingsChannel]?.minimumClipScore ?? 85;
    setMinimumClipScoreDraft(String(channelMinimumScore));
    const savedChannels = raw(selected, f.distributionChannels);
    setDistributionChannelsDraft(Array.isArray(savedChannels)
        ? savedChannels.map((value: any) => String(value?.name ?? value)).filter((value: string) => DISTRIBUTION_CHANNELS.includes(value as DistributionChannel) && (RESOURCE_AUTOMATION_ENABLED || value !== 'Resource')) as DistributionChannel[]
        : []);
  }, [selected?.id, selectedSettingsChannel, ideaAutomationSettings, f.requestedClipCount, f.minimumClipScore, f.distributionChannels]);

  useEffect(() => {
    if (!showDraftReview) return;
    setDraftPlatformTab(current => draftPlatforms.includes(current) ? current : (draftPlatforms[0] ?? ''));
    setDraftScheduleValues(current => {
        const nextValues = {...current};
        const platformIndexes: Record<string, number> = {};
        for (const record of selectedDistributionRecords) {
            const platform = option(record, df.platform) || 'Other';
            const index = platformIndexes[platform] ?? 0;
            platformIndexes[platform] = index + 1;
            if (!nextValues[record.id]) {
                nextValues[record.id] = toLocalDateTimeInput(text(record, df.scheduledAt))
                    || suggestedDistributionTime(platform, index, selectedPublishDate, ideaAutomationSettings[selectedSettingsChannel]?.clipsPerWeek ?? 3);
            }
        }
        return nextValues;
    });
    setDraftPublishedUrlValues(current => {
        const nextValues = {...current};
        for (const record of selectedDistributionRecords) {
            if (!nextValues[record.id]) nextValues[record.id] = text(record, df.postUrl);
        }
        return nextValues;
    });
  }, [showDraftReview, selected?.id, selectedDistributionRecords, draftPlatforms, df.platform, df.scheduledAt, df.postUrl, selectedPublishDate, selectedSettingsChannel, ideaAutomationSettings]);

    const activePlatformDrafts = selectedDistributionRecords.filter(record => (option(record, df.platform) || 'Other') === draftPlatformTab);

    if (!table) return <div className="p-10"><div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">Choose the <strong>Content Channels (Alex Woung)</strong> table in the interface settings.</div></div>;
    const selectedCompletion = selected ? completions.get(selected.id)! : null;
    const currentStage = displayedContentStage(selected, f, Boolean(selectedCompletion?.complete));
    const stageIndex = Math.max(0, STAGES.indexOf(currentStage));
    const next = selected && selectedCompletion ? nextStep(selected, f, selectedCompletion) : null;
    const existingAction = option(selected, f.action);
    const error = text(selected, f.error);
    const message = text(selected, f.message);
    const recordingSynced = /recorded footage found|recording found|raw video found/i.test(message);
    const longFormSubmitted = /long-form edit project (?:created|submitted)|long-form edit (?:submitted|processing)/i.test(message);
    const shortJob = shortClipJob(selected, f);
    const shortClipsSubmitted = shortJob.submitted;
    const clipCount = Array.isArray(raw(selected, f.clips)) ? raw(selected, f.clips).length : 0;
    const requestedClipCount = Math.max(0, Math.round(Number(raw(selected, f.requestedClipCount) ?? 0)));
    // Airtable may contain duplicate linked rows from an earlier transcript
    // import. The status card should show the requested unique clip count while
    // never claiming more clips than are actually linked.
    const displayedClipCount = requestedClipCount > 0 ? Math.min(clipCount, requestedClipCount) : clipCount;
    const finalThumbnailUrl = text(selected, f.finalThumbnailUrl);
    const thumbnailStatus = option(selected, f.thumbnailStatus) || (finalThumbnailUrl ? 'Needs Review' : 'Not started');
    const awaitingYouTubePublish = /approved|complete/i.test(thumbnailStatus) && !text(selected, f.youtubeUrl);
    // The shared OpusClip project field is also populated by the first,
    // long-form editing pass. Do not count that project as repurposing work.
    const shortClipsProjectReady = Boolean(shortJob.projectId) && shortJob.sourceMatches && !shortJob.blocked;
    const shortClipsReviewUrl = shortJob.projectId && /^[A-Za-z0-9_-]+$/.test(shortJob.projectId) ? `https://clip.opus.pro/clip/${encodeURIComponent(shortJob.projectId)}` : '';

    async function prepareYouTubeDetails() {
        if (!selected || busy) return;
        if (!f.youtubeTitle || !f.youtubeDescription) {
            setNotice('Airtable is missing the YouTube Title or YouTube Description field.');
            return;
        }
        setBusy(true); setNotice('');
        try {
            const response = await fetch('https://n8n.dulcy.io/webhook/REDACTED_PATH', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({recordId: selected.id, action: 'Prepare YouTube Details'}),
            });
            if (response.ok) {
                setNotice('AI is preparing the YouTube title and description. vidIQ will score and refine them when YouTube Studio opens.');
                return;
            }

            // Keep the Content Center usable if the n8n workflow has not been
            // imported or activated yet.
            const title = youtubeTitleDraft.trim() || text(selected, f.title);
            const source = text(selected, f.description) || text(selected, f.script) || text(selected, f.transcript);
            const description = youtubeDescriptionDraft.trim() || buildYouTubeDescription(selectedContentChannel, title, source, youtubeChaptersDraft);
            const values: Record<string, any> = {
                [f.youtubeTitle.id]: title,
                [f.youtubeDescription.id]: description,
            };
            if (f.youtubeChapters && youtubeChaptersDraft.trim()) values[f.youtubeChapters.id] = youtubeChaptersDraft.trim();
            await table.updateRecordAsync(selected.id, values);
            setYoutubeTitleDraft(title);
            setYoutubeDescriptionDraft(description);
            setNotice('YouTube details prepared with the local channel template. The AI workflow was unavailable, so review them before uploading.');
        } catch (err: any) {
            setNotice(err?.message || 'The YouTube details could not be prepared.');
        } finally { setBusy(false); }
    }

    async function saveYouTubeDetails() {
        if (!selected || !f.youtubeTitle || !f.youtubeDescription || busy) return;
        setBusy(true); setNotice('');
        try {
            const values: Record<string, any> = {
                [f.youtubeTitle.id]: youtubeTitleDraft.trim(),
                [f.youtubeDescription.id]: youtubeDescriptionDraft.trim(),
            };
            if (f.youtubeChapters) values[f.youtubeChapters.id] = youtubeChaptersDraft.trim() || null;
            await table.updateRecordAsync(selected.id, values);
            setNotice('YouTube title, description, and chapters saved.');
        } catch (err: any) {
            setNotice(err?.message || 'The YouTube details could not be saved.');
        } finally { setBusy(false); }
    }

    async function saveYouTubeUrl() {
        if (!selected || !f.youtubeUrl || !youtubeUrlDraft.trim() || busy) return;
        setBusy(true); setNotice('');
        try {
            await table.updateRecordAsync(selected.id, {[f.youtubeUrl.id]: youtubeUrlDraft.trim()});
            setNotice('YouTube URL saved. This content is ready to move into repurposing.');
        } catch (err: any) {
            setNotice(err?.message || 'The YouTube URL could not be saved.');
        } finally { setBusy(false); }
    }

    async function retryDistributionDrafts() {
        if (!selected || busy || existingAction !== 'Generate Distribution Pack') return;
        setBusy(true); setNotice('');
        try {
            const response = await fetch('https://n8n.dulcy.io/webhook/REDACTED_PATH', {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({recordId: selected.id, action: 'Generate Distribution Pack'}),
            });
            if (!response.ok) throw new Error('Retry outcome not confirmed. Check the existing run before trying again.');
            setNotice('Retry accepted, not completed. Check the generated drafts before approval or scheduling. Do not retry while this run is working.');
        } catch (err: any) {
            setNotice(err?.message || 'Retry outcome unknown. Check the existing run before trying again.');
        } finally { setBusy(false); }
    }

    async function saveRepurposingBrief() {
        if (!selected || busy) return;
        if (!f.requestedClipCount || !f.minimumClipScore || !f.distributionChannels) {
            setNotice('Reload Airtable once so the new repurposing fields become available.');
            return;
        }
        const count = Math.max(1, Math.min(50, Math.round(Number(requestedClipCountDraft) || 3)));
        const minimumScore = Math.max(0, Math.min(100, Math.round(Number(minimumClipScoreDraft) || 85)));
        setBusy(true); setNotice('');
        try {
            const values: Record<string, any> = {
                [f.requestedClipCount.id]: count,
                [f.minimumClipScore.id]: minimumScore,
                [f.distributionChannels.id]: distributionChannelsDraft.filter(name => RESOURCE_AUTOMATION_ENABLED || name !== 'Resource').map(name => ({name})),
            };
            if (f.action && !existingAction && clipCount > 0) values[f.action.id] = {name: 'Generate Distribution Pack'};
            await table.updateRecordAsync(selected.id, values);
            setRequestedClipCountDraft(String(count));
            setMinimumClipScoreDraft(String(minimumScore));
            setNotice(clipCount > 0
                ? `Repurposing brief saved. Distribution drafts are now being generated from clips scoring ${minimumScore} or higher.`
                : `Repurposing brief saved. Only clips scoring ${minimumScore} or higher will be used once clips are available.`);
        } catch (err: any) {
            setNotice(err?.message || 'The repurposing brief could not be saved.');
        } finally { setBusy(false); }
    }

    function toggleDistributionChannel(channel: DistributionChannel) {
        if (channel === 'Resource' && !RESOURCE_AUTOMATION_ENABLED) return;
        setDistributionChannelsDraft(current => current.includes(channel)
            ? current.filter(value => value !== channel)
            : [...current, channel]);
    }

    async function copyText(value: string, label: string) {
        if (!value) return;
        try {
            await navigator.clipboard.writeText(value);
            setNotice(`${label} copied.`);
        } catch {
            setNotice(`Could not copy ${label.toLowerCase()}. Select the text and copy it manually.`);
        }
    }

    async function runAction(action: string) {
        if (!selected || !action || busy || existingAction) return;
        if ((action === 'Submit to OpusClip' || action === 'Refresh Opus Clips') && text(selected, f.finalAssetUrl)) {
            const job = shortClipJob(selected, f);
            if (!job.available || !job.finalId || job.blocked || (action === 'Submit to OpusClip' && job.submitted) || (action === 'Refresh Opus Clips' && (!job.projectId || !job.sourceMatches))) {
                setNotice('Short-clips job identity must be verified before this action. No duplicate project was submitted.');
                return;
            }
        }
        if (action === 'Prepare YouTube Details') {
            await prepareYouTubeDetails();
            return;
        }
        if (action === 'Generate Thumbnail') {
            await thumbnailRequest.submit('Generate Thumbnail');
            return;
        }
        setBusy(true); setNotice('');
        try {
            if (action === 'Generate Script') {
                const response = await fetch('https://n8n.dulcy.io/webhook/REDACTED_PATH', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({recordId: selected.id, action}),
                });
                if (!response.ok) throw new Error(`Script automation returned ${response.status}.`);
                setNotice('Script generation started. The teleprompter draft will appear here when it is ready.');
                return;
            }
            if (!f.action) throw new Error('Airtable is missing the Content Automation Action field.');
            await table.updateRecordAsync(selected.id, {[f.action.id]: {name: action}});
            setNotice(`${action} started. This screen will update when the automation finishes.`);
        } catch (err: any) {
            setNotice(err?.message || 'The action could not be started.');
        } finally { setBusy(false); }
    }

    async function setEditingRoute(route: 'OpusClip' | 'DaVinci Resolve') {
    if (!selected || routeSaving) return;
    if (!f.editingRoute) {
      setNotice('Airtable is missing the Editing Route field. Add it as a single select with OpusClip and DaVinci Resolve options.');
      return;
    }
        const previousRoute = editingRouteDraft;
        setEditingRouteDraft(route);
        setRouteSaving(true); setNotice('');
        try {
            let savedRoute: string = route;
            if (f.editingRoute.type === 'singleSelect') {
                const choices = ((f.editingRoute.options as any)?.choices ?? []) as Array<{name: string}>;
                const match = choices.find(choice => route === 'OpusClip'
                    ? /opus\s*clip/i.test(choice.name)
                    : /davinci|manual|editor/i.test(choice.name));
                if (!match) {
                    const available = choices.map(choice => choice.name).filter(Boolean).join(', ') || 'none';
                    throw new Error(route === 'OpusClip'
                        ? `Add an OpusClip choice to the Editing Route field in Airtable. Current choices: ${available}.`
                        : `Add a DaVinci or Manual Editor choice to the Editing Route field in Airtable. Current choices: ${available}.`);
                }
                savedRoute = match.name;
            }
            const routeValue = f.editingRoute.type === 'singleSelect' ? {name: savedRoute} : savedRoute;
            await table.updateRecordAsync(selected.id, {[f.editingRoute.id]: routeValue});
            const routeLabel = route === 'OpusClip' ? 'OpusClip' : 'DaVinci Resolve';
            setNotice(`${routeLabel} selected. The recommended next step has been updated.`);
        } catch (err: any) {
            setEditingRouteDraft(previousRoute);
            setNotice(err?.message || 'The editing route could not be saved.');
        } finally { setRouteSaving(false); }
    }


    async function decideIdea(approve: boolean) {
        if (!selected || busy || decisionInFlight.current) return;
        if (!f.ideaDecision || !f.recordingDate || !f.publishDate) { setNotice('Idea approval fields are unavailable. Reload Airtable.'); return; }
        if (text(selected, f.ideaDecision) === 'Duplicate') { setNotice('Open the primary idea listed in the review reason.'); return; }
        decisionInFlight.current = true; setBusy(true); setNotice('');
        try {
            const current = records.find(record => record.id === selected.id);
            if (!current) throw new Error('This idea is no longer available.');
            if (!ideaNeedsApproval(current, f)) return;
            const values: Record<string, any> = {[f.ideaDecision.id]: approve ? 'Approved' : 'Rejected'};
            let dates = {recording:'', publish:''};
            if (approve) {
                const channel = text(current, f.contentChannel) as ContentChannel;
                if (!CONTENT_CHANNELS.includes(channel)) throw new Error('Choose a content channel before approving.');
                const occupied = records.filter(record => record.id !== current.id && text(record, f.contentChannel) === channel && !ideaIsArchived(record, f) && !ideaNeedsApproval(record, f)).map(record=>({recording:recordDateKey(record,f.recordingDate),publish:recordDateKey(record,f.publishDate)}));
                dates = nextIdeaDates(occupied, ideaAutomationSettings[channel], new Date(), channel);
                if (f.stage) values[f.stage.id] = {name:'Idea Approved'};
            }
            values[f.recordingDate.id] = dates.recording || null;
            values[f.publishDate.id] = dates.publish || null;
            await table.updateRecordAsync(current.id, values);
            setRecordingDateDraft(dates.recording); setPublishDateDraft(dates.publish);
            setNotice(approve ? `Approved. Record ${dates.recording}; publish ${dates.publish}. You can adjust these dates below.` : 'Idea rejected and removed from the active queue. It remains in history.');
        } catch (error: any) { setNotice(error?.message || 'The idea decision could not be saved.'); }
        finally { decisionInFlight.current = false; setBusy(false); }
    }

    async function updateScheduleDate(kind: 'recording' | 'publish', value: string) {
        if (!selected || busy) return;
        if (ideaNeedsApproval(selected, f)) { setNotice('Approve this idea before assigning dates.'); return; }
        const targetField = kind === 'recording' ? f.recordingDate : f.publishDate;
        if (!targetField) {
            setNotice(`${kind === 'recording' ? 'Recording Date' : 'Publish Date'} is not available in Airtable.`);
            return;
        }
        if (kind === 'recording') setRecordingDateDraft(value);
        else setPublishDateDraft(value);
        setBusy(true); setNotice('');
        try {
            await table.updateRecordAsync(selected.id, {[targetField.id]: value || null});
            setNotice(`${kind === 'recording' ? 'Recording' : 'Publish'} date updated.`);
        } catch (err: any) {
            if (kind === 'recording') setRecordingDateDraft(selectedRecordingDate);
            else setPublishDateDraft(selectedPublishDate);
            setNotice(err?.message || 'The schedule date could not be updated.');
        } finally { setBusy(false); }
    }

    async function setContentChannel(channel: ContentChannel) {
        if (!selected || channelSaving) return;
        if (!f.contentChannel) {
            setNotice('Airtable is missing the Content Channel field. Add it as a single select with Alex Woung and Alex Woung Raw options.');
            return;
        }
        const previousChannel = contentChannelDraft;
        setContentChannelDraft(channel);
        setChannelSaving(true); setNotice('');
        try {
            if (f.contentChannel.type === 'singleSelect') {
                const choices = ((f.contentChannel.options as any)?.choices ?? []) as Array<{name: string}>;
                if (!choices.some(choice => choice.name === channel)) {
                    throw new Error(`Add the ${channel} choice to the Content Channel field in Airtable.`);
                }
            }
            const channelValue = f.contentChannel.type === 'singleSelect' ? {name: channel} : channel;
            await table.updateRecordAsync(selected.id, {[f.contentChannel.id]: channelValue});
            setNotice(`${channel} selected. Future n8n actions for this content will use that channel.`);
        } catch (err: any) {
            setContentChannelDraft(previousChannel);
            setNotice(err?.message || 'The content channel could not be saved.');
        } finally { setChannelSaving(false); }
    }

    async function approveThumbnail() {
        if (!selected || !f.thumbnailStatus || busy || thumbnailRequest.blocked || text(selected, f.youtubeUrl)) return;
        setBusy(true); setNotice('');
        try {
            let approvedValue: any = 'Approved';
            if (f.thumbnailStatus.type === 'singleSelect') {
                const choices = ((f.thumbnailStatus.options as any)?.choices ?? []) as Array<{name: string}>;
                const approvedChoice = choices.find(choice => /approved/i.test(choice.name));
                if (!approvedChoice) throw new Error('Add an Approved choice to the Thumbnail Status field in Airtable.');
                approvedValue = {name: approvedChoice.name};
            }
            await table.updateRecordAsync(selected.id, {[f.thumbnailStatus.id]: approvedValue});
            setNotice('Thumbnail approved. Uploading the long-form video to YouTube is now the next step.');
        } catch (err: any) {
            setNotice(err?.message || 'The thumbnail could not be approved.');
        } finally { setBusy(false); }
    }

    async function deleteContentRecord() {
        if (!selected || !table || busy) return;
        const deletedTitle = text(selected, f.title) || 'Untitled content';
        setBusy(true); setNotice('');
        try {
            await table.deleteRecordAsync(selected.id);
            setShowDeleteConfirm(false);
            setSelectedId(null);
            setNotice(`${deletedTitle} was deleted from Airtable. External videos, clips, and published posts were not deleted.`);
        } catch (err: any) {
            setNotice(err?.message || 'The content record could not be deleted from Airtable.');
        } finally { setBusy(false); }
    }

    async function createManualIdea() {
        if (!ideaTitle.trim() || !f.title || busy) return;
        setBusy(true); setNotice('');
        try {
            const values: Record<string, any> = {[f.title.id]: ideaTitle.trim()};
            if (f.description && ideaDescription.trim()) values[f.description.id] = ideaDescription.trim();
            if (f.ideaDecision) values[f.ideaDecision.id] = 'Needs Review';
            if (f.contentSource) values[f.contentSource.id] = {name: 'Manual Idea'};


            if (f.contentChannel) {
                values[f.contentChannel.id] = f.contentChannel.type === 'singleSelect'
                    ? {name: ideaContentChannel}
                    : ideaContentChannel;
            }
            const newRecordId = await table.createRecordAsync(values);
            setSelectedId(newRecordId);
            setView('pipeline');
            setShowAddIdea(false);
            setIdeaTitle(''); setIdeaDescription(''); setIdeaRecordingDate(''); setIdeaPublishDate('');
            setIdeaContentChannel(DEFAULT_CONTENT_CHANNEL);
            setNotice('Content idea added for review. Approve it to assign recording and publishing dates.');
        } catch (err: any) {
            setNotice(err?.message || 'The content idea could not be added.');
        } finally { setBusy(false); }
    }

    async function saveDistributionDraft(record: AnyRecord, approvalStatus: 'Approved' | 'Needs Changes') {
        if (savingDraftId) return;
        if (!distributionTable || !df.approvalStatus) {
            setDraftReviewNotice('The Approval Status field is unavailable. Reload Airtable and try again.');
            return;
        }
        const requestedPlatform = option(record, df.platform);
        const requestedOutputType = option(record, df.outputType);
        if (!RESOURCE_AUTOMATION_ENABLED && (/resource/i.test(requestedOutputType) || /gamma|resource/i.test(requestedPlatform))) {
            setDraftReviewNotice('Resources are coming soon. The Gamma automation is preserved but paused until the Gamma API plan is connected.');
            return;
        }
        setSavingDraftId(record.id); setNotice(''); setDraftReviewNotice('');
        try {
            const savedApproval = existingSelectChoice(df.approvalStatus, approvalStatus === 'Approved'
                ? ['Approved']
                : ['Needs Changes', 'Changes Requested', 'Needs changes', 'Rejected']);
            const values: Record<string, any> = {[df.approvalStatus.id]: {name: savedApproval}};
            const scheduledValue = draftScheduleValues[record.id];
            if (df.scheduledAt && scheduledValue) values[df.scheduledAt.id] = new Date(scheduledValue).toISOString();
            await distributionTable.updateRecordAsync(record.id, values);
            if (approvalStatus === 'Approved') {
                const platform = option(record, df.platform);
                const outputType = option(record, df.outputType);
                const isFramerBlog = /framer/i.test(platform) && /blog/i.test(outputType);
                const isGammaResource = /resource/i.test(outputType) || /gamma|resource/i.test(platform);
                const isNewsletter = /newsletter/i.test(outputType) || /newsletter/i.test(platform);
                if (isNewsletter) {
                    const response = await fetch('https://n8n.dulcy.io/webhook/REDACTED_PATH', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({recordId: record.id}),
                    });
                    const result = await response.json().catch(() => null);
                    if (!response.ok || !result?.ok) throw new Error(result?.message || 'The newsletter was approved, but its Close subscriber preview could not be prepared.');
                    setDraftReviewNotice(`Approved: branded HTML prepared for ${result.subscriberCount ?? 0} subscribed email${result.subscriberCount === 1 ? '' : 's'} from Close CRM. Nothing was sent.`);
                    setDraftApprovalOverrides(values => ({...values, [record.id]: approvalStatus}));
                    return;
                }
                const response = await fetch(isFramerBlog
                    ? 'https://n8n.dulcy.io/webhook/REDACTED_PATH'
                    : isGammaResource
                        ? 'https://n8n.dulcy.io/webhook/REDACTED_PATH'
                        : 'https://n8n.dulcy.io/webhook/REDACTED_PATH', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(isFramerBlog || isGammaResource
                        ? {recordId: record.id}
                        : {distributionRecordId: record.id}),
                });
                if (!response.ok) throw new Error(isFramerBlog
                    ? 'The blog was approved, but its Framer CMS draft could not be created.'
                    : isGammaResource
                        ? 'The resource was approved, but Gamma generation could not be started.'
                        : 'The draft was approved, but the scheduling automation could not be started.');
                setDraftReviewNotice(isFramerBlog
                    ? 'Approved: an unpublished Framer CMS draft was created for final review.'
                    : isGammaResource
                        ? 'Approved: Gamma is creating the resource. Its link will appear here when ready.'
                        : 'Approved: scheduling started immediately for this post.');
            }
            setDraftApprovalOverrides(values => ({...values, [record.id]: approvalStatus}));
            if (approvalStatus !== 'Approved') setDraftReviewNotice('Saved: this draft was marked as needing changes.');
        } catch (err: any) {
            setDraftReviewNotice(err?.message || 'The draft could not be updated.');
        } finally { setSavingDraftId(null); }
    }

    async function saveManualSocialPost(record: AnyRecord, platform: 'Reddit' | 'X' | 'LinkedIn') {
        if (savingDraftId) return;
        if (!distributionTable || !df.approvalStatus || !df.publishingStatus || !df.postUrl) {
            setDraftReviewNotice('The Published URL field is unavailable. Reload Airtable and try again.');
            return;
        }
        const postUrl = (draftPublishedUrlValues[record.id] ?? '').trim();
        const validUrl = platform === 'Reddit'
            ? /^https?:\/\/(www\.)?reddit\.com\/r\//i.test(postUrl)
            : platform === 'LinkedIn'
                ? /^https?:\/\/(www\.)?linkedin\.com\/(feed\/update|posts)\//i.test(postUrl)
                : /^https?:\/\/(www\.)?(x\.com|twitter\.com)\//i.test(postUrl);
        if (!validUrl) {
            setDraftReviewNotice(`Paste the published ${platform} post URL before marking this draft as published.`);
            return;
        }
        setSavingDraftId(record.id); setDraftReviewNotice('');
        try {
            const values: Record<string, any> = {
                [df.approvalStatus.id]: {name: existingSelectChoice(df.approvalStatus, ['Approved'])},
                [df.publishingStatus.id]: {name: existingSelectChoice(df.publishingStatus, ['Published', 'Posted', 'Complete'])},
            };
            values[df.postUrl.id] = postUrl;
            await distributionTable.updateRecordAsync(record.id, values);
            setDraftApprovalOverrides(current => ({...current, [record.id]: 'Published manually'}));
            setDraftReviewNotice(`${platform} post marked as published and its URL was saved.`);
        } catch (err: any) {
            setDraftReviewNotice(err?.message || `The ${platform} post could not be marked as published.`);
        } finally { setSavingDraftId(null); }
    }

    function handlePrimary() {
        if (!selected || !next) return;
        if (next.action) { runAction(next.action); return; }
        if (next.href) { window.open(next.href, '_blank'); return; }
        if (next.button === 'Review drafts') { setShowDraftReview(true); return; }
        expandRecord(selected);
    }

    return <div className="min-h-screen bg-slate-50 text-slate-900">
        <header className="border-b border-slate-200 bg-white px-7 py-5"><div className="flex items-center justify-between gap-5"><div><h1 className="text-2xl font-black">Content Center</h1><p className="mt-1 text-sm text-slate-500">One place for ideas, recording, editing, publishing, and repurposing.</p></div><div className="flex items-center gap-3"><button onClick={() => setShowAddIdea(true)} className="rounded-xl bg-purple-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm">+ Add content idea</button><button onClick={() => setShowIdeaSettings(true)} title="Idea automation settings" aria-label="Idea automation settings" className="grid h-11 w-11 place-items-center rounded-xl border border-slate-300 bg-white text-slate-600 shadow-sm hover:border-purple-300 hover:text-purple-700"><GearSixIcon size={21}/></button><div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1"><button onClick={() => setView('pipeline')} className={`rounded-lg px-4 py-2 text-sm font-bold ${view === 'pipeline' ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-500'}`}>Content</button><button onClick={() => setView('calendar')} className={`rounded-lg px-4 py-2 text-sm font-bold ${view === 'calendar' ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-500'}`}>Calendar</button></div><div className="flex items-center gap-2 rounded-full border border-purple-200 bg-purple-50 px-4 py-2 text-sm font-bold text-purple-700"><CalendarBlankIcon size={18}/> {visible.length} {activeOnly ? 'active' : 'visible'} items</div></div></div></header>
        {notice && <div className="border-b border-blue-200 bg-blue-50 px-7 py-3 text-sm font-semibold text-blue-800">{notice}</div>}
        {showIdeaSettings && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-5"><div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><div className="text-xs font-black uppercase tracking-wider text-purple-700">Automation settings</div><h2 className="mt-1 text-2xl font-black">Content scheduling settings</h2><p className="mt-1 text-sm text-slate-500">Every idea needs your approval. Set the review threshold, schedule cadence, and clip quality here.</p></div><button onClick={() => setShowIdeaSettings(false)} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-600">Close</button></div><div className="mt-5 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1.5">{CONTENT_CHANNELS.map(channel => <button key={channel} type="button" onClick={() => setIdeaSettingsChannel(channel)} className={`rounded-xl px-4 py-3 text-sm font-black ${ideaSettingsChannel === channel ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-500'}`}>{channel}</button>)}</div><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-sm font-bold text-slate-700">Videos per week<input type="number" min="1" max="7" disabled={ideaSettingsChannel === 'Alex Woung'} value={ideaSettingsChannel === 'Alex Woung' ? 2 : ideaAutomationSettings[ideaSettingsChannel].videosPerWeek} onChange={event => { const value = event.currentTarget.value; setIdeaAutomationSettings(settings => ({...settings, [ideaSettingsChannel]: {...settings[ideaSettingsChannel], videosPerWeek: Math.max(1, Math.min(7, Number(value) || 1))}})); }} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg font-black outline-none focus:border-purple-500"/></label><label className="text-sm font-bold text-slate-700">Minimum spacing between videos<input type="number" min="1" max="14" disabled={ideaSettingsChannel === 'Alex Woung'} value={ideaSettingsChannel === 'Alex Woung' ? 2 : ideaAutomationSettings[ideaSettingsChannel].minimumSpacingDays} onChange={event => { const value = event.currentTarget.value; setIdeaAutomationSettings(settings => ({...settings, [ideaSettingsChannel]: {...settings[ideaSettingsChannel], minimumSpacingDays: Math.max(1, Math.min(14, Number(value) || 1))}})); }} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg font-black outline-none focus:border-purple-500"/><span className="mt-1 block text-xs font-medium text-slate-400">Days</span></label><label className="text-sm font-bold text-slate-700">Manual-review score<input type="number" min="0" max="100" value={ideaAutomationSettings[ideaSettingsChannel].reviewThreshold} onChange={event => { const value = event.currentTarget.value; setIdeaAutomationSettings(settings => ({...settings, [ideaSettingsChannel]: {...settings[ideaSettingsChannel], reviewThreshold: Math.max(0, Math.min(100, Number(value) || 0))}})); }} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg font-black outline-none focus:border-purple-500"/><span className="mt-1 block text-xs font-medium text-slate-400">Lower-scoring ideas stay archived instead of filling your calendar.</span></label><label className="text-sm font-bold text-slate-700">Minimum clip score<input type="number" min="0" max="100" value={ideaAutomationSettings[ideaSettingsChannel].minimumClipScore} onChange={event => { const value = event.currentTarget.value; setIdeaAutomationSettings(settings => ({...settings, [ideaSettingsChannel]: {...settings[ideaSettingsChannel], minimumClipScore: Math.max(0, Math.min(100, Number(value) || 0))}})); }} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg font-black outline-none focus:border-purple-500"/><span className="mt-1 block text-xs font-medium text-slate-400">Only OpusClip results at or above this score are used. 85 recommended.</span></label><label className="text-sm font-bold text-slate-700">Clips per week<input type="number" min="1" max="7" value={ideaAutomationSettings[ideaSettingsChannel].clipsPerWeek} onChange={event => { const value = event.currentTarget.value; setIdeaAutomationSettings(settings => ({...settings, [ideaSettingsChannel]: {...settings[ideaSettingsChannel], clipsPerWeek: Math.max(1, Math.min(7, Number(value) || 1))}})); }} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg font-black outline-none focus:border-purple-500"/><span className="mt-1 block text-xs font-medium text-slate-400">Approved clips are spread evenly through each week.</span></label></div><div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900"><strong>{ideaSettingsChannel}</strong> will schedule approved ideas up to <strong>{ideaAutomationSettings[ideaSettingsChannel].videosPerWeek} video{ideaAutomationSettings[ideaSettingsChannel].videosPerWeek === 1 ? '' : 's'} per week</strong>, spaced at least <strong>{ideaAutomationSettings[ideaSettingsChannel].minimumSpacingDays} days apart</strong>. Repurposing will use clips scoring <strong>{ideaAutomationSettings[ideaSettingsChannel].minimumClipScore} or higher</strong> and schedule <strong>{ideaAutomationSettings[ideaSettingsChannel].clipsPerWeek} clips per week</strong>.</div><div className="mt-6 flex items-center justify-between gap-4"><button type="button" onClick={() => setIdeaAutomationSettings(DEFAULT_IDEA_AUTOMATION_SETTINGS)} className="text-sm font-bold text-slate-500 hover:text-slate-800">Reset defaults</button><button type="button" disabled={busy} onClick={() => saveIdeaAutomationSettings().catch(error => setNotice(error instanceof Error ? error.message : 'Could not save automation settings.'))} className="rounded-xl bg-purple-600 px-5 py-3 text-sm font-black text-white disabled:opacity-50">{busy ? 'Saving...' : 'Save settings'}</button></div></div></div>}
        {showAddIdea && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-5"><div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-black">Add a content idea</h2><p className="mt-1 text-sm text-slate-500">Add the idea now. Dates are optional and can be scheduled later.</p></div><button onClick={() => setShowAddIdea(false)} className="rounded-lg px-3 py-2 text-slate-500 hover:bg-slate-100">Close</button></div><div className="mt-5 space-y-4"><label className="block text-sm font-bold text-slate-700">Idea title<input autoFocus value={ideaTitle} onChange={event => setIdeaTitle(event.currentTarget.value)} placeholder="What should this content be about?" className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-medium outline-none focus:border-purple-500"/></label><label className="block text-sm font-bold text-slate-700">Notes or angle <span className="font-medium text-slate-400">(optional)</span><textarea value={ideaDescription} onChange={event => setIdeaDescription(event.currentTarget.value)} placeholder="Why this matters, the hook, or what you want covered…" className="mt-2 min-h-28 w-full rounded-xl border border-slate-300 px-4 py-3 font-medium outline-none focus:border-purple-500"/></label><div className="grid grid-cols-2 gap-4"><label className="block text-sm font-bold text-slate-700">Recording date <span className="font-medium text-slate-400">(optional)</span><input type="date" value={ideaRecordingDate} onChange={event => setIdeaRecordingDate(event.currentTarget.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-medium outline-none focus:border-purple-500"/></label><label className="block text-sm font-bold text-slate-700">Publish date <span className="font-medium text-slate-400">(optional)</span><input type="date" value={ideaPublishDate} onChange={event => setIdeaPublishDate(event.currentTarget.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-medium outline-none focus:border-purple-500"/></label></div></div><div className="mt-6 flex justify-end gap-3"><button onClick={() => setShowAddIdea(false)} className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold text-slate-700">Cancel</button><button disabled={!ideaTitle.trim() || busy} onClick={createManualIdea} className="rounded-xl bg-purple-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-40">{busy ? 'Adding…' : 'Add idea'}</button></div></div></div>}
        {showDraftReview && selected && <div className="fixed inset-0 z-50 bg-slate-950/55 p-5"><div className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-5 border-b border-slate-200 px-7 py-5"><div><div className="text-xs font-black uppercase tracking-wider text-purple-700">Distribution review</div><h2 className="mt-1 text-2xl font-black">Review clips and posts</h2><p className="mt-1 text-sm text-slate-500">Approve scheduled channels here. Reddit, X, and LinkedIn stay manual: copy the draft, publish it from the correct account, then save its URL.</p></div><button onClick={() => setShowDraftReview(false)} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50">Close</button></div>
            {draftReviewNotice && <div className="border-b border-blue-200 bg-blue-50 px-7 py-3 text-sm font-bold text-blue-800">{draftReviewNotice}</div>}
            <div className="flex gap-3 border-b border-slate-200 px-7 py-3">
                <button onClick={() => setReviewSection('clips')} className={`rounded-xl px-5 py-3 font-black ${reviewSection === 'clips' ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-700'}`}>Clips ({selectedClips.length})</button>
                <button onClick={() => setReviewSection('posts')} className={`rounded-xl px-5 py-3 font-black ${reviewSection === 'posts' ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-700'}`}>Posts ({selectedDistributionRecords.length})</button>
            </div>
            {reviewSection === 'clips' ? <div className="flex-1 overflow-y-auto bg-slate-50 p-7">
                <div className="mb-5 rounded-2xl border border-blue-200 bg-blue-50 p-5 text-sm leading-6 text-blue-950"><strong>1. Review the shortlist. 2. Edit and save in OpusClip. 3. Refresh the final copy, review it, then approve it here. 4. Generate and review posts.</strong><p>These are the imported candidates, not every clip OpusClip generated. Clips wanted limits the shortlist; it does not limit generation. An imported preview may be outdated after edits. Wait for Opus to finish rendering, then select its exact final clip ID and refresh here. Refreshing does not approve, schedule or publish it. Editing an already scheduled Opus clip may affect that scheduled media.</p>{shortClipsReviewUrl && <a href={shortClipsReviewUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block font-black underline">Browse all candidates / edit in OpusClip</a>}</div>
                {!clipsTable ? <p className="rounded-xl bg-white p-6">Connect Content Clips as the Clips table in the interface settings.</p> : selectedClips.length === 0 ? <p className="rounded-xl bg-white p-6">No clips are linked to this video yet. Existing posts are on the Posts tab.</p> : <div className="grid gap-5 lg:grid-cols-2">{selectedClips.map((clip, index) => <article key={clip.id} className="rounded-2xl border border-slate-200 bg-white p-5">
                    <div className="flex justify-between gap-3 text-xs font-black text-purple-700"><span>Candidate {index + 1} · Score {text(clip, cf.score) || 'not supplied'}</span><span>{currentReview(clip)?.status || 'Not yet verified'}</span></div>
                    <h3 className="my-3 text-lg font-black">{text(clip, cf.name) || 'Untitled clip'}</h3>
                    {/^https:\/\//i.test((currentReview(clip)?.final.url || text(clip, cf.media))) ? <><video key={(currentReview(clip)?.final.url || text(clip, cf.media))} controls preload="none" playsInline src={(currentReview(clip)?.final.url || text(clip, cf.media))} className="mx-auto max-h-96 w-full rounded-xl bg-black"/><a className="mt-2 inline-block text-sm font-bold text-purple-700 underline" href={(currentReview(clip)?.final.url || text(clip, cf.media))} target="_blank" rel="noopener noreferrer">Open current preview</a></> : <p>No media preview available. Refresh after Opus finishes rendering.</p>}
                    <p className="mt-3 break-all text-xs text-slate-500">Imported Opus identity: {text(clip, cf.opusId) || 'Missing'}</p>
                    <label className="mt-3 block text-xs font-bold">Final Opus clip ID (within this project)<input value={finalSelection(clip)} disabled={Boolean(previewRefreshBusy[clip.id])} onChange={event => { const value = event.currentTarget.value; setSelectedFinalIds(current => ({...current, [clip.id]: value})); }} className="mt-1 block w-full rounded-lg border p-2"/></label>
                    <p className="mt-2 text-xs text-slate-500">Verified copy: {currentReview(clip)?.final.clipId || 'None'} · Review version: {currentReview(clip)?.version ?? 'None'}. Imported media is not approval evidence.</p>
                    <button type="button" disabled={!cf.refreshIntent || Boolean(previewRefreshBusy[clip.id])} onClick={() => void requestCurrentReview(clip, 'refresh-current')} className="mt-3 rounded-xl border border-purple-300 px-4 py-2 text-sm font-bold text-purple-700 disabled:cursor-wait disabled:opacity-50">{previewRefreshBusy[clip.id] ? 'Requesting preview…' : 'Refresh current preview'}</button>
                    <div className="mt-3 flex gap-2">{(['approve-current', 'reject-current'] as const).map(action => <button key={action} type="button" disabled={Boolean(previewRefreshBusy[clip.id]) || !currentReview(clip) || finalSelection(clip).trim() !== currentReview(clip)?.final.clipId} onClick={() => void requestCurrentReview(clip, action)} className="rounded-xl border px-4 py-2 text-sm font-bold disabled:opacity-40">{action === 'approve-current' ? 'Approve reviewed copy' : 'Reject copy'}</button>)}</div>
                    {previewRefreshNotice[clip.id] && <p role="status" className="mt-2 text-sm leading-6 text-slate-600">{previewRefreshNotice[clip.id]}</p>}
                    {text(clip, cf.notes) && <details className="mt-3 text-sm"><summary className="cursor-pointer font-bold">Editorial review notes</summary><p className="mt-2 whitespace-pre-wrap leading-6">{text(clip, cf.notes)}</p></details>}
                    {(currentReview(clip)?.final.transcript || text(clip, cf.transcript)) && <details className="mt-3 text-sm"><summary className="cursor-pointer font-bold">Transcript</summary><p className="mt-2 whitespace-pre-wrap leading-6">{(currentReview(clip)?.final.transcript || text(clip, cf.transcript))}</p></details>}
                    <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">Refresh resets approval and verifies the selected rendered copy. Approval applies to the displayed review version only; another edit requires refresh and approval again. Generate drafts after approval, then review and schedule in Posts. Nothing is scheduled from this tab.</p>
                </article>)}</div>}
            </div> : selectedDistributionRecords.length === 0 ? <div className="grid flex-1 place-items-center p-10 text-center"><div>{!distributionTable ? <><h3 className="text-xl font-black">Connect the Content Distribution table</h3><p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">The six drafts already exist, but this interface extension does not have its Distribution table data source selected yet. Open the extension settings, choose <strong>Content Distribution</strong> for <strong>Distribution table</strong>, then reload the Content Center.</p></> : <><h3 className="text-xl font-black">No drafts are linked to this content item</h3><p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">The Distribution table is connected, but its Parent Content links do not point to this record. If drafts already exist, check their Parent Content links before generating again. Otherwise approve the reviewed clips, then use Save and generate drafts.</p></>}</div></div> : <>
                <div className="flex gap-2 overflow-x-auto border-b border-slate-200 bg-slate-50 px-7 py-4">{draftPlatforms.map(platform => { const count = selectedDistributionRecords.filter(record => (option(record, df.platform) || 'Other') === platform).length; return <button key={platform} onClick={() => setDraftPlatformTab(platform)} className={`whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-black ${draftPlatformTab === platform ? 'bg-purple-600 text-white shadow-sm' : 'border border-slate-300 bg-white text-slate-700'}`}>{platform} <span className={`ml-1 rounded-full px-2 py-0.5 text-xs ${draftPlatformTab === platform ? 'bg-white/20' : 'bg-slate-100'}`}>{count}</span></button>; })}</div>
                <div className="flex-1 overflow-y-auto bg-slate-50 p-7"><div className="space-y-5">{activePlatformDrafts.map((record, index) => { const approval = draftApprovalOverrides[record.id] || option(record, df.approvalStatus) || 'Needs Review'; const mediaUrl = text(record, df.mediaUrl); const publishedUrl = text(record, df.postUrl); const saving = savingDraftId === record.id; const platform = option(record, df.platform); const outputType = option(record, df.outputType); const isReddit = /reddit/i.test(platform); const isTwitter = /twitter|^x$/i.test(platform); const isLinkedIn = /linkedin/i.test(platform); const isResource = /resource/i.test(outputType) || /gamma|resource/i.test(platform); const isNewsletter = /newsletter/i.test(outputType) || /newsletter/i.test(platform); const redditCommunity = redditCommunityForRecord(record); return <div key={record.id} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-wider text-blue-700"><span>{outputType || `${draftPlatformTab} post`} · Post {index + 1}{isReddit ? ` · r/${redditCommunity}` : ''}</span>{(isTwitter || isLinkedIn) && <span className="rounded-full bg-purple-100 px-2 py-1 text-[10px] text-purple-700">Typefully coming soon</span>}</div><h3 className="mt-2 text-xl font-black text-slate-900">{text(record, df.draftTitle) || 'Untitled draft'}</h3>{publishedUrl && <a href={publishedUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-2 text-sm font-black text-purple-700">Open finished {isResource ? 'Gamma resource' : 'output'} <ArrowRightIcon size={16}/></a>}</div><span className={`rounded-full px-3 py-1 text-xs font-black ${/approved|published/i.test(approval) ? 'bg-emerald-100 text-emerald-800' : /changes|rejected/i.test(approval) ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>{approval}</span></div>
                    <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
                        <div>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="text-xs font-black uppercase tracking-wider text-slate-500">{isNewsletter ? 'Email preview' : 'Post copy'}</div>
                                {(isReddit || isTwitter || isLinkedIn || isNewsletter) && <div className="flex gap-2">
                                    {isReddit && <button onClick={() => void copyText(text(record, df.draftTitle), 'Reddit title')} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold">Copy title</button>}
                                    {isNewsletter && <button onClick={() => void copyText(newsletterHtml(text(record, df.draftTitle), text(record, df.draftBody)), 'Newsletter HTML')} className="rounded-lg border border-purple-300 bg-purple-50 px-3 py-1.5 text-xs font-bold text-purple-700">Copy HTML</button>}
                                    <button onClick={() => void copyText(text(record, df.draftBody), isTwitter ? 'X post' : isLinkedIn ? 'LinkedIn post' : isNewsletter ? 'Newsletter text' : 'Reddit post')} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold">Copy {isNewsletter ? 'text' : 'post'}</button>
                                </div>}
                            </div>
                            {isNewsletter
                                ? <iframe title={`Newsletter preview: ${text(record, df.draftTitle)}`} srcDoc={newsletterHtml(text(record, df.draftTitle), text(record, df.draftBody))} className="mt-2 h-[620px] w-full rounded-xl border border-purple-200 bg-white" sandbox="allow-popups allow-popups-to-escape-sandbox"/>
                                : <div className="mt-2 whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">{text(record, df.draftBody) || 'No draft copy was generated.'}</div>}
                            {mediaUrl && <a href={mediaUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-blue-700">Preview attached clip <ArrowRightIcon size={16}/></a>}
                        </div>
                        {isReddit || isTwitter || isLinkedIn ? <div>
                            <div className={`rounded-xl border p-4 ${isTwitter ? 'border-sky-200 bg-sky-50' : isLinkedIn ? 'border-blue-200 bg-blue-50' : 'border-orange-200 bg-orange-50'}`}>
                                <div className={`text-xs font-black uppercase tracking-wider ${isTwitter ? 'text-sky-800' : isLinkedIn ? 'text-blue-800' : 'text-orange-800'}`}>Manual {isTwitter ? 'X' : isLinkedIn ? 'LinkedIn' : 'Reddit'} post</div>
                                <p className={`mt-2 text-sm leading-5 ${isTwitter ? 'text-sky-900' : isLinkedIn ? 'text-blue-900' : 'text-orange-900'}`}>{isTwitter ? <>Confirm you are signed into the correct X account, review the post, and publish it manually.</> : isLinkedIn ? <>Copy the approved draft, confirm you are using the correct LinkedIn profile, and publish it manually. Typefully automation can be connected later.</> : <>Post this once in <strong>r/{redditCommunity}</strong>. Adjust it if needed so it sounds natural in the conversation.</>}</p>
                                <a href={isTwitter ? `https://x.com/intent/post?text=${encodeURIComponent(text(record, df.draftBody))}` : isLinkedIn ? 'https://www.linkedin.com/feed/' : `https://www.reddit.com/r/${redditCommunity}/submit?selftext=true`} target="_blank" rel="noreferrer" className={`mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-black text-white ${isTwitter ? 'bg-slate-950' : isLinkedIn ? 'bg-blue-700' : 'bg-orange-600'}`}>Open {isTwitter ? 'X composer' : isLinkedIn ? 'LinkedIn' : `r/${redditCommunity}`} <ArrowRightIcon size={16}/></a>
                            </div>
                            <label className="mt-4 block text-xs font-black uppercase tracking-wider text-slate-500">Published {isTwitter ? 'X' : isLinkedIn ? 'LinkedIn' : 'Reddit'} URL
                                <input value={draftPublishedUrlValues[record.id] ?? ''} onChange={event => { const value = event.currentTarget.value; setDraftPublishedUrlValues(values => ({...values, [record.id]: value})); }} placeholder={isTwitter ? 'https://x.com/alexwoung/status/...' : isLinkedIn ? 'https://www.linkedin.com/posts/...' : 'https://www.reddit.com/r/...'} className={`mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm font-medium normal-case outline-none ${isTwitter ? 'focus:border-sky-500' : isLinkedIn ? 'focus:border-blue-500' : 'focus:border-orange-500'}`}/>
                            </label>
                            <div className="mt-3 grid gap-2">
                                <button disabled={saving || !(draftPublishedUrlValues[record.id] ?? '').trim()} onClick={() => void saveManualSocialPost(record, isTwitter ? 'X' : isLinkedIn ? 'LinkedIn' : 'Reddit')} className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white disabled:opacity-40">{saving ? 'Saving…' : 'Mark as published'}</button>
                                <button disabled={saving} onClick={() => void saveDistributionDraft(record, 'Needs Changes')} className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-black text-amber-800 disabled:opacity-50">Needs changes</button>
                            </div>
                        </div> : <div>
                            {!isResource && !isNewsletter && <><label className="text-xs font-black uppercase tracking-wider text-slate-500">Suggested posting time<input type="datetime-local" value={draftScheduleValues[record.id] ?? ''} onChange={event => { const value = event.currentTarget.value; setDraftScheduleValues(values => ({...values, [record.id]: value})); }} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm font-bold outline-none focus:border-purple-500"/></label><p className="mt-2 text-xs leading-5 text-slate-400">A reasonable starting schedule. Adjust it if you prefer a specific campaign cadence.</p></>}
                            {isResource && <p className="rounded-xl border border-purple-200 bg-purple-50 p-4 text-sm leading-6 text-purple-900">Approval creates a Gamma document from this draft. The finished Gamma link will appear above when it is ready.</p>}
                            {isNewsletter && <div className="space-y-3"><p className="rounded-xl border border-purple-200 bg-purple-50 p-4 text-sm leading-6 text-purple-950"><strong>Audience:</strong> Close CRM leads where <strong>Subscribed to Newsletter? = Yes</strong>. The preview includes a required unsubscribe link.</p><p className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900">Approval saves the branded HTML newsletter for final review. It does not send the email.</p></div>}
                            <div className="mt-4 grid gap-2"><button disabled={saving} onClick={() => void saveDistributionDraft(record, 'Approved')} className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white disabled:opacity-50">{saving ? 'Saving…' : isResource ? 'Approve and create in Gamma' : isNewsletter ? 'Approve newsletter draft' : 'Approve and save time'}</button><button disabled={saving} onClick={() => void saveDistributionDraft(record, 'Needs Changes')} className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-black text-amber-800 disabled:opacity-50">Needs changes</button></div>
                        </div>}
                    </div>
                </div>; })}</div></div>
            </>}
        </div></div>}
        <main className={view === 'pipeline' ? 'grid min-h-[calc(100vh-88px)] grid-cols-[360px_minmax(0,1fr)]' : 'min-h-[calc(100vh-88px)]'}>
            {view === 'pipeline' && <aside className="border-r border-slate-200 bg-white p-5"><div className="relative"><MagnifyingGlassIcon size={18} className="absolute left-3 top-3.5 text-slate-400"/><input className="w-full rounded-xl border border-slate-300 py-3 pl-10 pr-3 outline-none focus:border-purple-500" placeholder="Search content…" value={search} onChange={event => setSearch(event.currentTarget.value)}/></div><label className="mt-4 flex cursor-pointer items-center gap-3 rounded-xl bg-slate-50 p-3 text-sm font-semibold text-slate-700"><input type="checkbox" checked={activeOnly} onChange={event => setActiveOnly(event.currentTarget.checked)} className="h-4 w-4 accent-purple-600"/> Hide older and completed history</label><div className="mt-5 space-y-2">{visible.map(record => { const active = record.id === selectedId; const recordStage = displayedContentStage(record, f, Boolean(completions.get(record.id)?.complete)); const recordError = text(record, f.error); const recordingDate = formatShortDate(text(record, f.recordingDate)); const publishDate = formatShortDate(text(record, f.publishDate)); return <button key={record.id} className={`w-full rounded-2xl border p-4 text-left transition ${active ? 'border-purple-400 bg-purple-50 shadow-sm' : 'border-slate-200 bg-white hover:border-purple-200'}`} onClick={() => setSelectedId(record.id)}><div className="flex items-start justify-between gap-3"><div className="font-bold leading-5">{text(record, f.title) || 'Untitled content'}</div>{recordError && <WarningCircleIcon size={18} className="shrink-0 text-red-500"/>}{isRecordingThisWeek(record, f.recordingDate, recordingWeek) && <span title="Recording date falls in this Monday–Sunday week (New York)" className="shrink-0 rounded-full bg-purple-100 px-2 py-1 text-[10px] font-bold uppercase text-purple-700">This week</span>}</div><div className="mt-3 flex items-center justify-between text-xs"><span className="font-semibold text-slate-500">{recordStage}</span>{recordingDate || publishDate ? <span className="text-right text-slate-400">{recordingDate && <span className="block">Record {recordingDate}</span>}{publishDate && <span className="block">Publish {publishDate}</span>}</span> : <span className="text-slate-400">{option(record, f.status) || 'Unscheduled'}</span>}</div></button>})}{visible.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No active content yet. Generate or add an idea to begin.</div>}</div></aside>}
            {view === 'calendar' ? <CalendarView records={eligible} fields={f} completions={completions} hideCompleted={activeOnly} onSelect={record => {setSelectedId(record.id); setView('pipeline');}}/> : <section className="min-w-0 p-7">{!selected ? <div className="grid min-h-[60vh] place-items-center text-slate-500">Choose a content item.</div> : <div className="mx-auto max-w-6xl">
                <div className="flex items-start justify-between gap-5"><div><div className="flex items-center gap-2"><span className="rounded-full border border-purple-200 bg-purple-50 px-3 py-1 text-xs font-bold text-purple-700">{currentStage}</span>{isRecordingThisWeek(selected, f.recordingDate, recordingWeek) && <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">Record this week</span>}</div><h2 className="mt-3 text-3xl font-black">{text(selected, f.title) || 'Untitled content'}</h2>{selectedCompletion?.complete && <p className="mt-2 text-sm text-emerald-800">Step 10: preparation complete. {completionDetail(selectedCompletion)}</p>}</div><div className="flex items-center gap-2"><button className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold shadow-sm hover:bg-slate-50" onClick={() => expandRecord(selected)}>Open Airtable record</button><button className="grid h-11 w-11 place-items-center rounded-xl border border-red-200 bg-red-50 text-red-600 shadow-sm hover:bg-red-100" title="Delete this content record from Airtable" aria-label="Delete this content record from Airtable" onClick={() => setShowDeleteConfirm(true)}><TrashIcon size={20}/></button></div></div>
                <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-purple-50 text-purple-700"><CalendarBlankIcon size={21}/></div><div><h3 className="font-black text-slate-900">Content schedule</h3><p className="text-sm text-slate-500">{contentChannelDraft === 'Alex Woung Raw' ? 'Raw: batch-record on Friday, aiming for four videos per week. Publication dates are planned separately.' : 'Main channel: record two videos per week; publish Tuesdays and Thursdays.'} This week is tagged automatically from the recording date, Monday–Sunday in New York. Publishing stays manual.</p></div></div><div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="flex flex-wrap items-center justify-between gap-4"><div><div className="text-xs font-black uppercase tracking-wider text-slate-500">Idea review</div><p className="mt-1 text-sm font-semibold text-slate-700">{ideaNeedsApproval(selected, f) ? 'Your approval is required before this enters the schedule.' : 'Approved for production'}</p>{text(selected, f.ideaScore) && <p className="mt-1 text-xs text-slate-500">Editorial score: {text(selected, f.ideaScore)}/100 · a suggestion, not approval</p>}</div>{ideaNeedsApproval(selected, f) && text(selected, f.ideaDecision) !== 'Duplicate' && <div className="flex flex-wrap gap-2"><button type="button" disabled={busy || channelSaving} onClick={() => void decideIdea(true)} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-black text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"><CheckCircleIcon size={19}/>{busy ? 'Saving…' : 'Approve & schedule'}</button><button type="button" disabled={busy || channelSaving} onClick={() => void decideIdea(false)} className="rounded-xl border border-red-300 bg-red-50 px-5 py-3 text-sm font-black text-red-700 hover:bg-red-100 disabled:opacity-50">Reject idea</button></div>}</div>{text(selected, f.ideaQualificationReason) && <p className="mt-3 text-sm leading-6 text-slate-600">{text(selected, f.ideaQualificationReason)}</p>}</div><div className="mt-4"><div className="text-xs font-black uppercase tracking-wider text-slate-500">Content for</div><div className="mt-2 grid gap-3 sm:grid-cols-2">{CONTENT_CHANNELS.map(channel => <button key={channel} type="button" disabled={channelSaving} onClick={() => void setContentChannel(channel)} className={`rounded-xl border px-4 py-3 text-left text-sm font-bold transition disabled:cursor-wait disabled:opacity-60 ${contentChannelDraft === channel ? 'border-purple-600 bg-purple-600 text-white shadow-sm' : 'border-slate-300 bg-white text-slate-700 hover:border-purple-300'}`}><span className="block">{contentChannelDraft === channel ? '✓ ' : ''}{channel}</span><span className={`mt-1 block text-xs font-medium ${contentChannelDraft === channel ? 'text-purple-100' : 'text-slate-400'}`}>{channel === 'Alex Woung' ? 'Main personal brand channel' : 'Raw, less-produced content channel'}</span></button>)}</div>{!f.contentChannel && <p className="mt-2 text-xs font-semibold text-amber-700">Airtable setup needed: add a single-select field named Content Channel.</p>}</div><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-xs font-black uppercase tracking-wider text-slate-500">Recording date<input type="date" disabled={busy || ideaNeedsApproval(selected, f)} value={recordingDateDraft} onChange={event => updateScheduleDate('recording', event.currentTarget.value)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-purple-500 disabled:opacity-50"/></label><label className="text-xs font-black uppercase tracking-wider text-slate-500">Publish date<input type="date" disabled={busy || ideaNeedsApproval(selected, f)} value={publishDateDraft} onChange={event => updateScheduleDate('publish', event.currentTarget.value)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-purple-500 disabled:opacity-50"/></label></div></div>
                {existingAction === 'Generate Distribution Pack' && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><p>Only retry after confirming the previous generation stopped and its blocker is resolved. Do not retry a running or uncertain job.</p><button disabled={busy} onClick={retryDistributionDrafts} className="mt-3 rounded-xl border border-amber-400 bg-white px-4 py-2 font-bold disabled:opacity-40">Retry draft generation</button></div>}
                <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-6"><div className="flex items-center justify-between gap-6"><div><div className="text-xs font-bold uppercase tracking-widest text-blue-700">Recommended next step</div><h3 className="mt-2 text-xl font-black text-blue-950">{next?.title}</h3><p className="mt-1 text-sm leading-6 text-blue-800">{error || next?.detail}</p>{existingAction && <p className="mt-2 text-xs font-bold text-blue-700"><ClockIcon size={14} className="mr-1 inline"/> {existingAction} is already queued.</p>}</div><button className="shrink-0 rounded-xl bg-purple-600 px-6 py-3 font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50" disabled={busy || Boolean(existingAction) || (next?.action === 'Generate Thumbnail' && thumbnailRequest.blocked)} onClick={handlePrimary}>{busy ? 'Starting…' : next?.button}<ArrowRightIcon size={18} className="ml-2 inline"/></button></div>{next?.href && !awaitingYouTubePublish && <a className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-blue-700 hover:underline" href={next.href} target="_blank" rel="noreferrer"><UploadSimpleIcon size={18}/> Open the correct Frame.io folder</a>}</div>
                {shortClipsReviewUrl && <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-purple-200 bg-white p-5"><div><h3 className="font-black text-slate-900">Review this video\'s clips</h3><p className="mt-1 text-sm text-slate-500">Opens the short-clips project in OpusClip. Reviewing does not approve or publish any posts.</p></div><a href={shortClipsReviewUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-5 py-3 text-sm font-black text-white">Review clips in OpusClip <ArrowRightIcon size={18}/></a><button onClick={() => { setReviewSection('clips'); setShowDraftReview(true); }} className="rounded-xl border border-purple-300 px-5 py-3 text-sm font-black text-purple-700">Review shortlist here</button></div>}
                {text(selected, f.script) && <div className="mt-5 rounded-2xl border border-purple-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-5"><div><div className="text-xs font-black uppercase tracking-wider text-purple-700">Recording script</div><h3 className="mt-1 text-xl font-black text-slate-900">Teleprompter draft ready</h3><p className="mt-1 text-sm text-slate-500">Review it below. Regenerate creates a new structure and avoids closely paraphrasing this version.</p></div><div className="flex flex-wrap gap-2"><button disabled={busy} onClick={() => void copyText(text(selected, f.script), 'Script')} className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold text-slate-700">Copy script</button><button disabled={busy} onClick={() => void runAction('Generate Script')} className="rounded-xl bg-purple-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Starting…' : 'Regenerate script'}</button></div></div><div className="mt-4 max-h-96 overflow-y-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm leading-7 text-slate-700">{text(selected, f.script)}</div></div>}
                {!text(selected, f.youtubeUrl) && (finalThumbnailUrl || thumbnailRequest.feedback || thumbnailRequest.requestError || thumbnailRequest.generating) && <div className="mt-5 rounded-2xl border border-purple-200 bg-white p-5 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-5">
                        <div><div className="text-xs font-black uppercase tracking-wider text-purple-700">Thumbnail</div><h3 className="font-black text-slate-900">{thumbnailRequest.blocked ? 'Thumbnail request in progress' : 'Thumbnail ready for review'}</h3><p className="mt-1 text-sm text-slate-500">Status: {thumbnailStatus}</p></div>
                        <div className="flex flex-wrap gap-3">
                            {finalThumbnailUrl && <a className="rounded-xl border border-purple-300 px-5 py-3 text-sm font-bold text-purple-700" href={finalThumbnailUrl} target="_blank" rel="noreferrer">Open current thumbnail in Frame.io</a>}
                            {text(selected, f.previousThumbnailUrl) && <a className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-bold text-slate-700" href={text(selected, f.previousThumbnailUrl)} target="_blank" rel="noreferrer">Open previous thumbnail</a>}
                            {finalThumbnailUrl && <button type="button" disabled={busy || thumbnailRequest.blocked} onClick={() => thumbnailRequest.setOpen(true)} className="rounded-xl border border-purple-300 px-5 py-3 text-sm font-bold text-purple-700 disabled:opacity-50">Request thumbnail changes</button>}
                            {finalThumbnailUrl && !/approved|complete/i.test(thumbnailStatus) && <button disabled={busy || thumbnailRequest.blocked} onClick={approveThumbnail} className="rounded-xl bg-purple-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Approving…' : 'Approve thumbnail'}</button>}
                        </div>
                    </div>
                    {thumbnailRequest.feedback && <p role="status" className="mt-3 text-sm text-purple-700">{thumbnailRequest.feedback}</p>}
                    {thumbnailRequest.requestError && <p role="alert" className="mt-3 text-sm text-red-700">{thumbnailRequest.requestError}</p>}
                    {error && <p className="mt-3 text-sm text-red-700">Latest automation error: {error}</p>}
                    {thumbnailRequest.open && <div className="mt-4 border-t border-purple-100 pt-4">
                        <label className="block text-sm font-bold text-slate-700">What should change?<textarea autoFocus disabled={thumbnailRequest.blocked} value={thumbnailRequest.changes} onChange={event => thumbnailRequest.setChanges(event.currentTarget.value)} placeholder="For example: make the headline larger and use a brighter background." className="mt-2 min-h-28 w-full rounded-xl border border-slate-300 px-4 py-3 font-medium"/></label>
                        <p className="mt-1 text-xs text-slate-500">{thumbnailRequest.changes.trim().length}/2,000 characters. The current thumbnail stays available until a replacement is ready. This does not approve or publish it.</p>
                        {thumbnailRequest.validationError && <p className="mt-1 text-xs text-amber-700">{thumbnailRequest.validationError}</p>}
                        <div className="mt-3 flex gap-3"><button type="button" disabled={thumbnailRequest.blocked} onClick={thumbnailRequest.cancel} className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold disabled:opacity-50">Cancel</button><button type="button" disabled={busy || thumbnailRequest.blocked || Boolean(thumbnailRequest.validationError)} onClick={() => void thumbnailRequest.submit('Revise Thumbnail')} className="rounded-xl bg-purple-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{thumbnailRequest.pending ? 'Submitting…' : 'Regenerate thumbnail'}</button></div>
                    </div>}
                </div>}
                {awaitingYouTubePublish && <div className="mt-5 rounded-2xl border border-blue-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-5"><div><div className="text-xs font-black uppercase tracking-wider text-blue-700">YouTube upload</div><h3 className="mt-1 text-xl font-black text-slate-900">Prepare and upload the long-form video</h3><p className="mt-1 text-sm text-slate-500">Channel: {selectedContentChannel || 'Choose a content channel above'}. Chapters are optional and should only be added when accurate timestamps are available.</p></div><a className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-red-700" href="https://studio.youtube.com/" target="_blank" rel="noreferrer"><UploadSimpleIcon size={18}/> Upload to YouTube</a></div><div className="mt-5 grid gap-4"><label className="text-xs font-black uppercase tracking-wider text-slate-500">YouTube title<div className="mt-2 flex gap-2"><input value={youtubeTitleDraft} onChange={event => setYoutubeTitleDraft(event.currentTarget.value)} className="min-w-0 flex-1 rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold outline-none focus:border-blue-500"/><button onClick={() => void copyText(youtubeTitleDraft, 'YouTube title')} className="rounded-xl border border-slate-300 px-4 text-sm font-bold">Copy</button></div></label><label className="text-xs font-black uppercase tracking-wider text-slate-500">YouTube description<div className="mt-2 flex items-start gap-2"><textarea value={youtubeDescriptionDraft} onChange={event => setYoutubeDescriptionDraft(event.currentTarget.value)} placeholder="Prepare YouTube details to generate the channel-specific description." className="min-h-72 min-w-0 flex-1 rounded-xl border border-slate-300 px-4 py-3 text-sm leading-6 outline-none focus:border-blue-500"/><button onClick={() => void copyText(youtubeDescriptionDraft, 'YouTube description')} className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold">Copy</button></div></label><label className="text-xs font-black uppercase tracking-wider text-slate-500">Chapters <span className="font-medium normal-case text-slate-400">(optional)</span><textarea value={youtubeChaptersDraft} onChange={event => setYoutubeChaptersDraft(event.currentTarget.value)} placeholder={'00:00 Introduction\n02:15 First topic'} className="mt-2 min-h-28 w-full rounded-xl border border-slate-300 px-4 py-3 font-mono text-sm outline-none focus:border-blue-500"/></label><div className="flex flex-wrap gap-3"><button disabled={busy} onClick={() => void prepareYouTubeDetails()} className="rounded-xl border border-blue-300 bg-blue-50 px-5 py-3 text-sm font-bold text-blue-700 disabled:opacity-50">Generate missing details</button><button disabled={busy || !youtubeTitleDraft.trim() || !youtubeDescriptionDraft.trim()} onClick={() => void saveYouTubeDetails()} className="rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">Save YouTube details</button></div><div className="border-t border-slate-200 pt-4"><label className="text-xs font-black uppercase tracking-wider text-slate-500">YouTube URL after upload<div className="mt-2 flex gap-2"><input value={youtubeUrlDraft} onChange={event => setYoutubeUrlDraft(event.currentTarget.value)} placeholder="https://youtu.be/..." className="min-w-0 flex-1 rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500"/><button disabled={busy || !youtubeUrlDraft.trim()} onClick={() => void saveYouTubeUrl()} className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">Save URL and continue</button></div></label></div></div></div>}
                {text(selected, f.youtubeUrl) && <div className="mt-5 rounded-2xl border border-blue-200 bg-white p-5 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-5"><div><div className="text-xs font-black uppercase tracking-wider text-blue-700">Repurposing brief</div><h3 className="mt-1 text-xl font-black text-slate-900">Choose what this video should become</h3><p className="mt-1 text-sm text-slate-500">OpusClip supplies each clip's transcript and score. The selected channels control which distribution drafts are generated.</p></div><div className="flex flex-wrap items-end gap-3"><label className="text-xs font-black uppercase tracking-wider text-slate-500">Clips wanted<input type="number" min="1" max="50" value={requestedClipCountDraft} onChange={event => setRequestedClipCountDraft(event.currentTarget.value)} className="mt-2 block w-32 rounded-xl border border-slate-300 px-4 py-3 text-base font-black text-slate-900 outline-none focus:border-blue-500"/></label><div className="pb-1 text-xs font-bold text-slate-500">Using minimum score <strong className="text-slate-800">{minimumClipScoreDraft}</strong> from Settings</div></div></div>
                    <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{DISTRIBUTION_CHANNELS.map(channel => { const selectedChannel = distributionChannelsDraft.includes(channel); const comingSoon = channel === 'Resource' && !RESOURCE_AUTOMATION_ENABLED; const typefullyLater = channel === 'X / Twitter' || channel === 'LinkedIn'; return <button key={channel} type="button" disabled={comingSoon} onClick={() => toggleDistributionChannel(channel)} className={`rounded-xl border px-4 py-3 text-left text-sm font-bold transition ${comingSoon ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400' : selectedChannel ? 'border-blue-600 bg-blue-600 text-white shadow-sm' : 'border-slate-300 bg-white text-slate-700 hover:border-blue-300'}`}><span className="flex items-center justify-between gap-2"><span>{selectedChannel ? '✓ ' : ''}{channel}</span>{comingSoon && <span className="rounded-full bg-white px-2 py-1 text-[10px] font-black uppercase tracking-wide text-purple-600">Coming soon</span>}{typefullyLater && <span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-wide ${selectedChannel ? 'bg-white/20 text-white' : 'bg-purple-50 text-purple-600'}`}>Typefully coming soon</span>}</span></button>; })}</div>
                    <div className="mt-5 flex flex-wrap items-center gap-3"><button disabled={busy || distributionChannelsDraft.length === 0} onClick={() => void saveRepurposingBrief()} className="rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white disabled:opacity-40">{busy ? 'Starting…' : clipCount > 0 ? 'Save and generate drafts' : 'Save repurposing brief'}</button><span className="text-xs font-medium text-slate-500">{clipCount > 0 ? 'This saves your choices and starts the distribution automation.' : 'Choose at least one output. Draft generation starts after clips are available.'}</span></div>
                </div>}
                {text(selected, f.rawFolderUrl) && !text(selected, f.finalAssetUrl) && <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-5"><div><h3 className="font-black">Choose the editing path</h3><p className="mt-1 text-sm text-slate-500">Use OpusClip for automated editing, or edit the full video in DaVinci Resolve.</p></div><div className="flex gap-2"><button type="button" disabled={routeSaving} onClick={event => { event.preventDefault(); void setEditingRoute('OpusClip'); }} className={`rounded-xl border px-4 py-3 text-sm font-bold disabled:cursor-wait disabled:opacity-70 ${editingRouteDraft === 'OpusClip' ? 'border-purple-600 bg-purple-600 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>{routeSaving && editingRouteDraft === 'OpusClip' ? 'Saving…' : editingRouteDraft === 'OpusClip' ? '✓ OpusClip selected' : 'Use OpusClip'}</button><button type="button" disabled={routeSaving} onClick={event => { event.preventDefault(); void setEditingRoute('DaVinci Resolve'); }} className={`rounded-xl border px-4 py-3 text-sm font-bold disabled:cursor-wait disabled:opacity-70 ${editingRouteDraft === 'DaVinci Resolve' ? 'border-purple-600 bg-purple-600 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>{routeSaving && editingRouteDraft === 'DaVinci Resolve' ? 'Saving…' : editingRouteDraft === 'DaVinci Resolve' ? '✓ DaVinci selected' : 'Use DaVinci Resolve'}</button></div></div>
                    <div className="mt-4 flex flex-wrap gap-3"><a className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700" href={text(selected, f.rawFolderUrl)} target="_blank" rel="noreferrer"><UploadSimpleIcon size={17}/> Upload recording</a><button disabled={busy || Boolean(existingAction)} onClick={() => runAction('Sync Frame.io')} className="inline-flex items-center gap-2 rounded-xl border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-bold text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"><ClockIcon size={17}/> {existingAction === 'Sync Frame.io' ? 'Syncing Frame.io…' : 'Sync Frame.io'}</button>{text(selected, f.finalFolderUrl) && (longFormSubmitted || editingRouteDraft === 'DaVinci Resolve') && <a className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700" href={text(selected, f.finalFolderUrl)} target="_blank" rel="noreferrer"><UploadSimpleIcon size={17}/> Upload finalized video</a>}</div>
                    {editingRouteDraft === 'OpusClip' && <div className="mt-5 grid gap-3 md:grid-cols-2">
                        <div className={`flex h-full flex-col rounded-2xl border p-4 ${longFormSubmitted ? 'border-emerald-200 bg-emerald-50' : 'border-purple-200 bg-purple-50'}`}><div className="text-xs font-black uppercase tracking-wider text-purple-700">1. Full-video edit</div><p className="mt-2 text-sm leading-6 text-slate-600">Import the raw recording into OpusClip first. This pass does not create shorts.</p><button disabled={busy || Boolean(existingAction) || !recordingSynced || longFormSubmitted} onClick={() => runAction('Submit to OpusClip')} className="mt-auto rounded-xl bg-purple-600 px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300">{longFormSubmitted ? 'Full edit sent' : 'Edit full video'}</button></div>
                        <div className={`flex h-full flex-col rounded-2xl border p-4 ${shortClipsSubmitted ? 'border-emerald-200 bg-emerald-50' : 'border-blue-200 bg-blue-50'}`}><div className="text-xs font-black uppercase tracking-wider text-blue-700">2. Short clips</div><p className="mt-2 text-sm leading-6 text-slate-600">Upload the finalized long-form video to Final, sync it, then create a separate ClipBasic project.</p><button disabled={busy || Boolean(existingAction) || !Boolean(text(selected, f.finalAssetUrl)) || !shortJob.available || !shortJob.finalId || shortClipsSubmitted} onClick={() => runAction('Submit to OpusClip')} className="mt-auto rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300">{shortClipsSubmitted ? 'Short clips submitted' : 'Create short clips'}</button></div>
                    </div>}
                    <p className="mt-3 text-xs font-medium text-slate-500">Upload, sync Frame.io, and complete each pass in order. The short-clips button stays locked until the finished edit is available.</p>
                </div>}
                <div className="mt-7 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between gap-2">{STAGES.map((stage, index) => <React.Fragment key={stage}><div className="flex min-w-[62px] flex-col items-center gap-2"><div className={`grid h-8 w-8 place-items-center rounded-full text-xs font-black ${index < stageIndex ? 'bg-emerald-100 text-emerald-700' : index === stageIndex ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-400'}`}>{index < stageIndex ? <CheckCircleIcon size={19}/> : index + 1}</div><span className={`text-[11px] font-bold ${index === stageIndex ? 'text-purple-700' : 'text-slate-500'}`}>{stage}</span></div>{index < STAGES.length - 1 && <div className={`mb-6 h-1 flex-1 rounded-full ${index < stageIndex ? 'bg-emerald-300' : 'bg-slate-200'}`}/>}</React.Fragment>)}</div></div>
                <div className="mt-7 grid grid-cols-2 gap-5"><div className={card}><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-purple-50 text-purple-700"><FilmStripIcon size={22}/></div><div><h3 className="font-black">Video</h3><p className="text-xs text-slate-500">Recording and finished edit</p></div></div><div className="mt-5 space-y-3 text-sm"><StatusLine label="Recording folder" complete={Boolean(text(selected, f.rawFolderUrl))}/><StatusLine label="Finished video" complete={Boolean(text(selected, f.finalAssetUrl))}/><StatusLine label="YouTube destination saved" complete={Boolean(text(selected, f.youtubeUrl))}/></div></div><div className={card}><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700"><PlayCircleIcon size={22}/></div><div><h3 className="font-black">Repurposing</h3><p className="text-xs text-slate-500">Clips and written content</p></div></div><div className="mt-5 space-y-3 text-sm"><StatusLine label="Short-clips OpusClip project" complete={shortClipsProjectReady}/><StatusLine label={`${displayedClipCount} clips connected`} complete={displayedClipCount > 0}/><StatusLine label="Distribution drafts" complete={/^(Drafts Ready|Scheduled|Published)$/i.test(option(selected, f.distributionStatus)) || /complete/i.test(option(selected, f.distributionStatus))}/></div></div></div>
                {(message || error) && <div className={`mt-5 rounded-2xl border p-5 ${error ? 'border-red-200 bg-red-50 text-red-900' : 'border-slate-200 bg-white text-slate-700'}`}><div className="text-xs font-bold uppercase tracking-widest">{error ? 'Needs attention' : 'Latest update'}</div><p className="mt-2 text-sm leading-6">{error || message}</p></div>}
                <details className="mt-7 rounded-2xl border border-slate-200 bg-white"><summary className="cursor-pointer list-none px-5 py-4 text-sm font-bold text-slate-700">Advanced details and manual controls</summary><div className="border-t border-slate-200 p-5"><div className="grid grid-cols-2 gap-4 text-sm"><Detail label="Production stage" value={option(selected, f.stage) || 'Not started'}/><Detail label="Full-edit OpusClip status" value={option(selected, f.opusStatus) || 'Not submitted'}/><Detail label="Short-clips job state" value={shortJob.state || 'Not submitted'}/><Detail label="Thumbnail status" value={option(selected, f.thumbnailStatus) || 'Not started'}/><Detail label="Publishing status" value={option(selected, f.publishingStatus) || 'Not started'}/>{text(selected, f.ideaScore) && <Detail label="Idea score" value={text(selected, f.ideaScore)}/>} {text(selected, f.ideaSourceCommunity) && <Detail label="Idea source" value={text(selected, f.ideaSourceCommunity)}/>} {text(selected, f.ideaDecision) && <Detail label="Idea decision" value={text(selected, f.ideaDecision)}/>} {text(selected, f.ideaQualificationReason) && <div className="col-span-2"><Detail label="Why this idea qualified" value={text(selected, f.ideaQualificationReason)}/></div>}</div>{text(selected, f.ideaSourceUrl) && <div className="mt-5 rounded-2xl border border-purple-200 bg-purple-50 p-4"><div className="text-xs font-black uppercase tracking-wider text-purple-700">Original Reddit post</div><a className="mt-2 block break-all text-sm font-semibold text-purple-700 underline decoration-purple-300 underline-offset-4 hover:text-purple-900" href={text(selected, f.ideaSourceUrl)} target="_blank" rel="noreferrer">{text(selected, f.ideaSourceUrl)}</a><a className="mt-3 inline-flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-3 text-sm font-bold text-white hover:bg-purple-700" href={text(selected, f.ideaSourceUrl)} target="_blank" rel="noreferrer">Review original Reddit post <ArrowRightIcon size={17}/></a></div>}<button className="mt-5 rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold" onClick={() => expandRecord(selected)}>Edit all fields in Airtable</button></div></details>
            </div>}</section>}
        </main>
        {showDeleteConfirm && selected && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-6"><div className="w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl"><div className="flex items-start gap-4"><div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-red-50 text-red-600"><TrashIcon size={24}/></div><div><h2 className="text-xl font-black text-slate-900">Delete this content record?</h2><p className="mt-2 text-sm leading-6 text-slate-600"><strong>{text(selected, f.title) || 'Untitled content'}</strong> will be permanently removed from Airtable. Frame.io files, OpusClip projects, YouTube videos, and published posts will not be deleted.</p></div></div><div className="mt-7 flex justify-end gap-3"><button className="rounded-xl border border-slate-300 px-5 py-3 font-semibold" disabled={busy} onClick={() => setShowDeleteConfirm(false)}>Cancel</button><button className="rounded-xl bg-red-600 px-5 py-3 font-bold text-white disabled:opacity-50" disabled={busy} onClick={deleteContentRecord}>{busy ? 'Deleting…' : 'Delete from Airtable'}</button></div></div></div>}
    </div>;
}

function StatusLine({label, complete}: {label: string; complete: boolean}) {
    return <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2"><span className="font-semibold text-slate-700">{label}</span><span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${complete ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>{complete ? 'Ready' : 'Waiting'}</span></div>;
}

function Detail({label, value}: {label: string; value: string}) {
    return <div className="rounded-xl bg-slate-50 p-4"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</div><div className="mt-1 font-semibold text-slate-800">{value}</div></div>;
}

function formatShortDate(value: string): string {
    if (!value) return '';
    const timestamp = dateTime(value);
    if (!Number.isFinite(timestamp)) return value;
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {month: 'short', day: 'numeric'});
}

function dateTime(value: string): number {
    if (!value) return Number.POSITIVE_INFINITY;
    const normalized = String(value).trim();
    const isoMatch = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    const usMatch = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    let year: number;
    let month: number;
    let day: number;

    if (isoMatch) {
        year = Number(isoMatch[1]);
        month = Number(isoMatch[2]);
        day = Number(isoMatch[3]);
    } else if (usMatch) {
        month = Number(usMatch[1]);
        day = Number(usMatch[2]);
        year = Number(usMatch[3]);
    } else {
        const fallback = new Date(normalized).getTime();
        return Number.isNaN(fallback) ? Number.POSITIVE_INFINITY : fallback;
    }

    const parsed = new Date(year, month - 1, day, 12, 0, 0, 0).getTime();
    return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
}

function earliestScheduleTime(record: AnyRecord, recordingField: AnyField | null, publishField: AnyField | null): number {
    return Math.min(dateTime(text(record, recordingField)), dateTime(text(record, publishField)));
}

function isOnOrAfterContentCutoff(record: AnyRecord, recordingField: AnyField | null, publishField: AnyField | null): boolean {
    const dates = [text(record, recordingField), text(record, publishField)].filter(Boolean).map(dateTime).filter(Number.isFinite);
    if (dates.length === 0) return true;
    return Math.max(...dates) >= dateTime(CONTENT_CUTOFF_DATE);
}

function isoDate(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function recordDateKey(record: AnyRecord | null, target: AnyField | null): string {
    const value = raw(record, target);
    const source = value instanceof Date
        ? value
        : String(value ?? text(record, target)).trim();
    if (!source) return '';
    if (typeof source === 'string') {
        const isoMatch = source.match(/^(\d{4}-\d{2}-\d{2})/);
        if (isoMatch) return isoMatch[1];
    }
    const parsed = source instanceof Date ? source : new Date(source);
    return Number.isNaN(parsed.getTime()) ? '' : isoDate(parsed);
}

type RecordingWeek = {start: string; end: string};

function currentRecordingWeek(now = new Date()): RecordingWeek {
    // Match the editorial schedule's timezone. UTC calendar arithmetic avoids DST shifts.
    const parts = new Intl.DateTimeFormat('en-CA', {timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts(now);
    const part = (type: string) => parts.find(value => value.type === type)?.value ?? '';
    const monday = new Date(`${part('year')}-${part('month')}-${part('day')}T12:00:00Z`);
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    const sunday = new Date(monday);
    sunday.setUTCDate(sunday.getUTCDate() + 6);
    return {start: monday.toISOString().slice(0, 10), end: sunday.toISOString().slice(0, 10)};
}

function isRecordingThisWeek(record: AnyRecord | null, recordingField: AnyField | null, week: RecordingWeek): boolean {
    const date = recordDateKey(record, recordingField);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    const parsed = new Date(`${date}T12:00:00Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return false;
    return date >= week.start && date <= week.end;
}

function CalendarView({records, fields, completions, hideCompleted, onSelect}: {records: AnyRecord[]; fields: Record<string, AnyField | null>; completions: Map<string, ReturnType<typeof distributionCompletion>>; hideCompleted: boolean; onSelect: (record: AnyRecord) => void}) {
    const [monthOffset, setMonthOffset] = useState(0);
    const [dateFilter, setDateFilter] = useState<'all' | 'recording' | 'publish'>('all');
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const displayedMonth = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1, 12);
    const start = new Date(displayedMonth);
    start.setDate(1 - start.getDay());
    const days = Array.from({length: 42}, (_, index) => {
        const value = new Date(start);
        value.setDate(start.getDate() + index);
        return value;
    });
    const active = records.filter(record => (!hideCompleted || !completions.get(record.id)?.complete) && !ideaIsArchived(record, fields) && !ideaNeedsApproval(record, fields));
    const unscheduled = active.filter(record => {
        const recording = recordDateKey(record, fields.recordingDate);
        const publishing = recordDateKey(record, fields.publishDate);
        if (dateFilter === 'recording') return !recording;
        if (dateFilter === 'publish') return !publishing;
        return !recording && !publishing;
    });
    const events = new Map<string, Array<{record: AnyRecord; kind: 'Record' | 'Publish'}>>();
    active.forEach(record => {
        const recording = recordDateKey(record, fields.recordingDate);
        const publishing = recordDateKey(record, fields.publishDate);
        if (recording && dateFilter !== 'publish') events.set(recording, [...(events.get(recording) ?? []), {record, kind: 'Record'}]);
        if (publishing && dateFilter !== 'recording') events.set(publishing, [...(events.get(publishing) ?? []), {record, kind: 'Publish'}]);
    });

    return <section className="p-7"><div className="mx-auto max-w-7xl"><div className="flex items-end justify-between gap-4"><div><h2 className="text-2xl font-black">Recording and publishing calendar</h2><p className="mt-1 text-sm text-slate-500">Purple is when you record. Blue is when the finished content should publish.</p></div><div className="flex flex-wrap items-center justify-end gap-2"><div className="flex rounded-xl border border-slate-300 bg-slate-50 p-1 shadow-sm" aria-label="Calendar date filter">{([['all','All dates'],['recording','Recording dates'],['publish','Publish dates']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setDateFilter(value)} className={`rounded-lg px-3 py-2 text-xs font-black transition ${dateFilter === value ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>{label}</button>)}</div><button onClick={() => setMonthOffset(value => value - 1)} aria-label="Previous month" className="grid h-10 w-10 place-items-center rounded-xl border border-slate-300 bg-white text-xl font-black text-slate-700 shadow-sm">←</button><button onClick={() => setMonthOffset(0)} className="min-w-44 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-black text-slate-700 shadow-sm">{displayedMonth.toLocaleDateString('en-US', {month: 'long', year: 'numeric'})}</button><button onClick={() => setMonthOffset(value => value + 1)} aria-label="Next month" className="grid h-10 w-10 place-items-center rounded-xl border border-slate-300 bg-white text-xl font-black text-slate-700 shadow-sm">→</button></div></div><div className="mt-6 grid grid-cols-7 gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 shadow-sm">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(day => <div key={day} className="bg-slate-50 px-3 py-2 text-center text-xs font-black uppercase tracking-wider text-slate-500">{day}</div>)}{days.map(day => { const key = isoDate(day); const dayEvents = events.get(key) ?? []; const isToday = key === isoDate(today); const isCurrentMonth = day.getMonth() === displayedMonth.getMonth(); return <div key={key} className={`min-h-[135px] p-2 ${isCurrentMonth ? 'bg-white' : 'bg-slate-50'}`}><div className={`mb-2 grid h-7 w-7 place-items-center rounded-full text-xs font-black ${isToday ? 'bg-purple-600 text-white' : isCurrentMonth ? 'text-slate-500' : 'text-slate-300'}`}>{day.getDate()}</div><div className="space-y-1.5">{dayEvents.map(({record, kind}, index) => <button key={`${record.id}-${kind}-${index}`} onClick={() => onSelect(record)} className={`w-full rounded-lg border px-2 py-2 text-left text-[11px] font-bold leading-4 ${kind === 'Record' ? 'border-purple-200 bg-purple-50 text-purple-800' : 'border-blue-200 bg-blue-50 text-blue-800'}`}><span className="block text-[9px] font-black uppercase tracking-wider opacity-70">{kind}</span>{text(record, fields.title) || 'Untitled content'}</button>)}</div></div>})}</div>{unscheduled.length > 0 && <div className="mt-7 rounded-2xl border border-amber-200 bg-amber-50 p-5"><div className="flex items-center justify-between gap-4"><div><h3 className="font-black text-amber-950">Unscheduled active content</h3><p className="mt-1 text-sm text-amber-800">{dateFilter === 'recording' ? 'Give these items a Recording Date so they appear on this view.' : dateFilter === 'publish' ? 'Give these items a Publish Date so they appear on this view.' : 'Give these items a Recording Date or Publish Date so they appear on the calendar.'}</p></div><span className="rounded-full bg-white px-3 py-1 text-sm font-black text-amber-800">{unscheduled.length}</span></div><div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-3">{unscheduled.slice(0, 12).map(record => <button key={record.id} onClick={() => onSelect(record)} className="rounded-xl border border-amber-200 bg-white px-3 py-3 text-left text-sm font-bold text-slate-800 hover:border-purple-300">{text(record, fields.title) || 'Untitled content'}<span className="mt-1 block text-xs font-medium text-slate-500">{normalizedStage(option(record, fields.stage))}</span></button>)}</div></div>}</div></section>;
}

initializeBlock({interface: () => <ContentCenterErrorBoundary><ContentCenter/></ContentCenterErrorBoundary>});

