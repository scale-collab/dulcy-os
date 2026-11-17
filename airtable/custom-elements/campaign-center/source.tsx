import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
    CellRenderer,
    expandRecord,
    initializeBlock,
    useBase,
    useCustomProperties,
    useRecords,
} from '@airtable/blocks/interface/ui';
import {FieldType} from '@airtable/blocks/interface/models';
import {
    ArrowsClockwiseIcon,
    CaretDownIcon,
    CaretRightIcon,
    CopyIcon,
    EyeIcon,
    FunnelIcon,
    MagnifyingGlassIcon,
    PauseIcon,
    PencilSimpleIcon,
    PlayIcon,
    PlusIcon,
    TrashIcon,
    XIcon,
} from '@phosphor-icons/react';

type TimePeriod = 'Last 10 days' | 'Last 30 days' | 'Last 60 days' | 'Last 120 days' | 'All time';
type DateRange = 'all' | '10' | '30' | '60' | '120';
type Tab = 'overview' | 'strategy' | 'copy' | 'approval' | 'sequence' | 'settings' | 'senders' | 'analytics';
type AnyRecord = any;
type TrackedOperation = {
    type: 'spintax' | 'upload';
    recordId: string;
    campaignName: string;
    sawRunningState: boolean;
};
type AnyField = any;
type AnyTable = any;

const ACTIVE_CLIENT_STORAGE_KEY = 'dulcy.campaigns.active-client';
const ACTIVE_WORKSPACE_STORAGE_KEY = 'dulcy.campaigns.active-workspace';

function savedClientFilter(): string {
    try {
        return window.localStorage.getItem(ACTIVE_CLIENT_STORAGE_KEY) || 'Dulcy';
    } catch {
        return 'Dulcy';
    }
}

function savedWorkspaceFilter(): string {
    try {
        return window.localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY) || 'all';
    } catch {
        return 'all';
    }
}

const BISON_SYNC_WEBHOOK_URL = 'https://bison-sync-relay.scale-f9d.workers.dev/sync';
const BISON_SENDER_SYNC_WEBHOOK_URL = 'https://n8n.dulcy.io/webhook/sync-bison-senders';
function rawTimestampValue(record: any, field: any): string {
    const raw = cellValue(record, field);
    if (raw instanceof Date) return raw.toISOString();
    return raw === null || raw === undefined ? '' : String(raw).trim();
}
const pendingBisonChange = (record: any, fields: any) => {
    let request: any = {}; try { request = JSON.parse(textValue(record, fields.automationRequest) || '{}'); } catch {}
    if (!['Launch', 'Pause', 'Delete'].includes(request.kind) || request.kind !== optionName(record, fields.bisonAction)) return false;
    const status = optionName(record, fields.status).toLowerCase();
    const fresh = Date.parse(rawTimestampValue(record, fields.statusModified)) >= Date.parse(request.requestedAt);
    if (fresh && (request.kind === 'Launch' ? ['active','running','live','scheduled','completed'].includes(status) : request.kind === 'Pause' ? ['paused','inactive'].includes(status) : status === 'deleted')) return false;
    return campaignAutomationState(record, fields, Date.now()).active;
};
const CAMPAIGN_SENDER_UPDATE_WEBHOOK_URL = 'https://n8n.dulcy.io/webhook/campaign-update-senders';
const readSenderUpdateState = (record: any, field: any): any => {
    try { return JSON.parse(textValue(record, field) || '{}'); } catch { return {}; }
};
const senderUpdateBlocked = (record: any, field: any) => {
    const state = readSenderUpdateState(record, field);
    return ['Requested', 'Running'].includes(state.status) || state.requiresAttention === true;
};
const CAMPAIGN_TOP_UP_PREPARE_URL = 'https://n8n.dulcy.io/webhook/campaign-top-up-prepare';
const CAMPAIGN_TOP_UP_WEBHOOK_URL = 'https://n8n.dulcy.io/webhook/campaign-top-up-leads';
// Verified split-output families whose top-up intent is stored on one child.
// Runtime identity checks below prevent these exact IDs from crossing client boundaries.
const TOP_UP_RESERVATION_FAMILIES = [{
    ownerId: 'recaM6Leomumw4auE',
    members: [
        {recordId: 'recaM6Leomumw4auE', bisonId: '602'},
        {recordId: 'recIbAm41zVwTYyRI', bisonId: '601'},
    ],
}];

// Exact field IDs from the live Campaigns table. These take priority over
// aliases so renamed, formula, and similarly named fields resolve reliably.
const CAMPAIGN_FIELD_IDS = {
    progress: 'fldGM1f8fNNu6ODo2',
    totalLeads: 'fldbYOfqWk4KrNgfz',
    contacted: 'fld8nKHhBCV8UFm0G',
    emailsSent: 'fldDmaS8NZF3j0ZBY',
    replies: 'fldqSxElCOm0QN4kh',
    replyRate: 'fldjZzJHEuIQoMUbb',
    repliesData: 'fldoY2XU0mz33L0sS',
    bounces: 'fld3MHVEqXgHimKom',
    bounceRate: 'fldiLOzbllDI8mn7C',
    bouncesData: 'fldKEvZR0qkhiepcq',
    interested: 'fldSRXRCC0x2AhX9h',
    interestedRate: 'fldPx4lkp0XeXtamH',
    interestedData: 'fld31Z20ar3plBXdG',
    meetings: 'fldoUuw5JDk0L264W',
    meetingRate: 'fldTFkLcWvTI5Zrex',
    meetingsData: 'fldqQDM6C7Rrt8oHl',
    workflowStage: 'fldOVJmlGWxW1dveo',
    campaignApproach: 'fldclFGDzjg4nvfxL',
    prepDate: 'fldMyRtIz3Zm26oiH',
    launchDate: 'fldhyq0anpSO1r0bV',
    thesis: 'fldlixHfhzrd7nuSc',
    campaignLeadList: 'fldEN25silh1TWs1h',
    leadList: 'fld5weZ6ED31dBlaz',
    topUpLeadList: 'fld4lMlTPjrRmAFHp',
    topUpRequest: 'fldOU7mRKMTG5hGjM',
    topUpStatus: 'fldhUPV4f4pqvv047',
    topUpAdded: 'fldj24jsClYDgjNyG',
    topUpSkipped: 'fldBz14RRsy2PDUhp',
    topUpFailed: 'fldEosJWzT7I73inC',
    topUpLastRun: 'fldFfVuUx0ZMCaJXX',
    topUpMessage: 'fldfSoL1aatKQs722',
    subject1: 'fldZTtdvwRV53voZE',
    body1: 'fldjnYRokcvObXphA',
    subject2: 'fldAikx1V83MsK3Ql',
    body2: 'fldw7AQWalsiisKrM',
    subject3: 'fldu2xpTQFuuyU71Q',
    body3: 'fld6U4bB1335Ac5vM',
    subject4: 'fldFrZUqdTeydSTUV',
    body4: 'fldJ8gNIksLd8WZ8t',
    daysBetween: 'fldbX8yCSVIhfJ6v7',
    variants1: 'fldNIQxQkubt8LAT0',
    variants2: 'fld8zzSiQMwejvoZ4',
    variants3: 'fldpnrrUrJ8NPtxPC',
    variants4: 'fldT1Jw7wLftwkuGK',
    backupVariants: 'fldzztWeFYjHX65ck',
    monday: 'fldEX5XHj8lIkkp4g',
    tuesday: 'fldLoKQBjHmvA0sVd',
    wednesday: 'fldWdOeNb5mc95BZp',
    thursday: 'fldnJtB1br2i2zkLx',
    friday: 'fldsOIQHZfuILVYyx',
    saturday: 'fld9ybdYVtipVAQ7g',
    sunday: 'fldhasNVsPOKuTQSC',
    startTime: 'fldxkH2X1VdDOj54B',
    endTime: 'fldj60qqSPeYawLX4',
    timezone: 'fldg8Be3TXKtI30j5',
    maxEmails: 'fld0PxY90RaShLgvw',
    maxNewLeads: 'fldPRrn97ehpYGomi',
    plainText: 'fld2VaGjw0nYFJvIy',
    startDate: 'fldZGNVkmKEzcq4yj',
    endDate: 'fldaFRUpSPJB3IV8t',
    clientFeedback: 'fldWJJEJYzKxyLwti',
    selectChanges: 'fldhKpDiiRjqMJ2o0',
    reviewCopy: 'fldWeCXf5tCIwJMRd',
    companyFeedback: 'fldvHy50OLfkmtdwp',
    geographyFeedback: 'fldy9BjxRZuyh6WLO',
    industryFeedback: 'fldZYgj2wmOH7CJKE',
    titleFeedback: 'fldAAxGIIe6E7g26Y',
    additionalContext: 'fldkRCt0spCxZribv',
    emailAccounts: 'fldi906rwZ9YOpU64',
    canEnterVertical: 'fldNGNt6DF3s0pvYy',
    canCreateOffer: 'fldbp5hFeZSKg8ZJT',
    finalSubject1a: 'fldzT18PUxePQIYLJ', finalBody1a: 'fldIX1lC9HGgbIaSh', finalSubject1b: 'fld7JbSeUeGRIErm6', finalBody1b: 'fldGoEivHNQeokI0Z', finalSubject1c: 'fldaioqEyiX4R0cFe', finalBody1c: 'fldYltiXCNiZ4hY7c',
    finalSubject2a: 'fldj6TMQJYy0PxEko', finalBody2a: 'fldRL9Q0XLFlJ9Mkn', finalSubject2b: 'fld7ZeulbHEkOhiYu', finalBody2b: 'fldQUnGRfJB2Pq3sf', finalSubject2c: 'fldeLeDeZnIBMZTsw', finalBody2c: 'fldffd3FJPmkwJ4OF',
    finalSubject3a: 'fldhwjgXT5at1lZdE', finalBody3a: 'fld2unmibesFQ2Sqc', finalSubject3b: 'fldfT20oJVFIV3k9i', finalBody3b: 'fldnxe2hocQKozF7X', finalSubject3c: 'fld40AvWVaNakJP0c', finalBody3c: 'fldqK0H3nzJTViQAZ',
    finalSubject4a: 'fldlpfpmRywwxorso', finalBody4a: 'fldLWnxQ1MJqzuJdw',
    createSpintax: 'fldsvgKf6U5zDOygf',
} as const;

// Exact fields shared with Lead List Center. Campaign creation must write the
// targeting sentence into the Lead List record itself; the Lead List custom
// interface cannot depend on being able to read across to Campaigns.
const LEAD_LIST_FIELD_IDS = {
    name: 'fldbg5PAnKyFHc3uy',
    link: 'fldSOTvnUxzKWXMDD',
    client: 'fldEujtSLqwdpOyGD',
    campaign: 'fldepbn71awSjmZPV',
    icpDescription: 'fldcYwP7Dlq4uyC39',
    sourceType: 'fldJSSY0QTMU5pzsQ',
    stage: 'fld8nrebRFL0O8kgj',
    processingStatus: 'fldf9wpMGWg0SebHV',
    finalFile: 'fldjn5vqHSVYiAR6z',
    finalGenericCount: 'fld0FHomkh3uyx0FD',
    finalDirectCount: 'fldQZJCpTofahmTkl',
} as const;

// Pivot permissions belong to the client, not an individual campaign. A blank
// value is intentionally treated as Enabled so new clients start with both
// pivot paths available without requiring setup on every campaign.
const CLIENT_FIELD_IDS = {
    newVerticalPivot: 'fldY5tnIicC48grKq',
    newOfferPivot: 'fld9HliYa3igd1Uri',
} as const;

const FIELD_ALIASES = {
    campaignName: ['Name', 'Campaign Name', 'Campaign'],
    client: ['Client', 'Clients', 'Company'],
    status: ['Campaign Status', 'Status'],
    type: ['Campaign Type', 'Type'],
    lifecycle: ['Lifecycle', 'Campaign Lifecycle', 'Stage'],
    workspace: ['Workspace', 'Workspace ID', 'Bison Workspace', 'EmailBison Workspace'],
    created: ['Created At', 'Created', 'Created Time'],
    health: ['Health', 'Campaign Health'],
    totalLeads: ['Total Leads', 'Leads'],
    contacted: ['Total Leads Contacted', 'Leads Contacted', 'Contacted'],
    emailsSent: ['Emails Sent', 'Total Emails Sent', 'Sent'],
    replies: ['Unique Replies', 'Replies', 'Total Replies'],
    replyRate: ['Unique Replies %', 'Reply %', 'Reply Rate', 'Replies %'],
    repliesData: ['Unique Replies Data'],
    bounces: ['Bounces', 'Total Bounces', 'Bounced'],
    bounceRate: ['Bounced %', 'Bounce %', 'Bounce Rate', 'Bounces %'],
    bouncesData: ['Bounced Data'],
    interested: ['Interested', 'Positive Replies'],
    interestedRate: ['Interested %', 'Positive Reply %', 'Positive Reply Rate'],
    interestedData: ['Interested Data'],
    meetings: ['Meetings Booked', 'Meetings'],
    meetingRate: ['Meetings %', 'Meeting %', 'Meeting Rate', 'Meetings Booked %'],
    meetingsData: ['Meetings Booked Data'],
    progress: ['Progress', 'Campaign Progress'],
    bisonUrl: ['Bison URL', 'EmailBison URL', 'Campaign URL'],
    bisonId: ['EmailBison Campaign ID', 'EmailBison ID', 'Bison Campaign ID', 'Bison ID', 'ID'],
    workflowStage: ['Workflow Stage'],
    campaignApproach: ['Campaign Approach'],
    prepDate: ['Campaign Prep Date'],
    launchDate: ['Estimated Launch Date'],
    thesis: ['Campaign Thesis'],
    campaignLeadList: ['Campaign Lead List'],
    leadList: ['Lead List'],
    topUpLeadList: ['Top-up Lead List'],
    topUpRequest: ['Top-up Request'],
    topUpStatus: ['Top-up Status'],
    topUpAdded: ['Top-up Added'],
    topUpSkipped: ['Top-up Skipped'],
    topUpFailed: ['Top-up Failed'],
    topUpLastRun: ['Top-up Last Run'],
    topUpMessage: ['Top-up Message'],
    bisonApiKey: ['EmailBison API (from Client)'],
    bisonBaseUrl: ['EmailBison Base URL (from Client)', 'EmailBison Base URL'],
    subject1: ['Subject Line Email 1 (Review)'], body1: ['Script Copy Email 1 (Review)'],
    subject2: ['Subject Line Email 2 (Review)'], body2: ['Script Copy Email 2 (Review)'],
    subject3: ['Subject Line Email 3 (Review)'], body3: ['Script Copy Email 3 (Review)'],
    subject4: ['Subject Line Email 4 (Review)'], body4: ['Script Copy Email 4 (Review)'],
    threadReply2: ['Thread Reply - Step 2', 'Thread Reply Step 2', 'Step 2 Thread Reply'],
    threadReply3: ['Thread Reply - Step 3', 'Thread Reply Step 3', 'Step 3 Thread Reply'],
    threadReply4: ['Thread Reply - Step 4', 'Thread Reply Step 4', 'Step 4 Thread Reply'],
    daysBetween: ['Days Between Emails'], variants1: ['Number of variants - Step 1'], variants2: ['Number of variants - Step 2'], variants3: ['Number of variants - Step 3'], variants4: ['Number of variants - Step 4'], backupVariants: ['How many back up variants should  each step have?'],
    monday: ['Run on Monday'], tuesday: ['Run on Tuesday'], wednesday: ['Run on Wednesday'], thursday: ['Run on Thursday'], friday: ['Run on Friday'], saturday: ['Run on Saturday'], sunday: ['Run on Sunday'],
    startTime: ['start_time'], endTime: ['end_time'], timezone: ['TimeZone'], maxEmails: ['max_emails_per_day'], maxNewLeads: ['max_new_leads_per_day'], plainText: ['plain_text'], startDate: ['start_date'], endDate: ['end_date'],
    clientFeedback: ["Client's Feedback"], selectChanges: ['Select Changes'], reviewCopy: ['Review copy'], companyFeedback: ['Company Size - Feedback'], geographyFeedback: ['Geographic Targeting - Feedback'], industryFeedback: ['Industry Targeting - Feedback'], titleFeedback: ['Title Targeting - Feedback'], additionalContext: ['Additional Context'],
    clientReviewSubmittedAt: ['Client Review Submitted At'], clientReviewAutoApproveAt: ['Client Review Auto-Approve At'], campaignApprovalSource: ['Campaign Approval Source'],
    emailAccounts: ['Email Accounts', 'Sender Accounts', 'Sending Accounts'],
    canEnterVertical: ['Can Enter New Vertical'],
    canCreateOffer: ['Can Create New Offer'],
    finalSubject1a: ['Campaign Subject 1 Version 1'], finalBody1a: ['Campaign Body 1 Version 1'], finalSubject1b: ['Campaign Subject 1 Version 2'], finalBody1b: ['Campaign Body 1 Version 2'], finalSubject1c: ['Campaign Subject 1 Version 3'], finalBody1c: ['Campaign Body 1 Version 3'],
    finalSubject2a: ['Campaign Subject 2 Version 1'], finalBody2a: ['Campaign Body 2 Version 1'], finalSubject2b: ['Campaign Subject 2 Version 2'], finalBody2b: ['Campaign Body 2 Version 2'], finalSubject2c: ['Campaign Subject 2 Version 3'], finalBody2c: ['Campaign Body 2 Version 3'],
    finalSubject3a: ['Campaign Subject 3 Version 1'], finalBody3a: ['Campaign Body 3 Version 1'], finalSubject3b: ['Campaign Subject 3 Version 2'], finalBody3b: ['Campaign Body 3 Version 2'], finalSubject3c: ['Campaign Subject 3 Version 3'], finalBody3c: ['Campaign Body 3 Version 3'],
    finalSubject4a: ['Campaign Email 4 Subject'], finalBody4a: ['Campaign Body 4 Version 1'],
    createSpintax: ['create_spintax'],
    uploadToBison: ['Upload to EmailBison', 'Trigger Automation', 'Create EmailBison Campaign'],
    bisonAction: ['Bison Action', 'Campaign Action'],
    skipBounceNotification: ['Skip Bounce Notifications', 'Skip Bounce Notification', 'Skip bounce notification', 'skip_bounce_notification', 'skip bounce notification'],
    skipBouncePause: ['Skip Bounce Pause', 'Skip bounce pause', 'skip_bounce_pause', 'skip bounce pause'],
} as const;

const ANALYTICS_ALIASES = {
    campaign: ['Campaign', 'Campaigns'],
    client: ['Client', 'Clients'],
    date: ['Date', 'Analytics Date', 'Day'],
    period: ['Date Period', 'Period', 'Time Period'],
    subject: ['Email Subject', 'Subject'],
    step: ['Sequence Step', 'Step'],
    sent: ['Sent', 'Emails Sent'],
    replies: ['Replies', 'Total Replies'],
    interested: ['Interested', 'Positive Replies'],
    bounce: ['Bounce %', 'Bounce Rate'],
    open: ['Open %', 'Open Rate'],
} as const;

const SEQUENCE_ANALYTICS_ALIASES = {
    campaign: ['Campaign', 'Campaigns'],
    step: ['Step Number', 'Sequence Step', 'Step'],
    variant: ['Variant'],
    subject: ['Subject', 'Email Subject'],
    copy: ['Email Copy Snapshot', 'Email Copy', 'Body'],
    sent: ['Emails Sent', 'Sent'],
    replies: ['Replies', 'Total Replies'],
    replyRate: ['Reply Rate', 'Replies %'],
    interested: ['Interested Replies', 'Interested', 'Positive Replies'],
    interestedRate: ['Interested Rate', 'Interested %', 'Positive Reply Rate'],
    bounces: ['Bounces', 'Bounced'],
    bounceRate: ['Bounce Rate', 'Bounce %'],
    sampleStatus: ['Sample Size Status'],
    lastSynced: ['Last Synced'],
} as const;

const EMAIL_ACCOUNT_ALIASES = {
    name: ['Email Account', 'Email', 'Email Address', 'Name', 'Sender Email'],
    emailId: ['Email ID', 'EmailBison Email ID', 'EmailBison Account ID', 'Sender ID'],
    workspace: ['Workspace ID', 'EmailBison Workspace ID', 'Bison Workspace ID', 'Workspace', 'Bison Workspace', 'EmailBison Workspace'],
    client: ['Client', 'Clients', 'Clients Table', 'Company'],
    status: ['email_status', 'Email Status', 'Status', 'Account Status', 'Connection Status'],
    connected: ['Connected', 'Is Connected', 'Email Connected', 'Account Connected'],
    activeSending: ['Actively Sending', 'Active Sending', 'Is Sending', 'Sending'],
    warmupDays: ['Warmup Days', 'Warm Up Days', 'Warm-up Days', 'Days Warming', 'Warming Days', 'Warmup Age', 'Warm-up Age'],
    warmupStatus: ['Warmup Status', 'Warm Up Status', 'Warm-up Status', 'Warming Status', 'Warming'],
    warmupStart: ['Warmup Start Date', 'Warm Up Start Date', 'Warm-up Start Date', 'Warming Start Date', 'Warmup Started', 'Warm Up Started'],
    campaigns: ['Campaigns', 'Active Campaigns', 'Campaign'],
    dailyLimit: ['email_daily_limit', 'Daily Limit', 'Daily Send Limit', 'Daily Sending Limit', 'Daily Email Limit', 'Emails Per Day', 'Max Emails Per Day', 'max_emails_per_day'],
} as const;

const EMAIL_ACCOUNT_FIELD_IDS = {
    dailyLimit: 'fldBP1gljUUM44JMk',
} as const;

const CAMPAIGN_OUTPUT_SUFFIXES = {
    generic: ' - Generic Emails',
    direct: ' - Direct Emails',
} as const;

// Sender-only workspace overrides. These do not change the client/workspace
// relationships used elsewhere in Campaign Center. Twenty West Media keeps
// both workspaces for historical reporting, but new campaigns must draw sender
// accounts only from the healthy Internal EmailBison workspace.
const SENDER_WORKSPACE_OVERRIDES: Record<string, string[]> = {
    'dulcy': ['2'],
    'dulcy free campaigns': ['41'],
    'twenty west media': ['66'],
    'twenty west media (internal)': ['66'],
};

function baseCampaignName(name: string): string {
    return name.replace(/\s+-\s+(?:Generic|Direct) Emails\s*$/i, '').trim();
}

function genericSafeCopy(value: string): string {
    if (!value) return value;
    const lines = value.replace(/\r\n/g, '\n').split('\n');
    const firstContentLine = lines.findIndex(line => line.trim().length > 0);
    // Generic records have no first name. Remove an opening line that depends
    // on it instead of converting it into an awkward "Hey there" greeting.
    if (firstContentLine >= 0 && /\{FIRST_NAME\}/i.test(lines[firstContentLine])) {
        lines.splice(firstContentLine, 1);
    }
    const converted = lines
        .join('\n')
        .replace(/\{FIRST_NAME\}/gi, '')
        .replace(/^\s*\n+/, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    if (/\{FIRST_NAME\}/i.test(converted)) {
        throw new Error('Generic-email copy still uses {FIRST_NAME} outside a Hey/Hi/Hello greeting. Rewrite that sentence before creating campaign outputs.');
    }
    return converted;
}

function campaignLifecycleState(status: string, hasLeadList: boolean, hasCopy: boolean) {
    if (['completed', 'complete', 'done', 'finished'].includes(status)) return {
        label: 'Done', detail: 'Campaign delivery is complete.', badge: 'border-slate-300 bg-slate-800 text-white',
    };
    // A launched campaign stays in Scheduled while sending or paused.
    // An upload or a pending Launch request is not proof of launch.
    if (['scheduled', 'active', 'live', 'running', 'paused'].includes(status)) return {
        label: 'Scheduled', detail: 'The campaign has been launched.' + (status === 'paused' ? ' Sending is currently paused.' : ''), badge: 'border-blue-300 bg-blue-100 text-blue-800',
    };
    if (!hasLeadList) return {
        label: 'Needs leads', detail: 'Attach a lead list to this campaign.', badge: 'border-amber-300 bg-amber-100 text-amber-800',
    };
    if (!hasCopy) return {
        label: 'Needs copy', detail: 'Fill in the first email subject and copy in Copy or Sequence.', badge: 'border-purple-300 bg-purple-100 text-purple-800',
    };
    return {label: 'Ready', detail: 'Lead list attached and copy filled in. Awaiting launch.', badge: 'border-emerald-300 bg-emerald-100 text-emerald-800'};
}

type CampaignAutomationRequest = {kind: string; label: string; requestedAt: string; baselineStatus: string; baselineBisonId: string};
type CampaignActionResult = {version: 1; recordId: string; kind: 'Launch' | 'Pause'; requestedAt: string; campaignId: string; runId: string; completedAt: string; outcome: 'Completed'; message: string};
const campaignAutomationDisplaySourceFields = (fields: any): AnyField[] => [
    fields.automationRequest, fields.automationStatus, fields.automationMessage, fields.automationError,
    fields.automationStarted, fields.automationCompleted, fields.automationRunId, fields.actionResult,
    fields.topUpStatus, fields.topUpMessage, fields.topUpLastRun, fields.bisonId,
    fields.status, fields.statusModified, fields.workflowStage,
].filter(Boolean);
function campaignAutomationDisplayFingerprint(record: AnyRecord, fields: any): string {
    return JSON.stringify(campaignAutomationDisplaySourceFields(fields).map(field => [field.id, cellValue(record, field) ?? null]));
}
function campaignAutomationDisplayIsDismissed(record: AnyRecord, fields: any, fingerprint: string): boolean {
    try {
        const saved = JSON.parse(textValue(record, fields.automationDisplayState));
        return saved?.version === 1 && saved?.fingerprint === fingerprint && Number.isFinite(Date.parse(saved?.dismissedAt));
    } catch { return false; }
}
function normalizedBisonCampaignId(record: AnyRecord, field: AnyField | null): string {
    const raw = cellValue(record, field);
    const value = typeof raw === 'number' && Number.isSafeInteger(raw) ? String(raw) : typeof raw === 'string' ? raw.trim() : '';
    return /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0 ? value : '';
}
function matchingCampaignActionResult(record: AnyRecord, fields: any, request: CampaignAutomationRequest | null): CampaignActionResult | null {
    if (!request || !['Launch', 'Pause'].includes(request.kind) || !Number.isFinite(Date.parse(request.requestedAt))) return null;
    const currentCampaignId = normalizedBisonCampaignId(record, fields.bisonId);
    if (!currentCampaignId) return null;
    try {
        const value = JSON.parse(textValue(record, fields.actionResult));
        const completedAt = Date.parse(value?.completedAt);
        if (value?.version !== 1 || value?.recordId !== record.id || value?.kind !== request.kind || value?.requestedAt !== request.requestedAt
            || value?.campaignId !== currentCampaignId || value?.outcome !== 'Completed'
            || typeof value?.runId !== 'string' || !value.runId.trim() || typeof value?.message !== 'string'
            || !Number.isFinite(completedAt) || completedAt < Date.parse(request.requestedAt)) return null;
        return value as CampaignActionResult;
    } catch { return null; }
}
function verifiedEmailBisonCampaignLink(record: AnyRecord, fields: any): {url: string; title: string} {
    const rawId = normalizedBisonCampaignId(record, fields.bisonId);
    if (!rawId) return {
        url: '', title: 'Open the Direct or Generic output campaign to view it in EmailBison.',
    };
    const rawUrl = textValue(record, fields.bisonUrl).trim();
    try {
        const url = new URL(rawUrl);
        const uuidPath = /^\/campaigns\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/?$/i;
        if (url.origin === 'https://send.dulcy.io' && !url.username && !url.password && !url.search && !url.hash && uuidPath.test(url.pathname)) return {
            url: url.href, title: 'View in EmailBison',
        };
    } catch { /* Missing or invalid verified URL. */ }
    return {url: '', title: 'The verified EmailBison campaign link is not available yet.'};
}
function campaignAutomationState(record: AnyRecord, fields: any, now: number) {
    let request: CampaignAutomationRequest | null = null;
    try { const value = JSON.parse(textValue(record, fields.automationRequest)); if (value?.kind && Number.isFinite(Date.parse(value.requestedAt))) request = value; } catch { /* No saved request. */ }
    const savedStatus = optionName(record, fields.automationStatus);
    const savedStart = String(cellValue(record, fields.automationStarted) ?? '');
    const savedIsCurrent = !!savedStatus && (!request || Date.parse(savedStart) >= Date.parse(request.requestedAt));
    const status = optionName(record, fields.status).toLowerCase();
    const stage = optionName(record, fields.workflowStage).toLowerCase();
    const changedAt = rawTimestampValue(record, fields.statusModified);
    const freshStatus = !!request && Date.parse(changedAt) >= Date.parse(request.requestedAt);
    const actionResult = matchingCampaignActionResult(record, fields, request);
    const actionResultWins = !!actionResult && (!savedIsCurrent || Date.parse(savedStart) <= Date.parse(actionResult.completedAt));
    let label = 'Not started', message = 'No automation request has been saved for this campaign yet.', completedAt = '';
    if (request) {
        label = 'Requested';
        message = `${request.label} requested. Waiting for results to be saved to Airtable.`;
        let complete = false;
        if (request.kind === 'upload') complete = !request.baselineBisonId && !!textValue(record, fields.bisonId);
        if (request.kind === 'spintax') {
            if (stage === 'spintax in progress') { label = 'Waiting'; message = 'Spintax generation and validation requested. Waiting for the saved result.'; }
            complete = freshStatus && status === 'spintax generated' && stage !== 'spintax in progress';
        }
        if (actionResultWins && actionResult) {
            label = 'Completed';
            message = actionResult.message || `${request.label}: provider success is saved in Airtable.`;
            completedAt = actionResult.completedAt;
        }
        if (request.kind === 'Delete') complete = freshStatus && status === 'deleted';
        if (request.kind === 'topup') {
            const topUpStatus = optionName(record, fields.topUpStatus);
            const topUpLastRun = rawTimestampValue(record, fields.topUpLastRun);
            const freshTopUp = Date.parse(topUpLastRun) >= Date.parse(request.requestedAt);
            if (freshTopUp) {
                label = topUpStatus || 'Waiting';
                message = textValue(record, fields.topUpMessage) || message;
                completedAt = ['completed', 'failed', 'error'].includes(label.toLowerCase()) ? topUpLastRun : '';
            }
        }
        if (complete) { label = 'Completed'; message = `${request.label}: the result is saved in Airtable.`; completedAt = freshStatus ? changedAt : ''; }
        if (freshStatus && ['failed', 'error'].includes(status)) { label = 'Failed'; message = 'Airtable reports a failed campaign step. Check the execution before retrying.'; }
    } else if (stage === 'spintax in progress') {
        label = 'Waiting'; message = 'The campaign is marked Spintax in Progress. Waiting for results; its request time is unavailable.';
    }
    if (savedIsCurrent && !actionResultWins) {
        label = savedStatus;
        message = textValue(record, fields.automationMessage) || message;
        completedAt = String(cellValue(record, fields.automationCompleted) ?? '');
    }
    const startedAt = savedIsCurrent && !actionResultWins ? savedStart : request?.requestedAt || '';
    const active = ['requested', 'waiting', 'running', 'queued', 'processing'].includes(label.toLowerCase());
    return {label, message, startedAt, completedAt, active,
        stale: active && Number.isFinite(Date.parse(startedAt)) && now - Date.parse(startedAt) >= 3600000,
        error: savedIsCurrent && !actionResultWins ? textValue(record, fields.automationError) : '',
        runId: actionResultWins && actionResult ? actionResult.runId : savedIsCurrent ? textValue(record, fields.automationRunId) : ''};
}
function campaignAutomationDismissalUpdate(record: AnyRecord, fields: any, expectedFingerprint: string, now: number): Record<string, any> {
    if (campaignAutomationDisplayFingerprint(record, fields) !== expectedFingerprint) throw new Error('The automation status changed while Clear was open. Nothing was cleared; review the newer status first.');
    const state = campaignAutomationState(record, fields, now);
    if (state.active && !state.stale) throw new Error('A current automation request cannot be cleared. Wait for completion or until it is stale.');
    if (!fields.automationDisplayState) throw new Error('Campaign Automation Display State is not configured. Nothing was cleared.');
    return {[fields.automationDisplayState.id]: JSON.stringify({version: 1, fingerprint: expectedFingerprint, dismissedAt: new Date(now).toISOString()})};
}
type CampaignAutomationClearSnapshot = {recordId: string; fingerprint: string};
function campaignAutomationClearSnapshotMatches(snapshot: CampaignAutomationClearSnapshot | null, record: AnyRecord, fields: any): boolean {
    return !!snapshot && snapshot.recordId === record.id && snapshot.fingerprint === campaignAutomationDisplayFingerprint(record, fields);
}
function CampaignAutomationStatus({record, fields, onRequestClear}: {record: AnyRecord; fields: any; onRequestClear: (snapshot: CampaignAutomationClearSnapshot) => Promise<void>}) {
    const [now, setNow] = useState(Date.now());
    const [clearOpen, setClearOpen] = useState(false);
    const [clearSnapshot, setClearSnapshot] = useState<CampaignAutomationClearSnapshot | null>(null);
    const [clearAcknowledged, setClearAcknowledged] = useState(false);
    const [clearing, setClearing] = useState(false);
    const [clearProblem, setClearProblem] = useState('');
    const clearInFlightRef = useRef(false);
    useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30000); return () => window.clearInterval(timer); }, []);
    const actualState = campaignAutomationState(record, fields, now);
    const displayFingerprint = campaignAutomationDisplayFingerprint(record, fields);
    const dismissed = campaignAutomationDisplayIsDismissed(record, fields, displayFingerprint);
    const state = dismissed ? {...actualState, label: 'Cleared', message: 'The saved automation display was cleared. Operational requests, execution history, and audit receipts are preserved.', startedAt: '', completedAt: '', active: false, stale: false, error: '', runId: ''} : actualState;
    const tone = state.error || ['failed', 'error'].includes(state.label.toLowerCase()) ? 'border-red-200 bg-red-50 text-red-900'
        : state.stale ? 'border-amber-200 bg-amber-50 text-amber-950'
        : state.label.toLowerCase() === 'completed' ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
        : state.active ? 'border-blue-200 bg-blue-50 text-blue-950' : 'border-slate-200 bg-slate-50 text-slate-700';
    const dateLabel = (value: string) => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : '';
    const hasSavedStatus = !dismissed && campaignAutomationDisplaySourceFields(fields).some(field => cellValue(record, field) !== null && String(cellValue(record, field) ?? '').trim() !== '');
    const clearBlocked = actualState.active && !actualState.stale;
    const clearSnapshotCurrent = campaignAutomationClearSnapshotMatches(clearSnapshot, record, fields);
    useEffect(() => {
        if (clearOpen && clearSnapshot && !clearSnapshotCurrent) {
            setClearAcknowledged(false);
            setClearProblem('The automation status changed while this confirmation was open. Close this dialog and review the newer result.');
        }
    }, [clearOpen, clearSnapshot, clearSnapshotCurrent]);
    const openClear = () => {
        setClearSnapshot({recordId: record.id, fingerprint: displayFingerprint});
        setClearAcknowledged(false);
        setClearProblem('');
        setClearOpen(true);
    };
    const closeClear = () => {
        if (clearing || clearInFlightRef.current) return;
        setClearOpen(false);
        setClearSnapshot(null);
        setClearAcknowledged(false);
        setClearProblem('');
    };
    const confirmClear = async () => {
        if (!clearAcknowledged || clearing || clearInFlightRef.current || clearBlocked || !clearSnapshot || !clearSnapshotCurrent) {
            if (clearSnapshot && !clearSnapshotCurrent) setClearProblem('The automation status changed while this confirmation was open. Nothing was cleared.');
            return;
        }
        clearInFlightRef.current = true;
        setClearing(true);
        try {
            await onRequestClear(clearSnapshot);
            setClearOpen(false);
            setClearSnapshot(null);
            setClearAcknowledged(false);
            setClearProblem('');
        } catch (error) {
            setClearProblem(error instanceof Error ? error.message : 'The automation display could not be cleared. Nothing was changed.');
        } finally {
            clearInFlightRef.current = false;
            setClearing(false);
        }
    };
    return <>
    <section aria-label="Automation status" className={`mt-4 rounded-xl border p-4 ${tone}`}>
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">Automation status</h3><div className="flex items-center gap-2"><span className="rounded-full border border-current px-3 py-1 text-xs font-bold">{state.label}</span>{hasSavedStatus && <button type="button" title={clearBlocked ? 'A current automation request cannot be cleared. Wait for completion or until it is stale.' : 'Clear saved automation display'} disabled={clearBlocked || clearing} className="rounded-md border border-current bg-white/70 px-2 py-1 text-[11px] font-bold hover:bg-white disabled:cursor-not-allowed disabled:opacity-40" onClick={openClear}>Clear</button>}</div></div>
        <p role="status" aria-live="polite" className="mt-2 whitespace-pre-wrap text-sm">{state.message}</p>
        {state.error && <p className="mt-2 whitespace-pre-wrap text-sm">{state.error}</p>}
        {state.stale && <p className="mt-3 text-sm font-semibold">Needs checking: this request is over an hour old. This is not proof of failure; check the execution before starting another run.</p>}
        <div className="mt-3 flex flex-wrap gap-4 text-xs">
            {dateLabel(state.startedAt) && <span>Requested: {dateLabel(state.startedAt)}</span>}
            {state.active && dateLabel(state.startedAt) && <span>Elapsed: {Math.max(0, Math.floor((now - Date.parse(state.startedAt)) / 60000))} min</span>}
            {!state.active && dateLabel(state.completedAt) && <span>Result saved: {dateLabel(state.completedAt)}</span>}
            {state.runId && <span>Run: {state.runId}</span>}
        </div>
        <p className="mt-2 text-xs opacity-75">Saved on this campaign and shared with your team. Updates when Airtable changes; not a live n8n health check.</p>
    </section>
    {clearOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-labelledby="clear-campaign-status-title"><div className="w-full max-w-lg rounded-2xl bg-white p-6 text-slate-900 shadow-2xl">
        <h3 id="clear-campaign-status-title" className="text-lg font-black">Clear saved automation status?</h3>
        <p className="mt-3 text-sm leading-6 text-slate-700">This hides only the current saved automation display. It does not erase the request or audit receipt, and it does not stop, cancel, rerun, or change an execution, campaign, lead, or sender. A newer status automatically appears.</p>
        {clearProblem && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800">{clearProblem}</p>}
        <label className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-950"><input type="checkbox" className="mt-0.5" checked={clearAcknowledged} onChange={event => setClearAcknowledged(event.currentTarget.checked)}/><span>I confirmed the execution is finished or this saved request is stale, and I only want to hide this exact saved display.</span></label>
        <div className="mt-5 flex justify-end gap-3"><button type="button" className="rounded-lg border border-slate-300 px-4 py-2 font-semibold hover:bg-slate-50" onClick={closeClear} disabled={clearing}>Cancel</button><button type="button" className="rounded-lg bg-red-600 px-4 py-2 font-bold text-white disabled:cursor-not-allowed disabled:opacity-40" onClick={confirmClear} disabled={!clearAcknowledged || clearing || clearBlocked || !clearSnapshotCurrent}>{clearing ? 'Clearing…' : 'Clear saved status'}</button></div>
    </div></div>}
    </>;
}

function isCampaignCopyField(field: AnyField): boolean {
    return /^Campaign (?:(?:Email )?\d+ (?:Subject|Body)|(?:Email )?(?:Subject|Body) \d+)(?: (?:Version|Spintax) \d+)?$/i.test(field.name);
}

// Recognize completed output pairs without losing their source when top-ups add lists.
// Keep originals for audit/recovery; the same set controls visibility and reservations.
function completedSplitParentIds(records: AnyRecord[], fields: any): Set<string> {
    const sameLinks = (a: AnyRecord, b: AnyRecord, field: AnyField | null) =>
        JSON.stringify([...linkedIds(a, field)].sort()) === JSON.stringify([...linkedIds(b, field)].sort());
    return new Set(records.filter(parent => {
        const name = textValue(parent, fields.name) || parent.name;
        if (/\s+-\s+(?:Generic|Direct) Emails\s*$/i.test(name) || textValue(parent, fields.bisonId)) return false;
        const sourceIds = linkedIds(parent, fields.leadList);
        if (!sourceIds.length || !linkedIds(parent, fields.client).length) return false;
        if (['active', 'live', 'running', 'paused', 'scheduled'].includes(optionName(parent, fields.status).trim().toLowerCase())) return false;
        const pairs = [CAMPAIGN_OUTPUT_SUFFIXES.generic, CAMPAIGN_OUTPUT_SUFFIXES.direct].map(suffix =>
            records.filter(child => child.id !== parent.id
                && (textValue(child, fields.name) || child.name).trim().toLowerCase() === (baseCampaignName(name) + suffix).toLowerCase()
                && sameLinks(parent, child, fields.client)
                && sameLinks(parent, child, fields.workspace)
                && /^\d+$/.test(textValue(child, fields.bisonId).trim())
                && Number(textValue(child, fields.bisonId)) > 0));
        // Unuploaded drafts cannot prove a split, and duplicate uploaded outputs are ambiguous.
        if (pairs.some(pair => pair.length !== 1)) return false;
        const children = pairs.map(pair => pair[0]);
        if (textValue(children[0], fields.bisonId) === textValue(children[1], fields.bisonId)) return false;
        if (children.some(child => !['active', 'live', 'paused', 'complete', 'completed', 'inactive', 'finished', 'ended'].includes(optionName(child, fields.status).trim().toLowerCase())
            && optionName(child, fields.automationStatus).trim().toLowerCase() !== 'completed')) return false;
        const childSources = children.map(child => linkedIds(child, fields.leadList));
        const hasSource = childSources.map(ids => sourceIds.every(id => ids.includes(id)));
        if (hasSource.every(Boolean)) return true;
        // Legacy output with a missing source link: require its sibling's source plus an
        // exact, disjoint sender partition. Never infer lineage from a name alone.
        if (hasSource.filter(Boolean).length !== 1 || childSources.some((ids, i) => !hasSource[i] && ids.length > 0)) return false;
        const parentSenders = linkedIds(parent, fields.emailAccounts);
        const childSenders = children.map(child => linkedIds(child, fields.emailAccounts));
        const combined = childSenders.flat();
        return parentSenders.length > 0 && childSenders.every(ids => ids.length > 0)
            && new Set(combined).size === combined.length
            && new Set(parentSenders).size === parentSenders.length
            && combined.length === parentSenders.length
            && combined.every(id => parentSenders.includes(id));
    }).map(parent => parent.id));
}

function resolveParentFirstPlan(input) {
  const CF = {name:'fldSsb4QjS9UyvKhj',client:'fldl5bZ644djPsBmN',lists:'fld5weZ6ED31dBlaz',topup:'fld4lMlTPjrRmAFHp',bison:'fldxSETE3D66RyWRH',workspace:'fldQjybcwloD9dZxS',status:'fldZABZwE9SmnwMv3',processing:'fldCebt3IMI8ZxdQq'};
  const LF = {client:'fldEujtSLqwdpOyGD',sheet:'fldSOTvnUxzKWXMDD',scope:'fldevysyehxsGxt2q',direct:'fldQZJCpTofahmTkl',generic:'fld0FHomkh3uyx0FD',processing:'fldf9wpMGWg0SebHV',stage:'fld8nrebRFL0O8kgj',campaign:'fldepbn71awSjmZPV'};
  const fail = message => {throw Error('Parent-first top-up blocked: '+message);};
  const f = r => r?.fields ?? r?.cellValuesByFieldId ?? {};
  const text = v => String(v && typeof v==='object' ? v.name ?? '' : v ?? '').trim();
  const ids = v => Array.isArray(v) ? v.map(x=>typeof x==='string'?x:x?.id).filter(Boolean) : [];
  const same = (a,b) => JSON.stringify([...a].sort())===JSON.stringify([...b].sort());
  const recordId = v => /^rec[A-Za-z0-9]+$/.test(v??'');
  const campaigns=input.campaigns, lists=input.lists;
  if(!Array.isArray(campaigns)||!Array.isArray(lists)||input.complete!==true||input.offset)fail('complete authoritative metadata is required');
  if(campaigns.length>1000||lists.length>1000||new Set(campaigns.map(r=>r.id)).size!==campaigns.length||new Set(lists.map(r=>r.id)).size!==lists.length)fail('duplicate or unbounded metadata');
  const cm=new Map<any, any>(campaigns.map(r=>[r.id,r])),lm=new Map<any, any>(lists.map(r=>[r.id,r]));
  const selected=cm.get(input.selectedRecordId);if(!selected)fail('selected campaign missing');
  const client=ids(f(selected)[CF.client]);if(client.length!==1||!recordId(client[0]))fail('exact client missing');
  function workspace(r){
    const expected=String(input.workspaceId??'').trim();
    const raw=f(r)[CF.workspace];
    const values=raw?.valuesByLinkedRecordId ? Object.values(raw.valuesByLinkedRecordId).flat() : Array.isArray(raw)?raw:[raw];
    const unique=[...new Set(values
      .map(v=>v&&typeof v==='object'?(v.name??v.value??''):v)
      .filter(v=>v!=null&&v!=='')
      .map(v=>String(v).trim()))];
    if(unique.length>1)fail('conflicting workspace');
    const resolved=unique[0]??expected;
    if(!/^\d+$/.test(resolved)||Number(resolved)<1)fail('exact workspace missing');
    if(expected&&resolved!==expected)fail('conflicting workspace');
    return resolved;
  }
  const workspaceId=workspace(selected),matching=campaigns.filter(r=>same(ids(f(r)[CF.client]),client));
  const suffix=/\s+-\s+(Generic|Direct) Emails\s*$/i;
  const base=n=>text(n).replace(suffix,'').trim().toLowerCase();
  const scopes=new Map<any, any>();
  function scope(r){
    if(scopes.has(r.id))return scopes.get(r.id);
    const raw=f(r)[LF.scope];if(!raw){scopes.set(r.id,null);return null;}
    let s;try{s=typeof raw==='string'?JSON.parse(raw):raw;}catch{fail('invalid scope on '+r.id);}
    if(!s||s.version!==1||s.mode!=='this-build-only'||![r.id,'pending'].includes(s.buildRecordId)||!Array.isArray(s.sources)||s.sources.length>100)fail('invalid scope identity on '+r.id);
    scopes.set(r.id,s);return s;
  }
  // Saved managed top-ups bind destinations by immutable record/provider IDs.
  // Names remain display labels and must not invalidate a proven family.
  const boundList=input.currentListId?lm.get(input.currentListId):null;
  const boundScope=boundList?scope(boundList):null;
  const savedFamily=boundScope?.parentFirstVersion===1;
  const candidates=[];
  if(savedFamily){
    const root=cm.get(boundScope.originalParentRecordId),original=lm.get(boundScope.originalLeadListRecordId);
    const ds=boundScope.destinations;
    if(!root||!original||Number(f(root)[CF.bison])||!Array.isArray(ds)||ds.length!==2)fail('saved parent/original/destinations missing');
    if(ds[0]?.outputType!=='generic'||ds[1]?.outputType!=='direct')fail('saved output types changed');
    const children=ds.map(d=>cm.get(d.recordId));
    if(children.some(r=>!r)||new Set([root.id,...children.map(r=>r.id)]).size!==3)fail('saved family record identities conflict');
    if(![root.id,...children.map(r=>r.id)].includes(selected.id))fail('selected campaign is outside saved family');
    if(!ids(f(root)[CF.lists]).includes(original.id)||scope(original))fail('saved original parent link changed');
    for(const r of [root,...children])if(!same(ids(f(r)[CF.client]),client)||workspace(r)!==workspaceId)fail('saved family client/workspace changed');
    children.forEach((r,i)=>{
      if(!ids(f(r)[CF.lists]).includes(original.id)||Number(f(r)[CF.bison])!==Number(ds[i].campaignId))fail('saved child source/provider identity changed');
    });
    candidates.push({root,original,children});
  }
  const unsplit=!savedFamily&&Number(f(selected)[CF.bison])>0&&!suffix.test(text(f(selected)[CF.name]));
  if(unsplit){
    const originals=ids(f(selected)[CF.lists]).filter(id=>{const r=lm.get(id);if(!r)fail('original metadata missing');return !scope(r);});
    if(originals.length!==1)fail('unsplit original source is ambiguous');
    candidates.push({root:selected,original:lm.get(originals[0]),children:[selected]});
  }
  for(const root of unsplit||savedFamily?[]:matching){
    if(Number(f(root)[CF.bison])||suffix.test(text(f(root)[CF.name]))||base(f(root)[CF.name])!==base(f(selected)[CF.name]))continue;
    if(workspace(root)!==workspaceId)continue;
    const originalIds=ids(f(root)[CF.lists]).filter(id=>{const r=lm.get(id);if(!r)fail('parent source metadata missing');return !scope(r);});
    if(originalIds.length!==1)fail('parent original full list is missing or ambiguous');
    const originalId=originalIds[0];
    const children=['generic','direct'].map(type=>matching.filter(r=>r.id!==root.id&&text(f(r)[CF.name]).toLowerCase()===base(f(root)[CF.name])+' - '+type+' emails'&&workspace(r)===workspaceId&&ids(f(r)[CF.lists]).includes(originalId)));
    if(children.some(rs=>rs.length!==1))continue;
    if(![root.id,...children.map(rs=>rs[0].id)].includes(selected.id))continue;
    candidates.push({root,original:lm.get(originalId),children:children.map(rs=>rs[0])});
  }
  if(candidates.length!==1)fail('cannot prove one canonical parent and both original-linked children');
  const {root,original,children}=candidates[0],familyIds=[...new Set([root.id,...children.map(r=>r.id)])];
  let unsplitType;
  if(unsplit){const current=lm.get(input.currentListId),g=Number(f(current)[LF.generic]??0),d=Number(f(current)[LF.direct]??0);if((g>0)===(d>0))fail('unsplit upload requires exactly one output stream');unsplitType=g>0?'generic':'direct';}
  const destinations=children.map((r,i)=>({recordId:r.id,campaignId:Number(f(r)[CF.bison]),outputType:unsplit?unsplitType:i===0?'generic':'direct'}));
  if(destinations.some(t=>!Number.isSafeInteger(t.campaignId)||t.campaignId<1)||new Set(destinations.map(t=>t.campaignId)).size!==children.length)fail('invalid child provider identities');
  for(const r of children){if(!['active','live','paused','complete','completed','inactive','finished','ended'].includes(text(f(r)[CF.status]).toLowerCase())&&text(f(r)[CF.processing]).toLowerCase()!=='completed')fail('child creation incomplete');}
  if(!same(ids(f(original)[LF.client]),client))fail('parent full-list client mismatch');
  function sheet(r){const id=text(f(r)[LF.sheet]).match(/\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/)?.[1];if(!id)fail('source sheet missing on '+r.id);return id;}
  const originalSheetId=sheet(original);
  const current=input.currentListId?lm.get(input.currentListId):null;
  if(input.currentListId&&!current)fail('current build missing');
  if(current&&![root,...children].some(r=>ids(f(r)[CF.topup]).includes(current.id)))fail('current top-up no longer linked to family');
  const belongs=s=>{
    const bindings=[...(Array.isArray(s.campaignRecordIds)?s.campaignRecordIds:[]),s.campaignRecordId].filter(Boolean);
    return s.originalParentRecordId===root.id||bindings.some(id=>familyIds.includes(id));
  };
  function validateScope(r,s){
    const bindings=[...(Array.isArray(s.campaignRecordIds)?s.campaignRecordIds:[]),s.campaignRecordId].filter(Boolean);
    if(!same(ids(f(r)[LF.client]),client)||!bindings.length||bindings.some(id=>!familyIds.includes(id)))fail('scope outside canonical family on '+r.id);
    if(s.parentFirstVersion!=null){
      if(s.parentFirstVersion!==1||s.originalParentRecordId!==root.id||s.originalLeadListRecordId!==original.id||s.clientRecordId!==client[0]||String(s.workspaceId)!==workspaceId||!same(s.campaignRecordIds??[],familyIds)||JSON.stringify(s.destinations)!==JSON.stringify(destinations))fail('parent-first scope binding changed on '+r.id);
    }
    if(!s.sources.some(e=>e.recordId===original.id&&e.sheetId===originalSheetId))fail('original full-list anchor absent from scope '+r.id);
  }
  const sources=new Map<any, any>(),visiting=new Set(),visited=new Set(),history=[],unfinished=[];
  function add(id,expected=null){
    if(id===current?.id)fail('self/cyclic source');
    const r=lm.get(id);if(!r||!recordId(id))fail('prior source missing');
    if(!same(ids(f(r)[LF.client]),client))fail('prior source client mismatch');
    const sid=sheet(r);if(current&&sid===sheet(current))fail('current output used as prior source');
    if(expected&&(sid!==expected.sheetId||!Array.isArray(expected.tabs)||expected.tabs.some(t=>!['Expanded Companies','Final Direct','Final Generic'].includes(t))))fail('prior source provenance changed');
    if(visiting.has(id))fail('cyclic prior history');
    sources.set(id,{recordId:id,sheetId:sid,tabs:['Expanded Companies','Final Direct','Final Generic']});
    if(visited.has(id))return;visiting.add(id);
    const s=scope(r);if(s){validateScope(r,s);for(const e of s.sources)add(e.recordId,e);}else if(id!==original.id)fail('unbound historical list');
    visiting.delete(id);visited.add(id);
  }
  add(original.id);
  // Scan the complete metadata result, not just the currently selected pointer.
  for(const r of lists){
    const raw=f(r)[LF.scope];if(!raw)continue;
    let s;try{s=typeof raw==='string'?JSON.parse(raw):raw;}catch{if(same(ids(f(r)[LF.client]),client))fail('unreadable same-client history');continue;}
    if(!belongs(s))continue;
    s=scope(r);validateScope(r,s);
    if(r.id===current?.id)continue;
    const count=Number(f(r)[LF.direct]??0)+Number(f(r)[LF.generic]??0);
    if(!Number.isFinite(count)||count<0)fail('invalid history counts');
    const stage=text(f(r)[LF.stage]).toLowerCase(),processing=text(f(r)[LF.processing]).toLowerCase();
    if(['requested','queued','running','processing','waiting'].includes(processing))fail('another family build has active or waiting work');
    const completedZero=processing==='completed'&&['enrichment','qa','ready','completed'].includes(stage);
    if(count>0||['ready','completed'].includes(stage)||completedZero){if(s.buildRecordId!==r.id)fail('completed history has unbound build identity');history.push(r.id);add(r.id);}
    else unfinished.push(r.id);
  }
  // Explicitly linked/retained sources cannot disappear even if counts are stale.
  for(const r of [root,...children])for(const id of [...ids(f(r)[CF.lists]),...ids(f(r)[CF.topup])]){
    if(id===current?.id||unfinished.includes(id))continue;add(id);
  }
  if(current){const s=scope(current);if(!s||s.buildRecordId!==current.id)fail('current scope missing or unbound');validateScope(current,s);for(const e of s.sources)add(e.recordId,e);}
  if(unfinished.length>1||(current&&unfinished.length))fail('multiple unfinished family builds');
  if(sources.size>100)fail('history exceeds bounded source manifest');
  const ordered=[...sources.values()].sort((a,b)=>a.recordId.localeCompare(b.recordId));
  const manifest={version:1,mode:'this-build-only',buildRecordId:current?.id??'pending',parentFirstVersion:1,campaignRecordId:root.id,campaignRecordIds:familyIds,originalParentRecordId:root.id,originalLeadListRecordId:original.id,clientRecordId:client[0],workspaceId,destinations,sources:ordered};
  return {rootRecordId:root.id,originalListId:original.id,originalSheetId,clientRecordId:client[0],workspaceId,familyRecordIds:familyIds,destinations,sources:ordered,historyRecordIds:history.sort(),unfinishedRecordId:unfinished[0]??null,manifest};
}

const parentFirstInFlight = new Set<string>();
const parentFirstCampaignKeys = ['fldSsb4QjS9UyvKhj','fldl5bZ644djPsBmN','fld5weZ6ED31dBlaz','fld4lMlTPjrRmAFHp','fldxSETE3D66RyWRH','fldQjybcwloD9dZxS','fldZABZwE9SmnwMv3','fldCebt3IMI8ZxdQq'];
const ManagedTopUp = (() => {


const F={scope:'fldevysyehxsGxt2q',client:'fldEujtSLqwdpOyGD',stage:'fld8nrebRFL0O8kgj',qa:'fldUB4WsLi5kq6rUy',processing:'fldf9wpMGWg0SebHV',sheet:'fldSOTvnUxzKWXMDD',direct:'fldQZJCpTofahmTkl',generic:'fld0FHomkh3uyx0FD',run:'fld4kyzDwnHq5V4Iy',completed:'fldMSv3547BOvfdmH',file:'fldjn5vqHSVYiAR6z',name:'fldbg5PAnKyFHc3uy'};
const fields=r=>r?.fields??r?.cellValuesByFieldId??{};
const text=v=>String(v&&typeof v==='object'?v.name??'':v??'').trim();
const ids=v=>Array.isArray(v)?v.map(x=>typeof x==='string'?x:x?.id).filter(Boolean):[];
function canonical(v){if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';if(v&&typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';return JSON.stringify(v??null);}
function readScope(record){const v=fields(record)[F.scope];if(!v)return null;try{return typeof v==='string'?JSON.parse(v):v;}catch{throw Error('Unreadable saved top-up scope.');}}
function candidatePlan(input){
 const current=input.lists.find(r=>r.id===input.currentListId);if(!current)throw Error('Completed top-up is not loaded.');const f=fields(current),scope=readScope(current);
 if(!scope||scope.parentFirstVersion!==1||scope.version!==1||scope.mode!=='this-build-only'||scope.buildRecordId!==current.id)throw Error('A saved managed top-up scope is required.');
 if(!scope.campaignRecordIds?.includes(input.selectedRecordId)||!Array.isArray(scope.destinations)||scope.destinations.length!==2)throw Error('This top-up belongs to another campaign family.');
 if(text(f[F.stage])!=='Ready'||text(f[F.qa])!=='Passed'||text(f[F.processing])!=='Completed')throw Error('Complete this top-up with Ready, QA Passed and Completed processing first.');
 const counts={generic:Number(f[F.generic]??0),direct:Number(f[F.direct]??0)};
 if(Object.values(counts).some(n=>!Number.isSafeInteger(n)||n<0)||counts.generic+counts.direct<1)throw Error('Final top-up counts are missing or invalid.');
 if(!/^\d+$/.test(text(f[F.run]))||!text(f[F.completed]))throw Error('The final QA source revision is missing.');
 const sheetId=text(f[F.sheet]).match(/\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/)?.[1];if(!sheetId)throw Error('Final top-up sheet is missing.');
 // Only the candidate check simulates adoption. Never weaken the production upload resolver.
 const campaigns=input.campaigns.map(r=>{const cf={...fields(r)};if(scope.campaignRecordIds.includes(r.id))cf.fld4lMlTPjrRmAFHp=[{id:current.id}];return {...r,fields:cf};});
 const plan=resolveParentFirstPlan({...input,campaigns,complete:true});
 if(plan.rootRecordId!==scope.originalParentRecordId||plan.originalListId!==scope.originalLeadListRecordId||plan.workspaceId!==String(scope.workspaceId))throw Error('Saved top-up identity changed.');
 const revision={version:1,listId:current.id,sheetId,runId:text(f[F.run]),completedAt:text(f[F.completed]),qa:'Passed',stage:'Ready',counts,scope,finalFiles:(f[F.file]??[]).map(x=>({id:x.id,size:x.size??null})).sort((a,b)=>a.id.localeCompare(b.id))};
 return {plan,revision,revisionText:canonical(revision),sheetId,counts,name:text(f[F.name])};
}
function finalRows(values,label,expected){
 if(!Array.isArray(values)||!values.length||!Array.isArray(values[0]))throw Error('Missing '+label+' final data.');
 const headers=values[0].map(x=>String(x??'').trim());const normalized=headers.map(x=>x.toLowerCase().replace(/[^a-z0-9]/g,''));const indices=normalized.flatMap((v,i)=>['email','emails','emailaddress'].includes(v)?[i]:[]);if(indices.length!==1)throw Error('A unique email column is required in '+label+'.');
 const rows=values.slice(1).filter(r=>Array.isArray(r)&&r.some(v=>String(v??'').trim())).map(r=>headers.map((_,i)=>String(r[i]??'')));
 if(rows.length!==expected)throw Error(label+' final row count differs from saved QA counts.');
 const seen=new Set();for(const row of rows){const email=row[indices[0]].trim().toLowerCase();if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)||seen.has(email))throw Error('Invalid or duplicate final email in '+label+'.');seen.add(email);}
 return {headers,rows,emails:[...seen]};
}
function sourceContent(generic,direct,counts){const g=finalRows(generic,'Final Generic',counts.generic),d=finalRows(direct,'Final Direct',counts.direct);if(g.emails.some(e=>d.emails.includes(e)))throw Error('Duplicate email across final streams.');return canonical({version:1,generic:{headers:g.headers,rows:g.rows},direct:{headers:d.headers,rows:d.rows}});}
function inspectImports(all,current,revision){
 if(!Array.isArray(all)||all.some(x=>!Number.isSafeInteger(Number(x.id))))throw Error('Incomplete provider import history.');
 const prefix=current.name+' - ',stable='topup:'+revision.listId+':';
 const matching=all.filter(x=>String(x.name??'').startsWith(prefix)||String(x.name??'').includes(stable));
 if(matching.length)throw Error('A completed, pending or failed import already exists for this source. Reconcile it; do not upload again.');
 const created=Date.parse(current.createdAt);if(!Number.isFinite(created))throw Error('Complete import history needs the source creation timestamp.');
 const recent=[];for(const item of all){const at=Date.parse(item.created_at??item.createdAt??'');if(!Number.isFinite(at))throw Error('Complete import history contains an uncertain import timestamp.');if(at>=created)recent.push(Number(item.id));}
 return {complete:true,total:all.length,matchingImports:0,sourceListId:revision.listId,sourceName:current.name,createdAtValidated:true,recentImportIds:recent};
}

return {F,canonical,candidatePlan};
})();

const parentFirstListKeys = ['fldEujtSLqwdpOyGD','fldSOTvnUxzKWXMDD','fldevysyehxsGxt2q','fldQZJCpTofahmTkl','fld0FHomkh3uyx0FD','fldf9wpMGWg0SebHV','fld8nrebRFL0O8kgj','fldepbn71awSjmZPV'];
const parentFirstTemplateNames = ['Name of the Lead List','Name','File Name','Client','Source Type','Third-Party Source Method','ICP Description','List Thesis','DiscoLike Company Filters JSON','Included Industries','Included Countries','Excluded Industries','Included States','Employee Range','Homepage Keywords','State Filters','Industry Filters','Excluded Industry Filters','Country Filters','Include Generic Emails','Include Direct Contacts','Target Personas','Contact Persona DNA','Contact Source','Contact Filters JSON','Generic Verification Provider','Direct Verification Provider','Verification Provider','Catch-All Policy','Role Email Policy','Free Email Policy','SEG Rule','Custom Variables Requested','Column Mapping JSON','Workflow Template','Use DiscoGen Deep Review','DiscoGen Deep Review Prompt','DiscoGen Deep Review Additional Requirements','Expansion Target'];
const parentFirstSnapshot = (record:AnyRecord, keys:string[]) => ({id:record.id,fields:Object.fromEntries(keys.map(key=>[key,record.getCellValue(key)]))});
function readParentFirstContext(campaignRecords:AnyRecord[], listRecords:AnyRecord[], selectedRecordId:string, currentListId?:string, workspaceId?:string) {
 const campaignRows=campaignRecords.map((r:AnyRecord)=>parentFirstSnapshot(r,parentFirstCampaignKeys));
 const listRows=listRecords.map((r:AnyRecord)=>parentFirstSnapshot(r,parentFirstListKeys));
 const plan=resolveParentFirstPlan({campaigns:campaignRows,lists:listRows,selectedRecordId,currentListId,workspaceId,complete:true});
 return {plan,campaignRows,listRows,listRecords};
}
async function linkParentFirstIntent(campaignsTable:AnyTable,campaignRecords:AnyRecord[],listRecords:AnyRecord[],plan:any,id:string,workspaceId?:string) {
 const fresh=readParentFirstContext(campaignRecords,listRecords,plan.rootRecordId,undefined,workspaceId);
 if(fresh.plan.unfinishedRecordId!==id||fresh.plan.rootRecordId!==plan.rootRecordId||fresh.plan.originalListId!==plan.originalListId||JSON.stringify(fresh.plan.destinations)!==JSON.stringify(plan.destinations))throw Error('Top-up intent changed; no provider work requested.');
 const updates=plan.familyRecordIds.map((rid:string)=>({id:rid,fields:{fld4lMlTPjrRmAFHp:[{id}]}}));
 for(const update of updates)if(!campaignsTable.hasPermissionToUpdateRecord(update.id,update.fields))throw Error('Cannot link the same top-up intent to the complete family.');
 await campaignsTable.updateRecordsAsync(updates);
 const readbackRecords=campaignRecords.map((record:AnyRecord)=>campaignsTable.getRecordByIdIfExists?.(record.id)??record);
 const readback=readParentFirstContext(readbackRecords,listRecords,plan.rootRecordId,undefined,workspaceId);
 const ids=(v:any)=>(v??[]).map((x:any)=>typeof x==='string'?x:x.id);
 if(readback.plan.unfinishedRecordId!==id||plan.familyRecordIds.some((rid:string)=>JSON.stringify(ids(readback.campaignRows.find((r:any)=>r.id===rid)?.fields.fld4lMlTPjrRmAFHp))!==JSON.stringify([id])))throw Error('Incomplete family linkage; keep the existing build and repair links, do not create or run another.');
}

function proportionalSenderCounts(totalSenders: number, genericLeads: number, directLeads: number) {
    const activeOutputs = Number(genericLeads > 0) + Number(directLeads > 0);
    if (!activeOutputs) throw new Error('The linked lead list has no Final Generic or Final Direct leads.');
    if (totalSenders < activeOutputs) throw new Error(`Select at least ${activeOutputs} sender accounts so every non-empty campaign output receives one.`);
    if (activeOutputs === 1) return {generic: genericLeads > 0 ? totalSenders : 0, direct: directLeads > 0 ? totalSenders : 0};
    const totalLeads = genericLeads + directLeads;
    // Calculate the Direct share, then deliberately give every remaining
    // selected sender to Generic. The two outputs are therefore an exact
    // partition and no selected sender can disappear during the split.
    const direct = Math.max(1, Math.min(totalSenders - 1, Math.round(totalSenders * directLeads / totalLeads)));
    return {generic: totalSenders - direct, direct};
}

function findField(table: AnyTable | undefined, aliases: readonly string[]): AnyField | null {
    if (!table || typeof table.getFieldIfExists !== 'function') return null;
    for (const name of aliases) {
        const field = table.getFieldIfExists(name);
        if (field) return field;
    }
    return null;
}

function findCampaignField(
    table: AnyTable | undefined,
    fieldId: string,
    aliases: readonly string[],
): AnyField | null {
    if (!table) return null;
    const exact = table.fields?.find((field: AnyField | null | undefined) => field?.id === fieldId);
    return exact ?? findField(table, aliases);
}

function findLeadListField(
    table: AnyTable | undefined,
    fieldId: string,
    aliases: readonly string[],
): AnyField | null {
    if (!table) return null;
    const exact = table.fields?.find((field: AnyField | null | undefined) => field?.id === fieldId);
    return exact ?? findField(table, aliases);
}

function getCustomProperties(base: ReturnType<typeof useBase>) {
    const availableTables = (base.tables ?? []).filter((table): table is AnyTable => Boolean(table));
    const campaignPropertyTable = availableTables.find(table => table?.name === 'Campaigns');
    const emailsSentPropertyField = campaignPropertyTable?.getFieldIfExists('Emails Sent');
    const repliesDataPropertyField = campaignPropertyTable?.getFieldIfExists('Unique Replies Data');
    const bouncesDataPropertyField = campaignPropertyTable?.getFieldIfExists('Bounced Data');
    const interestedDataPropertyField = campaignPropertyTable?.getFieldIfExists('Interested Data');
    const meetingsDataPropertyField = campaignPropertyTable?.getFieldIfExists('Meetings Booked Data');
    return [
        {key: 'campaignsTable', label: 'Campaigns', type: 'table' as const, defaultValue: campaignPropertyTable},
        {key: 'sequenceAnalyticsTable', label: 'Sequence analytics', type: 'table' as const, defaultValue: availableTables.find(table => table?.name === 'Sequence Analytics')},
        {key: 'emailAnalyticsTable', label: 'Email analytics', type: 'table' as const, defaultValue: availableTables.find(table => table?.name === 'Email Analytics')},
        {key: 'emailOverviewTable', label: 'Email overview', type: 'table' as const, defaultValue: availableTables.find(table => table?.name === 'Email Analytics Overview')},
        {key: 'leadListsTable', label: 'Lead lists', type: 'table' as const, defaultValue: availableTables.find(table => table?.name === 'Lead Lists')},
        {key: 'clientsTable', label: 'Clients', type: 'table' as const, defaultValue: availableTables.find(table => table?.name === 'Workspace IDs')},
        {key: 'emailAccountsTable', label: 'Email accounts', type: 'table' as const, defaultValue: availableTables.find(table => table?.name?.trim().toLowerCase() === 'email accounts')},
        ...(campaignPropertyTable && emailsSentPropertyField ? [{key: 'emailsSentField', label: 'Emails sent field', type: 'field' as const, table: campaignPropertyTable, defaultValue: emailsSentPropertyField}] : []),
        ...(campaignPropertyTable && repliesDataPropertyField ? [{key: 'repliesDataField', label: 'Replies data field', type: 'field' as const, table: campaignPropertyTable, defaultValue: repliesDataPropertyField}] : []),
        ...(campaignPropertyTable && bouncesDataPropertyField ? [{key: 'bouncesDataField', label: 'Bounces data field', type: 'field' as const, table: campaignPropertyTable, defaultValue: bouncesDataPropertyField}] : []),
        ...(campaignPropertyTable && interestedDataPropertyField ? [{key: 'interestedDataField', label: 'Interested data field', type: 'field' as const, table: campaignPropertyTable, defaultValue: interestedDataPropertyField}] : []),
        ...(campaignPropertyTable && meetingsDataPropertyField ? [{key: 'meetingsDataField', label: 'Meetings data field', type: 'field' as const, table: campaignPropertyTable, defaultValue: meetingsDataPropertyField}] : []),
    ];
}

function cellValue(record: AnyRecord, field: AnyField | null): any {
    if (!field) return null;
    // Interface extensions can return a Field model whose object identity is
    // different from the one used by the record query. Reading by stable field
    // ID first avoids valid cells appearing empty in that situation.
    for (const cellLookupKey of [field.id, field.name, field]) {
        try {
            const resolvedCellValue = record.getCellValue(cellLookupKey);
            if (resolvedCellValue !== null && resolvedCellValue !== undefined) return resolvedCellValue;
        } catch {
            // Try the next supported field reference shape.
        }
    }
    return null;
}

function textValue(record: AnyRecord, field: AnyField | null): string {
    if (!field) return '';
    for (const textLookupKey of [field.id, field.name, field]) {
        try {
            const renderedTextCell = record.getCellValueAsString(textLookupKey)?.trim();
            if (renderedTextCell) return renderedTextCell;
        } catch {
            // Try the next supported field reference shape.
        }
    }
    const textCellValue = cellValue(record, field);
    return textCellValue === null ? '' : String(textCellValue).trim();
}

function firstPopulatedTextValue(record: AnyRecord, table: AnyTable | undefined, aliases: readonly string[]): string {
    if (!table) return '';
    for (const alias of aliases) {
        const field = table.getFieldIfExists(alias);
        const value = textValue(record, field);
        if (value) return value;
    }
    return '';
}

function clientFacingName(record: AnyRecord | null, clientsTable: AnyTable | undefined): string {
    if (!record) return '';
    return firstPopulatedTextValue(record, clientsTable, ['Display Name', 'Brand Name'])
        || String(record.name ?? '').trim();
}

function optionName(record: AnyRecord, field: AnyField | null): string {
    if (!field) return '';
    const optionCellValue = cellValue(record, field);
    if (!optionCellValue) return '';
    if (typeof optionCellValue === 'object' && !Array.isArray(optionCellValue) && 'name' in optionCellValue) return optionCellValue.name ?? '';
    return textValue(record, field);
}

function linkedIds(record: AnyRecord, field: AnyField | null): string[] {
    if (!field) return [];
    const linkedCellValue = cellValue(record, field);
    return Array.isArray(linkedCellValue) ? linkedCellValue.map(item => item?.id).filter(Boolean) : [];
}

function comparableValues(record: AnyRecord, field: AnyField | null): string[] {
    if (!field) return [];
    const comparableCellValue = cellValue(record, field);
    if (Array.isArray(comparableCellValue)) {
        return comparableCellValue.map(value => {
            if (value === null || value === undefined) return '';
            if (typeof value === 'object') return String(value.name ?? value.id ?? '');
            // Lookup and rollup fields often return arrays of primitive values,
            // for example ["Dulcy"]. Preserve those values for filtering.
            return String(value);
        }).map(value => value.trim()).filter(Boolean);
    }
    if (comparableCellValue && typeof comparableCellValue === 'object') return [String(comparableCellValue.name ?? comparableCellValue.id ?? '')].filter(Boolean);
    const comparableRenderedText = textValue(record, field);
    return comparableRenderedText ? [comparableRenderedText] : [];
}

function leadListMatchesClient(record: AnyRecord, clientField: AnyField, clientIds: string[], clientNames: string[]): boolean {
    const recordClientIds = linkedIds(record, clientField);
    // Linked Client IDs are authoritative; different IDs must never match by name.
    if (clientIds.length && recordClientIds.length) return recordClientIds.some(id => clientIds.includes(id));
    // Support legacy text/lookup fields with exact names only. Unassigned lists stay excluded.
    const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');
    const targetNames = clientNames.map(normalize).filter(Boolean);
    return [...comparableValues(record, clientField), textValue(record, clientField)]
        .map(normalize).filter(Boolean).some(name => targetNames.includes(name));
}

function stripBracketedClientPrefix(value: string): string {
    return String(value ?? '').trim().replace(/^\[[^\]]+\]\s*/, '').trim();
}

function stripBracketedClientPrefixForInput(value: string): string {
    return String(value ?? '').replace(/^\s*\[[^\]]+\]\s*/, '');
}

function clientPrefixedName(clientName: string, value: string): string {
    const cleanClientName = String(clientName ?? '').trim().replace(/^\[|\]$/g, '').trim();
    const cleanTitle = stripBracketedClientPrefix(value);
    if (!cleanClientName) return cleanTitle;
    return cleanTitle ? `[${cleanClientName}] ${cleanTitle}` : `[${cleanClientName}]`;
}

function selectOptions(field: AnyField | null, records: AnyRecord[]): string[] {
    if (!field) return [];
    const configured = field.type === FieldType.SINGLE_SELECT || field.type === FieldType.MULTIPLE_SELECTS
        ? (field.config?.options?.choices ?? field.options?.choices ?? []).map((c: any) => c.name)
        : [];
    const observed = records.flatMap(record => comparableValues(record, field));
    return [...new Set([...configured, ...observed])].filter(Boolean).sort((a, b) => a.localeCompare(b, undefined, {numeric: true, sensitivity: 'base'}));
}

function dateFor(record: AnyRecord, field: AnyField | null): Date | null {
    const dateCellValue = field ? cellValue(record, field) : record.createdTime;
    if (!dateCellValue) return null;
    const parsedCampaignDate = new Date(typeof dateCellValue === 'string' ? dateCellValue : String(dateCellValue));
    return Number.isNaN(parsedCampaignDate.getTime()) ? null : parsedCampaignDate;
}

function numericValue(record: AnyRecord, field: AnyField | null): number | null {
    if (!field) return null;
    const numericCellValue = cellValue(record, field);
    const numericCandidateValue = Array.isArray(numericCellValue) ? numericCellValue[0] : numericCellValue;
    if (numericCandidateValue === null || numericCandidateValue === undefined || numericCandidateValue === '') return null;
    if (typeof numericCandidateValue === 'number' && Number.isFinite(numericCandidateValue)) return numericCandidateValue;
    const parsedNumericValue = Number(String(numericCandidateValue ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsedNumericValue) ? parsedNumericValue : null;
}

function dateInputValue(record: AnyRecord, field: AnyField | null): string {
    const dateRawCell = cellValue(record, field);
    if (!dateRawCell) return '';
    const dateInputParsed = new Date(String(dateRawCell));
    return Number.isNaN(dateInputParsed.getTime()) ? '' : dateInputParsed.toISOString().slice(0, 10);
}

function randomizedTimeWithinHour(hour: number): string {
    const minute = Math.floor(Math.random() * 60);
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function formatCount(record: AnyRecord, field: AnyField | null): string {
    const countCellValue = numericValue(record, field);
    return countCellValue === null ? '—' : new Intl.NumberFormat().format(countCellValue);
}

function formatMetric(
    record: AnyRecord,
    countField: AnyField | null,
    rateField: AnyField | null,
    denominatorField: AnyField | null,
): string {
    const count = numericValue(record, countField);
    let rate = numericValue(record, rateField);
    // Airtable percent fields return fractions; the Campaigns formula fields
    // already return percentage points (for example, 3.05 means 3.05%).
    if (rate !== null && rateField?.type === FieldType.PERCENT) rate *= 100;
    if (rate === null && count !== null) {
        const denominator = numericValue(record, denominatorField);
        if (denominator && denominator > 0) rate = count / denominator * 100;
    }
    const countText = count === null ? '—' : new Intl.NumberFormat().format(count);
    const rateText = rate === null ? '—' : `${rate.toFixed(1)}%`;
    return `${countText} · ${rateText}`;
}

type KpiKind = 'reply' | 'interested' | 'bounce' | 'meeting';

function percentValue(record: AnyRecord, field: AnyField | null): number | null {
    const rawPercentValue = numericValue(record, field);
    if (rawPercentValue === null) return null;
    return field?.type === FieldType.PERCENT ? rawPercentValue * 100 : rawPercentValue;
}

function kpiPresentation(rateValue: number | null, kind: KpiKind) {
    if (rateValue === null) return {label: 'No data', score: null, chip: 'border-gray-200 bg-gray-100 text-gray-500', bar: 'bg-gray-300'};
    let kpiScore = 0;
    if (kind === 'reply') kpiScore = rateValue < 1 ? 0 : rateValue < 2 ? 1 : rateValue < 3 ? 2 : rateValue < 5 ? 3 : 4;
    if (kind === 'interested') kpiScore = rateValue < 5 ? 0 : rateValue < 10 ? 1 : rateValue < 15 ? 2 : rateValue < 20 ? 3 : 4;
    if (kind === 'bounce') kpiScore = rateValue < 1 ? 4 : rateValue < 2 ? 3 : rateValue < 3 ? 2 : rateValue < 4 ? 1 : 0;
    if (kind === 'meeting') kpiScore = rateValue < 10 ? 0 : rateValue < 20 ? 1 : rateValue < 30 ? 2 : rateValue < 40 ? 3 : 4;
    const labels = ['Bad', 'Not ideal', 'Average', 'Ideal', 'Good'];
    const chips = ['border-red-200 bg-red-50 text-red-700', 'border-orange-200 bg-orange-50 text-orange-700', 'border-amber-200 bg-amber-50 text-amber-700', 'border-blue-200 bg-blue-50 text-blue-700', 'border-emerald-200 bg-emerald-50 text-emerald-700'];
    const bars = ['bg-red-500', 'bg-orange-500', 'bg-amber-500', 'bg-blue-500', 'bg-emerald-500'];
    return {label: labels[kpiScore], score: kpiScore, chip: chips[kpiScore], bar: bars[kpiScore]};
}

function overallKpiPresentation(replyKpi: any, interestedKpi: any, bounceKpi: any, meetingKpi: any, replyRate: number | null, positiveReplyEfficiency: number | null) {
    const highReplyContext = replyRate !== null && replyRate >= 5 && positiveReplyEfficiency !== null && positiveReplyEfficiency <= 250;
    const overallScores = [replyKpi.score, bounceKpi.score, meetingKpi.score];
    if (!highReplyContext) overallScores.push(interestedKpi.score);
    const validOverallScores = overallScores.filter(score => score !== null) as number[];
    const overallWeakestScore = validOverallScores.length ? Math.min(...validOverallScores) : null;
    if (overallWeakestScore === null) return {label: 'No data', chip: 'border-gray-200 bg-gray-100 text-gray-500'};
    if (overallWeakestScore <= 1) return {label: 'Needs attention', chip: 'border-red-200 bg-red-50 text-red-700'};
    if (overallWeakestScore === 2) return {label: highReplyContext ? 'Healthy top funnel' : 'Average', chip: 'border-amber-200 bg-amber-50 text-amber-700'};
    return {label: highReplyContext ? 'Strong top funnel' : 'On target', chip: 'border-emerald-200 bg-emerald-50 text-emerald-700'};
}

function campaignStatusPresentation(statusValue: string) {
    const normalizedStatus = statusValue.trim().toLowerCase();
    if (normalizedStatus === 'active') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    if (normalizedStatus === 'completed') return 'border-blue-200 bg-blue-50 text-blue-700';
    if (normalizedStatus === 'paused') return 'border-amber-200 bg-amber-50 text-amber-700';
    if (normalizedStatus === 'uploaded') return 'border-purple-200 bg-purple-50 text-purple-700';
    if (normalizedStatus === 'draft' || normalizedStatus === 'spintax generated') return 'border-violet-200 bg-violet-50 text-violet-700';
    if (normalizedStatus === 'inactive' || normalizedStatus === 'stopped') return 'border-gray-200 bg-gray-100 text-gray-600';
    return 'border-slate-200 bg-slate-50 text-slate-700';
}

function volumeAwareKpiPresentation(kpi: {label: string; chip: string}, emailsSent: number | null) {
    if (emailsSent === null || emailsSent <= 0) return {label: 'No data', chip: 'border-gray-200 bg-gray-100 text-gray-500'};
    if (emailsSent < 1000) return {label: 'Learning', chip: 'border-blue-200 bg-blue-50 text-blue-700'};
    if (emailsSent < 2000) return {label: 'Early read', chip: 'border-indigo-200 bg-indigo-50 text-indigo-700'};
    return kpi;
}

function kpiHealthReason(emailsSent: number | null, replyRate: number | null, interestedRate: number | null, bounceRate: number | null, meetingRate: number | null, replyKpi: any, interestedKpi: any, bounceKpi: any, meetingKpi: any, positiveReplyEfficiency: number | null) {
    if (emailsSent === null || emailsSent <= 0) return 'No campaign-level email volume is available yet, so KPI Health cannot be evaluated.';
    if (emailsSent < 1000) return `${new Intl.NumberFormat().format(emailsSent)} emails have been sent. The campaign remains in Learning until 1,000 emails, so early rate movement will not trigger a negative health rating.`;
    if (emailsSent < 2000) return `${new Intl.NumberFormat().format(emailsSent)} emails have been sent. This is an Early read; full KPI Health evaluation begins at the 2,000-email ideal sample size.`;
    const highReplyContext = replyRate !== null && replyRate >= 5 && positiveReplyEfficiency !== null && positiveReplyEfficiency <= 250;
    const evaluatedMetrics = [
        {name: 'reply rate', rate: replyRate, kpi: replyKpi},
        {name: 'bounce rate', rate: bounceRate, kpi: bounceKpi},
        {name: 'meeting booked rate', rate: meetingRate, kpi: meetingKpi},
        ...(!highReplyContext ? [{name: 'interested reply rate', rate: interestedRate, kpi: interestedKpi}] : []),
    ].filter(metric => metric.rate !== null && metric.kpi.score !== null)
        .sort((firstMetric, secondMetric) => firstMetric.kpi.score - secondMetric.kpi.score);
    if (!evaluatedMetrics.length) return 'The campaign has enough volume, but none of the required KPI rate fields currently contain usable data.';
    const weakestMetric = evaluatedMetrics[0];
    return `The weakest evaluated metric is ${weakestMetric.name} at ${(weakestMetric.rate as number).toFixed(2)}%, rated ${weakestMetric.kpi.label}. KPI Health uses the weakest evaluated campaign metric so a deliverability or conversion problem is not hidden by stronger results elsewhere.`;
}

function emailsPerPositiveReply(record: AnyRecord, emailsField: AnyField | null, interestedField: AnyField | null): number | null {
    const positiveRatioSentCount = numericValue(record, emailsField);
    const positiveReplyCount = numericValue(record, interestedField);
    return positiveRatioSentCount !== null && positiveReplyCount !== null && positiveReplyCount > 0 ? positiveRatioSentCount / positiveReplyCount : null;
}

function emailsPerMeeting(record: AnyRecord, emailsField: AnyField | null, meetingsField: AnyField | null): number | null {
    const emailsPerMeetingSentCount = numericValue(record, emailsField);
    const meetingCount = numericValue(record, meetingsField);
    return emailsPerMeetingSentCount !== null && meetingCount !== null && meetingCount > 0 ? emailsPerMeetingSentCount / meetingCount : null;
}

function progressPercent(record: AnyRecord, progressField: AnyField | null): number | null {
    const progressRawValue = numericValue(record, progressField);
    if (progressRawValue === null) return null;
    return progressField?.type === FieldType.PERCENT ? progressRawValue * 100 : progressRawValue;
}

function campaignStageLabel(record: AnyRecord, campaignFields: any): string {
    const campaignStatus = optionName(record, campaignFields.status).trim().toLowerCase();
    // Status is already rendered separately. Once a campaign is live or done,
    // suppress stale build-stage chips instead of showing two status labels.
    if (['active', 'live', 'running', 'completed', 'complete', 'done', 'finished'].includes(campaignStatus)) return '';
    return optionName(record, campaignFields.workflowStage);
}

function clientPivotEnabled(record: AnyRecord | null, field: AnyField | null): boolean {
    if (!record || !field) return true;
    return optionName(record, field).trim().toLowerCase() !== 'disabled';
}

function nextMovePresentation(record: AnyRecord, campaignFields: any, agencyPositiveReplyRate: number | null, pivotOptions = {newVertical: true, newOffer: true}) {
    const campaignStatus = optionName(record, campaignFields.status).toLowerCase();
    const workflowStage = optionName(record, campaignFields.workflowStage).toLowerCase();
    const campaignIsLive = ['active', 'live', 'running'].includes(campaignStatus);
    const clientDecision = textValue(record, campaignFields.clientFeedback).toLowerCase();
    const approvalSource = textValue(record, campaignFields.campaignApprovalSource).toLowerCase();
    const approvalResolved = ['client approved', 'internal approval exception'].includes(approvalSource);
    const requestedChangeArea = textValue(record, campaignFields.selectChanges);
    const campaignThesis = textValue(record, campaignFields.thesis);
    const emailBisonCampaignId = textValue(record, campaignFields.bisonId);
    if (!campaignIsLive && (campaignStatus === 'draft' || workflowStage === 'strategy draft') && !campaignThesis) return {label: 'Finish thesis', detail: 'Complete the campaign thesis, targeting, offer, and approach before writing copy.', chip: 'border-purple-200 bg-purple-50 text-purple-700', ready: true};
    if (!campaignIsLive && campaignStatus === 'draft' && workflowStage === 'strategy draft') return {label: 'Finish campaign setup', detail: 'The thesis is started. Complete targeting and copy, then send it for approval.', chip: 'border-purple-200 bg-purple-50 text-purple-700', ready: true};
    if (!campaignIsLive && workflowStage === 'client review') return {label: 'Await client approval', detail: 'The campaign is with the client. Apply requested changes or approve the final copy.', chip: 'border-amber-200 bg-amber-50 text-amber-700', ready: false};
    if (!campaignIsLive && !approvalResolved && clientDecision.includes('request change')) return {label: 'Apply client changes', detail: requestedChangeArea ? `Client requested revisions to: ${requestedChangeArea}.` : 'Review the client feedback, apply the requested revisions, and resubmit the campaign.', chip: 'border-orange-300 bg-orange-50 text-orange-700', ready: true};
    if (!campaignIsLive && workflowStage === 'changes requested') return {label: 'Revise campaign', detail: 'Apply the client’s requested targeting or copy changes, then resubmit it.', chip: 'border-orange-200 bg-orange-50 text-orange-700', ready: true};
    if (!campaignIsLive && workflowStage === 'approved' && campaignStatus !== 'spintax generated') return {label: 'Prepare final sequence', detail: 'Copy the approved review fields into the sequence and generate validated spintax.', chip: 'border-indigo-200 bg-indigo-50 text-indigo-700', ready: true};
    if (!campaignIsLive && workflowStage === 'spintax in progress') return {label: 'Finish spintax QA', detail: 'Wait for validation and EmailGuard checks, then review the final sequence.', chip: 'border-indigo-200 bg-indigo-50 text-indigo-700', ready: false};
    if (!campaignIsLive && (workflowStage === 'build ready' || campaignStatus === 'spintax generated') && !emailBisonCampaignId) return {label: 'Upload to EmailBison', detail: 'The final sequence and settings are ready to create as an EmailBison draft.', chip: 'border-blue-200 bg-blue-50 text-blue-700', ready: true};
    if (emailBisonCampaignId && campaignStatus !== 'active' && campaignStatus !== 'completed') return {label: 'Launch campaign', detail: 'The EmailBison campaign exists and is ready to launch or resume.', chip: 'border-emerald-200 bg-emerald-50 text-emerald-700', ready: true};
    const campaignProgress = progressPercent(record, campaignFields.progress);
    const recommendationEmailsSent = numericValue(record, campaignFields.emailsSent);
    const recommendationInterestedCount = numericValue(record, campaignFields.interested);
    const recommendationMeetingCount = numericValue(record, campaignFields.meetings);
    const recommendationPositiveEfficiency = emailsPerPositiveReply(record, campaignFields.emailsSent, campaignFields.interested);
    const recommendationMeetingEfficiency = emailsPerMeeting(record, campaignFields.emailsSent, campaignFields.meetings);
    const recommendationBounceRate = percentValue(record, campaignFields.bounceRate);
    const campaignPositiveReplyRate = recommendationEmailsSent !== null && recommendationEmailsSent > 0 && recommendationInterestedCount !== null ? recommendationInterestedCount / recommendationEmailsSent * 100 : null;
    const campaignBookingRate = recommendationInterestedCount !== null && recommendationInterestedCount > 0 && recommendationMeetingCount !== null ? recommendationMeetingCount / recommendationInterestedCount * 100 : null;
    if (campaignProgress === null || campaignProgress < 60) return {label: campaignStatus === 'active' ? 'Keep running' : 'Review campaign status', detail: campaignStatus === 'active' ? 'Performance recommendation activates at 60% progress.' : 'This campaign is not currently active and does not have a pending build action.', chip: 'border-gray-200 bg-gray-100 text-gray-600', ready: false};
    if (campaignPositiveReplyRate === null || agencyPositiveReplyRate === null || agencyPositiveReplyRate <= 0) return {label: 'Needs data', detail: 'Email and interested-reply data are required.', chip: 'border-gray-200 bg-gray-100 text-gray-600', ready: false};
    const relativePerformance = campaignPositiveReplyRate / agencyPositiveReplyRate;
    const clearsPositiveEfficiency = recommendationPositiveEfficiency !== null && recommendationPositiveEfficiency <= 250;
    const clearsMeetingEfficiency = recommendationMeetingEfficiency !== null && recommendationMeetingEfficiency <= 1000;
    const clearsBounceGuardrail = recommendationBounceRate !== null && recommendationBounceRate < 3;
    const clearsTopFunnel = relativePerformance >= 0.6 && clearsPositiveEfficiency;
    if (recommendationBounceRate !== null && !clearsBounceGuardrail) return {label: 'Fix deliverability', detail: `Bounce rate is ${recommendationBounceRate.toFixed(2)}%. Fix list quality, verification, or sending infrastructure before diagnosing the offer or booking process.`, chip: 'border-red-200 bg-red-50 text-red-700', ready: true};
    if (clearsTopFunnel) {
        if ((recommendationInterestedCount ?? 0) < 10) return {label: 'Keep running', detail: 'The offer is producing interested replies, but there are fewer than 10 interested replies. Collect more booking data before changing the offer or sales process.', chip: 'border-gray-200 bg-gray-100 text-gray-600', ready: false};
        if (campaignBookingRate !== null && campaignBookingRate < 10) return {label: 'Fix booking process', detail: `The offer is producing interested replies, but only ${campaignBookingRate.toFixed(2)}% became meetings. Improve response speed, follow-up, qualification, and the booking handoff before changing the offer.`, chip: 'border-red-200 bg-red-50 text-red-700', ready: true};
        if (campaignBookingRate !== null && campaignBookingRate < 20) return {label: 'Improve follow-up and booking', detail: `${campaignBookingRate.toFixed(2)}% of interested replies became meetings. The offer is working; improve follow-up and booking conversion before testing a new offer.`, chip: 'border-amber-200 bg-amber-50 text-amber-700', ready: true};
        if (clearsMeetingEfficiency && clearsBounceGuardrail) return {label: 'Top up with leads', detail: 'Positive replies, meetings, bounce, and agency-relative performance all clear the guardrails. Add the linked lead list’s remaining qualified leads to the existing EmailBison campaign.', chip: 'border-emerald-200 bg-emerald-50 text-emerald-700', ready: true, action: 'top-up-leads' as const};
        if (recommendationBounceRate === null || campaignBookingRate === null) return {label: 'Needs data', detail: 'Bounce and meeting data are required before the campaign can be topped off.', chip: 'border-gray-200 bg-gray-100 text-gray-600', ready: false};
        return {label: 'Improve follow-up and booking', detail: 'The offer is producing interested replies, but meeting efficiency is still below the top-off guardrail. Improve the booking process before changing the offer.', chip: 'border-amber-200 bg-amber-50 text-amber-700', ready: true};
    }
    const recommendationIssues = [relativePerformance < 0.6 ? 'below agency benchmark' : '', !clearsPositiveEfficiency ? 'over 250 emails per positive reply' : ''].filter(Boolean).join(', ');
    if (pivotOptions.newVertical) return {label: 'Same offer, new vertical', detail: `Pivot recommended: ${recommendationIssues}. Keep the offer and test a new industry.`, chip: 'border-blue-200 bg-blue-50 text-blue-700', ready: true};
    if (pivotOptions.newOffer) return {label: 'Test new offer', detail: `New offer recommended: ${recommendationIssues}.`, chip: 'border-orange-200 bg-orange-50 text-orange-700', ready: true};
    return {label: 'Test copy and angles', detail: `Copy and angle testing recommended: ${recommendationIssues}.`, chip: 'border-orange-200 bg-orange-50 text-orange-700', ready: true};
}

function withinDays(record: AnyRecord, field: AnyField | null, days: number | null): boolean {
    if (!days) return true;
    const date = dateFor(record, field);
    if (!date) return false;
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - days);
    return date >= cutoff;
}

function periodDays(period: TimePeriod): number | null {
    if (period === 'All time') return null;
    return Number(period.match(/\d+/)?.[0] ?? 30);
}

function hasChoice(field: AnyField | null, name: string): boolean {
    const choices = field?.config?.options?.choices ?? field?.options?.choices ?? [];
    return choices.some((choice: any) => choice.name.toLowerCase() === name.toLowerCase());
}

function selectWriteValue(field: AnyField, name: string): any {
    return field.type === FieldType.SINGLE_SELECT ? {name} : name;
}

type ParsedReviewVariants = {
    structured: boolean;
    values: string[];
};

function parseReviewVariants(rawValue: unknown, fieldLabel: string, allowEmpty = false): ParsedReviewVariants {
    const source = String(rawValue ?? '').replace(/\r\n?/g, '\n').trim();
    if (!source) return {structured: false, values: []};

    // Deliberately conservative: ordinary uses of the word "variant" do not
    // split copy. Two or more explicit line-start labels are required.
    const markerPattern = /^(?:\[\s*)?variant\s+(10|[1-9]|[A-J])(?:\s*\])?\s*(?:(?::|[-–—])\s*)?(.*)$/gim;
    const markers = [...source.matchAll(markerPattern)];
    if (markers.length < 2) return {structured: false, values: [source]};

    const labelIndexes = markers.map(marker => {
        const token = String(marker[1]).toUpperCase();
        return /^\d+$/.test(token) ? Number(token) - 1 : token.charCodeAt(0) - 'A'.charCodeAt(0);
    });
    labelIndexes.forEach((labelIndex, markerIndex) => {
        if (labelIndex !== markerIndex) {
            throw new Error(`${fieldLabel} variant labels must be sequential, beginning with Variant 1 or Variant A, with no duplicates or gaps.`);
        }
    });

    const values = markers.map((marker, markerIndex) => {
        const markerEnd = (marker.index ?? 0) + marker[0].length;
        const nextMarkerStart = markers[markerIndex + 1]?.index ?? source.length;
        const inlineValue = String(marker[2] ?? '').trim();
        const followingLines = source.slice(markerEnd, nextMarkerStart).trim();
        return [inlineValue, followingLines].filter(Boolean).join('\n').trim();
    });
    if (!allowEmpty && values.some(value => !value)) throw new Error(`${fieldLabel} contains an empty labelled variant.`);
    return {structured: true, values};
}


function CampaignReviewPanel({record, table}: {record: any; table: any}) {
    const field = table?.fields.find((f: any) => f.id === 'fld4wy3OP82nps2zK' || f.name === 'Improvement Sugestion');
    const raw = field ? String(record?.getCellValue(field) || '') : '';
    const cleaned = raw.replace(/^(?:Reference:\s*)?\[Campaign learning v1:[^\]]+\]\s*\n?/gm, '')
        .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '$1 ($2)')
        .replace(/\*\*/g, '').replace(/^#{1,6}\s+/gm, '')
        .replace(/^\s*---+\s*$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
    const sections: {title: string; text: string}[] = [];
    const headings = /^(QUICK SUMMARY|RECOMMENDED NEXT STEPS|DETAILED REVIEW|REPLY FINDINGS|EVIDENCE AND LIMITS|QUESTIONS FOR ALEXANDER|SOURCES)\s*$/i;
    for (const line of cleaned.split('\n')) {
        if (headings.test(line.trim())) sections.push({title: line.trim(), text: ''});
        else { if (!sections.length) sections.push({title: 'Review', text: ''}); sections[sections.length - 1].text += line + '\n'; }
    }
    const linkText = (value: string) => value.split(/(https?:\/\/[^\s<>]+)/g).map((part, i) => {
        if (!/^https?:\/\//i.test(part)) return <React.Fragment key={i}>{part}</React.Fragment>;
        const url = part.replace(/[),.;]+$/, '');
        return <React.Fragment key={i}><a href={url} target="_blank" rel="noopener noreferrer" className="break-all text-purple-700 underline">{url}</a>{part.slice(url.length)}</React.Fragment>;
    });
    return <section aria-label="60% Campaign Review" className="mb-6 overflow-hidden rounded-2xl border border-purple-200 bg-white">
        <header className="border-b border-purple-100 bg-purple-50 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-bold text-gray-900">60% Campaign Review</h3>{cleaned && <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">Review required</span>}</div>
            <p className="mt-2 text-sm font-medium text-gray-700">{String(record?.name || 'Selected campaign')}</p>
        </header>
        {!field ? <p className="p-5 text-sm text-amber-800">Enable the Improvement Sugestion field in this component’s data settings to display campaign reviews.</p>
        : !cleaned ? <p className="p-5 text-sm leading-6 text-gray-600">No campaign review yet. A review is generated when this campaign newly reaches 60% completion.</p>
        : <div className="divide-y divide-gray-100">{sections.filter(s => s.text.trim()).map((s, i) => <details key={String(record?.id)+'-'+i+'-'+s.title} open={/^(QUICK SUMMARY|RECOMMENDED NEXT STEPS)$/i.test(s.title) || (i === 0 && sections.length === 1)} className="group p-5">
            <summary className="cursor-pointer text-sm font-semibold text-gray-900">{s.title.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase())}</summary>
            <div className="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-gray-700">{linkText(s.text.trim())}</div>
        </details>)}</div>}
        {cleaned && <p className="border-t border-gray-100 bg-slate-50 px-5 py-3 text-xs leading-5 text-gray-500">Recommendations only. Review the evidence and approve changes before adding leads or sending outreach.</p>}
    </section>;
}

function VerificationPerformancePanel({record, table}: {record: AnyRecord; table: AnyTable}) {
    const [provider, setProvider] = useState('All');
    const [emailType, setEmailType] = useState('All');
    const field = table?.fields.find((f: any) => f.name === 'Verification Cohort Analytics JSON');
    let snapshot: any = null;
    try { snapshot = field ? JSON.parse(String(record?.getCellValue(field) || 'null')) : null; } catch {}
    const groups: any[] = snapshot?.version === 1 && Array.isArray(snapshot.groups) ? snapshot.groups : [];
    const selectedGroups = groups.filter(g => (provider === 'All' || g.provider === provider) && (emailType === 'All' || g.emailType === emailType));
    const total = selectedGroups.reduce((a, g) => { for (const k of ['leads','contacted','sent','replies','positive','bounces']) a[k] += Number(g[k]) || 0; return a; }, {leads:0,contacted:0,sent:0,replies:0,positive:0,bounces:0});
    const rate = (n: number, d: number) => d > 0 ? (100*n/d).toFixed(2)+'%' : '—';
    const stale = snapshot?.updatedAt && Date.now() - Date.parse(snapshot.updatedAt) > 3*60*60*1000;
    return <section className="mb-6 rounded-xl border border-purple-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-base font-semibold text-gray-900">Verification performance</h3><p className="mt-1 text-sm text-gray-500">Campaign-to-date results by the provider that verified each lead's email.</p></div>
            <div className="flex flex-wrap gap-2"><label className="text-xs text-gray-600">Verified by<select aria-label="Verification provider" value={provider} onChange={e=>setProvider(e.target.value)} className="ml-2 rounded-lg border border-gray-200 bg-white p-2">{['All','MillionVerifier','LeadMagic','Unknown'].map(v=><option key={v}>{v}</option>)}</select></label><label className="text-xs text-gray-600">Email type<select aria-label="Verification email type" value={emailType} onChange={e=>setEmailType(e.target.value)} className="ml-2 rounded-lg border border-gray-200 bg-white p-2">{['All','Direct','Generic','Unknown'].map(v=><option key={v}>{v}</option>)}</select></label></div>
        </div>
        {!snapshot ? <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-gray-600">Provider statistics have not synced yet. Historical leads without campaign-specific verification tags remain Unknown.</p> : <>
            <p className={`mt-3 text-xs ${stale?'text-amber-700':'text-gray-500'}`}>{stale?'Refresh overdue · ':''}Updated {new Date(snapshot.updatedAt).toLocaleString()} · {Number(snapshot.tagged||0).toLocaleString()} of {Number(snapshot.total||0).toLocaleString()} leads have a known verifier.</p>
            <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">{[['Leads contacted',total.contacted,''],['Replies',total.replies,rate(total.replies,total.contacted)],['Positive replies',total.positive,rate(total.positive,total.contacted)],['Bounces',total.bounces,rate(total.bounces,total.contacted)]].map(([label,n,pct])=><div key={String(label)} className="rounded-lg border border-gray-200 bg-slate-50 p-3"><div className="text-xs text-gray-500">{label}</div><div className="mt-1 text-xl font-semibold text-gray-900">{Number(n).toLocaleString()} <span className="text-sm font-normal text-gray-500">{pct}</span></div></div>)}</div>
            <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr>{['Verified by','Email type','Leads','Contacted','Sent','Replies','Positive','Bounces'].map(h=><th className="whitespace-nowrap border-b p-2" key={h}>{h}</th>)}</tr></thead><tbody>{selectedGroups.filter(g=>g.leads>0).map(g=><tr key={g.provider+'|'+g.emailType}>{[g.provider,g.emailType,g.leads,g.contacted,g.sent,`${g.replies} (${rate(g.replies,g.contacted)})`,`${g.positive} (${rate(g.positive,g.contacted)})`,`${g.bounces} (${rate(g.bounces,g.contacted)})`].map((v,i)=><td className="whitespace-nowrap border-b border-gray-100 p-2" key={i}>{v}</td>)}</tr>)}</tbody></table></div>
            {!selectedGroups.some(g=>g.leads>0)&&<p className="mt-3 text-sm text-gray-500">No leads match these filters.</p>}
            <p className="mt-3 text-xs leading-5 text-gray-500">Rates use unique leads contacted. Replies and bounces count each lead once. Unknown means no saved campaign-specific attribution. LeadMagic recovery and MillionVerifier-valid groups are different populations, not a randomized verifier test. Filters apply to this section; sequence and inbox-placement results keep their own scope.</p>
        </>}
    </section>;
}

function CampaignCenter(): React.ReactElement {
    // Keep Campaign Center visually consistent regardless of Airtable's theme.
    const dark = false;
    const base = useBase();
    const {customPropertyValueByKey} = useCustomProperties(getCustomProperties);
    const configuredCampaignsTable = customPropertyValueByKey.campaignsTable as AnyTable | undefined;
    const campaignsTable = configuredCampaignsTable
        ?? base.tables.find(table => table?.name?.trim().toLowerCase() === 'campaigns');
    const sequenceAnalyticsTable = customPropertyValueByKey.sequenceAnalyticsTable as AnyTable | undefined;
    const analyticsTable = customPropertyValueByKey.emailAnalyticsTable as AnyTable | undefined;
    const overviewTable = customPropertyValueByKey.emailOverviewTable as AnyTable | undefined;
    const leadListsTable = customPropertyValueByKey.leadListsTable as AnyTable | undefined;
    const configuredClientsTable = customPropertyValueByKey.clientsTable as AnyTable | undefined;
    const clientsTable = base.tables.find(table => table.id === 'tblcjRBGJEWh5KgOt') ?? configuredClientsTable ?? base.tables.find(table => {
        const normalizedName = table?.name?.trim().toLowerCase();
        return normalizedName === 'workspace ids' || normalizedName === 'clients';
    });
    const configuredEmailAccountsTable = customPropertyValueByKey.emailAccountsTable as AnyTable | undefined;
    const emailAccountsTable = configuredEmailAccountsTable ?? base.tables.find(table => {
        if (!table) return false;
        const normalizedName = table.name.trim().toLowerCase();
        return normalizedName === 'email accounts'
            || normalizedName === 'sender emails'
            || normalizedName === 'sending accounts'
            || (normalizedName.includes('email') && normalizedName.includes('account'));
    });
    const configuredEmailsSentField = customPropertyValueByKey.emailsSentField as AnyField | undefined;
    const configuredRepliesDataField = customPropertyValueByKey.repliesDataField as AnyField | undefined;
    const configuredBouncesDataField = customPropertyValueByKey.bouncesDataField as AnyField | undefined;
    const configuredInterestedDataField = customPropertyValueByKey.interestedDataField as AnyField | undefined;
    const configuredMeetingsDataField = customPropertyValueByKey.meetingsDataField as AnyField | undefined;
    const syncWebhookUrl = BISON_SYNC_WEBHOOK_URL;
    const senderSyncWebhookUrl = BISON_SENDER_SYNC_WEBHOOK_URL;
    if (!campaignsTable) {
        throw new Error('Campaign Center could not find the Campaigns table. Configure the Campaigns table in Custom properties.');
    }
    const campaigns = ((useRecords(campaignsTable) ?? []) as AnyRecord[])
        .filter((record): record is AnyRecord => Boolean(record?.id));
    const campaignsRef = useRef<AnyRecord[]>(campaigns);
    campaignsRef.current = campaigns;
    // Interface custom properties can briefly resolve a newly added table as
    // null. Airtable's record hook dereferences the table ID immediately, so
    // always give it the already-configured Campaigns table as a safe model
    // and discard those fallback records when Sequence Analytics is absent.
    const sequenceAnalyticsQueryRecords = (useRecords(sequenceAnalyticsTable ?? campaignsTable) ?? []) as AnyRecord[];
    const sequenceAnalytics = (sequenceAnalyticsTable ? sequenceAnalyticsQueryRecords : [])
        .filter((record): record is AnyRecord => Boolean(record?.id));
    const analyticsQueryRecords = (useRecords(analyticsTable ?? campaignsTable) ?? []) as AnyRecord[];
    const analytics = (analyticsTable ? analyticsQueryRecords : [])
        .filter((record): record is AnyRecord => Boolean(record?.id));
    const overviewQueryRecords = (useRecords(overviewTable ?? campaignsTable) ?? []) as AnyRecord[];
    const overviews = (overviewTable ? overviewQueryRecords : [])
        .filter((record): record is AnyRecord => Boolean(record?.id));
    const leadListQueryRecords = (useRecords(leadListsTable ?? campaignsTable) ?? []) as AnyRecord[];
    const leadListRecords = (leadListsTable ? leadListQueryRecords : [])
        .filter((record): record is AnyRecord => Boolean(record?.id));
    const clientQueryRecords = (useRecords(clientsTable ?? campaignsTable) ?? []) as AnyRecord[];
    const clientRecords = clientsTable
        ? clientQueryRecords.filter((record): record is AnyRecord => Boolean(record?.id))
        : [];
    // Airtable's Interface record hook can throw while evaluating a null
    // table. Fall back to the already-configured Campaigns table so the hook
    // always receives a valid model; no fallback records are exposed as email
    // accounts because the array is cleared when detection did not succeed.
    const emailAccountQueryRecords = (useRecords(emailAccountsTable ?? campaignsTable) ?? []) as AnyRecord[];
    const safeEmailAccountRecords = (emailAccountsTable ? emailAccountQueryRecords : [])
        .filter((record): record is AnyRecord => Boolean(record?.id));

    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [clientFilter, setClientFilter] = useState(savedClientFilter);
    const [statusFilter, setStatusFilter] = useState('all');
    const [workspaceFilter, setWorkspaceFilter] = useState(savedWorkspaceFilter);
    const [healthFilter, setHealthFilter] = useState('all');
    const [dateRange, setDateRange] = useState<DateRange>('all');
    const [search, setSearch] = useState('');
    const [showHiddenHistory, setShowHiddenHistory] = useState(false);
    const [tab, setTab] = useState<Tab>('overview');
    const [timePeriod, setTimePeriod] = useState<TimePeriod>('Last 30 days');
    const [busy, setBusy] = useState<string | null>(null);
    const [notice, setNotice] = useState<{kind: 'success' | 'error' | 'info'; text: string} | null>(null);
    const [trackedOperation, setTrackedOperation] = useState<TrackedOperation | null>(null);
    const [sequenceStepLimits, setSequenceStepLimits] = useState<Record<string, number>>({});
    const [sequenceVariantLimits, setSequenceVariantLimits] = useState<Record<string, number>>({});
    const [showCampaignCreator, setShowCampaignCreator] = useState(false);
    const [newCampaignName, setNewCampaignName] = useState('');
    const [newCampaignThesis, setNewCampaignThesis] = useState('');
    const [buildLeadList, setBuildLeadList] = useState(true);
    const [leadListCreationMode, setLeadListCreationMode] = useState<'new' | 'existing'>('new');
    const [newLeadListName, setNewLeadListName] = useState('');
    const [newLeadListNameEdited, setNewLeadListNameEdited] = useState(false);
    const [existingLeadListId, setExistingLeadListId] = useState('');
    const [accountPickerOpen, setAccountPickerOpen] = useState(false);
    const [accountSearch, setAccountSearch] = useState('');
    const [senderStatusFilter, setSenderStatusFilter] = useState('all');
    const [accountSelectionCount, setAccountSelectionCount] = useState(10);
    const [sequenceDelayDraft, setSequenceDelayDraft] = useState('');
    const [skipApprovalConfirmed, setSkipApprovalConfirmed] = useState(false);
    const [manualTopUpAcknowledged, setManualTopUpAcknowledged] = useState(false);

    const creationClientRecord = clientFilter === 'all'
        ? null
        : clientRecords.find(record => String(record.name ?? '').trim().toLowerCase() === clientFilter.trim().toLowerCase()) ?? null;
    // Keep Airtable Name authoritative for matching and linked-record writes.
    const creationClientName = String(creationClientRecord?.name ?? '').trim();
    // Customer-facing campaign and list labels may use an optional display name.
    const creationClientDisplayName = clientFacingName(creationClientRecord, clientsTable);
    const campaignTitleDraft = stripBracketedClientPrefix(newCampaignName);
    const leadListTitleDraft = stripBracketedClientPrefix(newLeadListName || newCampaignName);
    const campaignNamePreview = creationClientDisplayName ? clientPrefixedName(creationClientDisplayName, campaignTitleDraft) : campaignTitleDraft;
    const leadListNamePreview = creationClientDisplayName ? clientPrefixedName(creationClientDisplayName, leadListTitleDraft) : leadListTitleDraft;

    useEffect(() => {
        setTab('overview');
        setNotice(null);
        setAccountPickerOpen(false);
        setAccountSearch('');
        setSenderStatusFilter('all');
        setSkipApprovalConfirmed(false);
        setManualTopUpAcknowledged(false);
    }, [selectedId]);

    const fields = useMemo(() => ({
        name: findField(campaignsTable, FIELD_ALIASES.campaignName),
        client: findField(campaignsTable, FIELD_ALIASES.client),
        status: findField(campaignsTable, FIELD_ALIASES.status),
        type: findField(campaignsTable, FIELD_ALIASES.type),
        lifecycle: findField(campaignsTable, FIELD_ALIASES.lifecycle),
        senderUpdateState: findField(campaignsTable, ['Sender Update State JSON']),
        automationRequest: findField(campaignsTable, ['Campaign Automation Request']),
        automationDisplayState: findCampaignField(campaignsTable, 'fld0t9xWgiOl8sJR1', ['Campaign Automation Display State']),
        actionResult: findCampaignField(campaignsTable, 'fldgfVmY5Ja6ngHFn', ['Campaign Action Result']),
        automationStatus: findField(campaignsTable, ['Processing Status']),
        automationMessage: findField(campaignsTable, ['Workflow Message']),
        automationError: findField(campaignsTable, ['Workflow Error']),
        automationStarted: findField(campaignsTable, ['Started At']),
        automationCompleted: findField(campaignsTable, ['Completed At']),
        automationRunId: findField(campaignsTable, ['Run ID']),
        statusModified: findField(campaignsTable, ['Status Last Modified']),

        workspace: findField(campaignsTable, FIELD_ALIASES.workspace),
        created: findField(campaignsTable, FIELD_ALIASES.created),
        health: findField(campaignsTable, FIELD_ALIASES.health),
        totalLeads: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.totalLeads, FIELD_ALIASES.totalLeads),
        contacted: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.contacted, FIELD_ALIASES.contacted),
        emailsSent: configuredEmailsSentField ?? findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.emailsSent, FIELD_ALIASES.emailsSent),
        replies: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.replies, FIELD_ALIASES.replies),
        replyRate: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.replyRate, FIELD_ALIASES.replyRate),
        repliesData: configuredRepliesDataField ?? findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.repliesData, FIELD_ALIASES.repliesData),
        bounces: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.bounces, FIELD_ALIASES.bounces),
        bounceRate: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.bounceRate, FIELD_ALIASES.bounceRate),
        bouncesData: configuredBouncesDataField ?? findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.bouncesData, FIELD_ALIASES.bouncesData),
        interested: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.interested, FIELD_ALIASES.interested),
        interestedRate: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.interestedRate, FIELD_ALIASES.interestedRate),
        interestedData: configuredInterestedDataField ?? findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.interestedData, FIELD_ALIASES.interestedData),
        meetings: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.meetings, FIELD_ALIASES.meetings),
        meetingRate: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.meetingRate, FIELD_ALIASES.meetingRate),
        meetingsData: configuredMeetingsDataField ?? findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.meetingsData, FIELD_ALIASES.meetingsData),
        progress: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.progress, FIELD_ALIASES.progress),
        bisonUrl: findCampaignField(campaignsTable, 'fldkCJDOFglvhcvD6', FIELD_ALIASES.bisonUrl),
        bisonId: findField(campaignsTable, FIELD_ALIASES.bisonId),
        workflowStage: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.workflowStage, FIELD_ALIASES.workflowStage),
        campaignApproach: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.campaignApproach, FIELD_ALIASES.campaignApproach),
        prepDate: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.prepDate, FIELD_ALIASES.prepDate),
        launchDate: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.launchDate, FIELD_ALIASES.launchDate),
        thesis: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.thesis, FIELD_ALIASES.thesis),
        campaignLeadList: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.campaignLeadList, FIELD_ALIASES.campaignLeadList),
        leadList: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.leadList, FIELD_ALIASES.leadList),
        topUpLeadList: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.topUpLeadList, FIELD_ALIASES.topUpLeadList),
        topUpRequest: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.topUpRequest, FIELD_ALIASES.topUpRequest),
        topUpStatus: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.topUpStatus, FIELD_ALIASES.topUpStatus),
        topUpAdded: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.topUpAdded, FIELD_ALIASES.topUpAdded),
        topUpSkipped: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.topUpSkipped, FIELD_ALIASES.topUpSkipped),
        topUpFailed: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.topUpFailed, FIELD_ALIASES.topUpFailed),
        topUpLastRun: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.topUpLastRun, FIELD_ALIASES.topUpLastRun),
        topUpMessage: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.topUpMessage, FIELD_ALIASES.topUpMessage),
        bisonApiKey: findField(campaignsTable, FIELD_ALIASES.bisonApiKey),
        bisonBaseUrl: findField(campaignsTable, FIELD_ALIASES.bisonBaseUrl),
        subject1: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.subject1, FIELD_ALIASES.subject1), body1: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.body1, FIELD_ALIASES.body1),
        subject2: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.subject2, FIELD_ALIASES.subject2), body2: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.body2, FIELD_ALIASES.body2),
        subject3: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.subject3, FIELD_ALIASES.subject3), body3: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.body3, FIELD_ALIASES.body3),
        subject4: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.subject4, FIELD_ALIASES.subject4), body4: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.body4, FIELD_ALIASES.body4),
        threadReply2: findField(campaignsTable, FIELD_ALIASES.threadReply2),
        threadReply3: findField(campaignsTable, FIELD_ALIASES.threadReply3),
        threadReply4: findField(campaignsTable, FIELD_ALIASES.threadReply4),
        finalSubject1a: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.finalSubject1a, FIELD_ALIASES.finalSubject1a), finalBody1a: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.finalBody1a, FIELD_ALIASES.finalBody1a), finalSubject1b: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.finalSubject1b, FIELD_ALIASES.finalSubject1b), finalBody1b: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.finalBody1b, FIELD_ALIASES.finalBody1b), finalSubject1c: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.finalSubject1c, FIELD_ALIASES.finalSubject1c), finalBody1c: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.finalBody1c, FIELD_ALIASES.finalBody1c),
        finalSubject2a: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.finalSubject2a, FIELD_ALIASES.finalSubject2a), finalBody2a: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.finalBody2a, FIELD_ALIASES.finalBody2a), finalSubject2b: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.finalSubject2b, FIELD_ALIASES.finalSubject2b), finalBody2b: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.finalBody2b, FIELD_ALIASES.finalBody2b), finalSubject2c: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.finalSubject2c, FIELD_ALIASES.finalSubject2c), finalBody2c: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.finalBody2c, FIELD_ALIASES.finalBody2c),
        finalSubject3a: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.finalSubject3a, FIELD_ALIASES.finalSubject3a), finalBody3a: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.finalBody3a, FIELD_ALIASES.finalBody3a), finalSubject3b: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.finalSubject3b, FIELD_ALIASES.finalSubject3b), finalBody3b: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.finalBody3b, FIELD_ALIASES.finalBody3b), finalSubject3c: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.finalSubject3c, FIELD_ALIASES.finalSubject3c), finalBody3c: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.finalBody3c, FIELD_ALIASES.finalBody3c),
        finalSubject4a: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.finalSubject4a, FIELD_ALIASES.finalSubject4a), finalBody4a: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.finalBody4a, FIELD_ALIASES.finalBody4a),
        createSpintax: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.createSpintax, FIELD_ALIASES.createSpintax),
        uploadToBison: findField(campaignsTable, FIELD_ALIASES.uploadToBison),
        bisonAction: findField(campaignsTable, FIELD_ALIASES.bisonAction),
        skipBounceNotification: findField(campaignsTable, FIELD_ALIASES.skipBounceNotification),
        skipBouncePause: findField(campaignsTable, FIELD_ALIASES.skipBouncePause),
        daysBetween: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.daysBetween, FIELD_ALIASES.daysBetween), variants1: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.variants1, FIELD_ALIASES.variants1), variants2: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.variants2, FIELD_ALIASES.variants2), variants3: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.variants3, FIELD_ALIASES.variants3), variants4: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.variants4, FIELD_ALIASES.variants4), backupVariants: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.backupVariants, FIELD_ALIASES.backupVariants),
        monday: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.monday, FIELD_ALIASES.monday), tuesday: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.tuesday, FIELD_ALIASES.tuesday), wednesday: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.wednesday, FIELD_ALIASES.wednesday), thursday: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.thursday, FIELD_ALIASES.thursday), friday: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.friday, FIELD_ALIASES.friday), saturday: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.saturday, FIELD_ALIASES.saturday), sunday: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.sunday, FIELD_ALIASES.sunday),
        startTime: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.startTime, FIELD_ALIASES.startTime), endTime: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.endTime, FIELD_ALIASES.endTime), timezone: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.timezone, FIELD_ALIASES.timezone), maxEmails: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.maxEmails, FIELD_ALIASES.maxEmails), maxNewLeads: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.maxNewLeads, FIELD_ALIASES.maxNewLeads), plainText: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.plainText, FIELD_ALIASES.plainText), startDate: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.startDate, FIELD_ALIASES.startDate), endDate: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.endDate, FIELD_ALIASES.endDate),
        clientFeedback: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.clientFeedback, FIELD_ALIASES.clientFeedback), selectChanges: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.selectChanges, FIELD_ALIASES.selectChanges), reviewCopy: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.reviewCopy, FIELD_ALIASES.reviewCopy), companyFeedback: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.companyFeedback, FIELD_ALIASES.companyFeedback), geographyFeedback: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.geographyFeedback, FIELD_ALIASES.geographyFeedback), industryFeedback: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.industryFeedback, FIELD_ALIASES.industryFeedback), titleFeedback: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.titleFeedback, FIELD_ALIASES.titleFeedback), additionalContext: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.additionalContext, FIELD_ALIASES.additionalContext),
        clientReviewSubmittedAt: findField(campaignsTable, FIELD_ALIASES.clientReviewSubmittedAt),
        clientReviewAutoApproveAt: findField(campaignsTable, FIELD_ALIASES.clientReviewAutoApproveAt),
        campaignApprovalSource: findField(campaignsTable, FIELD_ALIASES.campaignApprovalSource),
        emailAccounts: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.emailAccounts, FIELD_ALIASES.emailAccounts),
        canEnterVertical: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.canEnterVertical, FIELD_ALIASES.canEnterVertical),
        canCreateOffer: findCampaignField(campaignsTable, CAMPAIGN_FIELD_IDS.canCreateOffer, FIELD_ALIASES.canCreateOffer),
    }), [campaignsTable, configuredEmailsSentField, configuredRepliesDataField, configuredBouncesDataField, configuredInterestedDataField, configuredMeetingsDataField]);

    const analyticsFields = useMemo(() => ({
        campaign: findField(analyticsTable, ANALYTICS_ALIASES.campaign),
        client: findField(analyticsTable, ANALYTICS_ALIASES.client),
        date: findField(analyticsTable, ANALYTICS_ALIASES.date),
        subject: findField(analyticsTable, ANALYTICS_ALIASES.subject),
        step: findField(analyticsTable, ANALYTICS_ALIASES.step),
        sent: findField(analyticsTable, ANALYTICS_ALIASES.sent),
        replies: findField(analyticsTable, ANALYTICS_ALIASES.replies),
        interested: findField(analyticsTable, ANALYTICS_ALIASES.interested),
        bounce: findField(analyticsTable, ANALYTICS_ALIASES.bounce),
        open: findField(analyticsTable, ANALYTICS_ALIASES.open),
    }), [analyticsTable]);

    const sequenceAnalyticsFields = useMemo(() => ({
        campaign: findField(sequenceAnalyticsTable, SEQUENCE_ANALYTICS_ALIASES.campaign),
        step: findField(sequenceAnalyticsTable, SEQUENCE_ANALYTICS_ALIASES.step),
        variant: findField(sequenceAnalyticsTable, SEQUENCE_ANALYTICS_ALIASES.variant),
        subject: findField(sequenceAnalyticsTable, SEQUENCE_ANALYTICS_ALIASES.subject),
        copy: findField(sequenceAnalyticsTable, SEQUENCE_ANALYTICS_ALIASES.copy),
        sent: findField(sequenceAnalyticsTable, SEQUENCE_ANALYTICS_ALIASES.sent),
        replies: findField(sequenceAnalyticsTable, SEQUENCE_ANALYTICS_ALIASES.replies),
        replyRate: findField(sequenceAnalyticsTable, SEQUENCE_ANALYTICS_ALIASES.replyRate),
        interested: findField(sequenceAnalyticsTable, SEQUENCE_ANALYTICS_ALIASES.interested),
        interestedRate: findField(sequenceAnalyticsTable, SEQUENCE_ANALYTICS_ALIASES.interestedRate),
        bounces: findField(sequenceAnalyticsTable, SEQUENCE_ANALYTICS_ALIASES.bounces),
        bounceRate: findField(sequenceAnalyticsTable, SEQUENCE_ANALYTICS_ALIASES.bounceRate),
        sampleStatus: findField(sequenceAnalyticsTable, SEQUENCE_ANALYTICS_ALIASES.sampleStatus),
        lastSynced: findField(sequenceAnalyticsTable, SEQUENCE_ANALYTICS_ALIASES.lastSynced),
    }), [sequenceAnalyticsTable]);

    const overviewFields = useMemo(() => ({
        campaign: findField(overviewTable, ANALYTICS_ALIASES.campaign),
        client: findField(overviewTable, ANALYTICS_ALIASES.client),
        period: findField(overviewTable, ANALYTICS_ALIASES.period),
    }), [overviewTable]);

    const leadListFields = useMemo(() => ({
        name: findLeadListField(leadListsTable, LEAD_LIST_FIELD_IDS.name, ['Name of the Lead List', 'File Name', 'Name']),
        link: findLeadListField(leadListsTable, LEAD_LIST_FIELD_IDS.link, ['Lead List Link', 'Project Google Sheet Link']),
        client: findLeadListField(leadListsTable, LEAD_LIST_FIELD_IDS.client, ['Client', 'Clients', 'Clients Table', 'Company']),
        campaign: findLeadListField(leadListsTable, LEAD_LIST_FIELD_IDS.campaign, ['Which Campaign?', 'Campaign', 'Campaigns']),
        icpDescription: findLeadListField(leadListsTable, LEAD_LIST_FIELD_IDS.icpDescription, ['ICP Description', 'Targeting Sentence']),
        sourceType: findLeadListField(leadListsTable, LEAD_LIST_FIELD_IDS.sourceType, ['Source Type']),
        stage: findLeadListField(leadListsTable, LEAD_LIST_FIELD_IDS.stage, ['Lead List Stage', 'Stage']),
        qaStatus: findLeadListField(leadListsTable, 'fldUB4WsLi5kq6rUy', ['QA Status']),
        processingStatus: findLeadListField(leadListsTable, LEAD_LIST_FIELD_IDS.processingStatus, ['Processing Status']),
        automationAction: findLeadListField(leadListsTable, '', ['Automation Action']),
        finalFile: findLeadListField(leadListsTable, LEAD_LIST_FIELD_IDS.finalFile, ['Final Export File', 'Final File']),
        finalGenericCount: findLeadListField(leadListsTable, LEAD_LIST_FIELD_IDS.finalGenericCount, ['Final Generic Count', 'Final Generic', 'Generic Campaign List']),
        finalDirectCount: findLeadListField(leadListsTable, LEAD_LIST_FIELD_IDS.finalDirectCount, ['Final Direct Count', 'Final Direct', 'Direct Campaign List']),
    }), [leadListsTable]);
    const topUpBuildScopeField = useMemo(() => findField(leadListsTable, ['Top-up Build Scope JSON']), [leadListsTable]);
    const topUpUploadReceiptField = useMemo(() => findField(leadListsTable, ['Top-up Upload Receipt JSON']), [leadListsTable]);
    const [existingTopUpChoice,setExistingTopUpChoice] = useState('');


    const clientFields = useMemo(() => ({
        newVerticalPivot: findCampaignField(clientsTable, CLIENT_FIELD_IDS.newVerticalPivot, ['New Vertical Pivot']),
        newOfferPivot: findCampaignField(clientsTable, CLIENT_FIELD_IDS.newOfferPivot, ['New Offer Pivot']),
        workspaceId: findField(clientsTable, ['Workspace ID', 'EmailBison Workspace ID', 'Bison Workspace ID']),
    }), [clientsTable]);

    const emailAccountFields = useMemo(() => ({
        name: findField(emailAccountsTable, EMAIL_ACCOUNT_ALIASES.name),
        emailId: findField(emailAccountsTable, EMAIL_ACCOUNT_ALIASES.emailId),
        workspace: emailAccountsTable?.getFieldIfExists('Workspace ID')
            ?? findField(emailAccountsTable, EMAIL_ACCOUNT_ALIASES.workspace),
        client: findField(emailAccountsTable, EMAIL_ACCOUNT_ALIASES.client),
        status: findField(emailAccountsTable, EMAIL_ACCOUNT_ALIASES.status),
        connected: findField(emailAccountsTable, EMAIL_ACCOUNT_ALIASES.connected),
        activeSending: findField(emailAccountsTable, EMAIL_ACCOUNT_ALIASES.activeSending),
        warmupDays: findField(emailAccountsTable, EMAIL_ACCOUNT_ALIASES.warmupDays)
            ?? emailAccountsTable?.fields?.find(field => /(?:warm.*day|day.*warm|warm.*age)/i.test(field.name)),
        warmupStatus: findField(emailAccountsTable, EMAIL_ACCOUNT_ALIASES.warmupStatus)
            ?? emailAccountsTable?.fields?.find(field => /warm/i.test(field.name) && /status|state|ready/i.test(field.name)),
        warmupStart: findField(emailAccountsTable, EMAIL_ACCOUNT_ALIASES.warmupStart)
            ?? emailAccountsTable?.fields?.find(field => /warm/i.test(field.name) && /start|since|date/i.test(field.name)),
        campaigns: findField(emailAccountsTable, EMAIL_ACCOUNT_ALIASES.campaigns),
        dailyLimit: findCampaignField(emailAccountsTable, EMAIL_ACCOUNT_FIELD_IDS.dailyLimit, EMAIL_ACCOUNT_ALIASES.dailyLimit),
    }), [emailAccountsTable]);

    const options = useMemo(() => {
        const clientStatusField = clientsTable?.fields?.find(field => field.id === 'fldSr8KQs90Uk2d26')
            ?? clientsTable?.fields?.find(field => ['Client Status', 'Status', 'Account Status'].includes(field.name));
        const activeClientNames = clientsTable
            ? clientRecords
                .filter(record => showHiddenHistory || (clientStatusField && optionName(record, clientStatusField).trim().toLowerCase() === 'active'))
                .map(record => String(record.name ?? '').trim())
                .filter(Boolean)
                .sort((a, b) => a.localeCompare(b))
            : showHiddenHistory ? selectOptions(fields.client, campaigns) : [];
        return {
            clients: [...new Set(activeClientNames)],
            statuses: selectOptions(fields.status, campaigns),
            workspaces: selectOptions(fields.workspace, campaigns),
            health: selectOptions(fields.health, campaigns),
        };
    }, [campaigns, fields, clientsTable, clientRecords, showHiddenHistory]);

    useEffect(() => {
        if (!options.clients.length || (clientFilter !== 'all' && !options.clients.includes(clientFilter))) return;
        try {
            window.localStorage.setItem(ACTIVE_CLIENT_STORAGE_KEY, clientFilter);
        } catch {
            // Airtable can restrict browser storage in some embedded contexts.
        }
    }, [clientFilter, options.clients]);

    useEffect(() => {
        try {
            window.localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, workspaceFilter);
        } catch {
            // Airtable can restrict browser storage in some embedded contexts.
        }
    }, [workspaceFilter]);

    useEffect(() => {
        if (clientFilter === 'all' || !options.clients.length) return;
        if (!options.clients.includes(clientFilter)) {
            const dulcy = options.clients.find(client => client.toLowerCase() === 'dulcy');
            setClientFilter(dulcy ?? options.clients[0] ?? 'all');
        }
    }, [clientFilter, options.clients]);

    useEffect(() => {
        if (workspaceFilter === 'all' || !options.workspaces.length) return;
        if (!options.workspaces.includes(workspaceFilter)) setWorkspaceFilter('all');
    }, [workspaceFilter, options.workspaces]);

    const splitParents = useMemo(() => completedSplitParentIds(campaigns, fields), [campaigns, fields]);
    const filtered = useMemo(() => {
        const query = search.trim().toLowerCase();
        const match = (record: AnyRecord, field: AnyField | null, wanted: string) => wanted === 'all' || comparableValues(record, field).includes(wanted);
        return campaigns.filter(record => {
            const searchable = [fields.name, fields.client, fields.workspace, fields.status, fields.type]
                .map(field => textValue(record, field).toLowerCase()).join(' ');
            const status = optionName(record, fields.status).trim().toLowerCase();
            const lifecycle = optionName(record, fields.lifecycle).trim().toLowerCase();
            const createdAt = dateFor(record, fields.created)?.getTime();
            const isOld = createdAt !== undefined && createdAt < new Date('2026-07-15T00:00:00-04:00').getTime();
            const isRunning = ['active', 'live', 'paused', 'scheduled', 'running'].includes(status)
                || ['scheduled', 'running'].includes(lifecycle);
            const isHiddenHistory = isOld && !isRunning;
            return !splitParents.has(record.id)
                && (!query || searchable.includes(query))
                && match(record, fields.client, clientFilter)
                && match(record, fields.status, statusFilter)
                && match(record, fields.workspace, workspaceFilter)
                && match(record, fields.health, healthFilter)
                && withinDays(record, fields.created, dateRange === 'all' ? null : Number(dateRange))
                && (showHiddenHistory || !isHiddenHistory);
        }).sort((a, b) => {
            const aDate = dateFor(a, fields.created)?.getTime() ?? Number.NEGATIVE_INFINITY;
            const bDate = dateFor(b, fields.created)?.getTime() ?? Number.NEGATIVE_INFINITY;
            if (aDate !== bDate) return bDate - aDate;
            return textValue(a, fields.name).localeCompare(textValue(b, fields.name));
        });
    }, [campaigns, fields, splitParents, search, clientFilter, statusFilter, workspaceFilter, healthFilter, dateRange, showHiddenHistory]);

    const hiddenHistoryCount = useMemo(() => campaigns.filter(record => {
        const status = optionName(record, fields.status).trim().toLowerCase();
        const lifecycle = optionName(record, fields.lifecycle).trim().toLowerCase();
        const createdAt = dateFor(record, fields.created)?.getTime();
        const isRunning = ['active', 'live', 'paused', 'scheduled', 'running'].includes(status)
            || ['scheduled', 'running'].includes(lifecycle);
        return createdAt !== undefined
            && createdAt < new Date('2026-07-15T00:00:00-04:00').getTime()
            && !isRunning;
    }).length, [campaigns, fields.status, fields.lifecycle, fields.created]);

    const agencyBenchmarkCutoff = new Date();
    agencyBenchmarkCutoff.setDate(agencyBenchmarkCutoff.getDate() - 180);
    const agencyBenchmarkCampaigns = campaigns.filter(agencyRecord => {
        const benchmarkStatus = optionName(agencyRecord, fields.status).trim().toLowerCase();
        const benchmarkLifecycle = optionName(agencyRecord, fields.lifecycle).trim().toLowerCase();
        const benchmarkEmails = numericValue(agencyRecord, fields.emailsSent) ?? 0;
        const benchmarkDate = dateFor(agencyRecord, fields.launchDate) ?? dateFor(agencyRecord, fields.created);
        const benchmarkName = textValue(agencyRecord, fields.name).trim().toLowerCase();
        const isQualifiedStatus = ['active', 'live', 'running', 'completed'].includes(benchmarkStatus)
            || ['running', 'completed'].includes(benchmarkLifecycle);
        return isQualifiedStatus
            && benchmarkEmails >= 2000
            && benchmarkDate !== null
            && benchmarkDate >= agencyBenchmarkCutoff
            && !/(^|\s|\[)test(\s|\]|$)/i.test(benchmarkName);
    });
    const agencyTotals = agencyBenchmarkCampaigns.reduce((totals, agencyRecord) => {
        const agencyRecordEmails = numericValue(agencyRecord, fields.emailsSent);
        const agencyRecordReplies = numericValue(agencyRecord, fields.replies);
        const agencyRecordInterested = numericValue(agencyRecord, fields.interested);
        const agencyRecordMeetings = numericValue(agencyRecord, fields.meetings);
        if (agencyRecordEmails !== null && agencyRecordEmails > 0) totals.emails += agencyRecordEmails;
        if (agencyRecordReplies !== null && agencyRecordReplies > 0) totals.replies += agencyRecordReplies;
        if (agencyRecordInterested !== null && agencyRecordInterested > 0) totals.interested += agencyRecordInterested;
        if (agencyRecordMeetings !== null && agencyRecordMeetings > 0) totals.meetings += agencyRecordMeetings;
        return totals;
    }, {emails: 0, replies: 0, interested: 0, meetings: 0});
    // Keep this efficiency rate for the next-move recommendation logic.
    const agencyPositiveReplyRate = agencyTotals.emails > 0 ? agencyTotals.interested / agencyTotals.emails * 100 : null;
    // Displayed benchmark rates use the correct funnel-stage denominators.
    const agencyPositiveReplyPercent = agencyTotals.replies > 0 ? agencyTotals.interested / agencyTotals.replies * 100 : null;
    const agencyEmailsPerPositiveReply = agencyTotals.interested > 0 ? agencyTotals.emails / agencyTotals.interested : null;
    const agencyMeetingBookedPercent = agencyTotals.interested > 0 ? agencyTotals.meetings / agencyTotals.interested * 100 : null;
    const agencyEmailsPerMeeting = agencyTotals.meetings > 0 ? agencyTotals.emails / agencyTotals.meetings : null;

    const selected = useMemo(() => campaigns.find(record => record.id === selectedId) ?? null, [campaigns, selectedId]);
    const clientRecordForCampaign = useCallback((campaign: AnyRecord | null) => {
        if (!campaign || !fields.client) return null;
        const campaignClientIds = linkedIds(campaign, fields.client);
        if (campaignClientIds.length) {
            const linkedClient = clientRecords.find(clientRecord => campaignClientIds.includes(clientRecord.id));
            if (linkedClient) return linkedClient;
        }
        const campaignClientNames = comparableValues(campaign, fields.client)
            .map(value => value.trim().toLowerCase())
            .filter(Boolean);
        return clientRecords.find(clientRecord => campaignClientNames.includes(String(clientRecord.name ?? '').trim().toLowerCase())) ?? null;
    }, [fields.client, clientRecords]);
    const selectedClientRecord = useMemo(() => clientRecordForCampaign(selected), [clientRecordForCampaign, selected]);
    const selectedPivotOptions = useMemo(() => ({
        newVertical: clientPivotEnabled(selectedClientRecord, clientFields.newVerticalPivot),
        newOffer: clientPivotEnabled(selectedClientRecord, clientFields.newOfferPivot),
    }), [selectedClientRecord, clientFields]);
    const selectedClientBenchmark = useMemo(() => {
        if (!selected) return null;
        const selectedIds = linkedIds(selected, fields.client);
        const selectedNames = comparableValues(selected, fields.client).map(value => value.trim().toLowerCase()).filter(Boolean);
        if (!selectedIds.length && !selectedNames.length) return null;
        const clientCampaigns = campaigns.filter(campaignRecord => {
            const campaignIds = linkedIds(campaignRecord, fields.client);
            if (selectedIds.length && campaignIds.some(id => selectedIds.includes(id))) return true;
            const campaignNames = comparableValues(campaignRecord, fields.client).map(value => value.trim().toLowerCase());
            return selectedNames.some(name => campaignNames.includes(name));
        });
        const totals = clientCampaigns.reduce((clientTotals, campaignRecord) => {
            clientTotals.emails += Math.max(0, numericValue(campaignRecord, fields.emailsSent) ?? 0);
            clientTotals.replies += Math.max(0, numericValue(campaignRecord, fields.replies) ?? 0);
            clientTotals.interested += Math.max(0, numericValue(campaignRecord, fields.interested) ?? 0);
            clientTotals.meetings += Math.max(0, numericValue(campaignRecord, fields.meetings) ?? 0);
            return clientTotals;
        }, {emails: 0, replies: 0, interested: 0, meetings: 0});
        return {
            positiveReplyPercent: totals.replies > 0 ? totals.interested / totals.replies * 100 : null,
            emailsPerPositiveReply: totals.interested > 0 ? totals.emails / totals.interested : null,
            meetingBookedPercent: totals.interested > 0 ? totals.meetings / totals.interested * 100 : null,
            emailsPerMeeting: totals.meetings > 0 ? totals.emails / totals.meetings : null,
        };
    }, [selected, campaigns, fields.client, fields.emailsSent, fields.replies, fields.interested, fields.meetings]);
    const selectedClientDecision = selected ? textValue(selected, fields.clientFeedback) : '';
    // fld5weZ6ED31dBlaz is the real linked-record field. "Campaign Lead List"
    // is a URL field and must never be used to establish the relationship.
    const campaignLeadListLinkField = fields.leadList;
    // Counts and a completed verification job do not prove the lead list passed QA.
    const leadReadinessIssue = (record: AnyRecord): string => {
        const ids = linkedIds(record, campaignLeadListLinkField);
        if (!ids.length) return 'Link a Ready lead list with passed QA before uploading or launching.';
        if (!leadListFields.stage || !leadListFields.qaStatus) return 'Lead-list readiness cannot be checked. Enable Stage and QA Status for Lead Lists in this interface.';
        for (const id of ids) {
            const list = leadListRecords.find(candidate => candidate.id === id);
            if (!list) return 'The linked lead list is unavailable. Wait for it to load or check access before uploading or launching.';
            const stage = optionName(list, leadListFields.stage);
            const qa = optionName(list, leadListFields.qaStatus);
            const processing = optionName(list, leadListFields.processingStatus);
            if (!['ready', 'uploaded'].includes(stage.toLowerCase()) || qa.toLowerCase() !== 'passed') {
                return `Finish enrichment (or explicitly skip it), then pass automated QA in Lead List Center. Current stage: ${stage || 'Not set'}; QA: ${qa || 'Not passed'}. Upload and launch are locked until the list is Ready.`;
            }
            if (['requested', 'queued', 'running', 'processing', 'failed', 'error'].includes(processing.toLowerCase())) {
                return `The linked lead list has an unfinished automation (${processing}). Resolve it before uploading or launching.`;
            }
        }
        return '';
    };
    const assertLeadReadiness = (record: AnyRecord) => {
        const issue = leadReadinessIssue(record);
        if (issue) throw new Error(issue);
    };
    const selectedLeadReadinessIssue = selected ? leadReadinessIssue(selected) : '';
    const selectedBisonView = selected ? verifiedEmailBisonCampaignLink(selected, fields) : {url: '', title: ''};
    const selectedLeadListId = selected ? linkedIds(selected, campaignLeadListLinkField)[0] ?? null : null;
    const selectedLeadList = selectedLeadListId ? leadListRecords.find(leadListRecord => leadListRecord.id === selectedLeadListId) ?? null : null;
    const selectedGenericLeadCount = selectedLeadList ? Math.max(0, numericValue(selectedLeadList, leadListFields.finalGenericCount) ?? 0) : 0;
    const selectedDirectLeadCount = selectedLeadList ? Math.max(0, numericValue(selectedLeadList, leadListFields.finalDirectCount) ?? 0) : 0;
    const selectedSavedSequenceDelay = selected && fields.daysBetween
        ? numericValue(selected, fields.daysBetween) ?? Number.parseInt(optionName(selected, fields.daysBetween), 10)
        : null;
    useEffect(() => {
        if (!selected || !fields.daysBetween) {
            setSequenceDelayDraft('');
            return;
        }
        setSequenceDelayDraft(Number.isFinite(selectedSavedSequenceDelay) ? String(selectedSavedSequenceDelay) : '');
    }, [selected?.id, selectedSavedSequenceDelay, fields.daysBetween]);
    const managedTopUpSnapshot = (record:AnyRecord,keys:string[]) => ({id:record.id,fields:Object.fromEntries(keys.map(key=>{try{return [key,record.getCellValue(key)];}catch{return [key,null];}}))});
    const managedTopUpInputs = () => ({campaigns:campaigns.map(r=>managedTopUpSnapshot(campaignsTable.getRecordByIdIfExists?.(r.id)??r,parentFirstCampaignKeys)),lists:leadListRecords.map(r=>managedTopUpSnapshot(leadListsTable?.getRecordByIdIfExists?.(r.id)??r,[...new Set([...parentFirstListKeys,...Object.values(ManagedTopUp.F)])]))});
    const completedTopUpCandidates = useMemo(()=>{
      if(!selected||!leadListsTable)return [];
      const inputs=managedTopUpInputs();
      return inputs.lists.flatMap(r=>{try{const scope=JSON.parse(String(r.fields.fldevysyehxsGxt2q||'{}'));if(!scope.campaignRecordIds?.includes(selected.id))return [];const candidate=ManagedTopUp.candidatePlan({...inputs,currentListId:r.id,selectedRecordId:selected.id,complete:true});return [{id:r.id,...candidate}];}catch{return [];}});
    },[selected?.id,campaigns,leadListRecords,leadListsTable]);
    useEffect(()=>{setExistingTopUpChoice('');},[selected?.id]);
    const selectedTopUpLeadListId = selected && fields.topUpLeadList ? linkedIds(selected, fields.topUpLeadList)[0] ?? null : null;
    const selectedTopUpLeadList = selectedTopUpLeadListId ? leadListRecords.find(leadListRecord => leadListRecord.id === selectedTopUpLeadListId) ?? null : null;
    const selectedTopUpGenericCount = selectedTopUpLeadList ? Math.max(0, numericValue(selectedTopUpLeadList, leadListFields.finalGenericCount) ?? 0) : 0;
    const selectedTopUpDirectCount = selectedTopUpLeadList ? Math.max(0, numericValue(selectedTopUpLeadList, leadListFields.finalDirectCount) ?? 0) : 0;
    const selectedPreparedReceipt = (()=>{try{if(!selectedTopUpLeadList||!topUpUploadReceiptField)return null;const receipt=JSON.parse(textValue(selectedTopUpLeadList,topUpUploadReceiptField)||'{}');const candidate=completedTopUpCandidates.find(c=>c.id===selectedTopUpLeadListId);if(!candidate||receipt.sourceId!==selectedTopUpLeadListId||receipt.state!=='prepared'||(!Number.isFinite(Date.parse(receipt.expiresAt))||Date.parse(receipt.expiresAt)<=Date.now())||ManagedTopUp.canonical(receipt.binding?.sourceRevision)!==candidate.revisionText)return null;return receipt;}catch{return null;}})();

    useEffect(() => {
        if (!selected || !selectedLeadListId || !selectedLeadList || !leadListsTable || !leadListFields.icpDescription) return;
        const campaignThesis = textValue(selected, fields.thesis).trim();
        if (!campaignThesis || textValue(selectedLeadList, leadListFields.icpDescription).trim() === campaignThesis) return;
        const targetingUpdate = {[leadListFields.icpDescription.id]: campaignThesis};
        leadListsTable.updateRecordAsync(selectedLeadListId, targetingUpdate)
            .catch((error: any) => setNotice({kind: 'error', text: error?.message ?? 'Could not copy Campaign Thesis into the linked Lead List.'}));
    }, [selected?.id, selectedLeadListId, textValue(selected, fields.thesis), leadListsTable, leadListFields.icpDescription, fields.thesis]);
    useEffect(() => {
        if (!selected || !selectedLeadList || !leadListsTable || !leadListFields.name) return;
        const campaignName = textValue(selected, fields.name).trim();
        const leadListName = textValue(selectedLeadList, leadListFields.name).trim();
        if (!campaignName || leadListName !== `${campaignName} Lead List`) return;
        const nameUpdate = {[leadListFields.name.id]: campaignName};
        if (!leadListsTable.hasPermissionToUpdateRecord(selectedLeadList, nameUpdate)) return;
        leadListsTable.updateRecordAsync(selectedLeadList, nameUpdate)
            .then(() => setNotice({kind: 'success', text: 'The linked Lead List name now matches the campaign name exactly.'}))
            .catch((error: any) => setNotice({kind: 'error', text: error?.message ?? 'Could not align the linked Lead List name.'}));
    }, [selected?.id, selectedLeadList?.id, textValue(selected, fields.name), textValue(selectedLeadList, leadListFields.name), leadListsTable, leadListFields.name, fields.name]);
    const senderUpdateDispatch = useRef(false);
    const selectedSenderUpdate = selected ? readSenderUpdateState(selected, fields.senderUpdateState) : {};
    const senderUpdatePending = selected ? senderUpdateBlocked(selected, fields.senderUpdateState) : false;
    const selectedEmailAccountIds = selected ? linkedIds(selected, fields.emailAccounts) : [];
    const selectedClientNamesForAccounts = clientFilter !== 'all'
        ? [clientFilter.toLowerCase()]
        : selected
            ? comparableValues(selected, fields.client).map(value => value.toLowerCase())
            : [];
    const selectedClientIdsForAccounts = useMemo(() => {
        if (!fields.client || !selectedClientNamesForAccounts.length) return [] as string[];
        return [...new Set(campaigns.flatMap(campaignRecord => {
            const campaignClientText = textValue(campaignRecord, fields.client).toLowerCase();
            const campaignClientValues = comparableValues(campaignRecord, fields.client).map(value => value.toLowerCase());
            const belongsToSelectedClient = selectedClientNamesForAccounts.some(selectedClient =>
                campaignClientText === selectedClient
                || campaignClientValues.some(value => value === selectedClient)
            );
            return belongsToSelectedClient ? linkedIds(campaignRecord, fields.client) : [];
        }))];
    }, [campaigns, fields.client, selectedClientNamesForAccounts.join('|')]);
    const emailAccountClientFields = useMemo(() => {
        if (!emailAccountsTable) return [] as AnyField[];
        const discovered = EMAIL_ACCOUNT_ALIASES.client
            .map(alias => emailAccountsTable.getFieldIfExists(alias))
            .filter((field): field is AnyField => !!field);
        return [...new Map(discovered.filter(field => Boolean(field?.id)).map(field => [field.id, field])).values()];
    }, [emailAccountsTable]);
    const selectedWorkspaceNames = useMemo(() => {
        const directlySelected = selected ? comparableValues(selected, fields.workspace).map(value => value.toLowerCase()) : [];
        const clientWorkspaceIds = selectedClientRecord
            ? comparableValues(selectedClientRecord, clientFields.workspaceId).map(value => value.toLowerCase())
            : [];
        const workspaceOverrideClientNames = [
            ...selectedClientNamesForAccounts,
            String(selectedClientRecord?.name ?? '').trim().toLowerCase(),
        ].filter(Boolean);
        const senderWorkspaceOverride = workspaceOverrideClientNames
            .map(clientName => SENDER_WORKSPACE_OVERRIDES[clientName.trim().toLowerCase()])
            .find((workspaceIds): workspaceIds is string[] => Array.isArray(workspaceIds) && workspaceIds.length > 0);
        // The linked Workspace IDs record is the source of truth. Do not merge
        // campaign lookup values here because a shared client lookup can expose
        // both an old workspace and its replacement (for example IDs 65 and 66).
        const exactWorkspaceValues = senderWorkspaceOverride
            ? [...new Set(senderWorkspaceOverride)]
            : clientWorkspaceIds.length
                ? [...new Set(clientWorkspaceIds)]
                : [...new Set(directlySelected)];
        if (exactWorkspaceValues.length || !selectedClientNamesForAccounts.length) return exactWorkspaceValues;
        return [...new Set(campaigns.flatMap(campaignRecord => {
            const campaignClientNames = comparableValues(campaignRecord, fields.client).map(value => value.toLowerCase());
            const belongsToClient = campaignClientNames.some(value => selectedClientNamesForAccounts.includes(value));
            return belongsToClient ? comparableValues(campaignRecord, fields.workspace).map(value => value.toLowerCase()) : [];
        }))];
    }, [selected, selectedClientRecord, clientFields.workspaceId, fields.workspace, fields.client, campaigns, selectedClientNamesForAccounts.join('|')]);
    const topUpIntentOwnerByFamilyMember = useMemo(() => {
        const owners = new Map<string, AnyRecord>();
        const sameLinkedIds = (records: AnyRecord[], field: AnyField | null) => {
            if (!field || !records.length) return false;
            const values = records.map(record => JSON.stringify([...linkedIds(record, field)].sort()));
            return !!values[0] && values.every(value => value === values[0]);
        };
        TOP_UP_RESERVATION_FAMILIES.forEach(family => {
            const records = family.members.map(member => campaigns.find(record => record.id === member.recordId));
            if (records.some(record => !record)) return;
            const verifiedRecords = records as AnyRecord[];
            // Workspace is not exposed in every Campaign Center interface model.
            // The family is already narrowly allowlisted by exact record + Bison IDs;
            // require the same non-empty linked Client, which is available live.
            if (!sameLinkedIds(verifiedRecords, fields.client)) return;
            if (family.members.some((member, index) => textValue(verifiedRecords[index], fields.bisonId).trim() !== member.bisonId)) return;
            const owner = verifiedRecords.find(record => record.id === family.ownerId);
            if (!owner || splitParents.has(owner.id)) return;
            verifiedRecords.forEach(record => {
                if (!splitParents.has(record.id)) owners.set(record.id, owner);
            });
        });
        return owners;
    }, [campaigns, fields.client, fields.bisonId, splitParents]);
    const campaignSenderState = useCallback((campaignRecord: AnyRecord) => {
        if (splitParents.has(campaignRecord.id)) return {finished: true, releasingSoon: false, sending: false, launchReady: false};
        const campaignStatus = optionName(campaignRecord, fields.status).trim().toLowerCase();
        const workflowStatus = optionName(campaignRecord, fields.workflowStage).trim().toLowerCase();
        const rawProgress = numericValue(campaignRecord, fields.progress) ?? 0;
        const progress = rawProgress > 1 ? rawProgress / 100 : rawProgress;
        const finished = progress >= 1 || ['complete', 'completed', 'inactive', 'finished', 'ended'].includes(campaignStatus);
        const operational = !finished && (
            ['active', 'live', 'running', 'paused'].includes(campaignStatus)
            || ['live', 'running', 'paused'].includes(workflowStatus)
        );
        const intentRecord = topUpIntentOwnerByFamilyMember.get(campaignRecord.id) || campaignRecord;
        let latestRequest: any = {};
        try { latestRequest = JSON.parse(textValue(intentRecord, fields.automationRequest) || '{}'); } catch { /* Invalid requests cannot reserve senders. */ }
        const latestRequestAt = Date.parse(String(latestRequest?.requestedAt || ''));
        const statusModifiedAt = Date.parse(textValue(intentRecord, fields.statusModified));
        const topUpStatus = optionName(intentRecord, fields.topUpStatus).trim().toLowerCase();
        const newestTopUpBuildAt = linkedIds(intentRecord, fields.topUpLeadList).reduce((newest, leadListId) => {
            const leadList = leadListQueryRecords.find(candidate => candidate.id === leadListId);
            if (!leadList || !topUpBuildScopeField) return newest;
            try {
                const scope = JSON.parse(textValue(leadList, topUpBuildScopeField) || '{}');
                const createdAt = scope?.version === 1 && scope?.mode === 'this-build-only' ? Date.parse(String(scope.createdAt || '')) : NaN;
                return Number.isFinite(createdAt) ? Math.max(newest, createdAt) : newest;
            } catch { return newest; }
        }, 0);
        const buildCreatedBeforeUpload = newestTopUpBuildAt > 0 && (!Number.isFinite(latestRequestAt) || newestTopUpBuildAt > latestRequestAt);
        const topUpIntentOpen = String(latestRequest?.kind || '').toLowerCase() === 'topup'
            && ['requested', 'running', 'failed', 'error', 'completed'].includes(topUpStatus);
        const launchAwaitingStart = String(latestRequest?.kind || '').toLowerCase() === 'launch'
            && topUpStatus === 'completed'
            && (!Number.isFinite(statusModifiedAt) || !Number.isFinite(latestRequestAt) || statusModifiedAt < latestRequestAt);
        const pendingTopUpReservation = !operational
            && linkedIds(campaignRecord, fields.emailAccounts).length > 0
            && linkedIds(intentRecord, fields.topUpLeadList).length > 0
            && (buildCreatedBeforeUpload || topUpIntentOpen || launchAwaitingStart);
        // An active campaign can retain an old Build Ready workflow-stage value.
        // Operational status wins: only a genuinely non-active future campaign
        // can reserve an account for upcoming work.
        const launchReady = pendingTopUpReservation || (!finished && !operational && (
            ['uploaded', 'scheduled'].includes(campaignStatus)
            || ['launch ready', 'build ready', 'uploaded', 'scheduled', 'queued', 'waiting for senders'].includes(workflowStatus)
        ));
        return {finished, releasingSoon: operational && progress >= 0.6, sending: operational && progress < 0.6, launchReady};
    }, [fields.status, fields.workflowStage, fields.progress, fields.automationRequest, fields.statusModified, fields.topUpStatus, fields.topUpLeadList, fields.emailAccounts, splitParents, leadListQueryRecords, topUpBuildScopeField, topUpIntentOwnerByFamilyMember]);
    const campaignById = useMemo(() => {
        const index = new Map<string, AnyRecord>();
        campaigns.forEach(campaignRecord => index.set(campaignRecord.id, campaignRecord));
        return index;
    }, [campaigns]);
    const campaignIdsByEmailAccountId = useMemo(() => {
        const index = new Map<string, Set<string>>();
        if (!fields.emailAccounts) return index;
        campaigns.forEach(campaignRecord => {
            linkedIds(campaignRecord, fields.emailAccounts).forEach(accountId => {
                const campaignIds = index.get(accountId) ?? new Set<string>();
                campaignIds.add(campaignRecord.id);
                index.set(accountId, campaignIds);
            });
        });
        return index;
    }, [campaigns, fields.emailAccounts]);
    const emailAccountState = useCallback((accountRecord: AnyRecord) => {
        const accountStatus = optionName(accountRecord, emailAccountFields.status);
        const normalizedAccountStatus = accountStatus.trim().toLowerCase();
        const connectedValue = cellValue(accountRecord, emailAccountFields.connected);
        // When email_status exists, it is the authoritative connection gate:
        // only the exact Connected value is eligible for campaign selection.
        const statusAllowsConnection = emailAccountFields.status
            ? normalizedAccountStatus === 'connected'
            : connectedValue !== false;
        const explicitlyDisconnected = !statusAllowsConnection
            || connectedValue === false
            || /not connected|disconnected|inactive|failed|disabled/i.test(accountStatus);
        // Reconcile both sides of the Airtable relationship from prebuilt indexes. This avoids
        // rescanning every campaign for every sender during every render.
        const linkedCampaignIds = new Set(linkedIds(accountRecord, emailAccountFields.campaigns));
        campaignIdsByEmailAccountId.get(accountRecord.id)?.forEach(campaignId => linkedCampaignIds.add(campaignId));
        const linkedCampaigns = [...linkedCampaignIds]
            .map(campaignId => campaignById.get(campaignId))
            .filter((campaignRecord): campaignRecord is AnyRecord => !!campaignRecord);
        const linkedStates = linkedCampaigns.map(campaignSenderState);
        const linkedToSelectedCampaign = !!selected && linkedCampaigns.some(campaignRecord => campaignRecord.id === selected.id);
        const hasReleasingCampaign = linkedStates.some(state => state.releasingSoon);
        const hasSendingCampaign = linkedStates.some(state => state.sending);
        const hasQueuedCampaign = linkedStates.some(state => state.launchReady);
        const activeSendingValue = cellValue(accountRecord, emailAccountFields.activeSending);
        const explicitlySending = activeSendingValue === true || /^(sending|active|yes|true|1)$/i.test(String(activeSendingValue || '').trim());
        const warmupDaysValue = numericValue(accountRecord, emailAccountFields.warmupDays);
        const warmupDaysText = textValue(accountRecord, emailAccountFields.warmupDays).trim();
        const parsedWarmupDays = warmupDaysValue ?? (() => {
            const match = warmupDaysText.match(/-?\d+(?:\.\d+)?/);
            return match ? Number(match[0]) : null;
        })();
        const warmupStatusText = textValue(accountRecord, emailAccountFields.warmupStatus).trim().toLowerCase();
        const warmupStartDate = dateFor(accountRecord, emailAccountFields.warmupStart);
        const warmupAgeFromStart = warmupStartDate
            ? (Date.now() - warmupStartDate.getTime()) / (24 * 60 * 60 * 1000)
            : null;
        const warmingByDays = parsedWarmupDays !== null && parsedWarmupDays >= 0 && parsedWarmupDays < 14;
        // A checkbox can mean that automatic warmup is enabled indefinitely, so a
        // bare boolean true is not evidence that the account is still inside its
        // initial warming period. Only an explicit current-state label qualifies.
        const warmingByStatus = /^(?:warming|warm[\s-]?up|in warm[\s-]?up|warm[\s-]?up in progress)$/i.test(warmupStatusText);
        const warmingByStartDate = warmupAgeFromStart !== null && warmupAgeFromStart >= 0 && warmupAgeFromStart < 14;
        const explicitlyWarming = warmingByDays || warmingByStatus || warmingByStartDate;
        // Allocation and warmup are independent: a warming sender can be reserved.
        const state = explicitlyDisconnected ? 'disconnected'
            : hasSendingCampaign || explicitlySending ? 'sending'
            : hasQueuedCampaign ? 'reserved-next'
            : hasReleasingCampaign ? 'releasing-soon'
            : explicitlyWarming ? 'warming' : 'available';
        return {
            status: accountStatus,
            connected: !explicitlyDisconnected,
            state,
            sending: state === 'sending',
            warming: explicitlyWarming,
            releasingSoon: state === 'releasing-soon',
            reservedNext: state === 'reserved-next',
            available: state === 'available',
            selectable: state === 'available' || state === 'releasing-soon' || (state === 'warming' && !hasSendingCampaign && !explicitlySending && !hasQueuedCampaign) || linkedToSelectedCampaign,
        };
    }, [emailAccountFields, campaignById, campaignIdsByEmailAccountId, campaignSenderState, selected]);
    const emailAccountStateById = useMemo(() => {
        const states = new Map<string, ReturnType<typeof emailAccountState>>();
        safeEmailAccountRecords.forEach(accountRecord => states.set(accountRecord.id, emailAccountState(accountRecord)));
        return states;
    }, [safeEmailAccountRecords, emailAccountState]);
    const getEmailAccountState = useCallback((accountRecord: AnyRecord) => (
        emailAccountStateById.get(accountRecord.id) ?? emailAccountState(accountRecord)
    ), [emailAccountStateById, emailAccountState]);
    const workspaceEmailAccounts = useMemo(() => {
        const accountQuery = accountSearch.trim().toLowerCase();
        const normalizedScopeValue = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');
        const scopedAccounts = safeEmailAccountRecords.filter(accountRecord => {
            if (!accountRecord?.id) return false;
            const accountWorkspaceNames = comparableValues(accountRecord, emailAccountFields.workspace).map(value => value.toLowerCase());
            const accountClientNames = emailAccountClientFields
                .flatMap(clientField => {
                    const rawValues = comparableValues(accountRecord, clientField);
                    const renderedValue = textValue(accountRecord, clientField);
                    return [...rawValues, renderedValue];
                })
                .map(normalizedScopeValue)
                .filter(Boolean);
            const matchesWorkspace = selectedWorkspaceNames.length > 0
                && !!emailAccountFields.workspace
                && accountWorkspaceNames.some(value => selectedWorkspaceNames.includes(value));
            const matchesClient = selectedClientNamesForAccounts.length > 0
                && emailAccountClientFields.length > 0
                && (
                    accountClientNames.some(accountClient => selectedClientNamesForAccounts.some(selectedClientValue => {
                        const selectedClient = normalizedScopeValue(selectedClientValue);
                        return accountClient === selectedClient;
                    }))
                    || emailAccountClientFields.some(clientField =>
                        linkedIds(accountRecord, clientField).some(clientId => selectedClientIdsForAccounts.includes(clientId))
                    )
                );
            // Exact EmailBison workspace scope is authoritative. Client matching
            // is only a fallback for legacy records that have no workspace ID.
            const canMatchClient = selectedClientNamesForAccounts.length > 0 && emailAccountClientFields.length > 0;
            const canMatchWorkspace = selectedWorkspaceNames.length > 0 && !!emailAccountFields.workspace;
            const matchesSelectedScope = canMatchWorkspace
                ? matchesWorkspace
                : canMatchClient
                    ? matchesClient
                    : false;
            const accountName = textValue(accountRecord, emailAccountFields.name) || accountRecord.name || '';
            return matchesSelectedScope && (!accountQuery || accountName.toLowerCase().includes(accountQuery));
        }).sort((firstAccount, secondAccount) => {
            const firstSelected = selectedEmailAccountIds.includes(firstAccount.id) ? 1 : 0;
            const secondSelected = selectedEmailAccountIds.includes(secondAccount.id) ? 1 : 0;
            if (firstSelected !== secondSelected) return secondSelected - firstSelected;
            const firstSending = getEmailAccountState(firstAccount).sending ? 1 : 0;
            const secondSending = getEmailAccountState(secondAccount).sending ? 1 : 0;
            if (firstSending !== secondSending) return secondSending - firstSending;
            return (textValue(firstAccount, emailAccountFields.name) || firstAccount.name || '').localeCompare(textValue(secondAccount, emailAccountFields.name) || secondAccount.name || '');
        });
        const uniqueAccounts = new Map<string, typeof scopedAccounts[number]>();
        scopedAccounts.forEach(accountRecord => {
            const emailBisonId = String(cellValue(accountRecord, emailAccountFields.emailId) ?? '').trim();
            const normalizedEmail = (textValue(accountRecord, emailAccountFields.name) || accountRecord.name || '').trim().toLowerCase();
            const identity = emailBisonId ? `bison:${emailBisonId}` : normalizedEmail ? `email:${normalizedEmail}` : `record:${accountRecord.id}`;
            if (!uniqueAccounts.has(identity)) uniqueAccounts.set(identity, accountRecord);
        });
        return [...uniqueAccounts.values()];
    }, [safeEmailAccountRecords, emailAccountFields, emailAccountClientFields, selectedWorkspaceNames.join('|'), selectedClientNamesForAccounts.join('|'), selectedClientIdsForAccounts.join('|'), selectedEmailAccountIds.join('|'), accountSearch, getEmailAccountState]);
    const availableWorkspaceEmailAccounts = workspaceEmailAccounts.filter(accountRecord => {
        const accountState = getEmailAccountState(accountRecord);
        return accountState.available || (accountState.warming && accountState.selectable);
    });
    const visibleWorkspaceEmailAccounts = workspaceEmailAccounts.filter(accountRecord => {
        const accountState = getEmailAccountState(accountRecord);
        const isSelectedAccount = selectedEmailAccountIds.includes(accountRecord.id);
        if (senderStatusFilter === 'available') return accountState.available;
        if (senderStatusFilter === 'selected') return isSelectedAccount;
        if (senderStatusFilter === 'warming') return accountState.warming;
        if (senderStatusFilter === 'sending') return accountState.state === 'sending';
        if (senderStatusFilter === 'releasing-soon') return accountState.state === 'releasing-soon';
        if (senderStatusFilter === 'reserved-next') return accountState.state === 'reserved-next';
        if (senderStatusFilter === 'disconnected') return !accountState.connected;
        return true;
    });
    const visibleSelectableWorkspaceEmailAccounts = visibleWorkspaceEmailAccounts.filter(accountRecord => {
        const accountState = getEmailAccountState(accountRecord);
        if (selectedEmailAccountIds.includes(accountRecord.id)) return false;
        // Include idle warming accounts when planning under All statuses.
        // Explicit status filters still constrain the bulk selection.
        return senderStatusFilter === 'all'
            ? accountState.available || (accountState.warming && accountState.selectable)
            : senderStatusFilter === 'available' ? accountState.available : accountState.selectable;
    });
    const senderStatusCounts = workspaceEmailAccounts.reduce((counts, accountRecord) => {
        const state = getEmailAccountState(accountRecord).state as keyof typeof counts;
        if (state !== 'warming') counts[state] += 1;
        if (getEmailAccountState(accountRecord).warming) counts.warming += 1;
        return counts;
    }, {available: 0, warming: 0, sending: 0, 'releasing-soon': 0, 'reserved-next': 0, disconnected: 0});
    const selectedSenderDailyCapacity = selectedEmailAccountIds.reduce((total, accountId) => {
        const accountRecord = safeEmailAccountRecords.find(record => record.id === accountId);
        return total + (accountRecord ? numericValue(accountRecord, emailAccountFields.dailyLimit) ?? 0 : 0);
    }, 0);
    const selectedOutputType = selected ? (/\s+-\s+Generic(?: Emails)?\s*$/i.test(textValue(selected, fields.name) || selected.name) ? 'generic' : /\s+-\s+Direct(?: Emails)?\s*$/i.test(textValue(selected, fields.name) || selected.name) ? 'direct' : null) : null;
    const selectedVerifiedLeadCount = selectedOutputType === 'generic' ? selectedGenericLeadCount : selectedOutputType === 'direct' ? selectedDirectLeadCount : selectedGenericLeadCount + selectedDirectLeadCount;
    const selectedStepDelayDays = selected && fields.daysBetween
        ? Math.max(1, Number.parseInt(sequenceDelayDraft, 10) || numericValue(selected, fields.daysBetween) || Number.parseInt(optionName(selected, fields.daysBetween), 10) || 1)
        : 1;
    const supportedNewLeadsPerDay = selectedVerifiedLeadCount > 0
        ? Math.max(1, Math.floor(selectedVerifiedLeadCount / selectedStepDelayDays))
        : 0;
    const senderDailyLimits = workspaceEmailAccounts
        .map(accountRecord => numericValue(accountRecord, emailAccountFields.dailyLimit) ?? 0)
        .filter(limit => limit > 0)
        .sort((left, right) => left - right);
    const typicalSenderDailyLimit = senderDailyLimits.length
        ? senderDailyLimits[Math.floor(senderDailyLimits.length / 2)]
        : 15;
    const minimumOutputSenders = selectedOutputType ? Number(selectedVerifiedLeadCount > 0) : Number(selectedGenericLeadCount > 0) + Number(selectedDirectLeadCount > 0);
    const recommendedSenderCount = selectedVerifiedLeadCount > 0
        ? Math.max(minimumOutputSenders, Math.ceil(selectedVerifiedLeadCount / selectedStepDelayDays / Math.max(1, typicalSenderDailyLimit)))
        : 0;
    const senderSelectionTooSmall = minimumOutputSenders > 0 && selectedEmailAccountIds.length < minimumOutputSenders;
    // A campaign may use fewer senders than this ceiling. Preserve its selected allocation.
    const senderSelectionTooLarge = recommendedSenderCount > 0 && selectedEmailAccountIds.length > recommendedSenderCount;
    const senderSelectionBlocked = senderSelectionTooSmall || senderSelectionTooLarge;
    const selectedApprovalSource = selected ? textValue(selected, fields.campaignApprovalSource).toLowerCase() : '';
    const campaignApprovedByDulcy = selectedApprovalSource === 'internal approval exception';
    const clientHasApproved = !campaignApprovedByDulcy && (selectedApprovalSource === 'client approved' || selectedClientDecision.toLowerCase().includes('approve campaign'));
    const clientRequestedChanges = !campaignApprovedByDulcy && selectedApprovalSource !== 'client approved' && selectedClientDecision.toLowerCase().includes('request change');
    const selectedRequestedChangeArea = selected ? textValue(selected, fields.selectChanges) : '';
    const selectedPrimaryFeedback = selected ? textValue(selected, fields.reviewCopy) : '';
    const selectedAdditionalFeedback = selected ? [
        [fields.companyFeedback, 'Company size'],
        [fields.geographyFeedback, 'Geographic targeting'],
        [fields.industryFeedback, 'Industry targeting'],
        [fields.titleFeedback, 'Title targeting'],
        [fields.additionalContext, 'Additional context'],
    ].filter(([feedbackField]) => feedbackField && textValue(selected, feedbackField as AnyField)) : [];
    const selectedReplyRate = selected ? percentValue(selected, fields.replyRate) : null;
    const selectedInterestedRate = selected ? percentValue(selected, fields.interestedRate) : null;
    const selectedBounceRate = selected ? percentValue(selected, fields.bounceRate) : null;
    const selectedMeetingRate = selected ? percentValue(selected, fields.meetingRate) : null;
    const selectedReplyKpi = kpiPresentation(selectedReplyRate, 'reply');
    const selectedInterestedKpi = kpiPresentation(selectedInterestedRate, 'interested');
    const selectedBounceKpi = kpiPresentation(selectedBounceRate, 'bounce');
    const selectedMeetingKpi = kpiPresentation(selectedMeetingRate, 'meeting');
    const selectedEmailsPerLead = selected ? emailsPerPositiveReply(selected, fields.emailsSent, fields.interested) : null;
    const selectedEmailsPerMeeting = selected ? emailsPerMeeting(selected, fields.emailsSent, fields.meetings) : null;
    const selectedEmailsSent = selected ? numericValue(selected, fields.emailsSent) : null;
    const selectedOverallKpi = volumeAwareKpiPresentation(overallKpiPresentation(selectedReplyKpi, selectedInterestedKpi, selectedBounceKpi, selectedMeetingKpi, selectedReplyRate, selectedEmailsPerLead), selectedEmailsSent);
    const selectedKpiHealthReason = kpiHealthReason(selectedEmailsSent, selectedReplyRate, selectedInterestedRate, selectedBounceRate, selectedMeetingRate, selectedReplyKpi, selectedInterestedKpi, selectedBounceKpi, selectedMeetingKpi, selectedEmailsPerLead);
    const selectedNextMove = selected ? nextMovePresentation(selected, fields, agencyPositiveReplyRate, selectedPivotOptions) : null;
    const selectedLifecycle = useMemo(() => {
        if (!selected) return null;
        const status = optionName(selected, fields.status).trim().toLowerCase();
        const hasLeadList = linkedIds(selected, fields.leadList).length > 0;
        // Copy readiness is independent of approval and spintax processing.
        const hasReviewCopy = Boolean(textValue(selected, fields.subject1).trim() && textValue(selected, fields.body1).trim());
        const finalSubject = findField(campaignsTable, ['Campaign Email 1 Subject Version 1', 'Campaign Subject 1 Version 1', 'Campaign Email 1 Subject Spintax 1', 'Campaign Email 1 Subject']);
        const finalBody = findField(campaignsTable, ['Campaign Body 1 Version 1', 'Campaign Email 1 Body Spintax 1', 'Campaign Email 1 Body']);
        const hasSequenceCopy = Boolean(textValue(selected, finalSubject).trim() && textValue(selected, finalBody).trim());
        return campaignLifecycleState(status, hasLeadList, hasReviewCopy || hasSequenceCopy);
    }, [selected, fields, campaignsTable]);
    const selectedProgressRawValue = selected ? numericValue(selected, fields.progress) ?? 0 : 0;
    const selectedProgressBarWidth = Math.max(0, Math.min(100, selectedProgressRawValue <= 1 ? selectedProgressRawValue * 100 : selectedProgressRawValue));
    const selectedClientIds = useMemo(() => selected ? linkedIds(selected, fields.client) : [], [selected, fields.client]);
    const selectedClientNames = useMemo(() => selected ? comparableValues(selected, fields.client) : [], [selected, fields.client]);
    const clientLeadListOptions = useMemo(() => {
        if (!selected || !leadListsTable || !leadListFields.client) return [] as AnyRecord[];
        const campaignClientIds = linkedIds(selected, fields.client);
        const campaignClientNames = [
            ...comparableValues(selected, fields.client),
            textValue(selected, fields.client),
            clientFilter !== 'all' ? clientFilter : '',
        ];

        return leadListRecords.filter(leadListRecord =>
            leadListMatchesClient(leadListRecord, leadListFields.client, campaignClientIds, campaignClientNames)
        ).sort((firstLeadList, secondLeadList) =>
            (textValue(firstLeadList, leadListFields.name) || firstLeadList.name || '')
                .localeCompare(textValue(secondLeadList, leadListFields.name) || secondLeadList.name || '')
        );
    }, [selected, leadListsTable, leadListRecords, leadListFields, fields.client, clientFilter]);
    const creationLeadListOptions = useMemo(() => {
        if (!leadListsTable || !leadListFields.client || clientFilter === 'all') return [] as AnyRecord[];
        const targetClientIds = creationClientRecord ? [creationClientRecord.id] : [];
        return leadListRecords.filter(leadListRecord =>
            leadListMatchesClient(leadListRecord, leadListFields.client, targetClientIds, [clientFilter])
        ).sort((first, second) => (textValue(first, leadListFields.name) || first.name || '').localeCompare(textValue(second, leadListFields.name) || second.name || ''));
    }, [leadListsTable, leadListRecords, leadListFields, clientFilter, creationClientRecord]);

    const belongsToSelection = useCallback((record: AnyRecord, campaignField: AnyField | null, clientField: AnyField | null) => {
        if (!selected) return false;
        if (campaignField) return linkedIds(record, campaignField).includes(selected.id);
        if (!clientField) return false;
        const recordIds = linkedIds(record, clientField);
        if (recordIds.length && selectedClientIds.length) return recordIds.some(id => selectedClientIds.includes(id));
        return comparableValues(record, clientField).some(value => selectedClientNames.includes(value));
    }, [selected, selectedClientIds, selectedClientNames]);

    const relatedAnalytics = useMemo(() => analytics.filter(record =>
        belongsToSelection(record, analyticsFields.campaign, analyticsFields.client)
        && withinDays(record, analyticsFields.date, periodDays(timePeriod))
    ), [analytics, analyticsFields, belongsToSelection, timePeriod]);

    const relatedSequenceAnalytics = useMemo(() => sequenceAnalytics
        .filter(record => belongsToSelection(record, sequenceAnalyticsFields.campaign, null))
        .map(record => {
            const sent = numericValue(record, sequenceAnalyticsFields.sent) ?? 0;
            const replies = numericValue(record, sequenceAnalyticsFields.replies) ?? 0;
            const interested = numericValue(record, sequenceAnalyticsFields.interested) ?? 0;
            const bounces = numericValue(record, sequenceAnalyticsFields.bounces) ?? 0;
            return {
                record,
                step: numericValue(record, sequenceAnalyticsFields.step) ?? 0,
                variant: optionName(record, sequenceAnalyticsFields.variant) || textValue(record, sequenceAnalyticsFields.variant) || 'A',
                subject: textValue(record, sequenceAnalyticsFields.subject) || 'No subject',
                sent,
                replies,
                interested,
                bounces,
                replyRate: sent > 0 ? replies / sent * 100 : 0,
                // Variant quality measures how many replies were interested,
                // not how many sent emails became interested replies.
                interestedRate: replies > 0 ? interested / replies * 100 : 0,
                bounceRate: sent > 0 ? bounces / sent * 100 : 0,
                sampleStatus: sent >= 2000 ? 'Ideal' : sent >= 1000 ? 'Okay' : 'Not ideal',
            };
        })
        .sort((first, second) => first.step - second.step || first.variant.localeCompare(second.variant)),
    [sequenceAnalytics, sequenceAnalyticsFields, belongsToSelection]);

    const sequenceAnalyticsLeader = useMemo(() => [...relatedSequenceAnalytics].sort((first, second) =>
        second.interestedRate - first.interestedRate
        || second.replyRate - first.replyRate
        || second.sent - first.sent
    )[0] ?? null, [relatedSequenceAnalytics]);

    const sequenceAnalyticsTotals = useMemo(() => relatedSequenceAnalytics.reduce((totals, row) => ({
        sent: totals.sent + row.sent,
        replies: totals.replies + row.replies,
        interested: totals.interested + row.interested,
        bounces: totals.bounces + row.bounces,
    }), {sent: 0, replies: 0, interested: 0, bounces: 0}), [relatedSequenceAnalytics]);

    const relatedOverview = useMemo(() => overviews.filter(record => {
        if (!belongsToSelection(record, overviewFields.campaign, overviewFields.client)) return false;
        if (!overviewFields.period) return timePeriod === 'All time';
        return optionName(record, overviewFields.period).toLowerCase() === timePeriod.toLowerCase();
    }), [overviews, overviewFields, belongsToSelection, timePeriod]);

    const resetFilters = () => {
        setClientFilter('all'); setStatusFilter('all');
        setWorkspaceFilter('all'); setHealthFilter('all'); setDateRange('all'); setSearch('');
    };

    const clearCampaignAutomationStatus = async (snapshot: CampaignAutomationClearSnapshot) => {
        setBusy('clear-campaign-automation-status');
        setNotice(null);
        try {
            const current = campaignsRef.current.find(record => record.id === snapshot.recordId);
            if (!current) throw new Error('This campaign is no longer available. Nothing was cleared.');
            const update = campaignAutomationDismissalUpdate(current, fields, snapshot.fingerprint, Date.now());
            if (!campaignsTable.hasPermissionToUpdateRecords([{id: current.id, fields: update}])) throw new Error('You do not have permission to clear this campaign’s saved automation display.');
            await campaignsTable.updateRecordAsync(current, update);
            setNotice({kind: 'success', text: 'Saved automation display cleared. The operational request, execution history, and audit receipt were preserved.'});
        } catch (error) {
            setNotice({kind: 'error', text: error instanceof Error ? error.message : 'Could not clear the saved automation status.'});
            throw error;
        } finally {
            setBusy(null);
        }
    };

    const runAction = useCallback(async (label: string, action: () => Promise<void>, successText?: string | null) => {
        setBusy(label);
        setNotice(null);
        try {
            await action();
            if (successText !== null) {
                setNotice({kind: 'success', text: successText ?? `${label} completed.`});
            }
        } catch (error) {
            setNotice({
                kind: 'error',
                text: error instanceof Error ? error.message : `${label} failed.`,
            });
        } finally {
            setBusy(null);
        }
    }, []);

    const trackedOperationRecord = trackedOperation
        ? campaigns.find(record => record.id === trackedOperation.recordId) ?? null
        : null;
    const trackedOperationBisonId = trackedOperationRecord
        ? firstPopulatedTextValue(trackedOperationRecord, campaignsTable, FIELD_ALIASES.bisonId)
        : '';
    const trackedOperationCampaignStatus = trackedOperationRecord
        ? optionName(trackedOperationRecord, fields.status).toLowerCase()
        : '';
    const trackedOperationWorkflowStage = trackedOperationRecord
        ? optionName(trackedOperationRecord, fields.workflowStage).toLowerCase()
        : '';

    useEffect(() => {
        if (!trackedOperation || !trackedOperationRecord) return;

        if (trackedOperation.type === 'upload') {
            // Treat either the saved EmailBison ID or Airtable's final Uploaded
            // status as completion. Watching these primitive values makes this
            // react immediately even when Airtable reuses the records array.
            if (!trackedOperationBisonId && trackedOperationCampaignStatus !== 'uploaded') return;
            setNotice({
                kind: 'success',
                text: trackedOperationBisonId
                    ? `EmailBison upload complete for ${trackedOperation.campaignName}. Campaign ID: ${trackedOperationBisonId}.`
                    : `EmailBison upload complete for ${trackedOperation.campaignName}.`,
            });
            setTrackedOperation(null);
            return;
        }

        const isRunning = trackedOperationWorkflowStage === 'spintax in progress'
            || trackedOperationCampaignStatus !== 'spintax generated';

        if (!trackedOperation.sawRunningState && isRunning) {
            setTrackedOperation({...trackedOperation, sawRunningState: true});
            return;
        }

        if (trackedOperation.sawRunningState && trackedOperationCampaignStatus === 'spintax generated' && trackedOperationWorkflowStage !== 'spintax in progress') {
            setNotice({kind: 'success', text: `Spintax generation and validation complete for ${trackedOperation.campaignName}.`});
            setTrackedOperation(null);
        }
    }, [trackedOperation, trackedOperationRecord, trackedOperationBisonId, trackedOperationCampaignStatus, trackedOperationWorkflowStage]);

    const updateStatus = useCallback(async (record: AnyRecord, desired: string) => {
        if (!fields.status) throw new Error('A Campaign Status or Status field is required.');
        if (!hasChoice(fields.status, desired)) throw new Error(`Add the “${desired}” choice to ${fields.status.name} first.`);
        if (!campaignsTable.hasPermissionToUpdateRecord(record, {[fields.status.id]: selectWriteValue(fields.status, desired)})) {
            throw new Error('You do not have permission to update this campaign.');
        }
        await campaignsTable.updateRecordAsync(record, {[fields.status.id]: selectWriteValue(fields.status, desired)});
    }, [campaignsTable, fields.status]);

    const saveSelectedField = (field: AnyField | null, fieldValue: any, fieldLabel: string) => runAction(`Save ${fieldLabel}`, async () => {
        if (!selected || !field) throw new Error(`${fieldLabel} is not configured in Campaigns.`);
        const fieldUpdate = {[field.id]: fieldValue};
        if (!campaignsTable.hasPermissionToUpdateRecord(selected, fieldUpdate)) throw new Error(`You do not have permission to update ${fieldLabel}.`);
        await campaignsTable.updateRecordAsync(selected, fieldUpdate);
    }, null);

    const saveClientPivot = (field: AnyField | null, enabled: boolean, fieldLabel: string) => runAction(`Save ${fieldLabel}`, async () => {
        if (!selectedClientRecord) throw new Error('Link this campaign to a client before changing client-wide pivot options.');
        if (!clientsTable || !field) throw new Error(`${fieldLabel} is not configured in Workspace IDs.`);
        const clientUpdate = {[field.id]: selectWriteValue(field, enabled ? 'Enabled' : 'Disabled')};
        if (!clientsTable.hasPermissionToUpdateRecord(selectedClientRecord, clientUpdate)) {
            throw new Error(`You do not have permission to update ${fieldLabel} for this client.`);
        }
        await clientsTable.updateRecordAsync(selectedClientRecord, clientUpdate);
    }, `${fieldLabel} saved for this client and inherited by all linked campaigns.`);

    const saveCampaignThesis = (thesisValue: string) => runAction('Save campaign thesis', async () => {
        if (!selected || !fields.thesis) throw new Error('Campaign Thesis is not configured in Campaigns.');
        const cleanThesis = thesisValue.trim();
        const campaignUpdate = {[fields.thesis.id]: cleanThesis};
        if (!campaignsTable.hasPermissionToUpdateRecord(selected, campaignUpdate)) throw new Error('You do not have permission to update Campaign Thesis.');
        await campaignsTable.updateRecordAsync(selected, campaignUpdate);
        if (!selectedLeadListId) throw new Error('Campaign Thesis was saved, but this campaign does not have a linked Lead List record.');
        if (!leadListsTable || !leadListFields.icpDescription) throw new Error('Campaign Thesis was saved, but Lead Lists → ICP Description is not available in Campaign Center.');
        const targetingUpdate = {[leadListFields.icpDescription.id]: cleanThesis};
        await leadListsTable.updateRecordAsync(selectedLeadListId, targetingUpdate);
    }, 'Campaign thesis saved and copied into the linked Lead List targeting sentence.');

    const toggleCampaignEmailAccount = (accountId: string, shouldAttach: boolean) => runAction(shouldAttach ? 'Attach email account' : 'Remove email account', async () => {
        if (senderUpdatePending || senderUpdateDispatch.current) return;
        if (!selected || !fields.emailAccounts) throw new Error('Add a linked-record field named Email Accounts to Campaigns.');
        const nextAccountIds = shouldAttach
            ? [...new Set([...selectedEmailAccountIds, accountId])]
            : selectedEmailAccountIds.filter(existingAccountId => existingAccountId !== accountId);
        const accountUpdate = {[fields.emailAccounts.id]: nextAccountIds.map(id => ({id}))};
        if (!campaignsTable.hasPermissionToUpdateRecord(selected, accountUpdate)) throw new Error('You do not have permission to change campaign email accounts.');
        await campaignsTable.updateRecordAsync(selected, accountUpdate);
    }, null);

    const selectAvailableEmailAccounts = () => runAction('Select available email accounts', async () => {
        if (senderUpdatePending || senderUpdateDispatch.current) return;
        if (!selected || !fields.emailAccounts) throw new Error('Add a linked-record field named Email Accounts to Campaigns.');
        const requestedCount = Math.max(1, Math.floor(accountSelectionCount || 1));
        const accountIds = [...new Set([
            ...selectedEmailAccountIds,
            ...visibleSelectableWorkspaceEmailAccounts.slice(0, requestedCount).map(accountRecord => accountRecord.id),
        ])];
        if (!visibleSelectableWorkspaceEmailAccounts.length) throw new Error('No additional eligible sender accounts match the current filters.');
        const accountUpdate = {[fields.emailAccounts.id]: accountIds.map(id => ({id}))};
        if (!campaignsTable.hasPermissionToUpdateRecord(selected, accountUpdate)) throw new Error('You do not have permission to change campaign email accounts.');
        await campaignsTable.updateRecordAsync(selected, accountUpdate);
    }, null);

    const selectAllMatchingEmailAccounts = () => runAction('Select all matching email accounts', async () => {
        if (senderUpdatePending || senderUpdateDispatch.current) return;
        if (!selected || !fields.emailAccounts) throw new Error('Add a linked-record field named Email Accounts to Campaigns.');
        const matchingIds = visibleSelectableWorkspaceEmailAccounts.map(accountRecord => accountRecord.id);
        if (!matchingIds.length) throw new Error('No additional eligible sender accounts match the current filters.');
        const accountIds = [...new Set([...selectedEmailAccountIds, ...matchingIds])];
        const accountUpdate = {[fields.emailAccounts.id]: accountIds.map(id => ({id}))};
        if (!campaignsTable.hasPermissionToUpdateRecord(selected, accountUpdate)) throw new Error('You do not have permission to change campaign email accounts.');
        await campaignsTable.updateRecordAsync(selected, accountUpdate);
    }, null);

    const unselectAllEmailAccounts = () => runAction('Unselect all email accounts', async () => {
        if (senderUpdatePending || senderUpdateDispatch.current) return;
        if (!selected || !fields.emailAccounts) throw new Error('Add a linked-record field named Email Accounts to Campaigns.');
        if (!selectedEmailAccountIds.length) return;
        if (!window.confirm(`Unselect all ${selectedEmailAccountIds.length} email accounts from this campaign?`)) return;
        const accountUpdate = {[fields.emailAccounts.id]: []};
        if (!campaignsTable.hasPermissionToUpdateRecord(selected, accountUpdate)) throw new Error('You do not have permission to change campaign email accounts.');
        await campaignsTable.updateRecordAsync(selected, accountUpdate);
    }, null);

    const useRecommendedEmailAccounts = () => runAction('Use recommended email accounts', async () => {
        if (senderUpdatePending || senderUpdateDispatch.current) return;
        if (!selected || !fields.emailAccounts) throw new Error('Add a linked-record field named Email Accounts to Campaigns.');
        if (!recommendedSenderCount) throw new Error('Link a completed lead list before calculating the recommended sender count.');
        const eligibleSelectedIds = selectedEmailAccountIds.filter(accountId => {
            const accountRecord = safeEmailAccountRecords.find(record => record.id === accountId);
            return accountRecord ? getEmailAccountState(accountRecord).connected : false;
        });
        const fallbackIds = availableWorkspaceEmailAccounts.map(accountRecord => accountRecord.id);
        const recommendedIds = [...new Set([...eligibleSelectedIds, ...fallbackIds])].slice(0, recommendedSenderCount);
        if (recommendedIds.length < minimumOutputSenders) throw new Error(`Only ${recommendedIds.length} eligible sender account(s) are available; only ${minimumOutputSenders} are required to give each output a sender.`);
        const accountUpdate = {[fields.emailAccounts.id]: recommendedIds.map(id => ({id}))};
        if (!campaignsTable.hasPermissionToUpdateRecord(selected, accountUpdate)) throw new Error('You do not have permission to change campaign email accounts.');
        await campaignsTable.updateRecordAsync(selected, accountUpdate);
        setAccountSelectionCount(recommendedIds.length);
    }, 'Eligible sender accounts selected within the campaign maximum.');

    const saveLeadListField = (leadListField: AnyField | null, leadListFieldValue: any, leadListFieldLabel: string) => runAction(`Save ${leadListFieldLabel}`, async () => {
        if (!selectedLeadList || !leadListsTable || !leadListField) throw new Error(`${leadListFieldLabel} is not available on the linked Lead List record.`);
        const leadListFieldUpdate = {[leadListField.id]: leadListFieldValue};
        if (!leadListsTable.hasPermissionToUpdateRecord(selectedLeadList, leadListFieldUpdate)) throw new Error(`You do not have permission to update ${leadListFieldLabel}.`);
        await leadListsTable.updateRecordAsync(selectedLeadList, leadListFieldUpdate);
    }, null);

    const linkLeadListToCampaign = (leadListRecordId: string) => runAction('Link lead list', async () => {
        if (!selected || !campaignLeadListLinkField) throw new Error('Add a linked-record field named Lead List or Campaign Lead List to Campaigns.');
        if (!leadListRecordId) return;
        if (!clientLeadListOptions.some(record => record.id === leadListRecordId)) throw new Error('Choose a Lead List belonging to this campaign’s client.');
        const leadListUpdate = {[campaignLeadListLinkField.id]: [{id: leadListRecordId}]};
        if (!campaignsTable.hasPermissionToUpdateRecord(selected, leadListUpdate)) throw new Error('You do not have permission to link this Lead List.');
        await campaignsTable.updateRecordAsync(selected, leadListUpdate);
    }, null);

    const addWeekdayHours = (start: Date, hoursToAdd: number) => {
        const result = new Date(start);
        let remaining = hoursToAdd;
        while (remaining > 0) {
            result.setHours(result.getHours() + 1);
            const day = result.getDay();
            if (day !== 0 && day !== 6) remaining -= 1;
        }
        return result;
    };

    const moveWorkflow = (desiredWorkflow: string) => runAction(`Move to ${desiredWorkflow}`, async () => {
        if (!selected || !fields.workflowStage) throw new Error('Workflow Stage is not available.');
        if (!hasChoice(fields.workflowStage, desiredWorkflow)) throw new Error(`Workflow Stage is missing “${desiredWorkflow}”.`);
        const workflowUpdate: Record<string, any> = {[fields.workflowStage.id]: selectWriteValue(fields.workflowStage, desiredWorkflow)};
        if (desiredWorkflow === 'Client Review') {
            const submittedAt = new Date();
            if (!fields.clientReviewSubmittedAt || !fields.clientReviewAutoApproveAt) throw new Error('Client review timing fields are not available. Reload Airtable once, then try again.');
            workflowUpdate[fields.clientReviewSubmittedAt.id] = submittedAt.toISOString();
            workflowUpdate[fields.clientReviewAutoApproveAt.id] = addWeekdayHours(submittedAt, 48).toISOString();
            if (fields.campaignApprovalSource) workflowUpdate[fields.campaignApprovalSource.id] = '';
        }
        if (!campaignsTable.hasPermissionToUpdateRecord(selected, workflowUpdate)) throw new Error('You do not have permission to update Workflow Stage.');
        await campaignsTable.updateRecordAsync(selected, workflowUpdate);
    });

    const approveAndPrepareSequence = (skipClientApproval = false) => runAction(skipClientApproval ? 'Internally approve and prepare sequence' : 'Approve and prepare sequence', async () => {
        if (!selected) throw new Error('Select a campaign first.');
        if (!skipClientApproval && !clientHasApproved) throw new Error('Client feedback must say Approve Campaign first.');
        if (skipClientApproval && !skipApprovalConfirmed) throw new Error('Confirm that client approval is not required before using the exception.');
        const approvalSequenceUpdate: Record<string, any> = {};
        const seedApprovedCopy = (approvedTargetField: AnyField | null, reviewSourceField: AnyField | null) => {
            if (!approvedTargetField || !reviewSourceField) return;
            const reviewSourceValue = cellValue(selected, reviewSourceField);
            if (reviewSourceValue !== null && reviewSourceValue !== '') approvalSequenceUpdate[approvedTargetField.id] = reviewSourceValue;
        };
        const versionOneSubject = (stepNumber: number) => findField(campaignsTable, [`Campaign Email ${stepNumber} Subject Version 1`, `Campaign Email ${stepNumber} Subject`, `Campaign Subject ${stepNumber} Version 1`, `Campaign Email ${stepNumber} Subject Spintax 1`]);
        const versionOneBody = (stepNumber: number) => findField(campaignsTable, [`Campaign Body ${stepNumber} Version 1`, `Campaign Email ${stepNumber} Body Spintax 1`]);
        seedApprovedCopy(versionOneSubject(1), fields.subject1); seedApprovedCopy(versionOneBody(1), fields.body1);
        seedApprovedCopy(versionOneSubject(2), fields.subject2); seedApprovedCopy(versionOneBody(2), fields.body2);
        seedApprovedCopy(versionOneSubject(3), fields.subject3); seedApprovedCopy(versionOneBody(3), fields.body3);
        seedApprovedCopy(versionOneSubject(4), fields.subject4); seedApprovedCopy(versionOneBody(4), fields.body4);
        if (fields.workflowStage) {
            if (!hasChoice(fields.workflowStage, 'Approved')) throw new Error('Workflow Stage is missing “Approved”.');
            approvalSequenceUpdate[fields.workflowStage.id] = selectWriteValue(fields.workflowStage, 'Approved');
        }
        if (fields.campaignApprovalSource) approvalSequenceUpdate[fields.campaignApprovalSource.id] = skipClientApproval ? 'Internal approval exception' : 'Client approved';
        if (!Object.keys(approvalSequenceUpdate).length) throw new Error('No approved sequence fields are available. Enable the Campaign Subject/Body Version fields under Data → Fields.');
        if (!campaignsTable.hasPermissionToUpdateRecord(selected, approvalSequenceUpdate)) throw new Error('You do not have permission to prepare this sequence.');
        await campaignsTable.updateRecordAsync(selected, approvalSequenceUpdate);
        setSkipApprovalConfirmed(false);
        setTab('sequence');
    });

    const prepareSequenceFromReview = () => {
        if (!selected) return;
        return runAction('Prepare sequence from approved copy', async () => {
            const manualSequenceUpdate: Record<string, any> = {};
            const detectedVariantCounts: Record<number, number> = {};
            const sequenceTargetFields = (stepNumber: number, version: number) => ({
                subject: findField(campaignsTable, [
                    `Campaign Email ${stepNumber} Subject Version ${version}`,
                    `Campaign Subject ${stepNumber} Version ${version}`,
                    `Campaign Email ${stepNumber} Subject Spintax ${version}`,
                    ...(version === 1 ? [`Campaign Email ${stepNumber} Subject`] : []),
                ]),
                body: findField(campaignsTable, [
                    `Campaign Body ${stepNumber} Version ${version}`,
                    `Campaign Email ${stepNumber} Body Spintax ${version}`,
                    ...(version === 1 ? [`Campaign Email ${stepNumber} Body`] : []),
                ]),
            });
            const reviewSteps = [
                {number: 1, subject: fields.subject1, body: fields.body1, count: fields.variants1},
                {number: 2, subject: fields.subject2, body: fields.body2, count: fields.variants2},
                {number: 3, subject: fields.subject3, body: fields.body3, count: fields.variants3},
                {number: 4, subject: fields.subject4, body: fields.body4, count: fields.variants4},
            ];

            reviewSteps.forEach(reviewStep => {
                const subjectSource = reviewStep.subject ? cellValue(selected, reviewStep.subject) : '';
                const bodySource = reviewStep.body ? cellValue(selected, reviewStep.body) : '';
                const parsedSubjects = parseReviewVariants(subjectSource, `Email ${reviewStep.number} subject`, true);
                const parsedBodies = parseReviewVariants(bodySource, `Email ${reviewStep.number} body`);
                if (!parsedSubjects.values.length && !parsedBodies.values.length) return;
                if (!parsedBodies.values.length) throw new Error(`Email ${reviewStep.number} has a subject but no approved email body.`);
                if (parsedSubjects.structured && parsedBodies.structured && parsedSubjects.values.length !== parsedBodies.values.length) {
                    throw new Error(`Email ${reviewStep.number} has ${parsedSubjects.values.length} labelled subjects but ${parsedBodies.values.length} labelled bodies. The counts must match.`);
                }

                const detectedCount = Math.max(
                    parsedSubjects.structured ? parsedSubjects.values.length : 1,
                    parsedBodies.structured ? parsedBodies.values.length : 1,
                );
                if (detectedCount > 10) throw new Error(`Email ${reviewStep.number} contains more than 10 variants.`);
                detectedVariantCounts[reviewStep.number] = detectedCount;

                for (let variantIndex = 0; variantIndex < detectedCount; variantIndex += 1) {
                    const version = variantIndex + 1;
                    const target = sequenceTargetFields(reviewStep.number, version);
                    const subjectValue = parsedSubjects.structured
                        ? parsedSubjects.values[variantIndex]
                        : (parsedSubjects.values[0] ?? '');
                    const bodyValue = parsedBodies.structured
                        ? parsedBodies.values[variantIndex]
                        : parsedBodies.values[0];
                    if (!target.body) throw new Error(`Email ${reviewStep.number} detected Variant ${version}, but its Campaign Body Version ${version} field is missing.`);
                    if (subjectValue && !target.subject) throw new Error(`Email ${reviewStep.number} detected a subject for Variant ${version}, but its Campaign Subject Version ${version} field is missing.`);
                    manualSequenceUpdate[target.body.id] = bodyValue;
                    if (target.subject) manualSequenceUpdate[target.subject.id] = subjectValue;
                }

                if (reviewStep.count) {
                    const countText = String(detectedCount);
                    if (reviewStep.count.type === FieldType.SINGLE_SELECT) {
                        if (!hasChoice(reviewStep.count, countText)) throw new Error(`${reviewStep.count.name} is missing the “${countText}” option.`);
                        manualSequenceUpdate[reviewStep.count.id] = selectWriteValue(reviewStep.count, countText);
                    } else if (reviewStep.count.type === FieldType.NUMBER) {
                        manualSequenceUpdate[reviewStep.count.id] = detectedCount;
                    } else {
                        manualSequenceUpdate[reviewStep.count.id] = countText;
                    }
                }
            });

            if (!Object.keys(manualSequenceUpdate).length) throw new Error('No approved Email 1–4 review copy is available to copy.');
            const preview = Object.entries(detectedVariantCounts)
                .map(([stepNumber, count]) => `Email ${stepNumber}: ${count} ${count === 1 ? 'variant' : 'variants'}`)
                .join('\n');
            if (!window.confirm(`Refresh the sequence from approved copy?\n\n${preview}\n\nDetected variants will replace the matching sequence cards. Existing variants after the detected count will remain unchanged.`)) return;
            if (!campaignsTable.hasPermissionToUpdateRecord(selected, manualSequenceUpdate)) throw new Error('You do not have permission to update the final sequence.');
            await campaignsTable.updateRecordAsync(selected, manualSequenceUpdate);
            if (selectedId) {
                setSequenceVariantLimits(previousLimits => {
                    const updatedLimits = {...previousLimits};
                    Object.entries(detectedVariantCounts).forEach(([stepNumber, count]) => {
                        updatedLimits[`${selectedId}-${stepNumber}`] = count;
                    });
                    return updatedLimits;
                });
                setSequenceStepLimits(previousLimits => ({
                    ...previousLimits,
                    [selectedId]: Math.max(...Object.keys(detectedVariantCounts).map(Number)),
                }));
            }
            setNotice({kind: 'success', text: 'Approved copy refreshed. Detected split-test variants are now shown in Sequence.'});
        }, null);
    };

    const automationRequestUpdate = (record: AnyRecord | string, kind: string, label: string) => {
        if (!fields.automationRequest) throw new Error('Enable Campaign Automation Request under Data → Fields before starting this automation.');
        return {[fields.automationRequest.id]: JSON.stringify({kind, label, requestedAt: new Date().toISOString(),
            baselineStatus: typeof record === 'string' ? '' : optionName(record, fields.status),
            baselineBisonId: typeof record === 'string' ? '' : textValue(record, fields.bisonId)})};
    };

    const generateValidatedSpintax = () => {
        if (!selected) return;
        if (!window.confirm('Send this final sequence to the spintax generation and validation automation now?')) return;
        return runAction('Spintax generation request', async () => {
            if (!fields.createSpintax) throw new Error('Enable the create_spintax field under Data → Fields first.');
            const spintaxTriggerUpdate: Record<string, any> = {...automationRequestUpdate(selected, 'spintax', 'Generate and validate spintax'), [fields.createSpintax.id]: true};
            if (fields.workflowStage && hasChoice(fields.workflowStage, 'Spintax in Progress')) spintaxTriggerUpdate[fields.workflowStage.id] = selectWriteValue(fields.workflowStage, 'Spintax in Progress');
            if (!campaignsTable.hasPermissionToUpdateRecord(selected, spintaxTriggerUpdate)) throw new Error('You do not have permission to trigger spintax generation.');
            setTrackedOperation({
                type: 'spintax',
                recordId: selected.id,
                campaignName: textValue(selected, fields.name) || selected.name,
                sawRunningState: optionName(selected, fields.status).toLowerCase() !== 'spintax generated',
            });
            try {
                await campaignsTable.updateRecordAsync(selected, spintaxTriggerUpdate);
            } catch (error) {
                setTrackedOperation(null);
                throw error;
            }
        }, null);
    };

    const removeSequenceVariant = (removeStepNumber: number, removeVariantName: string, removeSubjectField: AnyField | null, removeBodyField: AnyField | null) => {
        if (!selected || !selectedId || removeVariantName.endsWith('A')) return;
        if (!window.confirm(`Delete Variant ${removeVariantName}? Its saved subject and email copy will be cleared.`)) return;
        return runAction(`Delete Variant ${removeVariantName}`, async () => {
            const removedVariantUpdate: Record<string, any> = {};
            if (removeSubjectField) removedVariantUpdate[removeSubjectField.id] = null;
            if (removeBodyField) removedVariantUpdate[removeBodyField.id] = null;
            if (Object.keys(removedVariantUpdate).length) {
                if (!campaignsTable.hasPermissionToUpdateRecord(selected, removedVariantUpdate)) throw new Error(`You do not have permission to delete Variant ${removeVariantName}.`);
                await campaignsTable.updateRecordAsync(selected, removedVariantUpdate);
            }
            const removedVariantLimitKey = `${selectedId}-${removeStepNumber}`;
            setSequenceVariantLimits({...sequenceVariantLimits, [removedVariantLimitKey]: Math.max(1, visibleVariantLimitForStep(removeStepNumber) - 1)});
        });
    };

    const createTopUpBuild = (record: AnyRecord, outsideKpi = false) => runAction('Create top-up list', async () => {
        if (outsideKpi && !manualTopUpAcknowledged) throw new Error('Acknowledge the KPI exception before starting this top-up.');
        if (!leadListsTable || !leadListFields.name || !fields.topUpLeadList || !campaignLeadListLinkField) throw new Error('Configure the campaign and Lead Lists links first.');
        const scopeField = findField(leadListsTable, ['Top-up Build Scope JSON']);
        if (!scopeField) throw new Error('Add Top-up Build Scope JSON to the interface data fields before creating a top-up.');

        if(Number(textValue(record,fields.bisonId))>0&&!/\s+-\s+(Generic|Direct) Emails\s*$/i.test(textValue(record,fields.name))){
        const attached = new Set([...linkedIds(record, campaignLeadListLinkField), ...linkedIds(record, fields.topUpLeadList)]);
        const sourceLists = leadListQueryRecords.filter(list => attached.has(list.id) && ((numericValue(list, leadListFields.finalGenericCount) ?? 0) + (numericValue(list, leadListFields.finalDirectCount) ?? 0) > 0));
        if (!sourceLists.length) throw new Error('This campaign has no attached completed list to use as the source.');
        const campaignClientIds = linkedIds(record, fields.client);
        const existing = leadListQueryRecords.find(list => {
            try { const scope = JSON.parse(textValue(list, scopeField) || '{}');
                return scope.version === 1 && scope.campaignRecordId === record.id && (scope.buildRecordId === list.id || scope.buildRecordId === 'pending') && Array.isArray(scope.sources) && scope.sources.length > 0 && linkedIds(list, leadListFields.client).some(id => campaignClientIds.includes(id)) && scope.mode === 'this-build-only' && !(numericValue(list, leadListFields.finalGenericCount) || numericValue(list, leadListFields.finalDirectCount));
            } catch { return false; }
        });
        if (existing) {
            const existingScope = JSON.parse(textValue(existing, scopeField));
            if (existingScope.buildRecordId === 'pending') await leadListsTable.updateRecordAsync(existing.id, {[scopeField.id]: JSON.stringify({...existingScope, buildRecordId:existing.id})});
            await campaignsTable.updateRecordAsync(record.id, {[fields.topUpLeadList.id]: [{id: existing.id}]});
            return;
        }
        const source = sourceLists.find(list => list.id === selectedLeadListId) ?? sourceLists[0];
        const sourceClientIds = linkedIds(source, leadListFields.client);
        if (!sourceClientIds.some(id => campaignClientIds.includes(id))) throw new Error('Source list and campaign client do not match.');
        const sources = sourceLists.map(list => {
            if (!linkedIds(list, leadListFields.client).some(id => campaignClientIds.includes(id))) throw new Error('An attached exclusion list belongs to a different client.');
            const sheetId = textValue(list, leadListFields.link).match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)?.[1];
            if (!sheetId) throw new Error('An attached source list is missing its Google Sheet.');
            const tabs = [];
            if ((numericValue(list, leadListFields.finalDirectCount) ?? 0) > 0) tabs.push('Final Direct');
            if ((numericValue(list, leadListFields.finalGenericCount) ?? 0) > 0) tabs.push('Final Generic');
            return {recordId: list.id, sheetId, tabs};
        });
        // Keep the earlier source chain when a campaign receives more than one top-up.
        for (const list of sourceLists) {
            const raw = textValue(list, scopeField); if (!raw) continue;
            let prior: any; try { prior = JSON.parse(raw); } catch { throw new Error('An attached list has an invalid top-up scope.'); }
            if (prior.version !== 1 || prior.mode !== 'this-build-only' || prior.buildRecordId !== list.id || prior.campaignRecordId !== record.id || !Array.isArray(prior.sources)) throw new Error('An attached top-up belongs to a different build or campaign.');
            for (const entry of prior.sources) {
                if (!/^rec[a-zA-Z0-9]+$/.test(entry.recordId) || !/^[-_a-zA-Z0-9]+$/.test(entry.sheetId) || !Array.isArray(entry.tabs) || !entry.tabs.length || entry.tabs.some((tab: string) => !['Final Direct','Final Generic'].includes(tab))) throw new Error('An earlier exclusion source is invalid.');
                const found = sources.find(item => item.recordId === entry.recordId);
                if (found && found.sheetId !== entry.sheetId) throw new Error('An earlier exclusion source has conflicting sheet links.');
                if (found) found.tabs = [...new Set([...found.tabs, ...entry.tabs])] as string[];
                else sources.push({recordId:entry.recordId, sheetId:entry.sheetId, tabs:[...entry.tabs]});
            }
        }
        const scope = {version: 1, mode: 'this-build-only', buildRecordId: 'pending', campaignRecordId: record.id, createdAt: new Date().toISOString(), sources};
        const values: Record<string, any> = {};
        const copyNames = ['Client','Source Type','Third-Party Source Method','ICP Description','List Thesis','DiscoLike Company Filters JSON','Included Industries','Included Countries','Excluded Industries','Included States','Employee Range','Homepage Keywords','State Filters','Industry Filters','Excluded Industry Filters','Country Filters','Include Generic Emails','Include Direct Contacts','Target Personas','Contact Persona DNA','Contact Source','Contact Filters JSON','Generic Verification Provider','Direct Verification Provider','Verification Provider','Catch-All Policy','Role Email Policy','Free Email Policy','SEG Rule','Custom Variables Requested','Column Mapping JSON','Workflow Template','Use DiscoGen Deep Review','DiscoGen Deep Review Prompt','DiscoGen Deep Review Additional Requirements','Expansion Target'];
        for (const name of copyNames) {
            const field = findField(leadListsTable, [name]); if (!field) continue;
            const value = source.getCellValue(field); if (value === null || value === undefined) continue;
            values[field.id] = field.type === FieldType.MULTIPLE_RECORD_LINKS ? (value as any[]).map(item => ({id:item.id})) : field.type === FieldType.SINGLE_SELECT ? {name:(value as any).name} : field.type === FieldType.MULTIPLE_SELECTS ? (value as any[]).map(item => ({name:item.name})) : value;
        }
        const name = (textValue(source, leadListFields.name) || source.name) + ' — Top-up ' + new Date().toISOString().slice(0,16).replace('T',' ');
        values[leadListFields.name.id] = name;
        const fileNameField = findField(leadListsTable, ['File Name']); if (fileNameField) values[fileNameField.id] = name;
        values[scopeField.id] = JSON.stringify(scope);
        if (leadListFields.campaign) values[leadListFields.campaign.id] = [{id:record.id}];
        for (const name of ['Automation Action','Enrichment Action','QA Action']) { const field=findField(leadListsTable,[name]); if(field) values[field.id]=null; }
        if (leadListFields.stage && hasChoice(leadListFields.stage,'Source & ICP')) values[leadListFields.stage.id]=selectWriteValue(leadListFields.stage,'Source & ICP');
        if (leadListFields.processingStatus && hasChoice(leadListFields.processingStatus,'Not Started')) values[leadListFields.processingStatus.id]=selectWriteValue(leadListFields.processingStatus,'Not Started');
        if (!leadListsTable.hasPermissionToCreateRecord(values)) throw new Error('You do not have permission to create the top-up list.');
        if (!campaignsTable.hasPermissionToUpdateRecord(record, {[fields.topUpLeadList.id]: []})) throw new Error('You do not have permission to link the top-up list.');
        const id = await leadListsTable.createRecordAsync(values);
        await leadListsTable.updateRecordAsync(id, {[scopeField.id]: JSON.stringify({...scope, buildRecordId:id})});
        await campaignsTable.updateRecordAsync(record.id, {[fields.topUpLeadList.id]: [{id}]});

            return;
        }

        const initial=readParentFirstContext(campaigns,leadListRecords,record.id,undefined,selectedWorkspaceNames.length===1?selectedWorkspaceNames[0]:undefined);
        const lockId=initial.plan.rootRecordId;
        if(parentFirstInFlight.has(lockId))throw new Error('This family already has a top-up creation in progress.');
        parentFirstInFlight.add(lockId);
        let fresh:any;
        try{
          fresh=readParentFirstContext(campaigns,leadListRecords,record.id,undefined,selectedWorkspaceNames.length===1?selectedWorkspaceNames[0]:undefined);
          const plan=fresh.plan;
          if(plan.rootRecordId!==lockId)throw Error('Canonical parent changed; no list created.');
          if(plan.unfinishedRecordId){
            const existing=fresh.listRecords.find((r:AnyRecord)=>r.id===plan.unfinishedRecordId);
            const existingScope=JSON.parse(textValue(existing,scopeField));
            if(existingScope.buildRecordId==='pending')await leadListsTable.updateRecordAsync(existing.id,{[scopeField.id]:JSON.stringify({...existingScope,buildRecordId:existing.id})});
            await linkParentFirstIntent(campaignsTable,campaigns,leadListRecords,plan,existing.id,selectedWorkspaceNames.length===1?selectedWorkspaceNames[0]:undefined);
            return;
          }
          const source=fresh.listRecords.find((r:AnyRecord)=>r.id===plan.originalListId);
          if(!source)throw Error('Original full source list missing; no child fallback.');
          const scope={...plan.manifest,createdAt:new Date().toISOString()};
        const values: Record<string, any> = {};
        const copyNames = ['Client','Source Type','Third-Party Source Method','ICP Description','List Thesis','DiscoLike Company Filters JSON','Included Industries','Included Countries','Excluded Industries','Included States','Employee Range','Homepage Keywords','State Filters','Industry Filters','Excluded Industry Filters','Country Filters','Include Generic Emails','Include Direct Contacts','Target Personas','Contact Persona DNA','Contact Source','Contact Filters JSON','Generic Verification Provider','Direct Verification Provider','Verification Provider','Catch-All Policy','Role Email Policy','Free Email Policy','SEG Rule','Custom Variables Requested','Column Mapping JSON','Workflow Template','Use DiscoGen Deep Review','DiscoGen Deep Review Prompt','DiscoGen Deep Review Additional Requirements','Expansion Target'];
        for (const name of copyNames) {
            const field = findField(leadListsTable, [name]); if (!field) continue;
            const value = source.getCellValue(field); if (value === null || value === undefined) continue;
            values[field.id] = field.type === FieldType.MULTIPLE_RECORD_LINKS ? (value as any[]).map(item => ({id:item.id})) : field.type === FieldType.SINGLE_SELECT ? {name:(value as any).name} : field.type === FieldType.MULTIPLE_SELECTS ? (value as any[]).map(item => ({name:item.name})) : value;
        }
        const name = (textValue(source, leadListFields.name) || source.name) + ' — Top-up ' + new Date().toISOString().slice(0,16).replace('T',' ');
        values[leadListFields.name.id] = name;
        const fileNameField = findField(leadListsTable, ['File Name']); if (fileNameField) values[fileNameField.id] = name;
        values[scopeField.id] = JSON.stringify(scope);
        if (leadListFields.campaign) values[leadListFields.campaign.id] = [{id:plan.rootRecordId}];
        for (const name of ['Automation Action','Enrichment Action','QA Action']) { const field=findField(leadListsTable,[name]); if(field) values[field.id]=null; }
        if (leadListFields.stage && hasChoice(leadListFields.stage,'Source & ICP')) values[leadListFields.stage.id]=selectWriteValue(leadListFields.stage,'Source & ICP');
        if (leadListFields.processingStatus && hasChoice(leadListFields.processingStatus,'Not Started')) values[leadListFields.processingStatus.id]=selectWriteValue(leadListFields.processingStatus,'Not Started');

          if(!leadListsTable.hasPermissionToCreateRecord(values))throw Error('No permission to create the parent-derived top-up.');
          for(const rid of plan.familyRecordIds)if(!campaignsTable.hasPermissionToUpdateRecord(rid,{[fields.topUpLeadList.id]:[]}))throw Error('No permission to link both destinations.');
          const id=await leadListsTable.createRecordAsync(values);
          await leadListsTable.updateRecordAsync(id,{[scopeField.id]:JSON.stringify({...scope,buildRecordId:id})});
          const created=leadListsTable.getRecordByIdIfExists?.(id);
          if(!created)throw Error('Top-up draft was created but is not loaded yet. Reopen either family campaign and continue the existing build; do not create another.');
          await linkParentFirstIntent(campaignsTable,campaigns,[...leadListRecords,created],plan,id,selectedWorkspaceNames.length===1?selectedWorkspaceNames[0]:undefined);
        }finally{parentFirstInFlight.delete(lockId);}
    });

    const adoptExistingCompletedTopUp = (record:AnyRecord)=>runAction('Use existing completed top-up',async()=>{
      if(!existingTopUpChoice||!fields.topUpLeadList||!topUpUploadReceiptField||!leadListsTable)throw Error('Enable Top-up Lead List and Top-up Upload Receipt JSON in this interface, then choose the completed list.');
      const candidate=ManagedTopUp.candidatePlan({...managedTopUpInputs(),selectedRecordId:record.id,currentListId:existingTopUpChoice,complete:true});
      const list=leadListRecords.find(r=>r.id===existingTopUpChoice);if(!list)throw Error('The completed list is no longer loaded.');
      const serverField=campaignsTable.getFieldIfExists?.('fld0DL0enVj3G1fUJ');if(!serverField||serverField.isComputed)throw Error('Enable the editable EmailBison Base URL field in this interface.');
      for(const id of candidate.plan.familyRecordIds){const campaign=campaignsTable.getRecordByIdIfExists?.(id)??campaigns.find(r=>r.id===id);if(!campaign)throw Error('Exact campaign family is not loaded.');const prior=textValue(campaign,serverField).trim().replace(/\/+$/,'');if(prior&&prior!=='https://send.dulcy.io')throw Error('An existing campaign connection points to another server. Review it before proceeding.');if(!campaignsTable.hasPermissionToUpdateRecord(campaign,{[fields.topUpLeadList.id]:[{id:list.id}],[serverField.id]:'https://send.dulcy.io'}))throw Error('You cannot link this completed top-up to its exact campaign family.');}
      if(!leadListsTable.hasPermissionToUpdateRecord(list,{[topUpUploadReceiptField.id]:''}))throw Error('You cannot save the source-bound top-up preparation.');
      const response=await fetch(CAMPAIGN_TOP_UP_PREPARE_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sourceId:list.id,selectedRecordId:record.id,expectedRevision:candidate.revisionText,apiKey:textValue(record,fields.bisonApiKey).trim()})});
      let receipt;try{receipt=JSON.parse(await response.text());}catch{throw Error('Preparation did not return a verified receipt. No upload was requested.');}
      if(!response.ok||receipt.ok!==true)throw Error(receipt.message||'Existing imports or the final source could not be verified. No upload was permitted.');
      const fresh=ManagedTopUp.candidatePlan({...managedTopUpInputs(),selectedRecordId:record.id,currentListId:list.id,complete:true});
      if(receipt.sourceId!==list.id||receipt.state!=='prepared'||receipt.baseUrl!=='https://send.dulcy.io'||!/^([a-f0-9]{64})$/.test(receipt.revisionHash??'')||!/^([a-f0-9]{64})$/.test(receipt.contentHash??'')||!receipt.uploadId||(!Number.isFinite(Date.parse(receipt.expiresAt))||Date.parse(receipt.expiresAt)<=Date.now())||ManagedTopUp.canonical(receipt.binding?.sourceRevision)!==fresh.revisionText||ManagedTopUp.canonical(receipt.binding?.destinations)!==ManagedTopUp.canonical(fresh.plan.destinations))throw Error('The source or destinations changed during preparation. Nothing was uploaded.');
      await leadListsTable.updateRecordAsync(list.id,{[topUpUploadReceiptField.id]:JSON.stringify(receipt)});
      await campaignsTable.updateRecordsAsync(fresh.plan.familyRecordIds.map(id=>({id,fields:{[fields.topUpLeadList.id]:[{id:list.id}],[serverField.id]:receipt.baseUrl}})));
      const linked=readParentFirstContext(campaigns.map(r=>campaignsTable.getRecordByIdIfExists?.(r.id)??r),leadListRecords,record.id,list.id);
      if(ManagedTopUp.canonical(linked.plan.destinations)!==ManagedTopUp.canonical(fresh.plan.destinations)||fresh.plan.familyRecordIds.some(id=>!linkedIds(campaignsTable.getRecordByIdIfExists?.(id)??campaigns.find(r=>r.id===id),fields.topUpLeadList).includes(list.id)))throw Error('Family linkage is incomplete. Re-select this existing list; do not create or upload another one.');
      setNotice({kind:'success',text:`Existing top-up selected: ${fresh.counts.generic} generic and ${fresh.counts.direct} direct. Original lists preserved. Nothing uploaded.`});
    });

    const requestCampaignTopUp = (record: AnyRecord, outsideKpi = false) => runAction('Top up campaign', async () => {
        if (outsideKpi && !manualTopUpAcknowledged) throw new Error('Acknowledge that this campaign has not reached the KPI threshold before topping it up.');
        if (!selectedTopUpLeadList || !selectedTopUpLeadListId) throw new Error('Select the completed lead list you want to add.');
        if(!selectedPreparedReceipt)throw Error('Use existing completed top-up to refresh its exact source and import checks before uploading.');
        if (selectedTopUpLeadListId === selectedLeadListId) throw new Error('Choose a different lead list. The original campaign list is already attached.');
        const topUpSheetLink = textValue(selectedTopUpLeadList, leadListFields.link).trim();
        if (!topUpSheetLink) throw new Error('The selected top-up list does not have its final Google Sheet link yet.');
        if (!textValue(record, fields.bisonApiKey).trim()) throw new Error('This client does not have an EmailBison API key connected.');
        const explicitTopUpBaseUrl = FIELD_ALIASES.bisonBaseUrl
            .map(alias => textValue(record, findField(campaignsTable, [alias])).trim())
            .find(value => value.length > 0);
        const topUpBaseUrl = (explicitTopUpBaseUrl || '').replace(/\/+$/, '');
        if (!/^https:\/\/[^/\s]+$/.test(topUpBaseUrl)) throw new Error('Set EmailBison Base URL to the HTTPS server for this campaign before topping it up.');
        if (!selectedTopUpGenericCount && !selectedTopUpDirectCount) throw new Error('The selected top-up list has no final Generic or Direct leads.');


        const requestedName=textValue(record,fields.name)||record.name;
        const familyContext=readParentFirstContext(campaigns,leadListRecords,record.id,selectedTopUpLeadListId,selectedWorkspaceNames.length===1?selectedWorkspaceNames[0]:undefined);
        const plan=familyContext.plan;
        const targets=plan.destinations.map((target:any)=>({...target,campaignName:target.outputType+' destination',expectedRows:target.outputType==='generic'?selectedTopUpGenericCount:selectedTopUpDirectCount}));
        const familyExclusion={familyRecordIds:plan.familyRecordIds,readinessRecordIds:[selectedTopUpLeadListId,...plan.sources.map((source:any)=>source.recordId)],parentFirstManifest:plan.manifest};
        const totalQualified = selectedTopUpGenericCount + selectedTopUpDirectCount;
        const topUpName = textValue(selectedTopUpLeadList, leadListFields.name) || selectedTopUpLeadList.name;
        const thresholdWarning = outsideKpi ? ' This campaign has not reached the KPI top-up threshold, and you chose to proceed anyway.' : '';
        if (!window.confirm(`Add up to ${new Intl.NumberFormat().format(totalQualified)} qualified leads from ${topUpName} to ${requestedName}? Existing EmailBison leads will be skipped.${thresholdWarning}`)) return;

        const requestUpdate: Record<string, any> = {...automationRequestUpdate(record, 'topup', 'Top up campaign')};
        if (fields.topUpRequest) requestUpdate[fields.topUpRequest.id] = true;
        if (fields.topUpStatus) requestUpdate[fields.topUpStatus.id] = selectWriteValue(fields.topUpStatus, 'Requested');
        if (fields.topUpAdded) requestUpdate[fields.topUpAdded.id] = 0;
        if (fields.topUpSkipped) requestUpdate[fields.topUpSkipped.id] = 0;
        if (fields.topUpFailed) requestUpdate[fields.topUpFailed.id] = 0;
        if (fields.topUpMessage) requestUpdate[fields.topUpMessage.id] = `Queued ${topUpName} for duplicate-safe import.`;
        await leadListsTable.updateRecordAsync(selectedTopUpLeadListId,{[topUpUploadReceiptField.id]:JSON.stringify({...selectedPreparedReceipt,state:'requested',requestedAt:new Date().toISOString()})});
        if (Object.keys(requestUpdate).length) await campaignsTable.updateRecordAsync(record, requestUpdate);

        const response = await fetch(CAMPAIGN_TOP_UP_WEBHOOK_URL, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                uploadPreparation:selectedPreparedReceipt,
                parentRecordId: record.id,
                topUpLeadListId: selectedTopUpLeadListId,
                topUpLeadListName: topUpName,
                projectSheetLink: topUpSheetLink,
                apiKey: textValue(record, fields.bisonApiKey).trim(),
                baseUrl: topUpBaseUrl,
                targets,
                ...familyExclusion,
            }),
        });
        const responseText = await response.text();
        if (!response.ok) throw new Error(responseText || `The top-up automation returned ${response.status}.`);
        setNotice({kind: 'success', text: 'Top-up started. This campaign will show the added, skipped, and failed totals when EmailBison finishes checking duplicates.'});
    });

    const updateCampaignSenders = async () => {
        if (!selected || senderUpdateDispatch.current || senderUpdatePending) return;
        senderUpdateDispatch.current = true;
        try { await runAction('Update campaign senders', async () => {
            if (!fields.senderUpdateState) throw new Error('Enable Sender Update State JSON under this interface’s Data → Fields.');
            if (!/^\d+$/.test(textValue(selected, fields.bisonId).trim())) throw new Error('Open the existing EmailBison output campaign to update its senders.');
            if (pendingBisonChange(selected, fields)) throw new Error('Wait for the pending campaign action to finish first.');
            const senderRecordIds = [...new Set(linkedIds(selected, fields.emailAccounts))];
            if (!senderRecordIds.length || senderRecordIds.length > 1000) throw new Error('Select between 1 and 1000 sender accounts.');
            if (senderRecordIds.some(id => !workspaceEmailAccounts.some(account => account.id === id))) throw new Error('All selected senders must belong to this campaign’s client workspace.');
            if (!window.confirm(`Update this campaign to use exactly the ${senderRecordIds.length} selected sender accounts? The campaign will pause while accounts are replaced and checked. It resumes only if it was running beforehand; paused or completed campaigns stay paused.`)) return;
            const requestId = crypto.randomUUID();
            const state = {requestId, senderRecordIds, status:'Requested', requestedAt:new Date().toISOString(), message:'Sender update requested. Waiting for n8n to confirm the result.'};
            const update = {[fields.senderUpdateState.id]:JSON.stringify(state)};
            if (!campaignsTable.hasPermissionToUpdateRecord(selected, update)) throw new Error('You do not have permission to update campaign senders.');
            await campaignsTable.updateRecordAsync(selected, update);
            try {
                const response = await fetch(CAMPAIGN_SENDER_UPDATE_WEBHOOK_URL, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({recordId:selected.id, requestId, senderRecordIds})});
                if (!response.ok) throw new Error(`Request returned HTTP ${response.status}.`);
                setNotice({kind:'success', text:'Sender update requested. The saved status below will show the verified result.'});
            } catch {
                // A lost response does not prove n8n failed to receive the request.
                // Keep the same request pending; never auto-submit a replacement.
                setNotice({kind:'error', text:'Delivery could not be confirmed. Check the sender update status before retrying; the automation may still be running.'});
            }
        }); } finally { senderUpdateDispatch.current = false; }
    };

    const requestBisonAction = (record: AnyRecord, action: 'Launch' | 'Pause' | 'Delete') => runAction(`${action} campaign`, async () => {
        if (action === 'Launch') assertLeadReadiness(record);
        if (senderUpdateBlocked(record, fields.senderUpdateState)) throw new Error('Finish or review the sender update before changing campaign status.');
        if (!fields.bisonAction) throw new Error('Add a single-select field named Bison Action with Launch, Pause, and Delete choices.');
        if (!hasChoice(fields.bisonAction, action)) throw new Error(`Add the “${action}” choice to ${fields.bisonAction.name}.`);
        const requestedName = textValue(record, fields.name) || record.name;
        const requestedLeadListIds = linkedIds(record, campaignLeadListLinkField);
        const isParentCampaign = !/\s+-\s+(?:Generic|Direct) Emails\s*$/i.test(requestedName);
        if (isParentCampaign && (action === 'Launch' || action === 'Pause')) {
            const childNames = new Set([
                (baseCampaignName(requestedName) + CAMPAIGN_OUTPUT_SUFFIXES.generic).toLowerCase(),
                (baseCampaignName(requestedName) + CAMPAIGN_OUTPUT_SUFFIXES.direct).toLowerCase(),
            ]);
            const children = campaigns.filter(candidate =>
                childNames.has(textValue(candidate, fields.name).trim().toLowerCase())
                && linkedIds(candidate, campaignLeadListLinkField).some(id => requestedLeadListIds.includes(id))
            );
            if (children.length) {
                if (children.some(child => senderUpdateBlocked(child, fields.senderUpdateState))) throw new Error('A campaign output has a sender update in progress. Finish it before changing campaign status.');
                const applicableChildren = children;
                if (action === 'Launch') applicableChildren.forEach(assertLeadReadiness);
                const missingRemoteCampaign = applicableChildren.filter(child => !textValue(child, fields.bisonId));
                if (missingRemoteCampaign.length) throw new Error('Create and finish uploading every applicable campaign output before requesting this action.');
                for (const child of applicableChildren) {
                    if (optionName(child, fields.bisonAction)) {
                        await campaignsTable.updateRecordAsync(child, {[fields.bisonAction.id]: null});
                        await new Promise(resolve => window.setTimeout(resolve, 300));
                    }
                    await campaignsTable.updateRecordAsync(child, {...automationRequestUpdate(child, action, `${action} campaign`), [fields.bisonAction.id]: selectWriteValue(fields.bisonAction, action)});
                }
                setNotice({kind: 'success', text: `${action} requested for ${applicableChildren.map(child => textValue(child, fields.name)).join(' and ')}.`});
                return;
            }
        }
        const actionUpdate = {...automationRequestUpdate(record, action, `${action} campaign`), [fields.bisonAction.id]: selectWriteValue(fields.bisonAction, action)};
        if (!campaignsTable.hasPermissionToUpdateRecord(record, actionUpdate)) throw new Error(`You do not have permission to request ${action.toLowerCase()}.`);
        // “When record matches conditions: Bison Action is not empty” only
        // fires when the record transitions from empty to non-empty. Clear any
        // previous action first—even a different one—so every button click
        // creates a new qualifying transition.
        if (optionName(record, fields.bisonAction)) {
            const resetUpdate = {[fields.bisonAction.id]: null};
            if (!campaignsTable.hasPermissionToUpdateRecord(record, resetUpdate)) throw new Error('You do not have permission to reset the previous EmailBison action.');
            await campaignsTable.updateRecordAsync(record, resetUpdate);
            await new Promise(resolve => window.setTimeout(resolve, 500));
        }
        await campaignsTable.updateRecordAsync(record, actionUpdate);
        if (action === 'Delete') setSelectedId(null);
    }, `${action} request submitted to the Airtable automation. Check its run history or EmailBison for the final result.`);

    const triggerBisonUpload = async (record: AnyRecord | string, knownStatus?: string) => {
        const status = knownStatus ?? (typeof record === 'string' ? '' : optionName(record, fields.status));
        if (status.toLowerCase() !== 'spintax generated') throw new Error('Generate and validate the final spintax before uploading to EmailBison. Campaign Status must be Spintax Generated.');
        if (!fields.uploadToBison) throw new Error('Select Trigger Automation under Custom properties → EmailBison upload trigger, or add a checkbox named Upload to EmailBison.');
        let uploadTriggerValue: any = true;
        if (fields.uploadToBison.type === FieldType.SINGLE_SELECT) {
            const uploadChoice = ['Upload', 'Create Draft', 'Requested'].find(choice => hasChoice(fields.uploadToBison, choice));
            if (!uploadChoice) throw new Error(`Add an “Upload” choice to ${fields.uploadToBison.name}.`);
            uploadTriggerValue = selectWriteValue(fields.uploadToBison, uploadChoice);
        }
        const uploadUpdate: Record<string, any> = {...automationRequestUpdate(record, 'upload', 'Create EmailBison campaign'), [fields.uploadToBison.id]: uploadTriggerValue};
        // Give every actual upload a slightly different daily send window. The
        // settings remain editable, but EmailBison will not receive the exact
        // same start/end minute for every campaign.
        if (fields.startTime) uploadUpdate[fields.startTime.id] = randomizedTimeWithinHour(8);
        if (fields.endTime) uploadUpdate[fields.endTime.id] = randomizedTimeWithinHour(18);
        if (fields.workflowStage && hasChoice(fields.workflowStage, 'Build Ready')) uploadUpdate[fields.workflowStage.id] = selectWriteValue(fields.workflowStage, 'Build Ready');
        if (!campaignsTable.hasPermissionToUpdateRecord(record, uploadUpdate)) throw new Error('You do not have permission to request an EmailBison upload.');
        await campaignsTable.updateRecordAsync(record, uploadUpdate);
    };

    const requestBisonUpload = (record: AnyRecord) => runAction('Upload to EmailBison', async () => {
        assertLeadReadiness(record);
        const campaignName = textValue(record, fields.name) || record.name;
        const isOutputCampaign = /\s+-\s+(?:Generic|Direct) Emails\s*$/i.test(campaignName);
        if (senderSelectionTooLarge) throw new Error(`Select no more than ${recommendedSenderCount} sender accounts for this campaign.`);
        if (isOutputCampaign) {
            setTrackedOperation({type: 'upload', recordId: record.id, campaignName, sawRunningState: true});
            try { await triggerBisonUpload(record); }
            catch (error) { setTrackedOperation(null); throw error; }
            return;
        }
        if (!selectedLeadList) throw new Error('Link the completed Lead List before creating EmailBison campaign outputs.');
        const genericLeads = selectedGenericLeadCount;
        const directLeads = selectedDirectLeadCount;
        if (!genericLeads && !directLeads) throw new Error('The linked Lead List has no Final Generic or Final Direct counts. Complete QA/export first.');
        if (senderSelectionTooSmall) throw new Error(`Select at least ${minimumOutputSenders} sender account(s) so every campaign output has one.`);

        // Only split the campaign when both lead types exist. A single lead
        // type should use the original campaign and all of its selected senders.
        if (!genericLeads || !directLeads) {
            if (genericLeads) {
                const genericUpdates: Record<string, any> = {};
                campaignsTable.fields
                    .filter((field: AnyField) => isCampaignCopyField(field))
                    .forEach((field: AnyField) => {
                        const value = cellValue(record, field);
                        if (typeof value !== 'string') return;
                        const safeValue = genericSafeCopy(value);
                        if (safeValue !== value) genericUpdates[field.id] = safeValue;
                    });
                if (Object.keys(genericUpdates).length) {
                    if (!campaignsTable.hasPermissionToUpdateRecord(record, genericUpdates)) throw new Error('You do not have permission to remove first-name greetings from the generic campaign copy.');
                    await campaignsTable.updateRecordAsync(record, genericUpdates);
                }
            }
            setTrackedOperation({type: 'upload', recordId: record.id, campaignName, sawRunningState: true});
            try { await triggerBisonUpload(record); }
            catch (error) { setTrackedOperation(null); throw error; }
            setNotice({kind: 'success', text: `${genericLeads ? 'Generic' : 'Direct'}-only lead list detected. The original campaign was sent to EmailBison without creating a duplicate child campaign.`});
            return;
        }

        const senderIds = linkedIds(record, fields.emailAccounts);
        const allocation = proportionalSenderCounts(senderIds.length, genericLeads, directLeads);
        const genericSenderIds = senderIds.slice(0, allocation.generic);
        const directSenderIds = senderIds.slice(allocation.generic, allocation.generic + allocation.direct);
        const allocatedSenderIds = [...genericSenderIds, ...directSenderIds];
        if (allocatedSenderIds.length !== senderIds.length || new Set(allocatedSenderIds).size !== new Set(senderIds).size) {
            throw new Error(`Sender allocation failed its safety check: ${senderIds.length} selected, ${allocatedSenderIds.length} assigned. No campaign output was uploaded.`);
        }
        const parentName = baseCampaignName(campaignName);
        const outputs = [
            ...(genericLeads ? [{kind: 'generic' as const, name: parentName + CAMPAIGN_OUTPUT_SUFFIXES.generic, senders: genericSenderIds, leads: genericLeads}] : []),
            ...(directLeads ? [{kind: 'direct' as const, name: parentName + CAMPAIGN_OUTPUT_SUFFIXES.direct, senders: directSenderIds, leads: directLeads}] : []),
        ];
        const pendingUploads: Array<{record: AnyRecord | string; knownStatus?: string}> = [];
        const outputCopyValues = (outputKind: 'generic' | 'direct') => {
            const excludedFieldIds = new Set([
                fields.senderUpdateState, fields.automationRequest, fields.automationStatus, fields.automationMessage, fields.automationError, fields.automationStarted, fields.automationCompleted, fields.automationRunId,
                fields.name, fields.status, fields.workflowStage, fields.lifecycle,
                fields.emailAccounts, fields.bisonId, fields.bisonUrl,
                fields.uploadToBison, fields.bisonAction, fields.createSpintax,
                fields.progress, fields.health, fields.totalLeads, fields.contacted,
                fields.emailsSent, fields.replies, fields.replyRate, fields.repliesData,
                fields.bounces, fields.bounceRate, fields.bouncesData,
                fields.interested, fields.interestedRate, fields.interestedData,
                fields.meetings, fields.meetingRate, fields.meetingsData,
                fields.topUpRequest, fields.topUpStatus, fields.topUpAdded,
                fields.topUpSkipped, fields.topUpFailed, fields.topUpLastRun,
                fields.topUpMessage,
            ].filter(Boolean).map((field: AnyField) => field.id));
            const copiedValues: Record<string, any> = {};
            campaignsTable.fields.forEach((field: AnyField) => {
                if (!field?.id || field.isComputed || excludedFieldIds.has(field.id)) return;
                let value = cellValue(record, field);
                if (value === null || value === undefined) return;
                if (field.type === FieldType.MULTIPLE_RECORD_LINKS && Array.isArray(value)) {
                    value = value.filter(link => link?.id).map(link => ({id: link.id}));
                }
                if (outputKind === 'generic'
                    && typeof value === 'string'
                    && isCampaignCopyField(field)) {
                    value = genericSafeCopy(value);
                }
                copiedValues[field.id] = value;
            });
            if (!campaignLeadListLinkField) throw new Error('Enable the campaign Lead List link before splitting.');
            copiedValues[campaignLeadListLinkField.id] = linkedIds(record, campaignLeadListLinkField).map(id => ({id}));
            if (!copiedValues[campaignLeadListLinkField.id].some((link: {id: string}) => link.id === selectedLeadList.id)) {
                throw new Error('The selected lead list does not match this campaign. Reopen the campaign before splitting.');
            }
            return copiedValues;
        };
        const preparedCopies = {generic: outputCopyValues('generic'), direct: outputCopyValues('direct')};
        for (const output of outputs) {
            const existing = campaigns.find(candidate =>
                textValue(candidate, fields.name).trim().toLowerCase() === output.name.toLowerCase()
                && linkedIds(candidate, campaignLeadListLinkField).includes(selectedLeadList.id)
                && [fields.client, fields.workspace].every(field =>
                    JSON.stringify([...linkedIds(candidate, field)].sort()) === JSON.stringify([...linkedIds(record, field)].sort()))
            );
            if (existing) {
                const repairUpdate: Record<string, any> = {...preparedCopies[output.kind]};
                if (fields.emailAccounts) repairUpdate[fields.emailAccounts.id] = output.senders.map(id => ({id}));
                if (!campaignsTable.hasPermissionToUpdateRecord(existing, repairUpdate)) throw new Error(`You do not have permission to synchronize ${output.name}.`);
                await campaignsTable.updateRecordAsync(existing, repairUpdate);
                // A retry repairs missing Client, workspace, lead-list, copy,
                // settings, and sender links even when the EmailBison campaign
                // already exists. It never creates or uploads a duplicate.
                if (textValue(existing, fields.bisonId)) continue;
                pendingUploads.push({record: existing});
                continue;
            }
            const childValues: Record<string, any> = {...preparedCopies[output.kind]};
            if (!fields.name || !fields.status || !fields.emailAccounts) throw new Error('Campaigns must expose Name, Campaign Status, and Email Accounts before split outputs can be created.');
            childValues[fields.name.id] = output.name;
            childValues[fields.emailAccounts.id] = output.senders.map(id => ({id}));
            childValues[fields.status.id] = selectWriteValue(fields.status, 'Spintax Generated');
            if (fields.workflowStage && hasChoice(fields.workflowStage, 'Build Ready')) childValues[fields.workflowStage.id] = selectWriteValue(fields.workflowStage, 'Build Ready');
            if (!campaignsTable.hasPermissionToCreateRecord(childValues)) throw new Error(`You do not have permission to create ${output.name}.`);
            const childId = await campaignsTable.createRecordAsync(childValues);
            // The custom-extension runtime can update a newly created record by
            // ID immediately, but does not expose selectRecordsAsync here.
            // Keep the ID and request the upload without a fragile reload.
            pendingUploads.push({record: childId, knownStatus: 'Spintax Generated'});
        }
        for (const pending of pendingUploads) await triggerBisonUpload(pending.record, pending.knownStatus);
        setTrackedOperation(null);
        const splitSummary = outputs.map(output => `${output.name}: ${output.leads.toLocaleString()} leads / ${output.senders.length} senders`).join(' · ');
        setSelectedId(null);
        setNotice({kind: 'success', text: `Campaign outputs created. ${splitSummary}. Uploaded outputs are never duplicated on retry.`});
    }, null);

    const deleteCampaign = () => {
        if (!selected) return;
        const campaignToDelete = selected;
        const campaignToDeleteName = textValue(campaignToDelete, fields.name) || campaignToDelete.name || 'this campaign';
        const typedConfirmation = window.prompt(`Permanently delete “${campaignToDeleteName}”?\n\nType DELETE to continue.`);
        if (typedConfirmation === null) return;
        if (typedConfirmation.trim() !== 'DELETE') {
            setNotice({kind: 'error', text: 'Campaign was not deleted. You must type DELETE exactly.'});
            return;
        }
        if (!window.confirm(`Final confirmation: request deletion of “${campaignToDeleteName}”? The automation will delete EmailBison first when an ID exists, then delete Airtable.`)) return;

        // Campaign Center never deletes Airtable campaign records directly.
        // Every deletion goes through the automation so it can inspect the
        // EmailBison ID, remove the remote campaign first when necessary, and
        // delete the Airtable record only after remote handling succeeds.
        return requestBisonAction(campaignToDelete, 'Delete');
    };

    const openCampaignCreator = () => {
        setNewCampaignName('');
        setNewCampaignThesis('');
        setNewLeadListName('');
        setNewLeadListNameEdited(false);
        setBuildLeadList(true);
        setLeadListCreationMode('new');
        setExistingLeadListId('');
        setShowCampaignCreator(true);
    };

    const createCampaign = () => runAction('New campaign', async () => {
        if (!fields.name) throw new Error('A Name or Campaign Name field is required.');
        if (clientFilter === 'all') throw new Error('Choose one client in the Campaign Center filter before creating a campaign.');
        if (!creationClientRecord || !creationClientName) throw new Error(`Could not resolve the filtered client “${clientFilter}” to its authoritative Airtable Client record.`);
        if (!campaignTitleDraft) throw new Error('Enter a campaign name without the client prefix.');
        if (buildLeadList && leadListCreationMode === 'existing' && !creationLeadListOptions.some(record => record.id === existingLeadListId)) throw new Error('Choose an existing Lead List belonging to the selected client.');
        const cleanCampaignName = clientPrefixedName(creationClientDisplayName || creationClientName, campaignTitleDraft);
        const newCampaignValues: Record<string, any> = {[fields.name.id]: cleanCampaignName};
        if (fields.thesis && newCampaignThesis.trim()) newCampaignValues[fields.thesis.id] = newCampaignThesis.trim();
        // Seed every new campaign with a slightly different daily send window.
        // These remain editable and are randomized again when the campaign is
        // actually uploaded, so campaigns do not share identical send times.
        if (fields.startTime) newCampaignValues[fields.startTime.id] = randomizedTimeWithinHour(8);
        if (fields.endTime) newCampaignValues[fields.endTime.id] = randomizedTimeWithinHour(18);
        let filteredClientValue: any = null;
        if (fields.client && clientFilter !== 'all') {
            if (fields.client.type === FieldType.MULTIPLE_RECORD_LINKS) {
                filteredClientValue = [{id: creationClientRecord.id}];
            } else if (hasChoice(fields.client, creationClientName)) {
                filteredClientValue = selectWriteValue(fields.client, creationClientName);
            } else {
                throw new Error(`The Campaign Client field cannot accept the authoritative client “${creationClientName}”.`);
            }
            newCampaignValues[fields.client.id] = filteredClientValue;
        }
        if (fields.workflowStage && hasChoice(fields.workflowStage, 'Strategy Draft')) newCampaignValues[fields.workflowStage.id] = selectWriteValue(fields.workflowStage, 'Strategy Draft');
        if (fields.status && hasChoice(fields.status, 'Draft')) newCampaignValues[fields.status.id] = selectWriteValue(fields.status, 'Draft');
        if (!campaignsTable.hasPermissionToCreateRecord(newCampaignValues)) throw new Error('You do not have permission to create campaigns.');
        const newCampaignId = await campaignsTable.createRecordAsync(newCampaignValues);

        if (buildLeadList) {
            if (!leadListsTable) throw new Error('The campaign was created, but Lead Lists is not configured in Campaign Center custom properties.');
            if (!campaignLeadListLinkField && !leadListFields.campaign) throw new Error('The campaign was created, but no Campaign ↔ Lead List linked-record field is configured.');
            let leadListId = existingLeadListId;
            if (leadListCreationMode === 'new') {
                if (!leadListFields.name) throw new Error('The campaign was created, but Lead Lists needs a Name of the Lead List or File Name field.');
                const cleanLeadListName = clientPrefixedName(creationClientDisplayName || creationClientName, leadListTitleDraft || campaignTitleDraft);
                const leadListValues: Record<string, any> = {[leadListFields.name.id]: cleanLeadListName};
                if (leadListFields.icpDescription && newCampaignThesis.trim()) leadListValues[leadListFields.icpDescription.id] = newCampaignThesis.trim();
                if (leadListFields.client && filteredClientValue !== undefined && filteredClientValue !== null) leadListValues[leadListFields.client.id] = filteredClientValue;
                if (leadListFields.campaign) leadListValues[leadListFields.campaign.id] = [{id: newCampaignId}];
                if (leadListFields.sourceType && hasChoice(leadListFields.sourceType, 'DiscoLike')) leadListValues[leadListFields.sourceType.id] = selectWriteValue(leadListFields.sourceType, 'DiscoLike');
                if (leadListFields.stage) {
                    if (hasChoice(leadListFields.stage, 'Source & ICP')) leadListValues[leadListFields.stage.id] = selectWriteValue(leadListFields.stage, 'Source & ICP');
                    else if (hasChoice(leadListFields.stage, 'Unconfigured')) leadListValues[leadListFields.stage.id] = selectWriteValue(leadListFields.stage, 'Unconfigured');
                }
                if (leadListFields.processingStatus && hasChoice(leadListFields.processingStatus, 'Not Started')) leadListValues[leadListFields.processingStatus.id] = selectWriteValue(leadListFields.processingStatus, 'Not Started');
                // Clear the action atomically during creation so an Airtable automation
                // cannot observe and run a field default before the final sync below.
                if (leadListFields.automationAction) leadListValues[leadListFields.automationAction.id] = null;
                if (!leadListsTable.hasPermissionToCreateRecord(leadListValues)) throw new Error('The campaign was created, but you do not have permission to create its Lead List.');
                leadListId = await leadListsTable.createRecordAsync(leadListValues);
            } else if (!leadListId) {
                throw new Error('The campaign was created, but no existing Lead List was selected.');
            }
            if (campaignLeadListLinkField) {
                const campaignLinkUpdate = {[campaignLeadListLinkField.id]: [{id: leadListId}]};
                const createdCampaign = campaignsTable.getRecordByIdIfExists?.(newCampaignId);
                if (createdCampaign && !campaignsTable.hasPermissionToUpdateRecord(createdCampaign, campaignLinkUpdate)) throw new Error('The campaign and Lead List were created, but you do not have permission to link them.');
                await campaignsTable.updateRecordAsync(newCampaignId, campaignLinkUpdate);
            } else if (leadListCreationMode === 'existing' && leadListFields.campaign) {
                const existingLeadList = leadListsTable.getRecordByIdIfExists?.(leadListId);
                const existingCampaignIds = existingLeadList ? linkedIds(existingLeadList, leadListFields.campaign) : [];
                await leadListsTable.updateRecordAsync(leadListId, {[leadListFields.campaign.id]: [...new Set([...existingCampaignIds, newCampaignId])].map(id => ({id}))});
            }

            // Do a final direct write after both records exist and are linked.
            // This covers both a newly created and an existing Lead List and
            // makes the handoff independent of cross-table reads in the other UI.
            const cleanTargeting = newCampaignThesis.trim();
            const leadListSync: Record<string, any> = {};
            if (leadListFields.campaign) leadListSync[leadListFields.campaign.id] = [{id: newCampaignId}];
            if (leadListFields.icpDescription && cleanTargeting) leadListSync[leadListFields.icpDescription.id] = cleanTargeting;
            // A newly linked Lead List must never inherit a stale/default retry command.
            // Work begins only when the user explicitly presses Generate filters.
            if (leadListFields.automationAction) leadListSync[leadListFields.automationAction.id] = null;
            if (Object.keys(leadListSync).length) {
                await leadListsTable.updateRecordAsync(leadListId, leadListSync);
            }
        }
        setShowCampaignCreator(false);
        setSelectedId(newCampaignId);
        setTab('strategy');
    }, buildLeadList ? 'Campaign created and its Lead List was linked automatically.' : 'Campaign created.');

    const syncBison = () => {
        if (!window.confirm('Run the full Bison campaign sync now? This updates all campaign records.')) return;
        return runAction('Bison sync request', async () => {
            let parsedUrl: URL;
            try { parsedUrl = new URL(syncWebhookUrl); }
            catch { throw new Error('The configured Bison sync webhook URL is invalid.'); }
            if (parsedUrl.protocol !== 'https:' || parsedUrl.hostname !== 'bison-sync-relay.scale-f9d.workers.dev') {
                throw new Error('The configured Bison sync relay URL is invalid.');
            }
            const controller = new AbortController();
            const timeout = window.setTimeout(() => controller.abort(), 15000);
            try {
                const response = await fetch(syncWebhookUrl, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({source: 'Campaign Center', requestedAt: new Date().toISOString()}),
                    signal: controller.signal,
                });
                if (!response.ok) throw new Error(`Airtable rejected the sync request (${response.status}).`);
            } catch (error) {
                if (error instanceof DOMException && error.name === 'AbortError') {
                    throw new Error('The webhook request timed out. Check Airtable automation history before trying again.');
                }
                throw error;
            } finally {
                window.clearTimeout(timeout);
            }
        });
    };

    const syncBisonSenders = () => {
        if (!window.confirm('Sync sender assignments from EmailBison now? This refreshes the sender links for every active campaign.')) return;
        return runAction('Bison sender sync request', async () => {
            let parsedUrl: URL;
            try { parsedUrl = new URL(senderSyncWebhookUrl); }
            catch { throw new Error('The configured Bison sync webhook URL is invalid.'); }
            if (parsedUrl.protocol !== 'https:' || parsedUrl.hostname !== 'n8n.dulcy.io' || parsedUrl.pathname !== '/webhook/sync-bison-senders') {
                throw new Error('The configured Bison sender sync URL is invalid.');
            }
            const controller = new AbortController();
            const timeout = window.setTimeout(() => controller.abort(), 15000);
            try {
                const response = await fetch(senderSyncWebhookUrl, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({source: 'Campaign Center', requestedAt: new Date().toISOString()}),
                    signal: controller.signal,
                });
                if (!response.ok) {
                    throw new Error(`Airtable rejected the sync request (${response.status}).`);
                }
            } catch (error) {
                if (error instanceof DOMException && error.name === 'AbortError') {
                    throw new Error('The sender sync request timed out. Check n8n execution history before trying again.');
                }
                throw error;
            } finally {
                window.clearTimeout(timeout);
            }
        });
    };

    const cloneCampaign = (record: AnyRecord) => runAction('Clone campaign', async () => {
        if (!window.confirm(`Create a draft copy of “${textValue(record, fields.name)}”?`)) return;
        const clonedCampaignValues: Record<string, any> = {};
        const copiedFieldIds = new Set<string>();
        const copyCampaignField = (field: AnyField | null) => {
            if (!field || copiedFieldIds.has(field.id)) return;
            const copiedCellValue = cellValue(record, field);
            if (copiedCellValue !== null) clonedCampaignValues[field.id] = copiedCellValue;
            copiedFieldIds.add(field.id);
        };

        // Copy the reusable campaign build, not the original campaign's live
        // EmailBison identity, analytics, approval response, or action flags.
        [
            fields.client, fields.type, fields.workspace,
            fields.campaignApproach, fields.prepDate, fields.launchDate,
            fields.thesis, fields.campaignLeadList, fields.leadList,
            fields.subject1, fields.body1, fields.subject2, fields.body2,
            fields.subject3, fields.body3, fields.subject4, fields.body4,
            fields.threadReply2, fields.threadReply3, fields.threadReply4,
            fields.finalSubject1a, fields.finalBody1a,
            fields.finalSubject1b, fields.finalBody1b,
            fields.finalSubject1c, fields.finalBody1c,
            fields.finalSubject2a, fields.finalBody2a,
            fields.finalSubject2b, fields.finalBody2b,
            fields.finalSubject2c, fields.finalBody2c,
            fields.finalSubject3a, fields.finalBody3a,
            fields.finalSubject3b, fields.finalBody3b,
            fields.finalSubject3c, fields.finalBody3c,
            fields.finalSubject4a, fields.finalBody4a,
            fields.daysBetween, fields.variants1, fields.variants2,
            fields.variants3, fields.backupVariants,
            fields.monday, fields.tuesday, fields.wednesday, fields.thursday,
            fields.friday, fields.saturday, fields.sunday,
            fields.startTime, fields.endTime, fields.timezone,
            fields.maxEmails, fields.maxNewLeads, fields.plainText,
            fields.startDate, fields.endDate, fields.emailAccounts,
            fields.skipBounceNotification, fields.skipBouncePause,
        ].forEach(copyCampaignField);

        // The interface explicitly resolves the first few sequence versions,
        // but Campaigns can contain variants through J. Copy every populated
        // subject/body version that exists in the table.
        campaignsTable.fields
            .filter((field: AnyField) => /^(?:Campaign Email \d+ Subject(?: Version \d+)?|Campaign Subject \d+ Version \d+|Campaign (?:Email )?Body \d+ Version \d+)$/i.test(field.name))
            .forEach(copyCampaignField);

        if (fields.name) clonedCampaignValues[fields.name.id] = `${textValue(record, fields.name) || 'Campaign'} Copy`;
        if (fields.status && hasChoice(fields.status, 'Draft')) clonedCampaignValues[fields.status.id] = selectWriteValue(fields.status, 'Draft');
        if (fields.startTime) clonedCampaignValues[fields.startTime.id] = randomizedTimeWithinHour(8);
        if (fields.endTime) clonedCampaignValues[fields.endTime.id] = randomizedTimeWithinHour(18);
        if (!campaignsTable.hasPermissionToCreateRecord(clonedCampaignValues)) throw new Error('You do not have permission to clone campaigns.');
        const clonedCampaignId = await campaignsTable.createRecordAsync(clonedCampaignValues);
        setSelectedId(clonedCampaignId);
    });

    const bg = dark ? 'bg-gray-900 text-white' : 'bg-white text-gray-900';
    const panel = dark ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200';
    const muted = dark ? 'text-gray-400' : 'text-gray-500';
    const control = `text-sm px-3 py-2.5 rounded-lg border outline-none transition-all focus:border-purple-500 focus:ring-2 focus:ring-purple-100 ${dark ? 'bg-gray-800 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900 shadow-sm'}`;
    const filterControl = `min-w-[180px] rounded-lg border px-3 py-2.5 text-sm font-medium outline-none transition-all focus:border-purple-500 focus:ring-2 focus:ring-purple-100 ${dark ? 'bg-gray-800 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900 shadow-sm'}`;
    const editorControl = 'min-h-[48px] w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base text-gray-900 outline-none transition-all hover:border-gray-400 focus:border-purple-500 focus:ring-2 focus:ring-purple-100';
    const editorLabel = 'mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-gray-500';
    const finalVariantLabels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
    const sequenceFieldsForStep = (stepNumber: number) => finalVariantLabels.map((variantLabel, variantIndex) => {
        const version = variantIndex + 1;
        return {
            name: `${stepNumber}${variantLabel}`,
            subject: findField(campaignsTable, [
                `Campaign Email ${stepNumber} Subject Version ${version}`,
                `Campaign Subject ${stepNumber} Version ${version}`,
                `Campaign Email ${stepNumber} Subject Spintax ${version}`,
                ...(version === 1 ? [`Campaign Email ${stepNumber} Subject`] : []),
            ]),
            body: findField(campaignsTable, [
                `Campaign Body ${stepNumber} Version ${version}`,
                `Campaign Email ${stepNumber} Body Spintax ${version}`,
                ...(version === 1 ? [`Campaign Email ${stepNumber} Body`] : []),
            ]),
        };
    });
    const finalSequenceSteps = [
        {number: 1, threadReply: null, variants: sequenceFieldsForStep(1)},
        {number: 2, threadReply: fields.threadReply2, variants: sequenceFieldsForStep(2)},
        {number: 3, threadReply: fields.threadReply3, variants: sequenceFieldsForStep(3)},
        {number: 4, threadReply: fields.threadReply4, variants: sequenceFieldsForStep(4)},
    ];
    const inferredSequenceStepLimit = selected ? Math.max(1, finalSequenceSteps.reduce((lastVisibleStep, inferredStep) => inferredStep.variants.some(inferredVariant => textValue(selected, inferredVariant.subject) || textValue(selected, inferredVariant.body)) ? inferredStep.number : lastVisibleStep, 1)) : 1;
    const visibleSequenceStepLimit = selectedId ? sequenceStepLimits[selectedId] ?? inferredSequenceStepLimit : 1;
    const visibleVariantLimitForStep = (visibleStepNumber: number) => {
        if (!selected || !selectedId) return 1;
        const variantLimitKey = `${selectedId}-${visibleStepNumber}`;
        const inferredVariantLimit = Math.max(1, finalSequenceSteps[visibleStepNumber - 1].variants.reduce((lastVisibleVariant, inferredVariant, inferredVariantIndex) => textValue(selected, inferredVariant.subject) || textValue(selected, inferredVariant.body) ? inferredVariantIndex + 1 : lastVisibleVariant, 1));
        return sequenceVariantLimits[variantLimitKey] ?? inferredVariantLimit;
    };
    const threadReplySubjectForVariant = (stepNumber: number, variantName: string): string => {
        if (!selected || stepNumber <= 1) return '';
        const variantIndex = Math.max(0, variantName.charCodeAt(variantName.length - 1) - 'A'.charCodeAt(0));
        const stepOneVariant = finalSequenceSteps[0].variants[variantIndex] ?? finalSequenceSteps[0].variants[0];
        const stepOneSubject = textValue(selected, stepOneVariant.subject).replace(/^re:\s*/i, '');
        return stepOneSubject ? `Re: ${stepOneSubject}` : 'Re: [add the Step 1 subject first]';
    };

    if (!campaignsTable) return <div className={`min-h-screen flex items-center justify-center ${dark ? 'bg-gray-800 text-white' : 'bg-gray-50 text-gray-900'}`}><div className="p-8 text-center"><h2 className="text-xl font-semibold">Configure Campaign Center</h2><p className={`mt-2 ${muted}`}>Select the Campaigns table in the custom element properties.</p></div></div>;

    const missingRequired = [!fields.name && 'Name', !fields.client && 'Client'].filter(Boolean) as string[];
    const filterSelect = (label: string, value: string, setter: (value: string) => void, values: string[]) => (
        <select aria-label={label} value={value} onChange={e => setter(e.target.value)} className={filterControl}>
            <option value="all">All {label}</option>{values.map(item => <option key={item} value={item}>{item}</option>)}
        </select>
    );

    return <div className={`min-h-screen flex flex-col ${dark ? 'bg-gray-800' : 'bg-slate-50'}`}>
        <header className={`relative overflow-hidden border-b px-6 py-5 ${panel}`}>
            <div className="pointer-events-none absolute -right-16 -top-24 h-56 w-56 rounded-full bg-purple-100 opacity-60 blur-3xl"/>
            <div className="relative flex items-center justify-between gap-4 mb-5">
                <div><div className="mb-1 flex items-center gap-2"><div className="h-8 w-1.5 rounded-full bg-gradient-to-b from-purple-500 to-indigo-600"/><h1 className="text-2xl font-bold tracking-tight text-gray-950">Campaign Center</h1></div><p className={`ml-3.5 text-sm ${muted}`}>Plan, approve, launch, and monitor outbound campaigns</p></div>
                <div className="flex gap-2">
                    <button disabled={!!busy} onClick={openCampaignCreator} className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-2.5 font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50"><PlusIcon size={16}/>New Campaign</button>
                    <button disabled={!!busy} onClick={syncBison} className={`${control} flex items-center gap-2 disabled:opacity-50`}><ArrowsClockwiseIcon className={busy === 'Bison sync request' ? 'animate-spin' : ''} size={16}/>{busy === 'Bison sync request' ? 'Starting sync…' : 'Sync with Bison'}</button>
                </div>
            </div>
            {missingRequired.length > 0 && <div className="mb-3 rounded-md border border-amber-400 bg-amber-50 text-amber-900 px-3 py-2 text-sm">Confirm these Campaigns fields: {missingRequired.join(', ')}. Aliases are listed in the setup notes.</div>}
            {trackedOperation && <div className="mb-3 flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900"><ArrowsClockwiseIcon className="shrink-0 animate-spin" size={16}/><strong>{trackedOperation.type === 'spintax' ? 'Generating and validating spintax…' : 'Uploading to EmailBison…'}</strong><span>{trackedOperation.campaignName}. You can keep working; this message will change when n8n finishes.</span></div>}
            {notice && <div className={`mb-3 rounded-md px-3 py-2 text-sm flex justify-between ${notice.kind === 'error' ? 'bg-red-100 text-red-800' : notice.kind === 'success' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}><span>{notice.text}</span><button onClick={() => setNotice(null)}><XIcon size={16}/></button></div>}
            <div className="relative rounded-xl border border-gray-200 bg-gray-50/80 p-4 shadow-inner"><div className="flex items-center gap-3 flex-wrap">
                {fields.client && filterSelect('Clients', clientFilter, setClientFilter, options.clients)}
                <div className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2.5 shadow-sm transition-all focus-within:border-purple-500 focus-within:ring-2 focus-within:ring-purple-100"><MagnifyingGlassIcon size={17} className="text-gray-400"/><input aria-label="Search campaigns" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search campaigns..." className="w-64 bg-transparent text-sm outline-none"/></div>
                <FunnelIcon size={19} className={muted}/>
                {fields.status && filterSelect('Statuses', statusFilter, setStatusFilter, options.statuses)}
                {fields.workspace && filterSelect('Workspaces', workspaceFilter, setWorkspaceFilter, options.workspaces)}
                {fields.health && filterSelect('Health', healthFilter, setHealthFilter, options.health)}
                {fields.created && <select aria-label="Created date" value={dateRange} onChange={e => setDateRange(e.target.value as DateRange)} className={filterControl}><option value="all">Any created date</option><option value="10">Created in 10 days</option><option value="30">Created in 30 days</option><option value="60">Created in 60 days</option><option value="120">Created in 120 days</option></select>}
                <button onClick={resetFilters} className={`${control} min-w-0 px-4 font-semibold hover:opacity-80`}>Clear</button>
                <span className={`ml-auto text-xs ${muted}`}>Newest first</span>
            </div></div>
            <div className="relative mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 font-semibold text-emerald-800 shadow-sm"><strong className="text-emerald-950">{senderStatusCounts.available}</strong> available</span>
                <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 font-semibold text-amber-800 shadow-sm"><strong className="text-amber-950">{senderStatusCounts.sending}</strong> sending</span>
                <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 font-semibold text-blue-800 shadow-sm"><strong className="text-blue-950">{senderStatusCounts['releasing-soon']}</strong> releasing soon</span>
                <span className="rounded-full border border-purple-200 bg-purple-50 px-3 py-1.5 font-semibold text-purple-800 shadow-sm"><strong className="text-purple-950">{senderStatusCounts['reserved-next']}</strong> reserved next</span>
                <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1.5 font-semibold text-red-800 shadow-sm"><strong className="text-red-950">{senderStatusCounts.disconnected}</strong> disconnected</span>
                <span className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 font-semibold text-orange-800 shadow-sm"><strong className="text-orange-950">{senderStatusCounts.warming}</strong> warming</span>
                <span className="text-[11px] font-medium text-slate-500">{workspaceEmailAccounts.length} total senders</span>
                <label className="ml-auto flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-600 shadow-sm"><input type="checkbox" checked={showHiddenHistory} onChange={event => setShowHiddenHistory(event.currentTarget.checked)} className="h-3.5 w-3.5 accent-purple-600"/><span>Show hidden history{hiddenHistoryCount ? ` (${hiddenHistoryCount})` : ''}</span></label>
            </div>
        </header>

        <div className="flex flex-1 overflow-hidden">
            <main className="flex-1 overflow-auto p-5">
                <div className={`overflow-hidden rounded-xl border shadow-sm ${panel}`}>
                    <div className="overflow-x-auto"><table className="w-full min-w-[2100px]">
                        <thead className={`sticky top-0 z-10 ${dark ? 'bg-gray-800' : 'bg-slate-100'}`}><tr>{['Campaign','Status','KPI Health','Next Move','Progress','Total Leads','Contacted','Emails Sent','Emails / Positive Reply','Emails / Meeting','Replies · %','Bounces · %','Interested · %','Meetings · %','Actions'].map(label => <th key={label} className={`border-b px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider ${muted}`}>{label}</th>)}</tr></thead>
                        <tbody className={`divide-y ${dark ? 'divide-gray-700' : 'divide-gray-200'}`}>
                            {filtered.map(record => {
                                const selectedRow = record.id === selectedId;
                                const rowReplyRate = percentValue(record, fields.replyRate);
                                const rowInterestedRate = percentValue(record, fields.interestedRate);
                                const rowBounceRate = percentValue(record, fields.bounceRate);
                                const rowMeetingRate = percentValue(record, fields.meetingRate);
                                const rowReplyKpi = kpiPresentation(rowReplyRate, 'reply');
                                const rowInterestedKpi = kpiPresentation(rowInterestedRate, 'interested');
                                const rowBounceKpi = kpiPresentation(rowBounceRate, 'bounce');
                                const rowMeetingKpi = kpiPresentation(rowMeetingRate, 'meeting');
                                const rowEmailsPerLead = emailsPerPositiveReply(record, fields.emailsSent, fields.interested);
                                const rowEmailsPerMeeting = emailsPerMeeting(record, fields.emailsSent, fields.meetings);
                                const rowEmailsSent = numericValue(record, fields.emailsSent);
                                const overallKpi = volumeAwareKpiPresentation(overallKpiPresentation(rowReplyKpi, rowInterestedKpi, rowBounceKpi, rowMeetingKpi, rowReplyRate, rowEmailsPerLead), rowEmailsSent);
                                const rowStatus = optionName(record, fields.status);
                                const rowClientRecord = clientRecordForCampaign(record);
                                const rowNextMove = nextMovePresentation(record, fields, agencyPositiveReplyRate, {
                                    newVertical: clientPivotEnabled(rowClientRecord, clientFields.newVerticalPivot),
                                    newOffer: clientPivotEnabled(rowClientRecord, clientFields.newOfferPivot),
                                });
                                const rowProgressPercent = progressPercent(record, fields.progress);
                                return <tr key={record.id} onClick={() => setSelectedId(selectedRow ? null : record.id)} className={`group cursor-pointer transition-colors ${selectedRow ? dark ? 'bg-purple-900/30' : 'bg-purple-50' : dark ? 'hover:bg-gray-800' : 'hover:bg-slate-50'}`}>
                                    <td className="px-4 py-4 font-medium"><div className="flex items-start gap-2"><span className="mt-0.5 rounded-md p-1 text-gray-400 transition-colors group-hover:bg-purple-100 group-hover:text-purple-600">{selectedRow ? <CaretDownIcon size={14}/> : <CaretRightIcon size={14}/>}</span><div><div className="text-gray-900">{fields.name ? <CellRenderer record={record} field={fields.name}/> : record.name}</div>{campaignStageLabel(record, fields) && <span className="mt-2 inline-flex whitespace-nowrap rounded-full border border-purple-200 bg-purple-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-purple-700 shadow-sm">{campaignStageLabel(record, fields)}</span>}</div></div></td>
                                    <td className="px-4 py-3">{fields.status ? <span className={`inline-flex whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold ${campaignStatusPresentation(rowStatus)}`}>{rowStatus || '—'}</span> : '—'}</td>
                                    <td className="px-4 py-3"><span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ${overallKpi.chip}`}>{overallKpi.label}</span></td>
                                    <td className="px-4 py-3"><span title={rowNextMove.detail} className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-none shadow-sm ${rowNextMove.chip}`}>{rowNextMove.label}</span></td>
                                    <td className="px-4 py-3"><div>{fields.progress ? <CellRenderer record={record} field={fields.progress}/> : <span>{textValue(record, fields.contacted) || '0'} / {textValue(record, fields.totalLeads) || '0'}</span>}</div><div className="mt-2 h-1.5 w-24 overflow-hidden rounded-full bg-gray-200"><div className="h-full rounded-full bg-gradient-to-r from-purple-500 to-indigo-500" style={{width: Math.max(0, Math.min(100, rowProgressPercent ?? 0)) + '%'}}/></div></td>
                                    <td className="px-4 py-3 tabular-nums">{formatCount(record, fields.totalLeads)}</td>
                                    <td className="px-4 py-3 tabular-nums">{formatCount(record, fields.contacted)}</td>
                                    <td className="px-4 py-3 tabular-nums">{fields.emailsSent ? <CellRenderer record={record} field={fields.emailsSent}/> : '—'}</td>
                                    <td className="px-4 py-3 tabular-nums whitespace-nowrap">{rowEmailsPerLead === null ? '—' : `1 / ${new Intl.NumberFormat().format(Math.round(rowEmailsPerLead))}`}</td>
                                    <td className="px-4 py-3 tabular-nums whitespace-nowrap">{rowEmailsPerMeeting === null ? '—' : `1 / ${new Intl.NumberFormat().format(Math.round(rowEmailsPerMeeting))}`}</td>
                                    <td className="px-4 py-3 tabular-nums whitespace-nowrap"><div className="flex min-h-[76px] flex-col items-start justify-between gap-2"><div className="min-h-[42px] leading-6">{fields.repliesData ? <CellRenderer record={record} field={fields.repliesData}/> : formatMetric(record, fields.replies, fields.replyRate, fields.emailsSent)}</div><span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${rowReplyKpi.chip}`}>{rowReplyKpi.label}</span></div></td>
                                    <td className="px-4 py-3 tabular-nums whitespace-nowrap"><div className="flex min-h-[76px] flex-col items-start justify-between gap-2"><div className="min-h-[42px] leading-6">{fields.bouncesData ? <CellRenderer record={record} field={fields.bouncesData}/> : formatMetric(record, fields.bounces, fields.bounceRate, fields.emailsSent)}</div><span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${rowBounceKpi.chip}`}>{rowBounceKpi.label}</span></div></td>
                                    <td className="px-4 py-3 tabular-nums whitespace-nowrap"><div className="flex min-h-[76px] flex-col items-start justify-between gap-2"><div className="min-h-[42px] leading-6">{fields.interestedData ? <CellRenderer record={record} field={fields.interestedData}/> : formatMetric(record, fields.interested, fields.interestedRate, fields.emailsSent)}</div><span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${rowInterestedKpi.chip}`}>{rowInterestedKpi.label}</span></div></td>
                                    <td className="px-4 py-3 tabular-nums whitespace-nowrap"><div className="flex min-h-[76px] flex-col items-start justify-between gap-2"><div className="min-h-[42px] leading-6">{fields.meetingsData ? <CellRenderer record={record} field={fields.meetingsData}/> : formatMetric(record, fields.meetings, fields.meetingRate, fields.interested)}</div><span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${rowMeetingKpi.chip}`}>{rowMeetingKpi.label}</span></div></td>
                                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}><div className="flex gap-1">
                                        <button title="Pause in EmailBison" disabled={!!busy} onClick={() => requestBisonAction(record, 'Pause')} className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-40"><PauseIcon size={16}/></button>
                                        <button title={leadReadinessIssue(record) || "Launch or resume in EmailBison"} disabled={!!busy || !!leadReadinessIssue(record)} onClick={() => requestBisonAction(record, 'Launch')} className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-40"><PlayIcon size={16}/></button>
                                        <button title="Clone" disabled={!!busy} onClick={() => cloneCampaign(record)} className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-40"><CopyIcon size={16}/></button>
                                        <button title="Open Airtable record" onClick={() => campaignsTable.hasPermissionToExpandRecords() ? expandRecord(record) : setNotice({kind: 'error', text: 'You do not have permission to expand records.'})} className="p-1.5 rounded hover:bg-gray-200"><EyeIcon size={16}/></button>
                                    </div></td>
                                </tr>;
                            })}
                            {!filtered.length && <tr><td colSpan={15} className={`px-6 py-16 text-center ${muted}`}><p className="font-medium">No campaigns match these filters.</p><button onClick={resetFilters} className="mt-2 text-purple-600">Clear filters</button></td></tr>}
                        </tbody>
                    </table></div>
                </div>
            </main>

            {selected && <aside key={selected.id} className={`w-[580px] max-w-[56vw] border-l overflow-auto shadow-2xl ${panel}`}>
                <div className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 px-5 py-4 backdrop-blur"><div className="flex justify-between gap-3"><div className="min-w-0"><div className="mb-1 flex items-center gap-2">{campaignStageLabel(selected, fields) && <span className="rounded-full border border-purple-200 bg-purple-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-purple-700 shadow-sm">{campaignStageLabel(selected, fields)}</span>}{fields.status && <span className="text-xs"><CellRenderer record={selected} field={fields.status}/></span>}</div><h2 className="truncate text-lg font-semibold text-gray-950">{textValue(selected, fields.name) || selected.name}</h2><p className={`text-sm ${muted}`}>{textValue(selected, fields.client) || 'No client linked'}</p></div><button title="Close campaign" onClick={() => setSelectedId(null)} className="h-9 w-9 shrink-0 rounded-lg border border-gray-200 bg-white p-2 text-gray-500 shadow-sm transition-colors hover:bg-gray-100 hover:text-gray-900"><XIcon size={18}/></button></div>
                    <div className="mt-4 grid grid-cols-5 gap-2"><button disabled={!!busy} onClick={() => requestBisonAction(selected, 'Pause')} className={`${control} flex items-center justify-center gap-1 px-2`}><PauseIcon size={15}/>Pause</button><button title={selectedLeadReadinessIssue || 'Launch or resume in EmailBison'} disabled={!!busy || !!selectedLeadReadinessIssue} onClick={() => requestBisonAction(selected, 'Launch')} className="flex items-center justify-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-2.5 text-sm font-semibold text-emerald-700 shadow-sm hover:bg-emerald-100 disabled:opacity-40"><PlayIcon size={15}/>Launch</button><button type="button" title={selectedBisonView.title} disabled={!selectedBisonView.url} onClick={() => selectedBisonView.url && window.open(selectedBisonView.url, '_blank', 'noopener,noreferrer')} className="flex items-center justify-center gap-1 rounded-lg border border-blue-300 bg-blue-50 px-2 py-2.5 text-sm font-semibold text-blue-700 shadow-sm hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-40"><EyeIcon size={15}/>View</button><button disabled={!!busy} onClick={() => cloneCampaign(selected)} className={`${control} flex items-center justify-center gap-1 px-2`}><CopyIcon size={15}/>Clone</button><button disabled={!!busy} onClick={deleteCampaign} className="flex items-center justify-center gap-1 rounded-lg border border-red-300 bg-red-50 px-2 py-2.5 text-sm font-semibold text-red-700 shadow-sm hover:bg-red-100 disabled:opacity-40"><TrashIcon size={15}/>Delete</button></div>
                    {selectedLeadReadinessIssue && <div role="status" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><div className="font-semibold">Lead list not ready</div><p className="mt-1 leading-5">{selectedLeadReadinessIssue}</p></div>}
                    <CampaignAutomationStatus record={selected} fields={fields} onRequestClear={clearCampaignAutomationStatus}/>
                    <div className="mt-4 grid grid-cols-8 gap-1 rounded-xl bg-gray-100 p-1 text-xs">{(['overview','strategy','copy','approval','sequence','senders','settings','analytics'] as Tab[]).map(name => <button key={name} onClick={() => setTab(name)} className={`min-w-0 rounded-lg px-1 py-2 font-medium capitalize transition-all ${tab === name ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:bg-white/70 hover:text-gray-800'}`}>{name}</button>)}</div>
                </div>
                <div className="bg-slate-50/60 p-5">
                    {tab === 'overview' && <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                            {fields.status && <div className="rounded-xl border border-purple-200 bg-purple-50 p-3"><div className="text-[11px] font-semibold uppercase tracking-wide text-purple-500">Status</div><div className="mt-1"><CellRenderer record={selected} field={fields.status}/></div></div>}
                            {selectedLifecycle && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3"><div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-600">Lifecycle · automatic</div><div className="mt-1.5 flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${selectedLifecycle.badge}`}>{selectedLifecycle.label}</span><span className="text-xs text-emerald-900/75">{selectedLifecycle.detail}</span></div></div>}
                        </div>

                        {selectedNextMove && <div className={`rounded-2xl border p-4 shadow-sm ${selectedNextMove.chip}`}>
                            <div className="flex items-start justify-between gap-4"><div><div className="text-[10px] font-semibold uppercase tracking-wider opacity-70">Recommended next move</div><div className="mt-1 text-xl font-bold">{selectedNextMove.label}</div><p className="mt-1 text-sm opacity-90">{selectedNextMove.detail}</p></div><span className="shrink-0 rounded-full bg-white/70 px-2.5 py-1 text-xs font-semibold">{progressPercent(selected, fields.progress) === null ? 'No progress' : `${progressPercent(selected, fields.progress)?.toFixed(0)}% complete`}</span></div>
                            {'action' in selectedNextMove && selectedNextMove.action === 'top-up-leads' && <div className="mt-3 rounded-xl border border-emerald-200 bg-white/70 p-3">
                                <div className="grid gap-3">
                                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3"><label className="block text-sm font-semibold text-blue-950">Use existing completed top-up<select aria-label="Existing completed top-up" value={existingTopUpChoice} disabled={!!busy} onChange={event=>setExistingTopUpChoice(event.currentTarget.value)} className="mt-2 w-full rounded-lg border bg-white p-2 text-xs"><option value="">Choose a Ready, QA-passed list…</option>{completedTopUpCandidates.map(c=><option key={c.id} value={c.id}>{c.name} · {c.counts.generic} generic / {c.counts.direct} direct</option>)}</select></label><button disabled={!!busy||!existingTopUpChoice||!topUpUploadReceiptField} onClick={()=>adoptExistingCompletedTopUp(selected)} className="mt-2 rounded-lg bg-blue-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">Use this completed top-up</button><p className="mt-2 text-xs text-blue-900">Checks the exact final source and prior imports, then links both existing destinations. This step does not upload or send.</p>{!topUpUploadReceiptField&&<p role="alert" className="mt-2 text-xs text-red-700">Enable Top-up Upload Receipt JSON in this interface’s data fields.</p>}{selectedTopUpLeadList&&!selectedPreparedReceipt&&<p className="mt-2 text-xs text-amber-800">Select this existing list to refresh its checks. Completed or uncertain uploads require reconciliation.</p>}</div>
                                    <div className="rounded-lg border bg-white p-3"><div className="text-sm font-semibold">{selectedTopUpLeadList ? (textValue(selectedTopUpLeadList, leadListFields.name) || selectedTopUpLeadList.name) : 'Create a new top-up list'}</div><p className="mt-1 text-xs">Copies your targeting and excludes contacts from this campaign’s attached lists for this build only.</p><button disabled={!!busy} onClick={() => createTopUpBuild(selected)} className="mt-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Top up · Create lead list</button></div>
                                    <div className="flex items-center justify-between gap-3">
                                        <div><div className="text-sm font-semibold text-emerald-900">{selectedTopUpLeadList ? `${new Intl.NumberFormat().format(selectedTopUpGenericCount + selectedTopUpDirectCount)} qualified leads selected` : 'Continue the new build in Lead List Center'}</div><div className="mt-0.5 text-xs text-emerald-800/75">{selectedTopUpLeadList ? `${new Intl.NumberFormat().format(selectedTopUpGenericCount)} generic · ${new Intl.NumberFormat().format(selectedTopUpDirectCount)} direct · duplicates will be skipped` : 'The original lead list remains attached to the campaign.'}</div></div>
                                        <button disabled={!!busy || !selectedPreparedReceipt || !selectedTopUpLeadList || (!selectedTopUpGenericCount && !selectedTopUpDirectCount)} onClick={() => requestCampaignTopUp(selected)} className="shrink-0 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"><PlusIcon size={15} className="mr-1 inline"/>Upload completed top-up</button>
                                    </div>
                                    {fields.topUpStatus && optionName(selected, fields.topUpStatus) && <div className="rounded-lg border border-emerald-100 bg-emerald-50/70 px-3 py-2 text-xs text-emerald-900"><span className="font-semibold">{optionName(selected, fields.topUpStatus)}</span>{fields.topUpAdded && <> · {new Intl.NumberFormat().format(numericValue(selected, fields.topUpAdded) ?? 0)} added</>}{fields.topUpSkipped && <> · {new Intl.NumberFormat().format(numericValue(selected, fields.topUpSkipped) ?? 0)} skipped</>}{fields.topUpFailed && <> · {new Intl.NumberFormat().format(numericValue(selected, fields.topUpFailed) ?? 0)} failed</>}{fields.topUpMessage && textValue(selected, fields.topUpMessage) && <div className="mt-1 text-emerald-800/80">{textValue(selected, fields.topUpMessage)}</div>}</div>}
                                </div>
                            </div>}
                            {!('action' in selectedNextMove && selectedNextMove.action === 'top-up-leads') && !!textValue(selected, fields.bisonId).trim() && <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50/90 p-3 text-amber-950">
                                <div className="font-semibold">Manual top-up</div>
                                <p className="mt-1 text-xs leading-5 text-amber-800">This campaign has not reached the automatic KPI top-up threshold. You can still add another completed lead list after acknowledging the exception.</p>
                                <div className="mt-3 grid gap-3">
                                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3"><label className="block text-sm font-semibold text-blue-950">Use existing completed top-up<select aria-label="Existing completed top-up" value={existingTopUpChoice} disabled={!!busy} onChange={event=>setExistingTopUpChoice(event.currentTarget.value)} className="mt-2 w-full rounded-lg border bg-white p-2 text-xs"><option value="">Choose a Ready, QA-passed list…</option>{completedTopUpCandidates.map(c=><option key={c.id} value={c.id}>{c.name} · {c.counts.generic} generic / {c.counts.direct} direct</option>)}</select></label><button disabled={!!busy||!existingTopUpChoice||!topUpUploadReceiptField} onClick={()=>adoptExistingCompletedTopUp(selected)} className="mt-2 rounded-lg bg-blue-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">Use this completed top-up</button><p className="mt-2 text-xs text-blue-900">Checks the exact final source and prior imports, then links both existing destinations. This step does not upload or send.</p>{!topUpUploadReceiptField&&<p role="alert" className="mt-2 text-xs text-red-700">Enable Top-up Upload Receipt JSON in this interface’s data fields.</p>}{selectedTopUpLeadList&&!selectedPreparedReceipt&&<p className="mt-2 text-xs text-amber-800">Select this existing list to refresh its checks. Completed or uncertain uploads require reconciliation.</p>}</div>
                                    <div className="rounded-lg border bg-white p-3"><div className="text-sm font-semibold">{selectedTopUpLeadList ? (textValue(selectedTopUpLeadList, leadListFields.name) || selectedTopUpLeadList.name) : 'Create a new top-up list'}</div><p className="mt-1 text-xs">Copies your targeting and excludes contacts from this campaign’s attached lists for this build only.</p><button disabled={!!busy || !manualTopUpAcknowledged} onClick={() => createTopUpBuild(selected, true)} className="mt-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Top up · Create lead list</button></div>
                                    <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-white p-3 text-xs font-medium"><input type="checkbox" checked={manualTopUpAcknowledged} onChange={event => setManualTopUpAcknowledged(event.currentTarget.checked)} className="mt-0.5 h-4 w-4 accent-amber-600"/><span>I acknowledge this campaign has not reached the KPI top-up threshold and want to proceed.</span></label>
                                    <div className="flex items-center justify-between gap-3">
                                        <div><div className="text-sm font-semibold">{selectedTopUpLeadList ? `${new Intl.NumberFormat().format(selectedTopUpGenericCount + selectedTopUpDirectCount)} qualified leads selected` : 'Continue the new build in Lead List Center'}</div><div className="mt-0.5 text-xs text-amber-800">{selectedTopUpLeadList ? `${new Intl.NumberFormat().format(selectedTopUpGenericCount)} generic · ${new Intl.NumberFormat().format(selectedTopUpDirectCount)} direct · duplicates will be skipped` : 'The original lead list remains attached to the campaign.'}</div></div>
                                        <button disabled={!!busy || !manualTopUpAcknowledged || !selectedPreparedReceipt || !selectedTopUpLeadList || (!selectedTopUpGenericCount && !selectedTopUpDirectCount)} onClick={() => requestCampaignTopUp(selected, true)} className="shrink-0 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-40"><PlusIcon size={15} className="mr-1 inline"/>Upload completed top-up</button>
                                    </div>
                                </div>
                            </div>}
                            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-current/10 pt-3 text-xs">
                                <div className="rounded-xl bg-white/60 p-3">
                                    <div className="mb-2 font-semibold uppercase tracking-wide opacity-70">Positive replies</div>
                                    <div className="space-y-2">
                                        <div><div className="font-semibold">Agency</div><div className="opacity-80">{agencyPositiveReplyPercent === null ? 'No data' : `${agencyPositiveReplyPercent.toFixed(1)}% of replies`}</div><div className="opacity-70">{agencyEmailsPerPositiveReply === null ? 'No email ratio' : `1 per ${new Intl.NumberFormat().format(Math.round(agencyEmailsPerPositiveReply))} emails`}</div></div>
                                        <div className="border-t border-current/10 pt-2"><div className="font-semibold">Current client</div><div className="opacity-80">{selectedClientBenchmark?.positiveReplyPercent === null || selectedClientBenchmark?.positiveReplyPercent === undefined ? 'No data' : `${selectedClientBenchmark.positiveReplyPercent.toFixed(1)}% of replies`}</div><div className="opacity-70">{selectedClientBenchmark?.emailsPerPositiveReply === null || selectedClientBenchmark?.emailsPerPositiveReply === undefined ? 'No email ratio' : `1 per ${new Intl.NumberFormat().format(Math.round(selectedClientBenchmark.emailsPerPositiveReply))} emails`}</div></div>
                                    </div>
                                </div>
                                <div className="rounded-xl bg-white/60 p-3">
                                    <div className="mb-2 font-semibold uppercase tracking-wide opacity-70">Meetings booked</div>
                                    <div className="space-y-2">
                                        <div><div className="font-semibold">Agency</div><div className="opacity-80">{agencyMeetingBookedPercent === null ? 'No data' : `${agencyMeetingBookedPercent.toFixed(1)}% of positive replies`}</div><div className="opacity-70">{agencyEmailsPerMeeting === null ? 'No email ratio' : `1 per ${new Intl.NumberFormat().format(Math.round(agencyEmailsPerMeeting))} emails`}</div></div>
                                        <div className="border-t border-current/10 pt-2"><div className="font-semibold">Current client</div><div className="opacity-80">{selectedClientBenchmark?.meetingBookedPercent === null || selectedClientBenchmark?.meetingBookedPercent === undefined ? 'No data' : `${selectedClientBenchmark.meetingBookedPercent.toFixed(1)}% of positive replies`}</div><div className="opacity-70">{selectedClientBenchmark?.emailsPerMeeting === null || selectedClientBenchmark?.emailsPerMeeting === undefined ? 'No email ratio' : `1 per ${new Intl.NumberFormat().format(Math.round(selectedClientBenchmark.emailsPerMeeting))} emails`}</div></div>
                                    </div>
                                </div>
                            </div>
                        </div>}

                        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                            <div className="mb-3 flex items-center justify-between"><div><h3 className="font-semibold text-gray-950">KPI performance</h3><p className={`text-xs ${muted}`}>Benchmarked against Dulcy's campaign targets</p></div><span className="rounded-full bg-purple-50 px-2.5 py-1 text-[11px] font-semibold text-purple-700">Current results</span></div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className={`rounded-xl border p-3 ${selectedReplyKpi.chip}`}><div className="text-[10px] font-semibold uppercase tracking-wide opacity-75">Reply rate</div><div className="mt-1 text-xl font-bold">{selectedReplyRate === null ? '—' : `${selectedReplyRate.toFixed(1)}%`}</div><div className="mt-1 text-xs font-semibold">{selectedReplyKpi.label}</div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/70"><div className={`h-full rounded-full ${selectedReplyKpi.bar}`} style={{width: selectedReplyKpi.score === null ? '0%' : ((selectedReplyKpi.score + 1) * 20) + '%'}}/></div></div>
                                <div className={`rounded-xl border p-3 ${selectedInterestedKpi.chip}`}><div className="text-[10px] font-semibold uppercase tracking-wide opacity-75">Interested rate</div><div className="mt-1 text-xl font-bold">{selectedInterestedRate === null ? '—' : `${selectedInterestedRate.toFixed(1)}%`}</div><div className="mt-1 text-xs font-semibold">{selectedInterestedKpi.label}</div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/70"><div className={`h-full rounded-full ${selectedInterestedKpi.bar}`} style={{width: selectedInterestedKpi.score === null ? '0%' : ((selectedInterestedKpi.score + 1) * 20) + '%'}}/></div></div>
                                <div className={`rounded-xl border p-3 ${selectedBounceKpi.chip}`}><div className="text-[10px] font-semibold uppercase tracking-wide opacity-75">Bounce rate</div><div className="mt-1 text-xl font-bold">{selectedBounceRate === null ? '—' : `${selectedBounceRate.toFixed(1)}%`}</div><div className="mt-1 text-xs font-semibold">{selectedBounceKpi.label}</div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/70"><div className={`h-full rounded-full ${selectedBounceKpi.bar}`} style={{width: selectedBounceKpi.score === null ? '0%' : ((selectedBounceKpi.score + 1) * 20) + '%'}}/></div></div>
                                <div className={`rounded-xl border p-3 ${selectedMeetingKpi.chip}`}><div className="text-[10px] font-semibold uppercase tracking-wide opacity-75">Meeting booked rate</div><div className="mt-1 text-xl font-bold">{selectedMeetingRate === null ? '—' : `${selectedMeetingRate.toFixed(1)}%`}</div><div className="mt-1 text-xs font-semibold">{selectedMeetingKpi.label}</div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/70"><div className={`h-full rounded-full ${selectedMeetingKpi.bar}`} style={{width: selectedMeetingKpi.score === null ? '0%' : ((selectedMeetingKpi.score + 1) * 20) + '%'}}/></div></div>
                            </div>
                            {selectedReplyRate !== null && selectedReplyRate >= 5 && selectedInterestedRate !== null && selectedInterestedRate < 15 && selectedEmailsPerLead !== null && selectedEmailsPerLead <= 250 && <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs leading-5 text-blue-800"><strong>High-reply context:</strong> Interested percentage is diluted because the campaign is generating unusually high reply volume. Positive-reply efficiency is still healthy at one per {new Intl.NumberFormat().format(Math.round(selectedEmailsPerLead))} emails, so the low interested percentage is not treated as a standalone failure.</div>}
                            <div className="mt-3 grid grid-cols-2 gap-3">
                                <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3"><div className="text-[10px] font-semibold uppercase tracking-wide text-indigo-500">Emails per positive reply</div><div className="mt-1 text-xl font-bold text-indigo-900">{selectedEmailsPerLead === null ? '—' : `1 per ${new Intl.NumberFormat().format(Math.round(selectedEmailsPerLead))}`}</div><div className="mt-1 text-xs text-indigo-600">Emails sent ÷ interested replies</div></div>
                                <div className="rounded-xl border border-cyan-100 bg-cyan-50 p-3"><div className="text-[10px] font-semibold uppercase tracking-wide text-cyan-600">Emails per meeting</div><div className="mt-1 text-xl font-bold text-cyan-900">{selectedEmailsPerMeeting === null ? '—' : `1 per ${new Intl.NumberFormat().format(Math.round(selectedEmailsPerMeeting))}`}</div><div className="mt-1 text-xs text-cyan-700">Emails sent ÷ meetings booked</div></div>
                            </div>
                            <details className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600"><summary className="cursor-pointer font-semibold text-gray-700">View KPI ranges</summary><div className="mt-2 grid grid-cols-2 gap-3 leading-5"><div><strong>Reply</strong><br/>Bad: under 1%<br/>Ideal: 3–5%<br/>Good: 5%+</div><div><strong>Interested</strong><br/>Bad: under 5%<br/>Ideal: 15–20%<br/>Good: 20%+</div><div><strong>Bounce</strong><br/>Good: under 1%<br/>Average: 2–3%<br/>Bad: 4%+</div><div><strong>Meeting booked</strong><br/>Bad: under 10%<br/>Ideal: 30–40%<br/>Good: 40%+</div></div></details>
                        </div>

                        {fields.progress && <div className="rounded-xl border border-purple-200 bg-gradient-to-br from-purple-50 to-indigo-50 p-4">
                            <div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wide text-purple-600">Campaign progress</span><span className="font-semibold text-purple-900"><CellRenderer record={selected} field={fields.progress}/></span></div>
                            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white shadow-inner"><div className="h-full rounded-full bg-gradient-to-r from-purple-500 to-indigo-500 transition-all" style={{width: selectedProgressBarWidth + '%'}}/></div>
                        </div>}

                        <div className="grid grid-cols-2 gap-3">
                            {fields.totalLeads && <div className="min-h-[92px] rounded-xl border border-slate-200 bg-slate-50 p-3 text-slate-700"><div className="text-[11px] font-semibold uppercase tracking-wide opacity-75">Total leads</div><div className="mt-2 text-lg font-semibold text-gray-900"><CellRenderer record={selected} field={fields.totalLeads}/></div></div>}
                            {fields.contacted && <div className="min-h-[92px] rounded-xl border border-blue-200 bg-blue-50 p-3 text-blue-700"><div className="text-[11px] font-semibold uppercase tracking-wide opacity-75">Contacted</div><div className="mt-2 text-lg font-semibold text-gray-900"><CellRenderer record={selected} field={fields.contacted}/></div></div>}
                            {fields.emailsSent && <div className="min-h-[92px] rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-indigo-700"><div className="text-[11px] font-semibold uppercase tracking-wide opacity-75">Emails sent</div><div className="mt-2 text-lg font-semibold text-gray-900"><CellRenderer record={selected} field={fields.emailsSent}/></div></div>}
                            {fields.repliesData && <div className="min-h-[92px] rounded-xl border border-cyan-200 bg-cyan-50 p-3 text-cyan-700"><div className="text-[11px] font-semibold uppercase tracking-wide opacity-75">Replies</div><div className="mt-2 text-lg font-semibold text-gray-900"><CellRenderer record={selected} field={fields.repliesData}/></div></div>}
                            {fields.bouncesData && <div className="min-h-[92px] rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-700"><div className="text-[11px] font-semibold uppercase tracking-wide opacity-75">Bounces</div><div className="mt-2 text-lg font-semibold text-gray-900"><CellRenderer record={selected} field={fields.bouncesData}/></div></div>}
                            {fields.interestedData && <div className="min-h-[92px] rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-700"><div className="text-[11px] font-semibold uppercase tracking-wide opacity-75">Interested</div><div className="mt-2 text-lg font-semibold text-gray-900"><CellRenderer record={selected} field={fields.interestedData}/></div></div>}
                            {fields.meetingsData && <div className="min-h-[92px] rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-700"><div className="text-[11px] font-semibold uppercase tracking-wide opacity-75">Meetings booked</div><div className="mt-2 text-lg font-semibold text-gray-900"><CellRenderer record={selected} field={fields.meetingsData}/></div></div>}
                            {fields.workspace && <div className="min-h-[92px] rounded-xl border border-gray-200 bg-gray-50 p-3 text-gray-700"><div className="text-[11px] font-semibold uppercase tracking-wide opacity-75">Workspace</div><div className="mt-2 text-lg font-semibold text-gray-900"><CellRenderer record={selected} field={fields.workspace}/></div></div>}
                        </div>

                        {fields.bisonUrl && <button onClick={() => { const campaignBisonLink = textValue(selected, fields.bisonUrl); if (campaignBisonLink.toLowerCase().startsWith('https://')) window.open(campaignBisonLink, '_blank', 'noopener,noreferrer'); else setNotice({kind:'error', text:'The Bison URL must be a valid HTTPS URL.'}); }} className="w-full bg-purple-600 text-white rounded-md py-2">Open in Bison</button>}
                    </div>}
                    {selectedSenderUpdate.status && <div role="status" className={`mt-4 rounded-xl border p-4 text-sm ${selectedSenderUpdate.status === 'Failed' || selectedSenderUpdate.requiresAttention ? 'border-red-200 bg-red-50 text-red-900' : selectedSenderUpdate.status === 'Completed' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-blue-200 bg-blue-50 text-blue-900'}`}>
                        <div className="font-semibold">Sender update · {selectedSenderUpdate.status}</div>
                        <p className="mt-1">{selectedSenderUpdate.message}</p>
                        {senderUpdatePending && Date.now() - Date.parse(selectedSenderUpdate.updatedAt || selectedSenderUpdate.requestedAt || '') > 10 * 60 * 1000 && <p className="mt-2 font-semibold">This update is taking longer than expected. Check the n8n run before retrying; completion has not been confirmed.</p>}
                        {selectedSenderUpdate.executionId && <a className="mt-2 inline-block underline" href={`https://n8n.dulcy.io/executions/${encodeURIComponent(selectedSenderUpdate.executionId)}`} target="_blank" rel="noreferrer">View automation run</a>}
                    </div>}
                    {tab === 'senders' && <div className="space-y-4">
                        {textValue(selected, fields.bisonId) && <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                            <div className="font-semibold text-blue-950">Apply selected senders to this campaign</div>
                            <p className="mt-1 text-sm text-blue-800">After changing your selection below, update the attached accounts in EmailBison. The campaign pauses for the change and resumes only if it was already running.</p>
                            <button disabled={senderUpdatePending || !!busy || senderUpdatePending || !selectedEmailAccountIds.length} onClick={updateCampaignSenders} className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{senderUpdatePending ? 'Sender update pending…' : `Update campaign senders (${selectedEmailAccountIds.length})`}</button>
                        </div>}
                        <div className="flex items-center justify-between gap-3 rounded-xl border border-purple-200 bg-purple-50/70 px-4 py-3">
                            <div><div className="text-sm font-semibold text-purple-950">Sender data</div><div className="text-xs text-purple-700">Refresh assignments from EmailBison before making allocation decisions.</div></div>
                            <button disabled={senderUpdatePending || !!busy} onClick={syncBisonSenders} className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-purple-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-purple-700 disabled:opacity-50"><ArrowsClockwiseIcon className={busy === 'Bison sender sync request' ? 'animate-spin' : ''} size={14}/>{busy === 'Bison sender sync request' ? 'Syncing…' : 'Sync Bison Senders'}</button>
                        </div>
                        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4"><h3 className="font-semibold text-indigo-950">Sender accounts</h3><p className="mt-1 text-sm text-indigo-700">The total counts unique senders. Warming is a separate label and can overlap with Reserved Next or Sending. Reserved Next means already allocated to an upcoming campaign; those accounts cannot be selected for another campaign. Unassigned warming accounts can be selected in advance; sending follows the campaign schedule. Available means warmed and free now. Releasing Soon means an active campaign is at least 60% complete.</p><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-6"><div className="rounded-lg border border-emerald-200 bg-white p-2"><div className="text-[10px] font-semibold uppercase text-emerald-700">Available</div><div className="text-xl font-bold text-emerald-900">{senderStatusCounts.available}</div></div><div className="rounded-lg border border-amber-200 bg-white p-2"><div className="text-[10px] font-semibold uppercase text-amber-700">Sending</div><div className="text-xl font-bold text-amber-900">{senderStatusCounts.sending}</div></div><div className="rounded-lg border border-blue-200 bg-white p-2"><div className="text-[10px] font-semibold uppercase text-blue-700">Releasing Soon</div><div className="text-xl font-bold text-blue-900">{senderStatusCounts['releasing-soon']}</div></div><div className="rounded-lg border border-purple-200 bg-white p-2"><div className="text-[10px] font-semibold uppercase text-purple-700">Reserved Next</div><div className="text-xl font-bold text-purple-900">{senderStatusCounts['reserved-next']}</div></div><div className="rounded-lg border border-red-200 bg-white p-2"><div className="text-[10px] font-semibold uppercase text-red-700">Disconnected</div><div className="text-xl font-bold text-red-900">{senderStatusCounts.disconnected}</div></div><div className="rounded-lg border border-orange-200 bg-white p-2"><div className="text-[10px] font-semibold uppercase text-orange-700">Warming</div><div className="text-xl font-bold text-orange-900">{senderStatusCounts.warming}</div></div></div><div className="mt-2 text-xs font-semibold text-indigo-800">{workspaceEmailAccounts.length} unique sender accounts in this workspace</div><div className="mt-3 flex flex-wrap items-end gap-2"><label className="text-xs font-semibold text-indigo-900">Number to select<input type="number" min={1} max={Math.max(1, visibleSelectableWorkspaceEmailAccounts.length)} value={accountSelectionCount} onChange={event => setAccountSelectionCount(Math.max(1, Number(event.currentTarget.value) || 1))} className="mt-1 block w-28 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none"/></label><button disabled={senderUpdatePending || !!busy || !visibleSelectableWorkspaceEmailAccounts.length} onClick={selectAvailableEmailAccounts} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{senderStatusFilter === 'available' ? 'Select available' : 'Select matching'}</button><button disabled={senderUpdatePending || !!busy || !visibleSelectableWorkspaceEmailAccounts.length} onClick={selectAllMatchingEmailAccounts} className="rounded-lg border border-indigo-300 bg-white px-4 py-2 text-sm font-semibold text-indigo-700 disabled:opacity-50">Select all matches</button><button disabled={senderUpdatePending || !!busy || !selectedEmailAccountIds.length} onClick={unselectAllEmailAccounts} className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50">Unselect all</button><div className="pb-2 text-xs text-indigo-700">{visibleSelectableWorkspaceEmailAccounts.length} selectable after current filters · {selectedEmailAccountIds.length} selected · {selectedSenderDailyCapacity.toLocaleString()} combined daily limit</div></div>{selectedVerifiedLeadCount > 0 && <div className={`mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 ${senderSelectionBlocked ? 'border-red-200 bg-red-50 text-red-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}><div className="text-sm"><div className="font-semibold">Maximum: {recommendedSenderCount} sender account{recommendedSenderCount === 1 ? '' : 's'}</div><div className="mt-1 text-xs">{selectedVerifiedLeadCount.toLocaleString()} verified leads with a {selectedStepDelayDays}-day delay support about {supportedNewLeadsPerDay.toLocaleString()} new leads per sending day. {selectedEmailAccountIds.length} currently selected. Fewer senders are allowed; this number is the maximum, not a minimum.</div></div>{senderSelectionBlocked && <button disabled={senderUpdatePending || !!busy} onClick={useRecommendedEmailAccounts} className="rounded-lg bg-red-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Select up to {recommendedSenderCount}</button>}</div>}<div className="mt-3 grid grid-cols-[minmax(0,1fr)_170px] gap-2"><input value={accountSearch} onChange={event => setAccountSearch(event.currentTarget.value)} placeholder="Search email or domain, e.g. usedulcy.io" className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none placeholder:text-gray-400"/><select aria-label="Sender account status" value={senderStatusFilter} onChange={event => setSenderStatusFilter(event.currentTarget.value)} className="rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm font-semibold text-indigo-900 outline-none"><option value="all">All statuses</option><option value="available">Available</option><option value="sending">Sending</option><option value="releasing-soon">Releasing Soon</option><option value="reserved-next">Reserved Next</option><option value="disconnected">Disconnected</option><option value="warming">Warming</option></select></div></div>
                        {!fields.emailAccounts && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Add a linked-record field named <strong>Email Accounts</strong> to Campaigns and link it to the Email Accounts table.</div>}
                        {emailAccountsTable && !visibleWorkspaceEmailAccounts.length && <div className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">No accounts match this workspace, search, and status filter.</div>}
                        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"><div className="max-h-[620px] divide-y divide-gray-100 overflow-auto">{visibleWorkspaceEmailAccounts.map(accountRecord => {
                            const accountIsSelected = selectedEmailAccountIds.includes(accountRecord.id);
                            const accountState = getEmailAccountState(accountRecord);
                            const accountLabel = textValue(accountRecord, emailAccountFields.name) || accountRecord.name || 'Unnamed account';
                            const cannotSelect = !accountState.selectable && !accountIsSelected;
                            const accountDailyLimit = numericValue(accountRecord, emailAccountFields.dailyLimit);
                            const stateLabel = accountState.state === 'warming' ? 'Warming' : accountState.state === 'releasing-soon' ? 'Releasing Soon' : accountState.state === 'reserved-next' ? 'Reserved Next' : accountState.state === 'sending' ? 'Sending' : accountState.state === 'disconnected' ? 'Disconnected' : 'Available';
                            const stateStyle = accountState.state === 'disconnected' ? 'border-red-200 bg-red-50 text-red-800' : accountState.state === 'warming' ? 'border-orange-200 bg-orange-50 text-orange-800' : accountState.state === 'sending' ? 'border-amber-200 bg-amber-50 text-amber-800' : accountState.state === 'releasing-soon' ? 'border-blue-200 bg-blue-50 text-blue-800' : accountState.state === 'reserved-next' ? 'border-purple-200 bg-purple-50 text-purple-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800';
                            return <label key={accountRecord.id} className={`flex items-center gap-3 p-3 ${cannotSelect ? 'cursor-not-allowed bg-gray-50' : 'cursor-pointer hover:bg-indigo-50/50'} ${accountIsSelected ? 'bg-indigo-50' : ''}`}><input type="checkbox" checked={accountIsSelected} disabled={senderUpdatePending || !!busy || cannotSelect} onChange={event => toggleCampaignEmailAccount(accountRecord.id, event.currentTarget.checked)} className="h-4 w-4 shrink-0 accent-indigo-600"/><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-gray-950">{accountLabel}</div><div className="mt-1 flex flex-wrap gap-2 text-xs text-gray-600">{accountState.status && <span>{accountState.status}</span>}</div></div><span className="shrink-0 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-800">Daily: {accountDailyLimit === null ? 'Not set' : accountDailyLimit.toLocaleString()}</span><span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${stateStyle}`}>{stateLabel}</span>{accountState.warming && accountState.state !== 'warming' && <span className="shrink-0 rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-800">Warming</span>}</label>;
                        })}</div></div>
                        <div className="flex justify-end"><button onClick={() => setTab('settings')} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Continue to settings</button></div>
                    </div>}
                    {tab === 'strategy' && <div className="space-y-5">
                        <div className="rounded-xl border border-purple-200 bg-purple-50 p-4"><h3 className="font-semibold text-purple-900">Campaign strategy</h3><p className="mt-1 text-sm text-purple-700">Build the brief, targeting thesis, lead-list connection, and launch timeline. Changes save to the Campaign record.</p></div>
                        <div><label className={editorLabel}>Campaign name</label><input className={editorControl} defaultValue={textValue(selected, fields.name)} onBlur={event => saveSelectedField(fields.name, event.currentTarget.value, 'campaign name')}/></div>
                        <div className="grid grid-cols-2 gap-3">
                            {fields.campaignApproach && <div><label className={editorLabel}>Campaign approach</label><select className={editorControl} value={optionName(selected, fields.campaignApproach)} onChange={event => saveSelectedField(fields.campaignApproach, selectWriteValue(fields.campaignApproach, event.currentTarget.value), 'campaign approach')}><option value="">Select approach</option>{selectOptions(fields.campaignApproach, campaigns).map(approachChoice => <option key={approachChoice} value={approachChoice}>{approachChoice}</option>)}</select></div>}
                            {fields.prepDate && <div><label className={editorLabel}>Campaign prep date</label><input type="date" className={editorControl} defaultValue={dateInputValue(selected, fields.prepDate)} onBlur={event => saveSelectedField(fields.prepDate, event.currentTarget.value || null, 'campaign prep date')}/></div>}
                            {fields.launchDate && <div><label className={editorLabel}>Estimated launch date</label><input type="date" className={editorControl} defaultValue={dateInputValue(selected, fields.launchDate)} onBlur={event => saveSelectedField(fields.launchDate, event.currentTarget.value || null, 'estimated launch date')}/></div>}
                        </div>
                        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4"><div className="mb-3"><div className="font-semibold text-blue-900">Client-wide pivot options</div><p className="text-sm text-blue-700">Saved once for {selectedClientRecord?.name ?? 'the linked client'} and inherited by every campaign for that client. Both options default to on.</p></div><div className="grid grid-cols-2 gap-3">{clientFields.newVerticalPivot && <label className="flex items-center gap-2 rounded-lg border border-blue-200 bg-white p-3 text-sm font-medium text-gray-800"><input type="checkbox" checked={selectedPivotOptions.newVertical} disabled={!selectedClientRecord || !!busy} onChange={event => saveClientPivot(clientFields.newVerticalPivot, event.currentTarget.checked, 'new vertical pivot')}/><span>Can enter a new vertical</span></label>}{clientFields.newOfferPivot && <label className="flex items-center gap-2 rounded-lg border border-blue-200 bg-white p-3 text-sm font-medium text-gray-800"><input type="checkbox" checked={selectedPivotOptions.newOffer} disabled={!selectedClientRecord || !!busy} onChange={event => saveClientPivot(clientFields.newOfferPivot, event.currentTarget.checked, 'new offer pivot')}/><span>Can create a new offer</span></label>}</div>{!selectedClientRecord && <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Link this campaign to a client to save the shared pivot settings.</div>}</div>
                        {fields.thesis && <div><label className={editorLabel}>Campaign thesis</label><textarea rows={8} className={editorControl} defaultValue={textValue(selected, fields.thesis)} onBlur={event => saveCampaignThesis(event.currentTarget.value)}/><p className="mt-2 text-xs leading-5 text-gray-500">Saving this also updates the linked Lead List’s Targeting Sentence.</p></div>}
                        {selectedLeadList && leadListFields.link && <div><label className={editorLabel}>Lead list link</label><input key={selectedLeadList.id} type="url" className={editorControl} defaultValue={textValue(selectedLeadList, leadListFields.link)} onBlur={event => saveLeadListField(leadListFields.link, event.currentTarget.value || null, 'lead list link')}/></div>}
                        {campaignLeadListLinkField && <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"><div className={editorLabel}>Linked lead-list record</div>{selectedLeadList ? <div><div className="rounded-lg border border-gray-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-gray-900">{textValue(selectedLeadList, leadListFields.name) || selectedLeadList.name}</div><button className="mt-3 rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 text-sm font-semibold text-purple-700 hover:bg-purple-100" onClick={() => leadListsTable?.hasPermissionToExpandRecords() ? expandRecord(selectedLeadList) : setNotice({kind: 'error', text: 'You do not have permission to open the linked Lead List record.'})}>Open linked lead list in Airtable</button></div> : <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">No Lead List record is linked to this campaign yet.</div>}<div className="mt-4"><label className={editorLabel}>{selectedLeadList ? 'Change lead list' : 'Select a lead list for this client'}</label>{!leadListsTable ? <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Configure the Lead lists table in Custom properties first.</div> : !leadListFields.client ? <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">The Lead Lists table needs a Client linked-record field so Campaign Center can safely filter the choices.</div> : clientLeadListOptions.length ? <select className={editorControl} value={selectedLeadList?.id ?? ''} disabled={!!busy} onChange={event => linkLeadListToCampaign(event.currentTarget.value)}><option value="">Select a lead list…</option>{clientLeadListOptions.map(leadListOption => <option key={leadListOption.id} value={leadListOption.id}>{textValue(leadListOption, leadListFields.name) || leadListOption.name}</option>)}</select> : <div className="rounded-lg border border-gray-200 bg-slate-50 p-3 text-sm text-gray-600">No Lead Lists are linked to {textValue(selected, fields.client) || clientFilter}. Add the client to a Lead List record, then it will appear here.</div>}</div></div>}
                        <div className="flex justify-end"><button onClick={() => setTab('copy')} className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white">Continue to copy</button></div>
                    </div>}

                    {tab === 'copy' && <div className="space-y-5">
                        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4"><h3 className="font-semibold text-indigo-900">Campaign copy</h3><p className="mt-1 text-sm text-indigo-700">Write the client-review version here. Approved copy remains separate from later spintax and EmailBison build output.</p><p className="mt-2 text-sm text-indigo-700"><span className="font-semibold">Using split tests?</span> Start each subject and copy block on a new line with <span className="font-mono">Variant 1</span>, <span className="font-mono">Variant 2</span>, and so on (A, B, C also works). “Refresh from approved copy” will preview and create the matching sequence variants.</p></div>
                        {[
                            [1, fields.subject1, fields.body1, null],
                            [2, fields.subject2, fields.body2, fields.threadReply2],
                            [3, fields.subject3, fields.body3, fields.threadReply3],
                            [4, fields.subject4, fields.body4, fields.threadReply4],
                        ].map(([sequenceNumber, sequenceSubject, sequenceBody, sequenceThreadReply]) => {
                            const reviewStepNumber = sequenceNumber as number;
                            const reviewThreadReplyField = sequenceThreadReply as AnyField | null;
                            const reviewIsThreadReply = reviewStepNumber > 1 && Boolean(cellValue(selected, reviewThreadReplyField));
                            const reviewReplySubject = `Re: ${textValue(selected, fields.subject1).replace(/^re:\s*/i, '')}`;
                            return <div key={reviewStepNumber} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"><div className="mb-3 flex items-center justify-between gap-3"><h4 className="font-semibold text-gray-900">Email {reviewStepNumber}</h4>{reviewStepNumber > 1 && (reviewThreadReplyField ? <label className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800"><input type="checkbox" checked={reviewIsThreadReply} onChange={event => saveSelectedField(reviewThreadReplyField, event.currentTarget.checked, `step ${reviewStepNumber} thread reply`)}/><span>Thread reply</span></label> : <span className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">Add Thread Reply - Step {reviewStepNumber}</span>)}</div>{sequenceSubject && <div><label className={editorLabel}>Subject line</label><input className={`${editorControl} ${reviewIsThreadReply ? 'bg-slate-100 text-gray-500' : ''}`} disabled={reviewIsThreadReply} value={reviewIsThreadReply ? reviewReplySubject : undefined} defaultValue={reviewIsThreadReply ? undefined : textValue(selected, sequenceSubject as AnyField)} onBlur={event => { if (!reviewIsThreadReply) saveSelectedField(sequenceSubject as AnyField, event.currentTarget.value, `email ${reviewStepNumber} subject`); }}/>{reviewIsThreadReply && <p className="mt-1.5 text-xs text-blue-700">Uses the Step 1 subject automatically.</p>}</div>}{sequenceBody && <div className="mt-3"><label className={editorLabel}>Email copy</label><textarea rows={8} className={editorControl} defaultValue={textValue(selected, sequenceBody as AnyField)} onBlur={event => saveSelectedField(sequenceBody as AnyField, event.currentTarget.value, `email ${reviewStepNumber} copy`)}/></div>}</div>;
                        })}
                        <div className="flex items-center justify-between rounded-xl border border-purple-200 bg-purple-50 p-4"><div><div className="font-semibold text-purple-900">Ready for client review?</div><div className="text-sm text-purple-700">This moves the workflow to Client Review.</div></div><button onClick={() => moveWorkflow('Client Review')} className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white">Send for approval</button></div>
                        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="font-semibold text-amber-950">Client approval exception</div><div className="mt-1 text-sm leading-5 text-amber-800">Only use this when the agreement or campaign process does not require client approval. This records Approved - Dulcy and prepares the sequence without sending it to Client Review.</div></div><button disabled={!skipApprovalConfirmed || !!busy} onClick={() => approveAndPrepareSequence(true)} className="shrink-0 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-40">Skip approval + prepare</button></div><label className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-white p-3 text-sm font-medium text-amber-950"><input type="checkbox" checked={skipApprovalConfirmed} onChange={event => setSkipApprovalConfirmed(event.currentTarget.checked)} className="mt-0.5 h-4 w-4 accent-amber-600"/><span>I confirm client approval is not required for this campaign.</span></label></div>
                    </div>}

                    {tab === 'approval' && <div className="space-y-4">
                        {campaignApprovedByDulcy && <div className="rounded-2xl border border-blue-300 bg-blue-50 p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-bold uppercase tracking-wider text-blue-600">Approval decision</div><h3 className="mt-1 text-xl font-bold text-blue-950">Approved - Dulcy</h3><p className="mt-1 text-sm text-blue-800">Dulcy approved this campaign internally because client approval was not required. Historical client feedback remains available below for context.</p></div><span className="shrink-0 rounded-full border border-blue-200 bg-white px-3 py-1 text-xs font-semibold text-blue-700">Internal approval</span></div></div>}
                        {clientRequestedChanges && <div className="rounded-2xl border border-orange-300 bg-orange-50 p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-bold uppercase tracking-wider text-orange-600">Client decision</div><h3 className="mt-1 text-xl font-bold text-orange-950">Changes requested</h3><p className="mt-1 text-sm text-orange-800">Review the requested area and feedback below, make the revisions, then resubmit the campaign.</p></div><span className="shrink-0 rounded-full border border-orange-200 bg-white px-3 py-1 text-xs font-semibold text-orange-700">Action required</span></div></div>}
                        {clientHasApproved && <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Client decision</div><h3 className="mt-1 text-xl font-bold text-emerald-950">Campaign approved</h3><p className="mt-1 text-sm text-emerald-800">The client approved the campaign. Prepare the final sequence when ready.</p></div><span className="shrink-0 rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-semibold text-emerald-700">Approved</span></div></div>}
                        {!campaignApprovedByDulcy && !clientRequestedChanges && !clientHasApproved && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-bold uppercase tracking-wider text-amber-600">Client decision</div><h3 className="mt-1 text-xl font-bold text-amber-950">{selectedClientDecision || 'Waiting for response'}</h3><p className="mt-1 text-sm text-amber-800">The client has not submitted a final approval yet.</p></div><span className="shrink-0 rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-semibold text-amber-700">Pending</span></div></div>}
                        {clientRequestedChanges && <div className="space-y-3"><div className="rounded-xl border border-orange-200 bg-white p-4 shadow-sm"><div className="text-[10px] font-semibold uppercase tracking-wider text-orange-500">Requested change area</div><div className="mt-2 text-lg font-bold text-gray-950">{selectedRequestedChangeArea || 'Not specified'}</div></div><div className="rounded-xl border border-purple-200 bg-white p-4 shadow-sm"><div className="text-[10px] font-semibold uppercase tracking-wider text-purple-500">What the client said</div><div className="mt-2 whitespace-pre-wrap text-sm font-medium leading-6 text-gray-900">{selectedPrimaryFeedback || 'No written feedback was provided.'}</div></div></div>}
                        {!clientRequestedChanges && fields.selectChanges && selectedRequestedChangeArea && <div className="rounded-xl border border-gray-200 bg-white p-4"><div className={editorLabel}>Requested change area</div><div className="font-semibold text-gray-900">{selectedRequestedChangeArea}</div></div>}
                        {!clientRequestedChanges && fields.reviewCopy && selectedPrimaryFeedback && <div className="rounded-xl border border-gray-200 bg-white p-4"><div className={editorLabel}>Copy feedback</div><div className="whitespace-pre-wrap text-sm leading-6 text-gray-900">{selectedPrimaryFeedback}</div></div>}
                        {!!selectedAdditionalFeedback.length && <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"><div className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Additional feedback</div><div className="space-y-3">{selectedAdditionalFeedback.map(([feedbackField, feedbackLabel]) => <div key={feedbackLabel as string} className="rounded-lg border border-gray-100 bg-slate-50 p-3"><div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{feedbackLabel as string}</div><div className="mt-1 whitespace-pre-wrap text-sm text-gray-900">{textValue(selected, feedbackField as AnyField)}</div></div>)}</div></div>}
                        {!campaignApprovedByDulcy && (clientRequestedChanges ? <button disabled={!!busy} onClick={() => moveWorkflow('Changes Requested')} className="w-full rounded-xl border border-orange-300 bg-orange-600 px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-orange-700 disabled:opacity-40">Move campaign to revision</button> : <div className="grid grid-cols-2 gap-3"><button onClick={() => moveWorkflow('Changes Requested')} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700">Mark changes requested</button><button disabled={!clientHasApproved || !!busy} onClick={() => approveAndPrepareSequence()} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">Approve + prepare sequence</button></div>)}
                    </div>}

                    {tab === 'sequence' && <div className="space-y-5">
                        <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-emerald-950">Final campaign sequence</h3><p className="mt-1 text-sm text-emerald-800">Step A is copied from the approved Email 1–4 review fields. Add B/C split-test variants, set the delay, then generate and validate spintax.</p></div><span className="shrink-0 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">Approved copy</span></div></div>
                        <div className="flex flex-wrap gap-2"><button disabled={!!busy} onClick={prepareSequenceFromReview} className="rounded-lg border border-purple-300 bg-white px-3 py-2 text-sm font-semibold text-purple-700 hover:bg-purple-50 disabled:opacity-40">Refresh from approved copy</button><button disabled={!!busy || !fields.createSpintax || trackedOperation?.type === 'spintax'} onClick={generateValidatedSpintax} className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:shadow-md disabled:cursor-not-allowed disabled:opacity-40">{trackedOperation?.type === 'spintax' && <ArrowsClockwiseIcon className="animate-spin" size={15}/>} {trackedOperation?.type === 'spintax' ? 'Spintax running…' : 'Generate + validate spintax'}</button></div>
                        {!fields.createSpintax && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Enable <strong>create_spintax</strong> under Data → Fields to activate the automation button.</div>}
                        {finalSequenceSteps.slice(0, visibleSequenceStepLimit).map((finalSequenceStep, finalStepIndex) => <React.Fragment key={finalSequenceStep.number}>
                            {finalSequenceStep.number > 1 && (finalSequenceStep.threadReply ? <label className="flex items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900"><span><span className="block font-semibold">Thread reply</span><span className="block text-xs text-blue-700">When enabled, EmailBison uses <strong>{threadReplySubjectForVariant(finalSequenceStep.number, `${finalSequenceStep.number}A`)}</strong> and keeps this step in the original thread.</span></span><input type="checkbox" checked={Boolean(cellValue(selected, finalSequenceStep.threadReply))} onChange={event => saveSelectedField(finalSequenceStep.threadReply, event.currentTarget.checked, `step ${finalSequenceStep.number} thread reply`)} className="h-4 w-4 shrink-0 accent-blue-600"/></label> : <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Add a checkbox field named <strong>Thread Reply - Step {finalSequenceStep.number}</strong> to Campaigns.</div>)}
                            <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-gray-200 bg-slate-50 px-4 py-3"><div><div className="text-xs font-semibold uppercase tracking-wider text-purple-600">Step {finalSequenceStep.number}</div><div className="text-sm text-gray-500">{visibleVariantLimitForStep(finalSequenceStep.number)} {visibleVariantLimitForStep(finalSequenceStep.number) === 1 ? 'variant' : 'split-test variants'}</div></div><span className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-600">Email {finalSequenceStep.number}</span></div><div className="space-y-4 p-4">{finalSequenceStep.variants.slice(0, visibleVariantLimitForStep(finalSequenceStep.number)).map(finalSequenceVariant => <div key={finalSequenceVariant.name} className="rounded-xl border border-gray-200 bg-white p-4 transition-all hover:border-purple-200 hover:shadow-sm"><div className="mb-3 flex items-center justify-between">{finalSequenceVariant.name.endsWith('A') ? <span className="text-xs font-medium text-emerald-600">Primary approved version</span> : finalSequenceVariant.name === finalSequenceStep.variants[visibleVariantLimitForStep(finalSequenceStep.number) - 1]?.name && <button title={`Delete Variant ${finalSequenceVariant.name}`} disabled={!!busy} onClick={() => removeSequenceVariant(finalSequenceStep.number, finalSequenceVariant.name, finalSequenceVariant.subject, finalSequenceVariant.body)} className="flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-40"><XIcon size={14}/> Delete</button>}</div>{finalSequenceVariant.subject ? <div><label className={editorLabel}>Subject line</label><input className={editorControl} defaultValue={textValue(selected, finalSequenceVariant.subject)} onBlur={event => saveSelectedField(finalSequenceVariant.subject, event.currentTarget.value, `variant ${finalSequenceVariant.name} subject`)}/></div> : <div className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">Enable this subject field under Data → Fields.</div>}{finalSequenceVariant.body ? <div className="mt-3"><label className={editorLabel}>Email copy</label><textarea rows={8} className={editorControl} defaultValue={textValue(selected, finalSequenceVariant.body)} onBlur={event => saveSelectedField(finalSequenceVariant.body, event.currentTarget.value, `variant ${finalSequenceVariant.name} body`)}/></div> : <div className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">Enable this body field under Data → Fields.</div>}</div>)}{finalSequenceStep.variants.length > visibleVariantLimitForStep(finalSequenceStep.number) && <button onClick={() => { if (!selectedId) return; const addVariantKey = `${selectedId}-${finalSequenceStep.number}`; setSequenceVariantLimits({...sequenceVariantLimits, [addVariantKey]: visibleVariantLimitForStep(finalSequenceStep.number) + 1}); }} className="w-full rounded-xl border-2 border-dashed border-purple-200 bg-purple-50/50 px-4 py-3 text-sm font-semibold text-purple-700 hover:border-purple-400 hover:bg-purple-50"><PlusIcon className="mr-1 inline" size={16}/> Add split-test variant</button>}</div></section>
                            {finalStepIndex < visibleSequenceStepLimit - 1 && <div className="flex items-center gap-3 px-3"><div className="h-px flex-1 bg-gray-200"/><div className="flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700"><span>Wait</span>{fields.daysBetween ? fields.daysBetween.type === FieldType.SINGLE_SELECT ? <select aria-label="Days between sequence steps" value={optionName(selected, fields.daysBetween)} onChange={event => saveSelectedField(fields.daysBetween, selectWriteValue(fields.daysBetween, event.currentTarget.value), 'days between emails')} className="rounded-md border border-blue-200 bg-white px-2 py-1 text-xs text-blue-800 outline-none"><option value="">—</option>{selectOptions(fields.daysBetween, campaigns).map(sequenceDelayChoice => <option key={sequenceDelayChoice} value={sequenceDelayChoice}>{sequenceDelayChoice}</option>)}</select> : <input aria-label="Days between sequence steps" type="number" min="0" value={sequenceDelayDraft} onChange={event => setSequenceDelayDraft(event.currentTarget.value)} onBlur={event => saveSelectedField(fields.daysBetween, event.currentTarget.value ? Number(event.currentTarget.value) : null, 'days between emails')} className="w-14 rounded-md border border-blue-200 bg-white px-2 py-1 text-center text-xs text-blue-800 outline-none"/> : <span className="rounded-md bg-amber-100 px-2 py-1 text-amber-900">field disabled</span>}<span>days, then</span></div><div className="h-px flex-1 bg-gray-200"/></div>}
                        </React.Fragment>)}
                        {visibleSequenceStepLimit < finalSequenceSteps.length && <button onClick={() => { if (!selectedId) return; setSequenceStepLimits({...sequenceStepLimits, [selectedId]: visibleSequenceStepLimit + 1}); }} className="w-full rounded-2xl border-2 border-dashed border-indigo-300 bg-indigo-50/50 px-4 py-4 text-sm font-semibold text-indigo-700 hover:border-indigo-500 hover:bg-indigo-50"><PlusIcon className="mr-1 inline" size={17}/> Add sequence step {visibleSequenceStepLimit + 1}</button>}
                        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-900"><div className="font-semibold">What the spintax automation must do</div><p className="mt-1">Pass 1 adds conversational <code>{'{option|option}'}</code> choices without changing merge tags such as <code>{'{FIRST_NAME}'}</code>. Pass 2 checks every possible combination for natural phrasing, valid braces and pipes, repeated wording, and grammatical compatibility.</p></div>
                        <div className="flex justify-end"><button onClick={() => setTab('senders')} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Continue to senders</button></div>
                    </div>}

                    {tab === 'settings' && <div className="space-y-5">
                        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4"><h3 className="font-semibold text-blue-900">Campaign build settings</h3><p className="mt-1 text-sm text-blue-700">Configure the sending schedule and sequence structure before the EmailBison build.</p></div>
                        <div><div className={editorLabel}>Sending days</div><div className="grid grid-cols-2 gap-2">{[
                            [fields.monday, 'Monday'], [fields.tuesday, 'Tuesday'], [fields.wednesday, 'Wednesday'], [fields.thursday, 'Thursday'], [fields.friday, 'Friday'], [fields.saturday, 'Saturday'], [fields.sunday, 'Sunday'],
                        ].filter(([dayField]) => dayField).map(([dayField, dayLabel]) => <label key={dayLabel as string} className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"><input type="checkbox" checked={Boolean(cellValue(selected, dayField as AnyField))} onChange={event => saveSelectedField(dayField as AnyField, event.currentTarget.checked, dayLabel as string)}/><span>{dayLabel as string}</span></label>)}</div></div>
                        <div className="grid grid-cols-2 gap-3">
                            {fields.maxEmails && <div><label className={editorLabel}>Max emails per day</label><input type="number" min="0" className={editorControl} defaultValue={numericValue(selected, fields.maxEmails) ?? ''} onBlur={event => saveSelectedField(fields.maxEmails, event.currentTarget.value ? Number(event.currentTarget.value) : null, 'max emails per day')}/></div>}
                            {fields.maxNewLeads && <div><label className={editorLabel}>Max new leads per day</label><input type="number" min="0" className={editorControl} defaultValue={numericValue(selected, fields.maxNewLeads) ?? ''} onBlur={event => saveSelectedField(fields.maxNewLeads, event.currentTarget.value ? Number(event.currentTarget.value) : null, 'max new leads per day')}/></div>}
                            {fields.startTime && <div><label className={editorLabel}>Start time</label><input className={editorControl} placeholder="09:00" defaultValue={textValue(selected, fields.startTime)} onBlur={event => saveSelectedField(fields.startTime, event.currentTarget.value, 'start time')}/></div>}
                            {fields.endTime && <div><label className={editorLabel}>End time</label><input className={editorControl} placeholder="17:00" defaultValue={textValue(selected, fields.endTime)} onBlur={event => saveSelectedField(fields.endTime, event.currentTarget.value, 'end time')}/></div>}
                            {fields.timezone && <div><label className={editorLabel}>Time zone</label><select className={editorControl} value={optionName(selected, fields.timezone)} onChange={event => saveSelectedField(fields.timezone, selectWriteValue(fields.timezone, event.currentTarget.value), 'time zone')}><option value="">Select time zone</option>{selectOptions(fields.timezone, campaigns).map(timezoneChoice => <option key={timezoneChoice} value={timezoneChoice}>{timezoneChoice}</option>)}</select></div>}
                            {fields.startDate && <div><label className={editorLabel}>Start date</label><input type="date" className={editorControl} defaultValue={dateInputValue(selected, fields.startDate)} onBlur={event => saveSelectedField(fields.startDate, event.currentTarget.value || null, 'start date')}/></div>}
                            {fields.endDate && <div><label className={editorLabel}>End date</label><input type="date" className={editorControl} defaultValue={dateInputValue(selected, fields.endDate)} onBlur={event => saveSelectedField(fields.endDate, event.currentTarget.value || null, 'end date')}/></div>}
                        </div>
                        {fields.plainText && <label className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4"><div><div className="font-medium">Plain-text sending</div><div className={`text-sm ${muted}`}>Send without HTML formatting.</div></div><input type="checkbox" checked={Boolean(cellValue(selected, fields.plainText))} onChange={event => saveSelectedField(fields.plainText, event.currentTarget.checked, 'plain text')}/></label>}
                        {selectedLeadList && (selectedGenericLeadCount > 0 || selectedDirectLeadCount > 0) && <div className="rounded-xl border border-purple-200 bg-purple-50 p-4"><div className="font-semibold text-purple-950">Automatic campaign-output split</div><p className="mt-1 text-sm leading-6 text-purple-800">Campaign Center creates one output per non-empty lead type and assigns every selected sender once, in proportion to the final lead counts.</p><div className="mt-3 grid grid-cols-2 gap-3">{selectedGenericLeadCount > 0 && <div className="rounded-lg border border-purple-200 bg-white p-3"><div className="text-xs font-semibold uppercase tracking-wide text-purple-600">Generic Emails</div><div className="mt-1 font-bold text-gray-950">{selectedGenericLeadCount.toLocaleString()} leads</div><div className="text-sm text-gray-500">Generic-safe greeting; no {'{FIRST_NAME}'}</div></div>}{selectedDirectLeadCount > 0 && <div className="rounded-lg border border-purple-200 bg-white p-3"><div className="text-xs font-semibold uppercase tracking-wide text-purple-600">Direct Emails</div><div className="mt-1 font-bold text-gray-950">{selectedDirectLeadCount.toLocaleString()} leads</div><div className="text-sm text-gray-500">Original approved sequence</div></div>}</div>{fields.emailAccounts && <div className="mt-3 text-sm font-semibold text-purple-900">Selected sender accounts: {linkedIds(selected, fields.emailAccounts).length}</div>}</div>}
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><div className="mb-3"><div className="font-semibold text-amber-950">Bounce safeguards</div><p className="mt-1 text-sm text-amber-800">Use these exceptions deliberately. Skipping a pause can allow a campaign to continue sending after its bounce threshold is reached.</p></div><div className="space-y-2">{fields.skipBounceNotification ? <label className="flex items-center justify-between rounded-lg border border-amber-200 bg-white p-3"><div><div className="text-sm font-semibold text-gray-900">Skip bounce notification</div><div className="text-xs text-gray-500">Do not send the automated bounce warning for this campaign.</div></div><input type="checkbox" checked={Boolean(cellValue(selected, fields.skipBounceNotification))} onChange={event => saveSelectedField(fields.skipBounceNotification, event.currentTarget.checked, 'skip bounce notification')}/></label> : <div className="rounded-lg border border-amber-200 bg-white p-3 text-sm text-amber-900">Enable <strong>Skip Bounce Notification</strong> under Data → Fields.</div>}{fields.skipBouncePause ? <label className="flex items-center justify-between rounded-lg border border-red-200 bg-white p-3"><div><div className="text-sm font-semibold text-red-800">Skip bounce pause</div><div className="text-xs text-gray-500">Keep sending instead of automatically pausing at the bounce threshold.</div></div><input type="checkbox" checked={Boolean(cellValue(selected, fields.skipBouncePause))} onChange={event => saveSelectedField(fields.skipBouncePause, event.currentTarget.checked, 'skip bounce pause')}/></label> : <div className="rounded-lg border border-amber-200 bg-white p-3 text-sm text-amber-900">Enable <strong>Skip Bounce Pause</strong> under Data → Fields.</div>}</div></div>
                        {optionName(selected, fields.status).toLowerCase() !== 'spintax generated' && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Upload is locked until Campaign Status is <span className="font-semibold">Spintax Generated</span>. Finish the sequence validation first.</div>}
                        {senderSelectionBlocked && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">Campaign creation is paused before n8n starts. Open <strong>Senders</strong> and select between {minimumOutputSenders} and {recommendedSenderCount} account{recommendedSenderCount === 1 ? '' : 's'}.</div>}
                        <div className="flex justify-end"><button disabled={!!selectedLeadReadinessIssue || optionName(selected, fields.status).toLowerCase() !== 'spintax generated' || senderSelectionBlocked || !!busy || trackedOperation?.type === 'upload'} onClick={() => requestBisonUpload(selected)} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">{trackedOperation?.type === 'upload' && <ArrowsClockwiseIcon className="animate-spin" size={15}/>} {trackedOperation?.type === 'upload' ? 'Uploading…' : selectedGenericLeadCount > 0 || selectedDirectLeadCount > 0 ? 'Create and upload campaign outputs' : 'Upload to EmailBison'}</button></div>
                    </div>}
                    {tab === 'analytics' && <div>
                        <CampaignReviewPanel key={selected.id} record={selected} table={campaignsTable}/>
                        <VerificationPerformancePanel key={selected.id} record={selected} table={campaignsTable}/>
                        <section className="mb-6 space-y-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div><h3 className="text-base font-semibold text-gray-900">Sequence performance</h3><p className="mt-1 text-sm text-gray-500">Campaign-to-date results by EmailBison step and split-test variant.</p></div>
                                {!!relatedSequenceAnalytics.length && <div className="rounded-lg border border-gray-200 bg-slate-50 px-3 py-2 text-xs text-gray-600"><strong>{relatedSequenceAnalytics.length}</strong> variants tracked · <strong>{new Intl.NumberFormat().format(sequenceAnalyticsTotals.sent)}</strong> emails sent</div>}
                            </div>
                            {!sequenceAnalyticsTable && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Configure the <strong>Sequence Analytics</strong> table under this extension's data settings.</div>}
                            {sequenceAnalyticsTable && !sequenceAnalyticsFields.campaign && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">Sequence Analytics needs its linked <strong>Campaign</strong> field enabled under Data → Fields.</div>}
                            {sequenceAnalyticsTable && sequenceAnalyticsFields.campaign && !relatedSequenceAnalytics.length && <div className="rounded-xl border border-gray-200 bg-slate-50 p-6 text-center text-sm text-gray-500">No sequence analytics have been synced for this campaign yet. Confirm it is Active or Completed, has an EmailBison ID, and appears in the latest n8n execution.</div>}
                            {!!relatedSequenceAnalytics.length && <>
                                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                                    {[
                                        ['Emails sent', sequenceAnalyticsTotals.sent, 'text-blue-700', 'bg-blue-50 border-blue-200'],
                                        ['Replies', sequenceAnalyticsTotals.replies, 'text-indigo-700', 'bg-indigo-50 border-indigo-200'],
                                        ['Interested', sequenceAnalyticsTotals.interested, 'text-emerald-700', 'bg-emerald-50 border-emerald-200'],
                                        ['Bounces', sequenceAnalyticsTotals.bounces, 'text-red-700', 'bg-red-50 border-red-200'],
                                    ].map(([label, value, valueClass, cardClass]) => <div key={label as string} className={`rounded-xl border p-3 ${cardClass}`}><div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">{label as string}</div><div className={`mt-1 text-2xl font-bold tabular-nums ${valueClass}`}>{new Intl.NumberFormat().format(value as number)}</div></div>)}
                                </div>
                                {sequenceAnalyticsLeader && <div className={`rounded-xl border p-4 ${sequenceAnalyticsLeader.sampleStatus === 'Not ideal' ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}><div className="flex flex-wrap items-center justify-between gap-2"><div><div className="text-xs font-bold uppercase tracking-wider text-purple-700">{sequenceAnalyticsLeader.sampleStatus === 'Not ideal' ? 'Early leader' : 'Current leader'}</div><div className="mt-1 font-semibold text-gray-900">Step {sequenceAnalyticsLeader.step} · Variant {sequenceAnalyticsLeader.variant}</div></div><div className="text-right"><div className="text-lg font-bold text-emerald-700">{sequenceAnalyticsLeader.interestedRate.toFixed(2)}% interested</div><div className="text-xs text-gray-600">{sequenceAnalyticsLeader.replyRate.toFixed(2)}% reply rate · {new Intl.NumberFormat().format(sequenceAnalyticsLeader.sent)} sent</div></div></div>{sequenceAnalyticsLeader.sampleStatus === 'Not ideal' && <p className="mt-2 text-xs text-amber-800">Directional only. This variant has fewer than 1,000 sends.</p>}</div>}
                                <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                                    <table className="w-full min-w-[980px] text-sm">
                                        <thead className="bg-slate-50"><tr>{['Step','Variant','Open','Sent','Replies','Reply rate','Interested','Interested rate','Bounces','Bounce rate','Sample','Sample size'].map(label => <th key={label} className="border-b border-gray-200 px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500">{label}</th>)}</tr></thead>
                                        <tbody>{relatedSequenceAnalytics.map(row => {
                                            const isLeader = sequenceAnalyticsLeader?.record.id === row.record.id;
                                            const sampleChip = row.sampleStatus === 'Ideal' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : row.sampleStatus === 'Okay' ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-amber-200 bg-amber-50 text-amber-700';
                                            return <tr key={row.record.id} className={`border-t border-gray-100 ${isLeader ? 'bg-purple-50/60' : 'hover:bg-slate-50'}`}>
                                                <td className="px-3 py-3 font-semibold text-gray-900">{row.step || '—'}</td>
                                                <td className="px-3 py-3"><span className="inline-flex min-w-7 justify-center rounded-full bg-purple-100 px-2 py-1 text-xs font-bold text-purple-700">{row.variant}</span></td>
                                                <td className="px-3 py-3"><button onClick={() => sequenceAnalyticsTable?.hasPermissionToExpandRecords() ? expandRecord(row.record) : setNotice({kind: 'error', text: 'Enable Click into record details for Sequence Analytics, then try again.'})} className="inline-flex items-center gap-1.5 rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 text-xs font-semibold text-purple-700 transition-colors hover:bg-purple-100"><EyeIcon size={14}/> Open</button></td>
                                                <td className="px-3 py-3 font-semibold tabular-nums">{new Intl.NumberFormat().format(row.sent)}</td>
                                                <td className="px-3 py-3 tabular-nums">{new Intl.NumberFormat().format(row.replies)}</td>
                                                <td className="px-3 py-3 tabular-nums"><div className="font-semibold">{row.replyRate.toFixed(2)}%</div><div className="mt-1 h-1 w-16 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-indigo-500" style={{width: `${Math.min(100, row.replyRate / 5 * 100)}%`}}/></div></td>
                                                <td className="px-3 py-3 tabular-nums">{new Intl.NumberFormat().format(row.interested)}</td>
                                                <td className="px-3 py-3 tabular-nums"><div className="font-semibold text-emerald-700">{row.interestedRate.toFixed(2)}%</div><div className="mt-1 h-1 w-16 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-emerald-500" style={{width: `${Math.min(100, row.interestedRate / 20 * 100)}%`}}/></div></td>
                                                <td className="px-3 py-3 tabular-nums">{new Intl.NumberFormat().format(row.bounces)}</td>
                                                <td className={`px-3 py-3 font-semibold tabular-nums ${row.bounceRate >= 4 ? 'text-red-700' : row.bounceRate >= 2 ? 'text-amber-700' : 'text-emerald-700'}`}>{row.bounceRate.toFixed(2)}%</td>
                                                <td className="px-3 py-3"><span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold ${sampleChip}`}>{row.sampleStatus}</span></td>
                                                <td className="whitespace-nowrap px-3 py-3 text-xs font-semibold tabular-nums text-gray-600">{new Intl.NumberFormat().format(row.sent)} / {row.sampleStatus === 'Ideal' ? '2,000+' : row.sampleStatus === 'Okay' ? '2,000' : '1,000'}</td>
                                            </tr>;
                                        })}</tbody>
                                    </table>
                                </div>
                                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs leading-5 text-blue-800"><strong>How to read this:</strong> Interested rate is interested replies divided by total replies and is the primary variant-quality signal. Reply rate adds context, bounce rate protects deliverability, and the sample badge prevents calling a winner too early. Meetings remain an overall campaign metric.</div>
                            </>}
                        </section>
                    </div>}
                </div>
            </aside>}
        </div>
        {showCampaignCreator && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-6"><div className="w-full max-w-2xl rounded-3xl bg-white p-7 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><h2 className="text-2xl font-bold text-gray-950">Create a campaign</h2><p className="mt-1 text-sm text-gray-500">Client: <strong className="text-gray-800">{clientFilter === 'all' ? 'Choose a client first' : clientFilter}</strong></p></div><button aria-label="Close campaign creator" onClick={() => setShowCampaignCreator(false)} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"><XIcon size={20}/></button></div>
            <div className="mt-6 space-y-5"><label className="block"><span className={editorLabel}>Campaign name</span><div className="flex items-center overflow-hidden rounded-xl border border-gray-300 bg-white focus-within:border-purple-500 focus-within:ring-2 focus-within:ring-purple-100"><span className="shrink-0 border-r border-gray-200 bg-slate-50 px-4 py-3 font-semibold text-gray-700">[{creationClientName || 'Client'}]</span><input autoFocus className="min-w-0 flex-1 border-0 bg-transparent px-4 py-3 outline-none" value={newCampaignName} onChange={event => { const title = stripBracketedClientPrefixForInput(event.currentTarget.value); setNewCampaignName(title); if (!newLeadListNameEdited) setNewLeadListName(title); }} placeholder="Florida Marketing Agencies"/></div><span className="mt-2 block text-xs text-gray-500">Saved as: <strong className="text-gray-700">{campaignNamePreview || `[${creationClientName || 'Client'}] Campaign name`}</strong></span></label><label className="block"><span className={editorLabel}>Initial targeting sentence <span className="font-normal normal-case tracking-normal text-gray-400">(optional)</span></span><textarea className={editorControl} rows={3} value={newCampaignThesis} onChange={event => setNewCampaignThesis(event.currentTarget.value)} placeholder="Example: B2B marketing agencies located in Florida, USA with 1–50 employees"/><span className="mt-2 block text-xs leading-5 text-gray-500">Saved as the campaign thesis and copied into the new Lead List targeting sentence.</span></label>
                <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-purple-200 bg-purple-50 p-5"><input type="checkbox" checked={buildLeadList} onChange={event => setBuildLeadList(event.currentTarget.checked)} className="mt-1 h-5 w-5 accent-purple-600"/><span><span className="block font-bold text-purple-950">Build or connect a lead list for this campaign</span><span className="mt-1 block text-sm leading-6 text-purple-800">Creates the Airtable relationship immediately. Sourcing will not start until you review the targeting plan in Lead List Center.</span></span></label>
                {buildLeadList && <div className="space-y-4 rounded-2xl border border-gray-200 bg-slate-50 p-5"><div className="grid grid-cols-2 gap-3"><button type="button" onClick={() => setLeadListCreationMode('new')} className={`rounded-xl border p-4 text-left ${leadListCreationMode === 'new' ? 'border-purple-500 bg-white ring-2 ring-purple-100' : 'border-gray-200 bg-white'}`}><div className="font-bold text-gray-950">Create a new lead list</div><div className="mt-1 text-sm text-gray-500">Recommended for a new targeting plan.</div></button><button type="button" onClick={() => setLeadListCreationMode('existing')} className={`rounded-xl border p-4 text-left ${leadListCreationMode === 'existing' ? 'border-purple-500 bg-white ring-2 ring-purple-100' : 'border-gray-200 bg-white'}`}><div className="font-bold text-gray-950">Connect an existing list</div><div className="mt-1 text-sm text-gray-500">Reuse a list already owned by this client.</div></button></div>
                    {leadListCreationMode === 'new' ? <label className="block"><span className={editorLabel}>Lead-list name</span><div className="flex items-center overflow-hidden rounded-xl border border-gray-300 bg-white focus-within:border-purple-500 focus-within:ring-2 focus-within:ring-purple-100"><span className="shrink-0 border-r border-gray-200 bg-slate-50 px-4 py-3 font-semibold text-gray-700">[{creationClientName || 'Client'}]</span><input className="min-w-0 flex-1 border-0 bg-transparent px-4 py-3 outline-none" value={newLeadListName} onChange={event => { setNewLeadListName(stripBracketedClientPrefixForInput(event.currentTarget.value)); setNewLeadListNameEdited(true); }} placeholder={campaignTitleDraft || 'Same as campaign name'}/></div><span className="mt-2 block text-xs text-gray-500">Saved as: <strong className="text-gray-700">{leadListNamePreview || campaignNamePreview || `[${creationClientName || 'Client'}] Lead-list name`}</strong></span></label> : <label className="block"><span className={editorLabel}>Existing lead list</span><select className={editorControl} value={existingLeadListId} onChange={event => setExistingLeadListId(event.currentTarget.value)}><option value="">Select a lead list…</option>{creationLeadListOptions.map(record => <option key={record.id} value={record.id}>{textValue(record, leadListFields.name) || record.name}</option>)}</select>{!creationLeadListOptions.length && <span className="mt-2 block text-xs text-amber-700">No Lead Lists were found for {clientFilter}. Create a new one instead.</span>}</label>}
                </div>}
            </div>
            <div className="mt-7 flex justify-end gap-3"><button onClick={() => setShowCampaignCreator(false)} className="rounded-xl border border-gray-300 px-5 py-3 font-semibold text-gray-700">Cancel</button><button disabled={!!busy || !campaignTitleDraft || !creationClientRecord || clientFilter === 'all' || (buildLeadList && leadListCreationMode === 'existing' && !existingLeadListId)} onClick={createCampaign} className="rounded-xl bg-purple-600 px-5 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{busy === 'New campaign' ? 'Creating…' : buildLeadList ? 'Create campaign and connect list' : 'Create campaign'}</button></div></div></div>}
    </div>;
}

type CampaignCenterErrorBoundaryState = {
    error: Error | null;
};

class CampaignCenterErrorBoundary extends React.Component<React.PropsWithChildren, CampaignCenterErrorBoundaryState> {
    state: CampaignCenterErrorBoundaryState = {error: null};

    static getDerivedStateFromError(error: Error): CampaignCenterErrorBoundaryState {
        return {error};
    }

    componentDidCatch(error: Error): void {
        // Airtable otherwise replaces the whole custom element with a generic
        // error page that hides the useful exception message.
        console.error('Campaign Center render failed', error);
    }

    render(): React.ReactNode {
        if (!this.state.error) return this.props.children;
        return <div className="min-h-screen bg-slate-50 p-8 text-gray-900">
            <div className="mx-auto max-w-2xl rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
                <div className="text-xs font-bold uppercase tracking-wider text-red-600">Campaign Center error</div>
                <h1 className="mt-2 text-xl font-bold">The interface hit a runtime error</h1>
                <p className="mt-2 text-sm text-gray-600">Copy the exact message below. It identifies the field or table that Airtable rejected.</p>
                <pre className="mt-4 whitespace-pre-wrap break-words rounded-xl bg-red-50 p-4 text-sm text-red-900">{this.state.error.message || String(this.state.error)}</pre>
                <button onClick={() => this.setState({error: null})} className="mt-4 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white">Try again</button>
            </div>
        </div>;
    }
}

initializeBlock({interface: () => <CampaignCenterErrorBoundary><CampaignCenter/></CampaignCenterErrorBoundary>});
