import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {CellRenderer, expandRecord, initializeBlock, useBase, useCustomProperties, useRecords} from '@airtable/blocks/interface/ui';
import {FieldType} from '@airtable/blocks/interface/models';
// Small built-in icons (the page cannot load an icon library in Airtable's editor).
type IconProps = {size?: number; className?: string};
const icon = (paths: string[]) => ({size = 20, className}: IconProps) => <svg width={size} height={size} viewBox="0 0 256 256" fill="none" stroke="currentColor" strokeWidth={16} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">{paths.map(d => <path key={d} d={d}/>)}</svg>;
const ArrowsClockwiseIcon = icon(['M40 128a88 88 0 0 1 150-62l26 26', 'M216 48v44h-44', 'M216 128a88 88 0 0 1-150 62l-26-26', 'M40 208v-44h44']);
const CaretDownIcon = icon(['M48 96l80 80 80-80']);
const CaretRightIcon = icon(['M96 48l80 80-80 80']);
const CopyIcon = icon(['M168 168h48V40H88v48', 'M40 88h128v128H40z']);
const EyeIcon = icon(['M128 56C48 56 16 128 16 128s32 72 112 72 112-72 112-72-32-72-112-72z', 'M128 168a40 40 0 1 0 0-80 40 40 0 0 0 0 80z']);
const FunnelIcon = icon(['M40 48h176l-68 80v72l-40 24v-96z']);
const MagnifyingGlassIcon = icon(['M112 184a72 72 0 1 0 0-144 72 72 0 0 0 0 144z', 'M163 163l53 53']);
const PauseIcon = icon(['M72 40h40v176H72z', 'M144 40h40v176h-40z']);
const PlayIcon = icon(['M72 40v176l144-88z']);
const PlusIcon = icon(['M40 128h176', 'M128 40v176']);
const TrashIcon = icon(['M216 56H40', 'M104 104v64', 'M152 104v64', 'M200 56v152a8 8 0 0 1-8 8H64a8 8 0 0 1-8-8V56', 'M168 56V40a16 16 0 0 0-16-16h-48a16 16 0 0 0-16 16v16']);
const XIcon = icon(['M200 56L56 200', 'M200 200L56 56']);

type DateRange = 'all' | '10' | '30' | '60' | '120';
type Tab = 'overview' | 'strategy' | 'copy' | 'approval' | 'sequence' | 'settings' | 'senders' | 'analytics';
type AnyRecord = any;
type AnyField = any;
type AnyTable = any;
type Notice = {kind: 'success' | 'error' | 'info'; text: string};

const ACTIVE_CLIENT_STORAGE_KEY = 'dulcy.campaigns.active-client';
const ACTIVE_WORKSPACE_STORAGE_KEY = 'dulcy.campaigns.active-workspace';
// Airtable can block browser storage in embedded pages; storage is only a convenience here.
const readStored = (key: string, fallback: string) => { try { return window.localStorage.getItem(key) || fallback; } catch { return fallback; } };
const writeStored = (key: string, value: string) => { try { window.localStorage.setItem(key, value); } catch { /* ignore */ } };

// Kept outside the engine (neither sends an API key): the full Bison sync relay and the n8n sender sync.
const BISON_SYNC_WEBHOOK_URL = 'https://bison-sync-relay.scale-f9d.workers.dev/sync';
const BISON_SENDER_SYNC_WEBHOOK_URL = 'https://n8n.dulcy.io/webhook/REDACTED_PATH';

// ---------- Dulcy engine presses (answered by engine/src/airtable/campaignActions.ts) ----------
type EngineAction = 'Build Campaign' | 'Launch Campaign' | 'Pause Campaign' | 'Top Up Campaign' | 'Update Senders';
// Engine Status values while a job is waiting to run or running.
const ENGINE_ACTIVE = ['Queued', 'Running', 'Waiting'];
const RUNNING = ['requested', 'queued', 'running', 'waiting', 'processing'];
const engineChip = (status: string) => status === 'Done' ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : status === 'Failed' ? 'border-red-300 bg-red-50 text-red-800' : status === 'Needs Review' ? 'border-amber-300 bg-amber-50 text-amber-800' : ENGINE_ACTIVE.includes(status) ? 'border-blue-300 bg-blue-50 text-blue-800' : 'border-slate-300 bg-white text-slate-600';

// ---------- Field maps: the exact field ID; name lookups only where the schema has no ID. ----------
type FieldSpec = Record<string, readonly string[]>;
const CAMPAIGN_FIELDS = {
  name: ['fldSsb4QjS9UyvKhj'], client: ['fldl5bZ644djPsBmN'], status: ['fldZABZwE9SmnwMv3'],
  type: ['fldd9fU7wNFTNQB0j'], lifecycle: ['fld9uXm3prQKN7utY'], created: ['fldC17C15viNdUAyN'],
  // Not in the schema snapshot; matched by name only when a base has them.
  workspace: ['Workspace', 'Workspace ID', 'Bison Workspace', 'EmailBison Workspace'], health: ['Health', 'Campaign Health'],
  automationRequest: ['fldKZKnaFMiAHrDEE'],
  processing: ['fldCebt3IMI8ZxdQq'], message: ['flduYPLoUQk94uUWA'], error: ['fld1ZYViMpvLDoBy2'],
  startedAt: ['fldqKPdzUqppbItvX'], completedAt: ['fldzjGuki2WoS1LBY'],
  runsOnEngine: ['flds0oKDXF1XgQUeI'], engineAction: ['fldsvWSdSkH8y16wW'], engineActionSetAt: ['fldiEM7H0JtiwZUi4'],
  engineStatus: ['fldBIuY7HML1wycLr'], engineJobId: ['fldx3JS89Nu10OjeT'], engineMessage: ['fldtsSMcX9XX4h1Vc'],
  totalLeads: ['fldbYOfqWk4KrNgfz'], contacted: ['fld8nKHhBCV8UFm0G'], emailsSent: ['fldDmaS8NZF3j0ZBY'],
  replies: ['fldqSxElCOm0QN4kh'], replyRate: ['fldjZzJHEuIQoMUbb'], repliesData: ['fldoY2XU0mz33L0sS'],
  bounces: ['fld3MHVEqXgHimKom'], bounceRate: ['fldiLOzbllDI8mn7C'], bouncesData: ['fldKEvZR0qkhiepcq'],
  interested: ['fldSRXRCC0x2AhX9h'], interestedRate: ['fldPx4lkp0XeXtamH'], interestedData: ['fld31Z20ar3plBXdG'],
  meetings: ['fldoUuw5JDk0L264W'], meetingRate: ['fldTFkLcWvTI5Zrex'], meetingsData: ['fldqQDM6C7Rrt8oHl'],
  progress: ['fldGM1f8fNNu6ODo2'], bisonUrl: ['fldkCJDOFglvhcvD6'], bisonId: ['fldxSETE3D66RyWRH'],
  directId: ['fldpwHUDMMDeXORek'], genericId: ['fld6h6ZPDeu2cgdTe'],
  workflowStage: ['fldOVJmlGWxW1dveo'], campaignApproach: ['fldclFGDzjg4nvfxL'],
  prepDate: ['fldMyRtIz3Zm26oiH'], launchDate: ['fldhyq0anpSO1r0bV'], thesis: ['fldlixHfhzrd7nuSc'],
  leadList: ['fld5weZ6ED31dBlaz'], topUpLeadList: ['fld4lMlTPjrRmAFHp'],
  topUpStatus: ['fldhUPV4f4pqvv047'], topUpAdded: ['fldj24jsClYDgjNyG'], topUpSkipped: ['fldBz14RRsy2PDUhp'],
  topUpFailed: ['fldEosJWzT7I73inC'], topUpLastRun: ['fldFfVuUx0ZMCaJXX'], topUpMessage: ['fldfSoL1aatKQs722'],
  subject1: ['fldZTtdvwRV53voZE'], body1: ['fldjnYRokcvObXphA'],
  subject2: ['fldAikx1V83MsK3Ql'], body2: ['fldw7AQWalsiisKrM'],
  subject3: ['fldu2xpTQFuuyU71Q'], body3: ['fld6U4bB1335Ac5vM'],
  subject4: ['fldFrZUqdTeydSTUV'], body4: ['fldJ8gNIksLd8WZ8t'],
  threadReply2: ['fldz66DfS1zAGHKcO'], threadReply3: ['fldUxqdktQwDc1OoC'], threadReply4: ['fld5UmGOG4X9EqHpL'],
  createSpintax: ['fldsvgKf6U5zDOygf'], bisonAction: ['fld7n4KEnvaPMDbt2'],
  skipBounceNotification: ['fldWNVUvrpLLDXITC'], skipBouncePause: ['fldjpNVGqOLFJbcEX'],
  daysBetween: ['fldbX8yCSVIhfJ6v7'], variants1: ['fldNIQxQkubt8LAT0'], variants2: ['fld8zzSiQMwejvoZ4'],
  variants3: ['fldpnrrUrJ8NPtxPC'], variants4: ['fldT1Jw7wLftwkuGK'], backupVariants: ['fldzztWeFYjHX65ck'],
  monday: ['fldEX5XHj8lIkkp4g'], tuesday: ['fldLoKQBjHmvA0sVd'], wednesday: ['fldWdOeNb5mc95BZp'], thursday: ['fldnJtB1br2i2zkLx'],
  friday: ['fldsOIQHZfuILVYyx'], saturday: ['fld9ybdYVtipVAQ7g'], sunday: ['fldhasNVsPOKuTQSC'],
  startTime: ['fldxkH2X1VdDOj54B'], endTime: ['fldj60qqSPeYawLX4'], timezone: ['fldg8Be3TXKtI30j5'],
  maxEmails: ['fld0PxY90RaShLgvw'], maxNewLeads: ['fldPRrn97ehpYGomi'], plainText: ['fld2VaGjw0nYFJvIy'],
  startDate: ['fldZGNVkmKEzcq4yj'], endDate: ['fldaFRUpSPJB3IV8t'],
  clientFeedback: ['fldWJJEJYzKxyLwti'], selectChanges: ['fldhKpDiiRjqMJ2o0'], reviewCopy: ['fldWeCXf5tCIwJMRd'],
  companyFeedback: ['fldvHy50OLfkmtdwp'], geographyFeedback: ['fldy9BjxRZuyh6WLO'], industryFeedback: ['fldZYgj2wmOH7CJKE'], titleFeedback: ['fldAAxGIIe6E7g26Y'], additionalContext: ['fldkRCt0spCxZribv'],
  clientReviewSubmittedAt: ['fldTwdx8HHei9LeQp'], clientReviewAutoApproveAt: ['fldC3vCiTcqhGaZrK'],
  campaignApprovalSource: ['fldgHA5CcgM885Itp'], emailAccounts: ['fldi906rwZ9YOpU64'],
  reviewNotes: ['fld4wy3OP82nps2zK'], verificationJson: ['fldwNUz5hgOhpgWu9'],
} as const;
const LEAD_LIST_FIELDS = {
  name: ['fldbg5PAnKyFHc3uy'], link: ['fldSOTvnUxzKWXMDD'], client: ['fldEujtSLqwdpOyGD'],
  campaign: ['fldepbn71awSjmZPV'], icpDescription: ['fldcYwP7Dlq4uyC39'], sourceType: ['fldJSSY0QTMU5pzsQ'],
  stage: ['fld8nrebRFL0O8kgj'], qaStatus: ['fldUB4WsLi5kq6rUy'], processingStatus: ['fldf9wpMGWg0SebHV'],
  automationAction: ['fldhViG7kJ5rKEaa4'], enrichmentAction: ['fldLyvQsbGvii0iUK'], qaAction: ['fldcBmKEYX8KUiKAM'],
  finalGenericCount: ['fld0FHomkh3uyx0FD'], finalDirectCount: ['fldQZJCpTofahmTkl'], topUpScope: ['fldevysyehxsGxt2q'],
} as const;
// Targeting copied from the source list into a new top-up list: Client, Source Type, Third-Party Source Method, ICP Description, List Thesis,
// DiscoLike filters, industries/countries/states, employee range, keywords, personas, contact source and filters, verification and
// email policies, SEG rule, custom variables, column mapping, workflow template, DiscoGen deep review settings and expansion target.
const TOP_UP_COPY_FIELDS = ['fldEujtSLqwdpOyGD', 'fldJSSY0QTMU5pzsQ', 'fldrwkcctpevJf4Em', 'fldcYwP7Dlq4uyC39', 'fldg6HZIKqe8c8RtW', 'fldC2hZQ3gSqLmi1y', 'fld1YCXcNy4DgpiLf', 'fldHeVveCAwW5BpPx', 'flde9rzZp6nxFY0kc', 'fldE9enhYUgKfpPBZ', 'fldG2MXz5lccu7KKU', 'fldydpLzUzAJGLBBJ', 'fldoeQZ5utB7F9XkD', 'fldOY9huqfW7v6bXT', 'fld8BzLAB6otoGBVI', 'fldja37uHGyGpZZLB', 'fldIXN5t3bqfiZ0Wu', 'fldfFcn3BB2RyiWer', 'fldle7FymM4BN7iJK', 'fldRIomZHeVxPWveE', 'fldwoK7IcKH6NYgVJ', 'fld8Y8iYpvUV4FDDX', 'fldX8cOpx3TcGX2jf', 'fldlJtYONrHGdyXoh', 'fldscHbLN6C72xbRj', 'fldL3nguggy3hWpXD', 'fldEowFa8B2lS2PRN', 'fldRbgKvjSv7sl5YL', 'fldfmIbpySyuXFyhf', 'fldTYRjTrpVW27tmG', 'fldUa69aE3HyX0n81', 'fldj6OeEu5swtimNx', 'fldsYFrdNF2VBS6SQ', 'fldVCKrDuXfEhxjZm', 'fldH7LfiagdudqYJn', 'fldYzvqGmQZxXL9AP'];
// Clients ("Workspace IDs"). A blank pivot value counts as Enabled.
const CLIENT_FIELDS = {
  name: ['fld48x6Yg3v6RP30W'], status: ['fldSr8KQs90Uk2d26'], brandName: ['fldTHTrYh0GCFeBLG'],
  newVerticalPivot: ['fldY5tnIicC48grKq'], newOfferPivot: ['fld9HliYa3igd1Uri'],
  workspaceId: ['Workspace ID', 'EmailBison Workspace ID', 'Bison Workspace ID'],
} as const;
const EMAIL_ACCOUNT_FIELDS = {
  name: ['Email Account', 'Email', 'Email Address', 'Sender Email'], emailId: ['fldR19WUqSSBVQcPO'], workspace: ['fldWB4pvEgQ8aYlT2'],
  status: ['fldvyAN2hm6gmfG86'], connected: ['Connected', 'Is Connected', 'Email Connected', 'Account Connected'], activeSending: ['Actively Sending', 'Active Sending', 'Is Sending', 'Sending'],
  warmupDays: ['fldm9axRACWn8QZeY'], warmupStatus: ['Warmup Status', 'Warm Up Status', 'Warm-up Status', 'Warming Status', 'Warming'],
  warmupStart: ['fldURrj0qP1DnAKyD'], campaigns: ['fldJJWRwowtWJhIfg'], dailyLimit: ['fldBP1gljUUM44JMk'],
} as const;
const EMAIL_ACCOUNT_CLIENT_FIELDS = ['flduDcGap2GSsqUia'];
const SEQUENCE_ANALYTICS_FIELDS = {
  campaign: ['fldOj7Uk9JSNnI1kF'], step: ['fldbgt319A6pym3Ni'], variant: ['fldqPCQ7mcynXjSUL'], subject: ['fldZGv33auxBB7F9e'],
  sent: ['fldWasIzQZHOeHlig'], replies: ['fldIvQkJnFcZlImqA'], interested: ['fldAcRMZyCly08iDj'], bounces: ['fldcZ6ICxoCsyyDBb'],
} as const;
const OUTPUT_SUFFIX = /\s+-\s+(?:Generic|Direct) Emails\s*$/i;

// Sender-only workspace overrides (Twenty West Media sends only from its healthy internal workspace).
const SENDER_WORKSPACE_OVERRIDES: Record<string, string[]> = {'dulcy': ['2'], 'dulcy free campaigns': ['41'], 'twenty west media': ['66'], 'twenty west media (internal)': ['66']};
const baseCampaignName = (name: string) => name.replace(OUTPUT_SUFFIX, '').trim();

// ---------- Cell helpers ----------
function findField(table: AnyTable | undefined, keys: readonly string[]): AnyField | null {
  if (!table) return null;
  for (const key of keys) {
    const field = /^fld[A-Za-z0-9]{14}$/.test(key) ? table.fields?.find((f: AnyField) => f?.id === key) : table.getFieldIfExists?.(key);
    if (field) return field;
  }
  return null;
}
const mapFields = <T extends FieldSpec>(table: AnyTable | undefined, spec: T) => Object.fromEntries(Object.entries(spec).map(([key, keys]) => [key, findField(table, keys)])) as {[K in keyof T]: AnyField | null};

function cellValue(record: AnyRecord, field: AnyField | null): any {
  if (!record || !field) return null;
  // Read by field ID first: interface field models can differ in identity from the record query's.
  for (const key of [field.id, field.name, field]) {
    try { const value = record.getCellValue(key); if (value !== null && value !== undefined) return value; } catch { /* next shape */ }
  }
  return null;
}
function textValue(record: AnyRecord, field: AnyField | null): string {
  if (!record || !field) return '';
  for (const key of [field.id, field.name, field]) {
    try { const text = record.getCellValueAsString(key)?.trim(); if (text) return text; } catch { /* next shape */ }
  }
  const raw = cellValue(record, field);
  return raw === null ? '' : String(raw).trim();
}
function optionName(record: AnyRecord, field: AnyField | null): string {
  const value = cellValue(record, field);
  if (!value) return '';
  if (typeof value === 'object' && !Array.isArray(value) && 'name' in value) return value.name ?? '';
  return textValue(record, field);
}
function linkedIds(record: AnyRecord, field: AnyField | null): string[] {
  const value = cellValue(record, field);
  return Array.isArray(value) ? value.map(item => item?.id).filter(Boolean) : [];
}
function comparableValues(record: AnyRecord, field: AnyField | null): string[] {
  if (!field) return [];
  const value = cellValue(record, field);
  // Lookups and rollups often return arrays of plain values, for example ["Dulcy"].
  if (Array.isArray(value)) return value.map(item => item === null || item === undefined ? '' : typeof item === 'object' ? String(item.name ?? item.id ?? '') : String(item)).map(item => item.trim()).filter(Boolean);
  if (value && typeof value === 'object') return [String(value.name ?? value.id ?? '')].filter(Boolean);
  const text = textValue(record, field);
  return text ? [text] : [];
}
const sameLinks = (a: AnyRecord, b: AnyRecord, field: AnyField | null) => JSON.stringify([...linkedIds(a, field)].sort()) === JSON.stringify([...linkedIds(b, field)].sort());
const normalizeName = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');
function leadListMatchesClient(record: AnyRecord, clientField: AnyField, clientIds: string[], clientNames: string[]): boolean {
  const recordClientIds = linkedIds(record, clientField);
  // Linked Client IDs are authoritative; different IDs never match by name. Unassigned lists stay out.
  if (clientIds.length && recordClientIds.length) return recordClientIds.some(id => clientIds.includes(id));
  const targets = clientNames.map(normalizeName).filter(Boolean);
  return [...comparableValues(record, clientField), textValue(record, clientField)].map(normalizeName).filter(Boolean).some(name => targets.includes(name));
}
const stripBracketedClientPrefix = (value: string) => String(value ?? '').trim().replace(/^\[[^\]]+\]\s*/, '').trim();
const stripBracketedClientPrefixForInput = (value: string) => String(value ?? '').replace(/^\s*\[[^\]]+\]\s*/, '');
function clientPrefixedName(clientName: string, value: string): string {
  const client = String(clientName ?? '').trim().replace(/^\[|\]$/g, '').trim();
  const title = stripBracketedClientPrefix(value);
  return !client ? title : title ? `[${client}] ${title}` : `[${client}]`;
}
function selectOptions(field: AnyField | null, records: AnyRecord[]): string[] {
  if (!field) return [];
  const configured = [FieldType.SINGLE_SELECT, FieldType.MULTIPLE_SELECTS].includes(field.type) ? (field.config?.options?.choices ?? field.options?.choices ?? []).map((c: any) => c.name) : [];
  return [...new Set([...configured, ...records.flatMap(record => comparableValues(record, field))])].filter(Boolean).sort((a, b) => a.localeCompare(b, undefined, {numeric: true, sensitivity: 'base'}));
}
function dateFor(record: AnyRecord, field: AnyField | null): Date | null {
  const raw = field ? cellValue(record, field) : record.createdTime;
  if (!raw) return null;
  const date = new Date(typeof raw === 'string' ? raw : String(raw));
  return Number.isNaN(date.getTime()) ? null : date;
}
function numericValue(record: AnyRecord, field: AnyField | null): number | null {
  const raw = cellValue(record, field);
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}
function dateInputValue(record: AnyRecord, field: AnyField | null): string {
  const date = field ? dateFor(record, field) : null;
  return date ? date.toISOString().slice(0, 10) : '';
}
const randomizedTimeWithinHour = (hour: number) => `${String(hour).padStart(2, '0')}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}`;
const fmt = (value: number) => new Intl.NumberFormat().format(value);
const formatCount = (record: AnyRecord, field: AnyField | null) => { const value = numericValue(record, field); return value === null ? '—' : fmt(value); };
function formatMetric(record: AnyRecord, countField: AnyField | null, rateField: AnyField | null, denominatorField: AnyField | null): string {
  const count = numericValue(record, countField);
  let rate = percentValue(record, rateField);
  if (rate === null && count !== null) { const d = numericValue(record, denominatorField); if (d && d > 0) rate = count / d * 100; }
  return `${count === null ? '—' : fmt(count)} · ${rate === null ? '—' : `${rate.toFixed(1)}%`}`;
}
// Percent fields return fractions; the Campaigns formula fields already return percentage points.
function percentValue(record: AnyRecord, field: AnyField | null): number | null {
  const value = numericValue(record, field);
  return value === null ? null : field?.type === FieldType.PERCENT ? value * 100 : value;
}
const progressPercent = (record: AnyRecord, field: AnyField | null) => percentValue(record, field);
const ratio = (top: number | null, bottom: number | null) => top !== null && bottom !== null && bottom > 0 ? top / bottom * 100 : null;
const perOne = (record: AnyRecord, emailsField: AnyField | null, countField: AnyField | null) => {
  const sent = numericValue(record, emailsField), count = numericValue(record, countField);
  return sent !== null && count !== null && count > 0 ? sent / count : null;
};
const hasChoice = (field: AnyField | null, name: string) => (field?.config?.options?.choices ?? field?.options?.choices ?? []).some((choice: any) => choice.name.toLowerCase() === name.toLowerCase());
const selectWriteValue = (field: AnyField, name: string) => field.type === FieldType.SINGLE_SELECT ? {name} : name;
function withinDays(record: AnyRecord, field: AnyField | null, days: number | null): boolean {
  if (!days) return true;
  const date = dateFor(record, field);
  if (!date) return false;
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - days);
  return date >= cutoff;
}
// A record "has" an EmailBison campaign when its ID, Direct ID or Generic ID is a positive number.
const bisonIdOf = (record: AnyRecord, field: AnyField | null) => { const value = numericValue(record, field); return value !== null && Number.isSafeInteger(value) && value > 0 ? String(value) : ''; };
const hasBisonCampaign = (record: AnyRecord, f: any) => Boolean(bisonIdOf(record, f.bisonId) || bisonIdOf(record, f.directId) || bisonIdOf(record, f.genericId));

// ---------- KPI presentation ----------
type KpiKind = 'reply' | 'interested' | 'bounce' | 'meeting';
const KPI_LABELS = ['Bad', 'Not ideal', 'Average', 'Ideal', 'Good'];
const KPI_CHIPS = ['border-red-200 bg-red-50 text-red-700', 'border-orange-200 bg-orange-50 text-orange-700', 'border-amber-200 bg-amber-50 text-amber-700', 'border-blue-200 bg-blue-50 text-blue-700', 'border-emerald-200 bg-emerald-50 text-emerald-700'];
const KPI_BARS = ['bg-red-500', 'bg-orange-500', 'bg-amber-500', 'bg-blue-500', 'bg-emerald-500'];
const NO_DATA = {label: 'No data', chip: 'border-gray-200 bg-gray-100 text-gray-500'};
function kpiPresentation(rate: number | null, kind: KpiKind) {
  if (rate === null) return {...NO_DATA, score: null as number | null, bar: 'bg-gray-300'};
  const score = kind === 'reply' ? (rate < 1 ? 0 : rate < 2 ? 1 : rate < 3 ? 2 : rate < 5 ? 3 : 4)
    : kind === 'interested' ? (rate < 5 ? 0 : rate < 10 ? 1 : rate < 15 ? 2 : rate < 20 ? 3 : 4)
    // Bounce: watch over 2.5%, pause rule over 4%.
    : kind === 'bounce' ? (rate < 1 ? 4 : rate <= 2 ? 3 : rate <= 2.5 ? 2 : rate <= 4 ? 1 : 0)
    : (rate < 10 ? 0 : rate < 20 ? 1 : rate < 30 ? 2 : rate < 40 ? 3 : 4);
  return {label: KPI_LABELS[score], score: score as number | null, chip: KPI_CHIPS[score], bar: KPI_BARS[score]};
}
// Bounce rule shown next to the numbers: watch over 2.5%; the engine pauses over 4% at 35%+ progress.
function bounceWatch(rate: number | null, progress: number | null) {
  if (rate === null || rate <= 2.5) return null;
  if (rate > 4 && (progress ?? 0) >= 35) return {label: 'Pause rule', text: `Bounce ${rate.toFixed(2)}% is over 4% at ${(progress ?? 0).toFixed(0)}% progress: the engine's bounce check pauses this campaign.`, chip: 'border-red-200 bg-red-50 text-red-700'};
  return {label: 'Watch', text: `Bounce ${rate.toFixed(2)}% is over 2.5%: watch it${rate > 4 ? ' (over 4%; the pause rule applies from 35% progress)' : ''}.`, chip: 'border-amber-200 bg-amber-50 text-amber-700'};
}
function overallKpiPresentation(reply: any, interested: any, bounce: any, meeting: any, replyRate: number | null, emailsPerPositive: number | null, emailsSent: number | null) {
  if (emailsSent === null || emailsSent <= 0) return NO_DATA;
  if (emailsSent < 1000) return {label: 'Learning', chip: 'border-blue-200 bg-blue-50 text-blue-700'};
  if (emailsSent < 2000) return {label: 'Early read', chip: 'border-indigo-200 bg-indigo-50 text-indigo-700'};
  const highReply = replyRate !== null && replyRate >= 5 && emailsPerPositive !== null && emailsPerPositive <= 250;
  const scores = [reply.score, bounce.score, meeting.score, ...(highReply ? [] : [interested.score])].filter(score => score !== null) as number[];
  if (!scores.length) return NO_DATA;
  const weakest = Math.min(...scores);
  if (weakest <= 1) return {label: 'Needs attention', chip: 'border-red-200 bg-red-50 text-red-700'};
  if (weakest === 2) return {label: highReply ? 'Healthy top funnel' : 'Average', chip: 'border-amber-200 bg-amber-50 text-amber-700'};
  return {label: highReply ? 'Strong top funnel' : 'On target', chip: 'border-emerald-200 bg-emerald-50 text-emerald-700'};
}
function campaignStatusPresentation(value: string) {
  const status = value.trim().toLowerCase();
  return status === 'active' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : status === 'completed' ? 'border-blue-200 bg-blue-50 text-blue-700'
    : status === 'paused' ? 'border-amber-200 bg-amber-50 text-amber-700' : status === 'uploaded' ? 'border-purple-200 bg-purple-50 text-purple-700'
    : ['draft', 'spintax generated'].includes(status) ? 'border-violet-200 bg-violet-50 text-violet-700' : ['inactive', 'stopped'].includes(status) ? 'border-gray-200 bg-gray-100 text-gray-600' : 'border-slate-200 bg-slate-50 text-slate-700';
}
// Status is shown separately; live or finished campaigns hide stale build-stage chips.
const campaignStageLabel = (record: AnyRecord, f: any) => ['active', 'live', 'running', 'completed', 'complete', 'done', 'finished'].includes(optionName(record, f.status).trim().toLowerCase()) ? '' : optionName(record, f.workflowStage);
const clientPivotEnabled = (record: AnyRecord | null, field: AnyField | null) => !record || !field || optionName(record, field).trim().toLowerCase() !== 'disabled';
function campaignLifecycleState(status: string, hasLeadList: boolean, hasCopy: boolean) {
  if (['completed', 'complete', 'done', 'finished'].includes(status)) return {label: 'Done', detail: 'Campaign delivery is complete.', badge: 'border-slate-300 bg-slate-800 text-white'};
  // A launched campaign stays Scheduled while sending or paused; a build is not proof of launch.
  if (['scheduled', 'active', 'live', 'running', 'paused'].includes(status)) return {label: 'Scheduled', detail: `The campaign has been launched.${status === 'paused' ? ' Sending is paused.' : ''}`, badge: 'border-blue-300 bg-blue-100 text-blue-800'};
  if (!hasLeadList) return {label: 'Needs leads', detail: 'Attach a lead list to this campaign.', badge: 'border-amber-300 bg-amber-100 text-amber-800'};
  if (!hasCopy) return {label: 'Needs copy', detail: 'Fill in the first email subject and copy.', badge: 'border-purple-300 bg-purple-100 text-purple-800'};
  return {label: 'Ready', detail: 'Lead list attached and copy filled in. Awaiting launch.', badge: 'border-emerald-300 bg-emerald-100 text-emerald-800'};
}

type NextMove = {label: string; detail: string; chip: string; ready: boolean; action?: 'top-up-leads'};
const MOVE = {purple: 'border-purple-200 bg-purple-50 text-purple-700', amber: 'border-amber-200 bg-amber-50 text-amber-700', orange: 'border-orange-200 bg-orange-50 text-orange-700', indigo: 'border-indigo-200 bg-indigo-50 text-indigo-700', blue: 'border-blue-200 bg-blue-50 text-blue-700', green: 'border-emerald-200 bg-emerald-50 text-emerald-700', gray: 'border-gray-200 bg-gray-100 text-gray-600'};
function nextMovePresentation(record: AnyRecord, f: any, pivot = {newVertical: true, newOffer: true}): NextMove {
  const status = optionName(record, f.status).toLowerCase();
  const stage = optionName(record, f.workflowStage).toLowerCase();
  const live = ['active', 'live', 'running'].includes(status);
  const approvalResolved = ['client approved', 'internal approval exception'].includes(textValue(record, f.campaignApprovalSource).toLowerCase());
  const changeArea = textValue(record, f.selectChanges);
  const hasBison = hasBisonCampaign(record, f);
  if (!live && (status === 'draft' || stage === 'strategy draft') && !textValue(record, f.thesis)) return {label: 'Finish thesis', detail: 'Complete the thesis, targeting, offer and approach before writing copy.', chip: MOVE.purple, ready: true};
  if (!live && status === 'draft' && stage === 'strategy draft') return {label: 'Finish campaign setup', detail: 'Complete targeting and copy, then send it for approval.', chip: MOVE.purple, ready: true};
  if (!live && stage === 'client review') return {label: 'Await client approval', detail: 'The campaign is with the client.', chip: MOVE.amber, ready: false};
  if (!live && !approvalResolved && textValue(record, f.clientFeedback).toLowerCase().includes('request change')) return {label: 'Apply client changes', detail: changeArea ? `Client requested revisions to: ${changeArea}.` : 'Apply the client feedback and resubmit.', chip: 'border-orange-300 bg-orange-50 text-orange-700', ready: true};
  if (!live && stage === 'changes requested') return {label: 'Revise campaign', detail: 'Apply the requested changes, then resubmit.', chip: MOVE.orange, ready: true};
  if (!live && stage === 'approved' && status !== 'spintax generated') return {label: 'Prepare final sequence', detail: 'Copy the approved copy into the sequence and generate validated spintax.', chip: MOVE.indigo, ready: true};
  if (!live && stage === 'spintax in progress') return {label: 'Finish spintax QA', detail: 'Wait for validation, then review the final sequence.', chip: MOVE.indigo, ready: false};
  if (!live && (stage === 'build ready' || status === 'spintax generated') && !hasBison) return {label: 'Build campaign', detail: 'The sequence and settings are ready: press Build Campaign to create the EmailBison drafts.', chip: MOVE.blue, ready: true};
  if (hasBison && status !== 'active' && status !== 'completed') return {label: 'Launch campaign', detail: 'The EmailBison campaign exists: press Launch to run the engine launch checks.', chip: MOVE.green, ready: true};
  const progress = progressPercent(record, f.progress);
  if (progress === null || progress < 60) return {label: status === 'active' ? 'Keep running' : 'Review campaign status', detail: status === 'active' ? 'The recommendation starts at 60% progress.' : 'This campaign is not active and has no pending build step.', chip: MOVE.gray, ready: false};
  // Alex's top-up rule: reply rate (unique replies / sent) 2%+ AND interested 15%+ of replies. Interested rate leads.
  const sent = numericValue(record, f.emailsSent), replies = numericValue(record, f.replies), interested = numericValue(record, f.interested);
  const replyRate = ratio(replies, sent), interestedRate = ratio(interested, replies);
  if (replyRate === null || interestedRate === null) return {label: 'Needs data', detail: 'Emails sent, unique replies and interested counts are required.', chip: MOVE.gray, ready: false};
  const watch = bounceWatch(percentValue(record, f.bounceRate), progress);
  const rates = `Interested ${interestedRate.toFixed(1)}% of replies, reply rate ${replyRate.toFixed(2)}%.${watch ? ` Bounce: ${watch.label.toLowerCase()} (${watch.text})` : ''}`;
  if (replyRate >= 2 && interestedRate >= 15) return {label: 'Top up with leads', detail: `${rates} Both clear the top-up rule (2%+ replies, 15%+ interested).`, chip: MOVE.green, ready: true, action: 'top-up-leads'};
  if (interestedRate >= 15) return {label: 'Test copy and angles', detail: `${rates} Interest is strong but replies are under 2%: test subject lines and openers.`, chip: MOVE.orange, ready: true};
  if (pivot.newVertical) return {label: 'Same offer, new vertical', detail: `${rates} Interested is under 15%: keep the offer and test a new industry.`, chip: MOVE.blue, ready: true};
  if (pivot.newOffer) return {label: 'Test new offer', detail: `${rates} Interested is under 15%: test a new offer.`, chip: MOVE.orange, ready: true};
  return {label: 'Test copy and angles', detail: `${rates} Interested is under 15%: test copy and angles.`, chip: MOVE.orange, ready: true};
}

type ParsedReviewVariants = {structured: boolean; values: string[]};
function parseReviewVariants(rawValue: unknown, fieldLabel: string, allowEmpty = false): ParsedReviewVariants {
  const source = String(rawValue ?? '').replace(/\r\n?/g, '\n').trim();
  if (!source) return {structured: false, values: []};
  // Only two or more line-start "Variant N" labels split copy; the word alone never does.
  const markers = [...source.matchAll(/^(?:\[\s*)?variant\s+(10|[1-9]|[A-J])(?:\s*\])?\s*(?:(?::|[-–—])\s*)?(.*)$/gim)];
  if (markers.length < 2) return {structured: false, values: [source]};
  markers.forEach((marker, index) => {
    const token = String(marker[1]).toUpperCase();
    if ((/^\d+$/.test(token) ? Number(token) - 1 : token.charCodeAt(0) - 65) !== index) throw new Error(`${fieldLabel} variant labels must be sequential from Variant 1 or Variant A, with no duplicates or gaps.`);
  });
  const values = markers.map((marker, index) => {
    const end = (marker.index ?? 0) + marker[0].length;
    return [String(marker[2] ?? '').trim(), source.slice(end, markers[index + 1]?.index ?? source.length).trim()].filter(Boolean).join('\n').trim();
  });
  if (!allowEmpty && values.some(value => !value)) throw new Error(`${fieldLabel} contains an empty labelled variant.`);
  return {structured: true, values};
}

// Hide old split parents whose two uploaded outputs carry on (legacy n8n splits). Engine-built parents keep
// their Direct/Generic IDs and stay visible, because their Launch, Pause, Top Up and Senders presses happen there.
function completedSplitParentIds(records: AnyRecord[], f: any): Set<string> {
  return new Set(records.filter(parent => {
    const name = textValue(parent, f.name);
    if (OUTPUT_SUFFIX.test(name) || hasBisonCampaign(parent, f)) return false;
    const sourceIds = linkedIds(parent, f.leadList);
    if (!sourceIds.length || !linkedIds(parent, f.client).length) return false;
    if (['active', 'live', 'running', 'paused', 'scheduled'].includes(optionName(parent, f.status).trim().toLowerCase())) return false;
    const pairs = [' - Generic Emails', ' - Direct Emails'].map(suffix => records.filter(child => child.id !== parent.id
      && textValue(child, f.name).toLowerCase() === (baseCampaignName(name) + suffix).toLowerCase()
      && sameLinks(parent, child, f.client) && sameLinks(parent, child, f.workspace) && bisonIdOf(child, f.bisonId)));
    // Unuploaded drafts cannot prove a split, and duplicate outputs are ambiguous.
    if (pairs.some(pair => pair.length !== 1)) return false;
    const children = pairs.map(pair => pair[0]);
    if (bisonIdOf(children[0], f.bisonId) === bisonIdOf(children[1], f.bisonId)) return false;
    if (children.some(child => !['active', 'live', 'paused', 'complete', 'completed', 'inactive', 'finished', 'ended'].includes(optionName(child, f.status).trim().toLowerCase())
      && optionName(child, f.processing).trim().toLowerCase() !== 'completed')) return false;
    const childSources = children.map(child => linkedIds(child, f.leadList));
    const hasSource = childSources.map(ids => sourceIds.every(id => ids.includes(id)));
    if (hasSource.every(Boolean)) return true;
    // Legacy output with a missing source link: require the sibling's source plus an exact, disjoint sender split.
    if (hasSource.filter(Boolean).length !== 1 || childSources.some((ids, i) => !hasSource[i] && ids.length > 0)) return false;
    const parentSenders = linkedIds(parent, f.emailAccounts);
    const combined = children.flatMap(child => linkedIds(child, f.emailAccounts));
    return parentSenders.length > 0 && children.every(child => linkedIds(child, f.emailAccounts).length > 0) && new Set(combined).size === combined.length
      && new Set(parentSenders).size === parentSenders.length && combined.length === parentSenders.length && combined.every(id => parentSenders.includes(id));
  }).map(parent => parent.id));
}

function verifiedEmailBisonCampaignLink(record: AnyRecord, f: any): {url: string; title: string} {
  if (!bisonIdOf(record, f.bisonId)) return {url: '', title: 'Open the Direct or Generic output campaign to view it in EmailBison.'};
  try {
    const url = new URL(textValue(record, f.bisonUrl));
    if (url.origin === 'https://send.dulcy.io' && !url.username && !url.password && !url.search && !url.hash && /^\/campaigns\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/?$/i.test(url.pathname)) return {url: url.href, title: 'View in EmailBison'};
  } catch { /* missing or invalid URL */ }
  return {url: '', title: 'The verified EmailBison campaign link is not available yet.'};
}

// ---------- Shared class strings ----------
const PILL = 'rounded-full border px-3 py-1 text-xs font-bold';
const CHIP = 'inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold';
const KICKER = 'text-[11px] font-semibold uppercase tracking-wide opacity-75';
const DIS = 'disabled:cursor-not-allowed disabled:opacity-40';
const ICON_BTN = 'p-1.5 rounded hover:bg-gray-200 disabled:opacity-40';
const NOTE_AMBER = 'rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900';
const NOTE_RED = 'rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900';
const CARD = 'rounded-xl border border-gray-200 bg-white p-4 shadow-sm';
const panel = 'bg-white border-gray-200';
const muted = 'text-gray-500';
const control = 'text-sm px-3 py-2.5 rounded-lg border outline-none transition-all focus:border-purple-500 focus:ring-2 focus:ring-purple-100 bg-white border-gray-300 text-gray-900 shadow-sm';
const filterControl = 'min-w-[180px] rounded-lg border px-3 py-2.5 text-sm font-medium outline-none transition-all focus:border-purple-500 focus:ring-2 focus:ring-purple-100 bg-white border-gray-300 text-gray-900 shadow-sm';
const editorControl = 'min-h-[48px] w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base text-gray-900 outline-none transition-all hover:border-gray-400 focus:border-purple-500 focus:ring-2 focus:ring-purple-100';
const editorLabel = 'mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-gray-500';
const PRIMARY_BTN = 'rounded-lg px-4 py-2 text-sm font-semibold text-white';
const SENDER_STATES = [
  {key: 'available', label: 'Available', tone: 'emerald'}, {key: 'sending', label: 'Sending', tone: 'amber'}, {key: 'releasing-soon', label: 'Releasing Soon', tone: 'blue'},
  {key: 'reserved-next', label: 'Reserved Next', tone: 'purple'}, {key: 'disconnected', label: 'Disconnected', tone: 'red'}, {key: 'warming', label: 'Warming', tone: 'orange'},
] as const;
// Full class strings per tone so Tailwind keeps them.
const TONE: Record<string, {pill: string; tile: string; label: string; value: string; strong: string}> = {
  emerald: {pill: 'border-emerald-200 bg-emerald-50 text-emerald-800', tile: 'border-emerald-200', label: 'text-emerald-700', value: 'text-emerald-900', strong: 'text-emerald-950'},
  amber: {pill: 'border-amber-200 bg-amber-50 text-amber-800', tile: 'border-amber-200', label: 'text-amber-700', value: 'text-amber-900', strong: 'text-amber-950'},
  blue: {pill: 'border-blue-200 bg-blue-50 text-blue-800', tile: 'border-blue-200', label: 'text-blue-700', value: 'text-blue-900', strong: 'text-blue-950'},
  purple: {pill: 'border-purple-200 bg-purple-50 text-purple-800', tile: 'border-purple-200', label: 'text-purple-700', value: 'text-purple-900', strong: 'text-purple-950'},
  red: {pill: 'border-red-200 bg-red-50 text-red-800', tile: 'border-red-200', label: 'text-red-700', value: 'text-red-900', strong: 'text-red-950'},
  orange: {pill: 'border-orange-200 bg-orange-50 text-orange-800', tile: 'border-orange-200', label: 'text-orange-700', value: 'text-orange-900', strong: 'text-orange-950'},
};

// ---------- Saved automation status (engine first, then the shared workflow fields) ----------
function CampaignAutomationStatus({status, message, error, startedAt, completedAt, engineStatus, engineJobId, engineMessage, engineAction, pressedAt, onRequestClear}: {
  status: string; message: string; error: string; startedAt: string; completedAt: string; engineStatus: string; engineJobId: string; engineMessage: string; engineAction: string; pressedAt: string; onRequestClear: () => Promise<void>;
}) {
  const [now, setNow] = useState(Date.now());
  const [clearOpen, setClearOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [clearing, setClearing] = useState(false);
  const normalized = status.trim().toLowerCase();
  const active = RUNNING.includes(normalized) || ENGINE_ACTIVE.includes(engineStatus) || Boolean(engineAction);
  useEffect(() => { if (!active) return; setNow(Date.now()); const timer = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer); }, [active, startedAt]);
  const start = Date.parse(startedAt), end = Date.parse(completedAt);
  const longRunning = active && Number.isFinite(start) && now - start >= 60 * 60 * 1000;
  const failed = ['failed', 'error', 'needs review'].includes(normalized) || ['Failed', 'Needs Review'].includes(engineStatus);
  const tone = failed || error ? 'border-red-200 bg-red-50 text-red-900' : longRunning ? 'border-amber-200 bg-amber-50 text-amber-950' : active ? 'border-blue-200 bg-blue-50 text-blue-950'
    : normalized === 'completed' || engineStatus === 'Done' ? 'border-emerald-200 bg-emerald-50 text-emerald-950' : 'border-slate-200 bg-slate-50 text-slate-700';
  const dateLabel = (raw: string) => raw && Number.isFinite(Date.parse(raw)) ? new Date(raw).toLocaleString() : '';
  const closeClear = () => { if (clearing) return; setClearOpen(false); setAcknowledged(false); };
  const confirmClear = async () => { if (!acknowledged || clearing) return; setClearing(true); try { await onRequestClear(); setClearOpen(false); setAcknowledged(false); } finally { setClearing(false); } };
  const hasSavedStatus = Boolean(status.trim() || message.trim() || error.trim());
  // The engine writes Engine Message first (launch lists its PASS/FAIL checks); Workflow Message is the older shared field.
  const displayMessage = engineMessage.trim() || message;
  return <>
    <section aria-label="Automation status" className={`mt-4 rounded-xl border p-4 ${tone}`}>
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">Automation status</h3><div className="flex items-center gap-2">
        <span className={`${PILL} ${engineChip(engineStatus)}`}>Engine: {engineStatus || 'Idle'}</span>
        <span className="rounded-full border border-current px-3 py-1 text-xs font-bold">{status || 'Not Started'}</span>
        {hasSavedStatus && <button type="button" className="rounded-md border border-current bg-white/70 px-2 py-1 text-[11px] font-bold hover:bg-white" onClick={() => setClearOpen(true)}>Clear status</button>}
      </div></div>
      <div role="status" aria-live="polite" className="mt-2 whitespace-pre-wrap break-words text-sm">{displayMessage || (active ? 'The engine reports an active job. Waiting for its next update.' : 'No engine message has been saved for this campaign yet.')}</div>
      {engineAction && <p className="mt-2 text-xs font-semibold">Waiting for the engine to pick up: {engineAction}. It starts within about 30 seconds.</p>}
      {error && <div className="mt-3 whitespace-pre-wrap break-words rounded-lg border border-red-200 bg-white p-3 text-sm text-red-800"><strong>Saved error: </strong>{error}</div>}
      {longRunning && <p className="mt-3 text-sm font-semibold">Started over an hour ago; read the engine message before pressing again.</p>}
      {failed && <p className="mt-3 text-sm font-semibold">Read the message before pressing the button again.</p>}
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs">
        {engineJobId && <span className="break-all">Engine job: {engineJobId}</span>}
        {dateLabel(pressedAt) && <span>Pressed: {dateLabel(pressedAt)}</span>}
        {dateLabel(startedAt) && <span>Started: {dateLabel(startedAt)}</span>}
        {active && Number.isFinite(start) && <span>Elapsed: {Math.max(0, Math.floor((now - start) / 60000))} min</span>}
        {!active && Number.isFinite(end) && (!Number.isFinite(start) || end >= start) && <span>Completed: {dateLabel(completedAt)}</span>}
      </div>
      <p className="mt-2 text-xs opacity-75">Saved on this campaign and shared with your team; the engine updates it as the job moves.</p>
    </section>
    {clearOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-labelledby="clear-status-title"><div className="w-full max-w-lg rounded-2xl bg-white p-6 text-slate-900 shadow-2xl">
      <h3 id="clear-status-title" className="text-lg font-black">Clear saved automation status?</h3>
      <p className="mt-3 text-sm leading-6 text-slate-700">Clears only the processing status, workflow message and workflow error; it does not stop an engine job or change the Engine fields.</p>
      <label className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-950"><input type="checkbox" className="mt-0.5" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)}/><span>I confirmed the job is finished, stopped or stuck.</span></label>
      <div className="mt-5 flex justify-end gap-3">
        <button type="button" className="rounded-lg border border-slate-300 px-4 py-2 font-semibold hover:bg-slate-50" onClick={closeClear} disabled={clearing}>Cancel</button>
        <button type="button" className={`rounded-lg bg-red-600 px-4 py-2 font-bold text-white ${DIS}`} onClick={confirmClear} disabled={!acknowledged || clearing}>{clearing ? 'Clearing…' : 'Clear saved status'}</button>
      </div>
    </div></div>}
  </>;
}

function CampaignReviewPanel({record, field, name}: {record: AnyRecord; field: AnyField | null; name: string}) {
  const raw = field ? String(cellValue(record, field) || '') : '';
  const cleaned = raw.replace(/^(?:Reference:\s*)?\[Campaign learning v1:[^\]]+\]\s*\n?/gm, '').replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '$1 ($2)')
    .replace(/\*\*/g, '').replace(/^#{1,6}\s+/gm, '').replace(/^\s*---+\s*$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
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
      <p className="mt-2 text-sm font-medium text-gray-700">{name || 'Selected campaign'}</p>
    </header>
    {!field ? <p className="p-5 text-sm text-amber-800">Add the Improvement Sugestion field to this page to show campaign reviews.</p>
    : !cleaned ? <p className="p-5 text-sm leading-6 text-gray-600">No campaign review yet; one is written when the campaign reaches 60%.</p>
    : <div className="divide-y divide-gray-100">{sections.filter(s => s.text.trim()).map((s, i) => <details key={`${record?.id}-${i}-${s.title}`} open={/^(QUICK SUMMARY|RECOMMENDED NEXT STEPS)$/i.test(s.title) || (i === 0 && sections.length === 1)} className="group p-5">
      <summary className="cursor-pointer text-sm font-semibold text-gray-900">{s.title.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase())}</summary>
      <div className="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-gray-700">{linkText(s.text.trim())}</div>
    </details>)}</div>}
    {cleaned && <p className="border-t border-gray-100 bg-slate-50 px-5 py-3 text-xs leading-5 text-gray-500">Recommendations only; approve changes before adding leads or sending.</p>}
  </section>;
}

function VerificationPerformancePanel({record, field}: {record: AnyRecord; field: AnyField | null}) {
  const [provider, setProvider] = useState('All');
  const [emailType, setEmailType] = useState('All');
  let snapshot: any = null;
  try { snapshot = field ? JSON.parse(String(cellValue(record, field) || 'null')) : null; } catch { /* not synced */ }
  const groups: any[] = snapshot?.version === 1 && Array.isArray(snapshot.groups) ? snapshot.groups : [];
  const shown = groups.filter(g => (provider === 'All' || g.provider === provider) && (emailType === 'All' || g.emailType === emailType));
  const total = shown.reduce((a, g) => { for (const k of ['leads', 'contacted', 'sent', 'replies', 'positive', 'bounces']) a[k] += Number(g[k]) || 0; return a; }, {leads: 0, contacted: 0, sent: 0, replies: 0, positive: 0, bounces: 0});
  const rate = (n: number, d: number) => d > 0 ? (100 * n / d).toFixed(2) + '%' : '—';
  const stale = snapshot?.updatedAt && Date.now() - Date.parse(snapshot.updatedAt) > 3 * 60 * 60 * 1000;
  const filter = (label: string, value: string, set: (v: string) => void, values: string[]) => <label className="text-xs text-gray-600">{label}<select aria-label={label} value={value} onChange={e => set(e.target.value)} className="ml-2 rounded-lg border border-gray-200 bg-white p-2">{values.map(v => <option key={v}>{v}</option>)}</select></label>;
  return <section className="mb-6 rounded-xl border border-purple-200 bg-white p-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-base font-semibold text-gray-900">Verification performance</h3><p className="mt-1 text-sm text-gray-500">Campaign-to-date results by the provider that verified each lead's email.</p></div>
      <div className="flex flex-wrap gap-2">{filter('Verified by', provider, setProvider, ['All', 'MillionVerifier', 'LeadMagic', 'Unknown'])}{filter('Email type', emailType, setEmailType, ['All', 'Direct', 'Generic', 'Unknown'])}</div>
    </div>
    {!snapshot ? <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-gray-600">Provider statistics have not synced yet; leads without verification tags stay Unknown.</p> : <>
      <p className={`mt-3 text-xs ${stale ? 'text-amber-700' : 'text-gray-500'}`}>{stale ? 'Refresh overdue · ' : ''}Updated {new Date(snapshot.updatedAt).toLocaleString()} · {Number(snapshot.tagged || 0).toLocaleString()} of {Number(snapshot.total || 0).toLocaleString()} leads have a known verifier.</p>
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">{[['Leads contacted', total.contacted, ''], ['Replies', total.replies, rate(total.replies, total.contacted)], ['Positive replies', total.positive, rate(total.positive, total.contacted)], ['Bounces', total.bounces, rate(total.bounces, total.contacted)]].map(([label, n, pct]) => <div key={String(label)} className="rounded-lg border border-gray-200 bg-slate-50 p-3"><div className="text-xs text-gray-500">{label}</div><div className="mt-1 text-xl font-semibold text-gray-900">{Number(n).toLocaleString()} <span className="text-sm font-normal text-gray-500">{pct}</span></div></div>)}</div>
      <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr>{['Verified by', 'Email type', 'Leads', 'Contacted', 'Sent', 'Replies', 'Positive', 'Bounces'].map(h => <th className="whitespace-nowrap border-b p-2" key={h}>{h}</th>)}</tr></thead><tbody>{shown.filter(g => g.leads > 0).map(g => <tr key={g.provider + '|' + g.emailType}>{[g.provider, g.emailType, g.leads, g.contacted, g.sent, `${g.replies} (${rate(g.replies, g.contacted)})`, `${g.positive} (${rate(g.positive, g.contacted)})`, `${g.bounces} (${rate(g.bounces, g.contacted)})`].map((v, i) => <td className="whitespace-nowrap border-b border-gray-100 p-2" key={i}>{v}</td>)}</tr>)}</tbody></table></div>
      {!shown.some(g => g.leads > 0) && <p className="mt-3 text-sm text-gray-500">No leads match these filters.</p>}
      <p className="mt-3 text-xs leading-5 text-gray-500">Rates use unique leads contacted; LeadMagic and MillionVerifier groups are different populations, not a controlled test.</p>
    </>}
  </section>;
}

function getCustomProperties(base: ReturnType<typeof useBase>) {
  const tables = (base.tables ?? []).filter((table): table is AnyTable => Boolean(table));
  const byName = (name: string) => tables.find(table => table?.name?.trim().toLowerCase() === name);
  const campaigns = byName('campaigns');
  const field = (key: string, label: string, name: string) => {
    const found = campaigns?.getFieldIfExists(name);
    return campaigns && found ? [{key, label, type: 'field' as const, table: campaigns, defaultValue: found}] : [];
  };
  return [
    {key: 'campaignsTable', label: 'Campaigns', type: 'table' as const, defaultValue: campaigns},
    {key: 'sequenceAnalyticsTable', label: 'Sequence analytics', type: 'table' as const, defaultValue: byName('sequence analytics')},
    {key: 'leadListsTable', label: 'Lead lists', type: 'table' as const, defaultValue: byName('lead lists')},
    {key: 'clientsTable', label: 'Clients', type: 'table' as const, defaultValue: byName('workspace ids')},
    {key: 'emailAccountsTable', label: 'Email accounts', type: 'table' as const, defaultValue: byName('email accounts')},
    ...field('emailsSentField', 'Emails sent field', 'Emails Sent'), ...field('repliesDataField', 'Replies data field', 'Unique Replies Data'),
    ...field('bouncesDataField', 'Bounces data field', 'Bounced Data'), ...field('interestedDataField', 'Interested data field', 'Interested Data'),
    ...field('meetingsDataField', 'Meetings data field', 'Meetings Booked Data'),
  ];
}

const HISTORY_CUTOFF = new Date('2026-07-15T00:00:00-04:00').getTime();
const sleep = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));
// Sequence card fields for one step and version (the names the Campaigns table uses for split-test versions).
const sequenceVersionFields = (table: AnyTable, step: number, version: number) => ({
  subject: findField(table, [`Campaign Email ${step} Subject Version ${version}`, `Campaign Subject ${step} Version ${version}`, `Campaign Email ${step} Subject Spintax ${version}`, ...(version === 1 ? [`Campaign Email ${step} Subject`] : [])]),
  body: findField(table, [`Campaign Body ${step} Version ${version}`, `Campaign Email ${step} Body Spintax ${version}`, ...(version === 1 ? [`Campaign Email ${step} Body`] : [])]),
});

function CampaignCenter(): React.ReactElement {
  const base = useBase();
  const {customPropertyValueByKey: props} = useCustomProperties(getCustomProperties);
  const tableNamed = (test: (name: string) => boolean) => base.tables.find(table => test(table?.name?.trim().toLowerCase() ?? ''));
  const campaignsTable = (props.campaignsTable as AnyTable | undefined) ?? tableNamed(name => name === 'campaigns');
  const sequenceAnalyticsTable = props.sequenceAnalyticsTable as AnyTable | undefined;
  const leadListsTable = props.leadListsTable as AnyTable | undefined;
  const clientsTable = base.tables.find(table => table.id === 'tblcjRBGJEWh5KgOt') ?? (props.clientsTable as AnyTable | undefined) ?? tableNamed(name => name === 'workspace ids' || name === 'clients');
  const emailAccountsTable = (props.emailAccountsTable as AnyTable | undefined) ?? tableNamed(name => ['email accounts', 'sender emails', 'sending accounts'].includes(name) || (name.includes('email') && name.includes('account')));
  if (!campaignsTable) throw new Error('Campaign Center could not find the Campaigns table. Configure it in Custom properties.');
  // The record hook needs a valid table: a missing optional table falls back to Campaigns and its rows are dropped.
  const rows = (result: any, keep: boolean) => (keep ? (result ?? []) as AnyRecord[] : []).filter((record: AnyRecord) => Boolean(record?.id));
  const campaigns = rows(useRecords(campaignsTable), true);
  const sequenceAnalytics = rows(useRecords(sequenceAnalyticsTable ?? campaignsTable), Boolean(sequenceAnalyticsTable));
  const leadListRecords = rows(useRecords(leadListsTable ?? campaignsTable), Boolean(leadListsTable));
  const clientRecords = rows(useRecords(clientsTable ?? campaignsTable), Boolean(clientsTable));
  const safeEmailAccountRecords = rows(useRecords(emailAccountsTable ?? campaignsTable), Boolean(emailAccountsTable));
  const campaignsRef = useRef<AnyRecord[]>(campaigns);
  campaignsRef.current = campaigns;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [clientFilter, setClientFilter] = useState(() => readStored(ACTIVE_CLIENT_STORAGE_KEY, 'Dulcy'));
  const [statusFilter, setStatusFilter] = useState('all');
  const [workspaceFilter, setWorkspaceFilter] = useState(() => readStored(ACTIVE_WORKSPACE_STORAGE_KEY, 'all'));
  const [healthFilter, setHealthFilter] = useState('all');
  const [dateRange, setDateRange] = useState<DateRange>('all');
  const [search, setSearch] = useState('');
  const [showHiddenHistory, setShowHiddenHistory] = useState(false);
  const [tab, setTab] = useState<Tab>('overview');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [trackedSpintax, setTrackedSpintax] = useState<{recordId: string; campaignName: string; sawRunningState: boolean} | null>(null);
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
  const [accountSearch, setAccountSearch] = useState('');
  const [senderStatusFilter, setSenderStatusFilter] = useState('all');
  const [accountSelectionCount, setAccountSelectionCount] = useState(10);
  const [sequenceDelayDraft, setSequenceDelayDraft] = useState('');
  const [skipApprovalConfirmed, setSkipApprovalConfirmed] = useState(false);
  const [manualTopUpAcknowledged, setManualTopUpAcknowledged] = useState(false);
  // A press on its way to the engine (record ID); with Engine Status/Action it locks that campaign's engine buttons.
  const [pressing, setPressing] = useState<string | null>(null);
  const pressLock = useRef(false);

  useEffect(() => {
    setTab('overview'); setNotice(null); setAccountSearch(''); setSenderStatusFilter('all'); setSkipApprovalConfirmed(false); setManualTopUpAcknowledged(false);
  }, [selectedId]);

  const fields = useMemo(() => {
    const mapped = mapFields(campaignsTable, CAMPAIGN_FIELDS);
    const configured = (key: string) => props[key] as AnyField | undefined;
    return {...mapped, emailsSent: configured('emailsSentField') ?? mapped.emailsSent, repliesData: configured('repliesDataField') ?? mapped.repliesData, bouncesData: configured('bouncesDataField') ?? mapped.bouncesData,
      interestedData: configured('interestedDataField') ?? mapped.interestedData, meetingsData: configured('meetingsDataField') ?? mapped.meetingsData};
  }, [campaignsTable, props.emailsSentField, props.repliesDataField, props.bouncesDataField, props.interestedDataField, props.meetingsDataField]);
  const leadListFields = useMemo(() => mapFields(leadListsTable, LEAD_LIST_FIELDS), [leadListsTable]);
  const clientFields = useMemo(() => mapFields(clientsTable, CLIENT_FIELDS), [clientsTable]);
  const emailAccountFields = useMemo(() => mapFields(emailAccountsTable, EMAIL_ACCOUNT_FIELDS), [emailAccountsTable]);
  const emailAccountClientFields = useMemo(() => [...new Map(EMAIL_ACCOUNT_CLIENT_FIELDS.map(key => findField(emailAccountsTable, [key])).filter(Boolean).map((field: AnyField) => [field.id, field])).values()], [emailAccountsTable]);
  const sequenceAnalyticsFields = useMemo(() => mapFields(sequenceAnalyticsTable, SEQUENCE_ANALYTICS_FIELDS), [sequenceAnalyticsTable]);
  // Names come from the Name fields, never from a record's primary field (the page may not be given it).
  const campaignName = (record: AnyRecord) => textValue(record, fields.name);
  const clientName = (record: AnyRecord | null) => textValue(record, clientFields.name);
  const leadListName = (record: AnyRecord | null) => textValue(record, leadListFields.name) || record?.id || '';
  const accountLabel = (record: AnyRecord) => textValue(record, emailAccountFields.name) || record.id;

  const creationClientRecord = clientFilter === 'all' ? null : clientRecords.find(record => clientName(record).toLowerCase() === clientFilter.trim().toLowerCase()) ?? null;
  // Client Name stays authoritative for matching and links; labels may use the Brand Name.
  const creationClientName = clientName(creationClientRecord);
  const creationClientDisplayName = textValue(creationClientRecord, clientFields.brandName) || creationClientName;
  const campaignTitleDraft = stripBracketedClientPrefix(newCampaignName);
  const leadListTitleDraft = stripBracketedClientPrefix(newLeadListName || newCampaignName);
  const campaignNamePreview = creationClientDisplayName ? clientPrefixedName(creationClientDisplayName, campaignTitleDraft) : campaignTitleDraft;
  const leadListNamePreview = creationClientDisplayName ? clientPrefixedName(creationClientDisplayName, leadListTitleDraft) : leadListTitleDraft;

  const options = useMemo(() => {
    const activeClientNames = clientsTable
      ? clientRecords.filter(record => showHiddenHistory || (clientFields.status && optionName(record, clientFields.status).trim().toLowerCase() === 'active')).map(clientName).filter(Boolean).sort((a, b) => a.localeCompare(b))
      : showHiddenHistory ? selectOptions(fields.client, campaigns) : [];
    return {clients: [...new Set(activeClientNames)], statuses: selectOptions(fields.status, campaigns), workspaces: selectOptions(fields.workspace, campaigns), health: selectOptions(fields.health, campaigns)};
  }, [campaigns, fields, clientsTable, clientRecords, clientFields, showHiddenHistory]);
  useEffect(() => { if (options.clients.length && (clientFilter === 'all' || options.clients.includes(clientFilter))) writeStored(ACTIVE_CLIENT_STORAGE_KEY, clientFilter); }, [clientFilter, options.clients]);
  useEffect(() => { writeStored(ACTIVE_WORKSPACE_STORAGE_KEY, workspaceFilter); }, [workspaceFilter]);
  useEffect(() => {
    if (clientFilter === 'all' || !options.clients.length || options.clients.includes(clientFilter)) return;
    setClientFilter(options.clients.find(client => client.toLowerCase() === 'dulcy') ?? options.clients[0] ?? 'all');
  }, [clientFilter, options.clients]);
  useEffect(() => { if (workspaceFilter !== 'all' && options.workspaces.length && !options.workspaces.includes(workspaceFilter)) setWorkspaceFilter('all'); }, [workspaceFilter, options.workspaces]);

  // Campaigns created before 15 Jul 2026 that are not running are hidden unless "Show hidden history" is ticked.
  const isHiddenHistory = (record: AnyRecord) => {
    const createdAt = dateFor(record, fields.created)?.getTime();
    const running = ['active', 'live', 'paused', 'scheduled', 'running'].includes(optionName(record, fields.status).trim().toLowerCase()) || ['scheduled', 'running'].includes(optionName(record, fields.lifecycle).trim().toLowerCase());
    return createdAt !== undefined && createdAt < HISTORY_CUTOFF && !running;
  };
  const splitParents = useMemo(() => completedSplitParentIds(campaigns, fields), [campaigns, fields]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const match = (record: AnyRecord, field: AnyField | null, wanted: string) => wanted === 'all' || comparableValues(record, field).includes(wanted);
    return campaigns.filter(record => !splitParents.has(record.id)
      && (!query || [fields.name, fields.client, fields.workspace, fields.status, fields.type].map(field => textValue(record, field).toLowerCase()).join(' ').includes(query))
      && match(record, fields.client, clientFilter) && match(record, fields.status, statusFilter) && match(record, fields.workspace, workspaceFilter) && match(record, fields.health, healthFilter)
      && withinDays(record, fields.created, dateRange === 'all' ? null : Number(dateRange)) && (showHiddenHistory || !isHiddenHistory(record)))
      .sort((a, b) => ((dateFor(b, fields.created)?.getTime() ?? -Infinity) - (dateFor(a, fields.created)?.getTime() ?? -Infinity)) || campaignName(a).localeCompare(campaignName(b)));
  }, [campaigns, fields, splitParents, search, clientFilter, statusFilter, workspaceFilter, healthFilter, dateRange, showHiddenHistory]);
  const hiddenHistoryCount = useMemo(() => campaigns.filter(isHiddenHistory).length, [campaigns, fields]);

  // Agency benchmark: qualified campaigns from the last 180 days with 2,000+ emails (tests excluded).
  const benchmarkCutoff = new Date();
  benchmarkCutoff.setDate(benchmarkCutoff.getDate() - 180);
  const sumCampaigns = (list: AnyRecord[]) => list.reduce((totals, record) => {
    totals.emails += Math.max(0, numericValue(record, fields.emailsSent) ?? 0); totals.replies += Math.max(0, numericValue(record, fields.replies) ?? 0);
    totals.interested += Math.max(0, numericValue(record, fields.interested) ?? 0); totals.meetings += Math.max(0, numericValue(record, fields.meetings) ?? 0);
    return totals;
  }, {emails: 0, replies: 0, interested: 0, meetings: 0});
  const benchmark = (totals: {emails: number; replies: number; interested: number; meetings: number}) => ({
    positiveReplyPercent: totals.replies > 0 ? totals.interested / totals.replies * 100 : null, emailsPerPositiveReply: totals.interested > 0 ? totals.emails / totals.interested : null,
    meetingBookedPercent: totals.interested > 0 ? totals.meetings / totals.interested * 100 : null, emailsPerMeeting: totals.meetings > 0 ? totals.emails / totals.meetings : null,
  });
  const agencyBenchmark = benchmark(sumCampaigns(campaigns.filter(record => {
    const date = dateFor(record, fields.launchDate) ?? dateFor(record, fields.created);
    return (['active', 'live', 'running', 'completed'].includes(optionName(record, fields.status).trim().toLowerCase()) || ['running', 'completed'].includes(optionName(record, fields.lifecycle).trim().toLowerCase()))
      && (numericValue(record, fields.emailsSent) ?? 0) >= 2000 && date !== null && date >= benchmarkCutoff && !/(^|\s|\[)test(\s|\]|$)/i.test(campaignName(record));
  })));

  const selected = useMemo(() => campaigns.find(record => record.id === selectedId) ?? null, [campaigns, selectedId]);
  const clientRecordForCampaign = useCallback((campaign: AnyRecord | null) => {
    if (!campaign || !fields.client) return null;
    const ids = linkedIds(campaign, fields.client);
    const linked = ids.length ? clientRecords.find(record => ids.includes(record.id)) : null;
    if (linked) return linked;
    const names = comparableValues(campaign, fields.client).map(value => value.trim().toLowerCase()).filter(Boolean);
    return clientRecords.find(record => names.includes(clientName(record).toLowerCase())) ?? null;
  }, [fields.client, clientRecords, clientFields.name]);
  const selectedClientRecord = useMemo(() => clientRecordForCampaign(selected), [clientRecordForCampaign, selected]);
  const pivotOptionsFor = (clientRecord: AnyRecord | null) => ({newVertical: clientPivotEnabled(clientRecord, clientFields.newVerticalPivot), newOffer: clientPivotEnabled(clientRecord, clientFields.newOfferPivot)});
  const selectedPivotOptions = pivotOptionsFor(selectedClientRecord);
  const selectedClientBenchmark = useMemo(() => {
    if (!selected) return null;
    const ids = linkedIds(selected, fields.client);
    const names = comparableValues(selected, fields.client).map(value => value.trim().toLowerCase()).filter(Boolean);
    if (!ids.length && !names.length) return null;
    return benchmark(sumCampaigns(campaigns.filter(record => (ids.length && linkedIds(record, fields.client).some(id => ids.includes(id)))
      || comparableValues(record, fields.client).map(value => value.trim().toLowerCase()).some(name => names.includes(name)))));
  }, [selected, campaigns, fields]);
  const selectedClientDecision = textValue(selected, fields.clientFeedback);
  // Lead List (fld5weZ6ED31dBlaz) is the linked-record field; "Campaign Lead List" is only a URL.
  const campaignLeadListLinkField = fields.leadList;
  // Counts and a finished verification job do not prove the lead list passed QA.
  const leadReadinessIssue = (record: AnyRecord): string => {
    const ids = linkedIds(record, campaignLeadListLinkField);
    if (!ids.length) return 'Link a Ready lead list with passed QA before building or launching.';
    if (!leadListFields.stage || !leadListFields.qaStatus) return 'Lead-list readiness cannot be checked: add Lead List Stage and QA Status to this page.';
    for (const id of ids) {
      const list = leadListRecords.find(candidate => candidate.id === id);
      if (!list) return 'The linked lead list is not loaded yet; wait or check access.';
      const stage = optionName(list, leadListFields.stage), qa = optionName(list, leadListFields.qaStatus), processing = optionName(list, leadListFields.processingStatus);
      if (!['ready', 'uploaded'].includes(stage.toLowerCase()) || qa.toLowerCase() !== 'passed') return `Finish the lead list in Lead List Center first (stage ${stage || 'not set'}, QA ${qa || 'not passed'}); build and launch stay locked until it is Ready.`;
      if (['requested', 'queued', 'running', 'processing', 'failed', 'error'].includes(processing.toLowerCase())) return `The linked lead list has an unfinished automation (${processing}); resolve it first.`;
    }
    return '';
  };
  const selectedLeadReadinessIssue = selected ? leadReadinessIssue(selected) : '';
  const selectedBisonView = selected ? verifiedEmailBisonCampaignLink(selected, fields) : {url: '', title: ''};
  const selectedLeadListId = selected ? linkedIds(selected, campaignLeadListLinkField)[0] ?? null : null;
  const selectedLeadList = selectedLeadListId ? leadListRecords.find(record => record.id === selectedLeadListId) ?? null : null;
  const leadCount = (list: AnyRecord | null, field: AnyField | null) => list ? Math.max(0, numericValue(list, field) ?? 0) : 0;
  const selectedGenericLeadCount = leadCount(selectedLeadList, leadListFields.finalGenericCount);
  const selectedDirectLeadCount = leadCount(selectedLeadList, leadListFields.finalDirectCount);
  const selectedSavedSequenceDelay = selected && fields.daysBetween ? numericValue(selected, fields.daysBetween) ?? Number.parseInt(optionName(selected, fields.daysBetween), 10) : null;
  useEffect(() => { setSequenceDelayDraft(selected && fields.daysBetween && Number.isFinite(selectedSavedSequenceDelay) ? String(selectedSavedSequenceDelay) : ''); }, [selected?.id, selectedSavedSequenceDelay, fields.daysBetween]);
  const selectedTopUpLeadListIds = selected ? linkedIds(selected, fields.topUpLeadList) : [];
  const selectedTopUpLeadListId = selectedTopUpLeadListIds[0] ?? null;
  const selectedTopUpLeadList = selectedTopUpLeadListId ? leadListRecords.find(record => record.id === selectedTopUpLeadListId) ?? null : null;
  const selectedTopUpGenericCount = leadCount(selectedTopUpLeadList, leadListFields.finalGenericCount);
  const selectedTopUpDirectCount = leadCount(selectedTopUpLeadList, leadListFields.finalDirectCount);

  const selectedEmailAccountIds = selected ? linkedIds(selected, fields.emailAccounts) : [];
  const selectedClientNamesForAccounts = clientFilter !== 'all' ? [clientFilter.toLowerCase()] : selected ? comparableValues(selected, fields.client).map(value => value.toLowerCase()) : [];
  const selectedClientIdsForAccounts = useMemo(() => {
    if (!fields.client || !selectedClientNamesForAccounts.length) return [] as string[];
    return [...new Set(campaigns.flatMap(record => {
      const text = textValue(record, fields.client).toLowerCase(), values = comparableValues(record, fields.client).map(value => value.toLowerCase());
      return selectedClientNamesForAccounts.some(name => text === name || values.includes(name)) ? linkedIds(record, fields.client) : [];
    }))];
  }, [campaigns, fields.client, selectedClientNamesForAccounts.join('|')]);
  const selectedWorkspaceNames = useMemo(() => {
    const directlySelected = selected ? comparableValues(selected, fields.workspace).map(value => value.toLowerCase()) : [];
    const clientWorkspaceIds = selectedClientRecord ? comparableValues(selectedClientRecord, clientFields.workspaceId).map(value => value.toLowerCase()) : [];
    const override = [...selectedClientNamesForAccounts, clientName(selectedClientRecord).toLowerCase()].filter(Boolean)
      .map(name => SENDER_WORKSPACE_OVERRIDES[name.trim()]).find((ids): ids is string[] => Array.isArray(ids) && ids.length > 0);
    // The client's own workspace record wins; a shared lookup can expose an old workspace and its replacement.
    const exact = [...new Set(override ?? (clientWorkspaceIds.length ? clientWorkspaceIds : directlySelected))];
    if (exact.length || !selectedClientNamesForAccounts.length) return exact;
    return [...new Set(campaigns.flatMap(record => comparableValues(record, fields.client).some(value => selectedClientNamesForAccounts.includes(value.toLowerCase()))
      ? comparableValues(record, fields.workspace).map(value => value.toLowerCase()) : []))];
  }, [selected, selectedClientRecord, clientFields, fields.workspace, fields.client, campaigns, selectedClientNamesForAccounts.join('|')]);
  const campaignSenderState = useCallback((record: AnyRecord) => {
    if (splitParents.has(record.id)) return {finished: true, releasingSoon: false, sending: false, launchReady: false};
    const status = optionName(record, fields.status).trim().toLowerCase(), stage = optionName(record, fields.workflowStage).trim().toLowerCase();
    const rawProgress = numericValue(record, fields.progress) ?? 0;
    const progress = rawProgress > 1 ? rawProgress / 100 : rawProgress;
    const finished = progress >= 1 || ['complete', 'completed', 'inactive', 'finished', 'ended'].includes(status);
    const operational = !finished && (['active', 'live', 'running', 'paused'].includes(status) || ['live', 'running', 'paused'].includes(stage));
    // A pending top-up (top-up list linked, not yet Completed) keeps the inboxes reserved.
    const topUpPending = !operational && linkedIds(record, fields.emailAccounts).length > 0 && linkedIds(record, fields.topUpLeadList).length > 0 && optionName(record, fields.topUpStatus).trim().toLowerCase() !== 'completed';
    // Operational status wins over an old Build Ready stage: only a future campaign reserves inboxes.
    const launchReady = topUpPending || (!finished && !operational && (['uploaded', 'scheduled'].includes(status) || ['launch ready', 'build ready', 'uploaded', 'scheduled', 'queued', 'waiting for senders'].includes(stage)));
    return {finished, releasingSoon: operational && progress >= 0.6, sending: operational && progress < 0.6, launchReady};
  }, [fields, splitParents]);
  const campaignById = useMemo(() => new Map(campaigns.map(record => [record.id, record])), [campaigns]);
  const campaignIdsByEmailAccountId = useMemo(() => {
    const index = new Map<string, Set<string>>();
    campaigns.forEach(record => linkedIds(record, fields.emailAccounts).forEach(accountId => index.set(accountId, (index.get(accountId) ?? new Set<string>()).add(record.id))));
    return index;
  }, [campaigns, fields.emailAccounts]);
  const emailAccountState = useCallback((account: AnyRecord) => {
    const accountStatus = optionName(account, emailAccountFields.status);
    const connectedValue = cellValue(account, emailAccountFields.connected);
    // email_status is the connection gate when present: only "Connected" counts.
    const statusAllows = emailAccountFields.status ? accountStatus.trim().toLowerCase() === 'connected' : connectedValue !== false;
    const disconnected = !statusAllows || connectedValue === false || /not connected|disconnected|inactive|failed|disabled/i.test(accountStatus);
    const linkedCampaignIds = new Set(linkedIds(account, emailAccountFields.campaigns));
    campaignIdsByEmailAccountId.get(account.id)?.forEach(id => linkedCampaignIds.add(id));
    const linkedCampaigns = [...linkedCampaignIds].map(id => campaignById.get(id)).filter(Boolean) as AnyRecord[];
    const linkedToSelected = !!selected && linkedCampaignIds.has(selected.id);
    const states: {id: string; sending: boolean; launchReady: boolean; releasingSoon: boolean}[] = linkedCampaigns.map(record => ({id: record.id, ...campaignSenderState(record)}));
    const activeSending = cellValue(account, emailAccountFields.activeSending);
    const explicitlySending = activeSending === true || /^(sending|active|yes|true|1)$/i.test(String(activeSending || '').trim());
    const warmupDays = numericValue(account, emailAccountFields.warmupDays);
    const warmupStart = dateFor(account, emailAccountFields.warmupStart);
    const warmupAge = warmupStart ? (Date.now() - warmupStart.getTime()) / 86400000 : null;
    // A bare checkbox can mean warmup stays on forever, so only days, a start date or an explicit label count.
    const warming = (warmupDays !== null && warmupDays >= 0 && warmupDays < 14) || /^(?:warming|warm[\s-]?up|in warm[\s-]?up|warm[\s-]?up in progress)$/i.test(textValue(account, emailAccountFields.warmupStatus)) || (warmupAge !== null && warmupAge >= 0 && warmupAge < 14);
    const sending = states.some(state => state.sending) || explicitlySending, queued = states.some(state => state.launchReady);
    const elsewhere = states.filter(state => state.id !== selected?.id);
    const state = disconnected ? 'disconnected' : sending ? 'sending' : queued ? 'reserved-next' : states.some(state => state.releasingSoon) ? 'releasing-soon' : warming ? 'warming' : 'available';
    // Busy in another campaign is a warning only; it never blocks ticking the inbox. Bulk picks keep the old eligibility (pickable).
    return {status: accountStatus, connected: !disconnected, state, sending: state === 'sending', warming, available: state === 'available', busyElsewhere: elsewhere.some(other => other.sending || other.launchReady),
      selectable: !disconnected || linkedToSelected, pickable: ['available', 'releasing-soon'].includes(state) || (state === 'warming' && !sending && !queued) || linkedToSelected};
  }, [emailAccountFields, campaignById, campaignIdsByEmailAccountId, campaignSenderState, selected]);
  const emailAccountStateById = useMemo(() => new Map(safeEmailAccountRecords.map(account => [account.id, emailAccountState(account)])), [safeEmailAccountRecords, emailAccountState]);
  const getEmailAccountState = (account: AnyRecord) => emailAccountStateById.get(account.id) ?? emailAccountState(account);
  const workspaceEmailAccounts = useMemo(() => {
    const query = accountSearch.trim().toLowerCase();
    const scoped = safeEmailAccountRecords.filter(account => {
      const workspaces = comparableValues(account, emailAccountFields.workspace).map(value => value.toLowerCase());
      const clients = emailAccountClientFields.flatMap(field => [...comparableValues(account, field), textValue(account, field)]).map(normalizeName).filter(Boolean);
      // The exact EmailBison workspace wins; client matching only covers legacy inboxes without a workspace ID.
      const matches = selectedWorkspaceNames.length > 0 && emailAccountFields.workspace ? workspaces.some(value => selectedWorkspaceNames.includes(value))
        : selectedClientNamesForAccounts.length > 0 && emailAccountClientFields.length > 0
          ? clients.some(client => selectedClientNamesForAccounts.some(name => client === normalizeName(name))) || emailAccountClientFields.some(field => linkedIds(account, field).some(id => selectedClientIdsForAccounts.includes(id)))
          : false;
      return matches && (!query || accountLabel(account).toLowerCase().includes(query));
    }).sort((a, b) => (Number(selectedEmailAccountIds.includes(b.id)) - Number(selectedEmailAccountIds.includes(a.id))) || (Number(getEmailAccountState(b).sending) - Number(getEmailAccountState(a).sending)) || accountLabel(a).localeCompare(accountLabel(b)));
    const unique = new Map<string, AnyRecord>();
    scoped.forEach(account => {
      const bisonId = String(cellValue(account, emailAccountFields.emailId) ?? '').trim(), email = textValue(account, emailAccountFields.name).toLowerCase();
      const identity = bisonId ? `bison:${bisonId}` : email ? `email:${email}` : `record:${account.id}`;
      if (!unique.has(identity)) unique.set(identity, account);
    });
    return [...unique.values()];
  }, [safeEmailAccountRecords, emailAccountFields, emailAccountClientFields, selectedWorkspaceNames.join('|'), selectedClientNamesForAccounts.join('|'), selectedClientIdsForAccounts.join('|'), selectedEmailAccountIds.join('|'), accountSearch, emailAccountStateById]);
  const availableWorkspaceEmailAccounts = workspaceEmailAccounts.filter(account => { const s = getEmailAccountState(account); return s.available || (s.warming && s.pickable); });
  const visibleWorkspaceEmailAccounts = workspaceEmailAccounts.filter(account => {
    const s = getEmailAccountState(account);
    return senderStatusFilter === 'all' ? true : senderStatusFilter === 'selected' ? selectedEmailAccountIds.includes(account.id) : senderStatusFilter === 'warming' ? s.warming
      : senderStatusFilter === 'disconnected' ? !s.connected : s.state === senderStatusFilter;
  });
  // Bulk picks stay as before: free inboxes first (idle warming ones too under All statuses).
  const visibleSelectableWorkspaceEmailAccounts = visibleWorkspaceEmailAccounts.filter(account => {
    const s = getEmailAccountState(account);
    if (selectedEmailAccountIds.includes(account.id)) return false;
    return senderStatusFilter === 'all' ? s.available || (s.warming && s.pickable) : senderStatusFilter === 'available' ? s.available : s.pickable;
  });
  const senderStatusCounts = workspaceEmailAccounts.reduce((counts, account) => {
    const s = getEmailAccountState(account);
    if (s.state !== 'warming') counts[s.state as keyof typeof counts] += 1;
    if (s.warming) counts.warming += 1;
    return counts;
  }, {available: 0, warming: 0, sending: 0, 'releasing-soon': 0, 'reserved-next': 0, disconnected: 0} as Record<string, number>);
  const selectedAccounts = selectedEmailAccountIds.map(id => safeEmailAccountRecords.find(record => record.id === id) ?? null);
  const selectedSenderDailyCapacity = selectedAccounts.reduce((total, account) => total + (account ? numericValue(account, emailAccountFields.dailyLimit) ?? 0 : 0), 0);
  // Update Senders needs every selected inbox to carry its own numeric Email ID (the EmailBison sender id).
  const missingSenderIds = selectedAccounts.filter(account => !account || !bisonIdOf(account, emailAccountFields.emailId)).length;
  const selectedOutputType = selected ? (/\s+-\s+Generic(?: Emails)?\s*$/i.test(campaignName(selected)) ? 'generic' : /\s+-\s+Direct(?: Emails)?\s*$/i.test(campaignName(selected)) ? 'direct' : null) : null;
  const selectedVerifiedLeadCount = selectedOutputType === 'generic' ? selectedGenericLeadCount : selectedOutputType === 'direct' ? selectedDirectLeadCount : selectedGenericLeadCount + selectedDirectLeadCount;
  const selectedStepDelayDays = selected && fields.daysBetween ? Math.max(1, Number.parseInt(sequenceDelayDraft, 10) || numericValue(selected, fields.daysBetween) || Number.parseInt(optionName(selected, fields.daysBetween), 10) || 1) : 1;
  const supportedNewLeadsPerDay = selectedVerifiedLeadCount > 0 ? Math.max(1, Math.floor(selectedVerifiedLeadCount / selectedStepDelayDays)) : 0;
  const senderDailyLimits = workspaceEmailAccounts.map(account => numericValue(account, emailAccountFields.dailyLimit) ?? 0).filter(limit => limit > 0).sort((a, b) => a - b);
  const typicalSenderDailyLimit = senderDailyLimits.length ? senderDailyLimits[Math.floor(senderDailyLimits.length / 2)] : 15;
  const minimumOutputSenders = selectedOutputType ? Number(selectedVerifiedLeadCount > 0) : Number(selectedGenericLeadCount > 0) + Number(selectedDirectLeadCount > 0);
  const recommendedSenderCount = selectedVerifiedLeadCount > 0 ? Math.max(minimumOutputSenders, Math.ceil(selectedVerifiedLeadCount / selectedStepDelayDays / Math.max(1, typicalSenderDailyLimit))) : 0;
  const senderSelectionTooSmall = minimumOutputSenders > 0 && selectedEmailAccountIds.length < minimumOutputSenders;
  // The recommendation is a ceiling; fewer inboxes are allowed.
  const senderSelectionTooLarge = recommendedSenderCount > 0 && selectedEmailAccountIds.length > recommendedSenderCount;
  const senderSelectionBlocked = senderSelectionTooSmall || senderSelectionTooLarge;
  const selectedApprovalSource = textValue(selected, fields.campaignApprovalSource).toLowerCase();
  const campaignApprovedByDulcy = selectedApprovalSource === 'internal approval exception';
  const clientHasApproved = !campaignApprovedByDulcy && (selectedApprovalSource === 'client approved' || selectedClientDecision.toLowerCase().includes('approve campaign'));
  const clientRequestedChanges = !campaignApprovedByDulcy && selectedApprovalSource !== 'client approved' && selectedClientDecision.toLowerCase().includes('request change');
  const selectedRequestedChangeArea = textValue(selected, fields.selectChanges);
  const selectedPrimaryFeedback = textValue(selected, fields.reviewCopy);
  const selectedAdditionalFeedback = ([[fields.companyFeedback, 'Company size'], [fields.geographyFeedback, 'Geographic targeting'], [fields.industryFeedback, 'Industry targeting'], [fields.titleFeedback, 'Title targeting'], [fields.additionalContext, 'Additional context']] as [AnyField | null, string][])
    .filter(([field]) => field && textValue(selected, field));
  const kpisFor = (record: AnyRecord) => {
    const replyRate = percentValue(record, fields.replyRate), interestedRate = percentValue(record, fields.interestedRate), bounceRate = percentValue(record, fields.bounceRate), meetingRate = percentValue(record, fields.meetingRate);
    const reply = kpiPresentation(replyRate, 'reply'), interested = kpiPresentation(interestedRate, 'interested'), bounce = kpiPresentation(bounceRate, 'bounce'), meeting = kpiPresentation(meetingRate, 'meeting');
    const emailsPerLead = perOne(record, fields.emailsSent, fields.interested), emailsPerMeetingValue = perOne(record, fields.emailsSent, fields.meetings);
    return {replyRate, interestedRate, bounceRate, meetingRate, reply, interested, bounce, meeting, emailsPerLead, emailsPerMeeting: emailsPerMeetingValue,
      overall: overallKpiPresentation(reply, interested, bounce, meeting, replyRate, emailsPerLead, numericValue(record, fields.emailsSent))};
  };
  const selectedKpis = selected ? kpisFor(selected) : null;
  const selectedProgress = selected ? progressPercent(selected, fields.progress) : null;
  const selectedBounceWatch = selectedKpis ? bounceWatch(selectedKpis.bounceRate, selectedProgress) : null;
  const selectedNextMove = selected ? nextMovePresentation(selected, fields, selectedPivotOptions) : null;
  const selectedLifecycle = useMemo(() => {
    if (!selected) return null;
    const hasReviewCopy = Boolean(textValue(selected, fields.subject1) && textValue(selected, fields.body1));
    // Copy readiness is independent of approval and spintax processing.
    const finalSubject = findField(campaignsTable, ['Campaign Email 1 Subject Version 1', 'Campaign Subject 1 Version 1', 'Campaign Email 1 Subject Spintax 1', 'Campaign Email 1 Subject']);
    const finalBody = findField(campaignsTable, ['Campaign Body 1 Version 1', 'Campaign Email 1 Body Spintax 1', 'Campaign Email 1 Body']);
    return campaignLifecycleState(optionName(selected, fields.status).trim().toLowerCase(), linkedIds(selected, fields.leadList).length > 0, hasReviewCopy || Boolean(textValue(selected, finalSubject) && textValue(selected, finalBody)));
  }, [selected, fields, campaignsTable]);
  const selectedProgressBarWidth = Math.max(0, Math.min(100, selectedProgress ?? 0));
  const clientLeadListOptions = useMemo(() => {
    if (!selected || !leadListsTable || !leadListFields.client) return [] as AnyRecord[];
    const names = [...comparableValues(selected, fields.client), textValue(selected, fields.client), clientFilter !== 'all' ? clientFilter : ''];
    return leadListRecords.filter(list => leadListMatchesClient(list, leadListFields.client, linkedIds(selected, fields.client), names)).sort((a, b) => leadListName(a).localeCompare(leadListName(b)));
  }, [selected, leadListsTable, leadListRecords, leadListFields, fields.client, clientFilter]);
  const creationLeadListOptions = useMemo(() => {
    if (!leadListsTable || !leadListFields.client || clientFilter === 'all') return [] as AnyRecord[];
    return leadListRecords.filter(list => leadListMatchesClient(list, leadListFields.client, creationClientRecord ? [creationClientRecord.id] : [], [clientFilter])).sort((a, b) => leadListName(a).localeCompare(leadListName(b)));
  }, [leadListsTable, leadListRecords, leadListFields, clientFilter, creationClientRecord]);

  const relatedSequenceAnalytics = useMemo(() => !selected || !sequenceAnalyticsFields.campaign ? [] : sequenceAnalytics
    .filter(record => linkedIds(record, sequenceAnalyticsFields.campaign).includes(selected.id))
    .map(record => {
      const [sent, replies, interested, bounces] = [sequenceAnalyticsFields.sent, sequenceAnalyticsFields.replies, sequenceAnalyticsFields.interested, sequenceAnalyticsFields.bounces].map(field => numericValue(record, field) ?? 0);
      // Variant quality is interested replies over replies, not over emails sent.
      return {record, step: numericValue(record, sequenceAnalyticsFields.step) ?? 0, variant: optionName(record, sequenceAnalyticsFields.variant) || 'A', subject: textValue(record, sequenceAnalyticsFields.subject) || 'No subject',
        sent, replies, interested, bounces, replyRate: sent > 0 ? replies / sent * 100 : 0, interestedRate: replies > 0 ? interested / replies * 100 : 0, bounceRate: sent > 0 ? bounces / sent * 100 : 0,
        sampleStatus: sent >= 2000 ? 'Ideal' : sent >= 1000 ? 'Okay' : 'Not ideal'};
    })
    .sort((a, b) => a.step - b.step || a.variant.localeCompare(b.variant)), [selected, sequenceAnalytics, sequenceAnalyticsFields]);
  const sequenceAnalyticsLeader = useMemo(() => [...relatedSequenceAnalytics].sort((a, b) => b.interestedRate - a.interestedRate || b.replyRate - a.replyRate || b.sent - a.sent)[0] ?? null, [relatedSequenceAnalytics]);
  const sequenceAnalyticsTotals = relatedSequenceAnalytics.reduce((t, row) => ({sent: t.sent + row.sent, replies: t.replies + row.replies, interested: t.interested + row.interested, bounces: t.bounces + row.bounces}), {sent: 0, replies: 0, interested: 0, bounces: 0});

  const resetFilters = () => { setClientFilter('all'); setStatusFilter('all'); setWorkspaceFilter('all'); setHealthFilter('all'); setDateRange('all'); setSearch(''); };

  const runAction = useCallback(async (label: string, action: () => Promise<void>, successText?: string | null) => {
    setBusy(label);
    setNotice(null);
    try {
      await action();
      if (successText !== null) setNotice({kind: 'success', text: successText ?? `${label} completed.`});
    } catch (error) {
      setNotice({kind: 'error', text: error instanceof Error ? error.message : `${label} failed.`});
    } finally {
      setBusy(null);
    }
  }, []);
  const updateCampaign = async (record: AnyRecord | string, update: Record<string, any>, what: string) => {
    if (typeof record !== 'string' && !campaignsTable.hasPermissionToUpdateRecord(record, update)) throw new Error(`You do not have permission to ${what}.`);
    await campaignsTable.updateRecordAsync(record, update);
  };

  // ---------- Engine presses ----------
  const engineStatusOf = (record: AnyRecord | null) => optionName(record, fields.engineStatus).trim();
  const engineActionOf = (record: AnyRecord | null) => optionName(record, fields.engineAction).trim();
  const engineBusy = (record: AnyRecord) => ENGINE_ACTIVE.includes(engineStatusOf(record)) || Boolean(engineActionOf(record));
  const lockedFor = (record: AnyRecord | null) => Boolean(record) && (pressing === record.id || engineBusy(record));
  const locked = lockedFor(selected);
  const LOCKED_HINT = 'This campaign has an engine request waiting or running; wait for its result.';
  // One press = Runs on Engine + Engine Action in ONE write. The engine picks it up within about 30 seconds,
  // clears Engine Action and writes Engine Status, Engine Job ID and Engine Message (launch lists its PASS/FAIL checks).
  async function requestEngine(record: AnyRecord, action: EngineAction): Promise<boolean> {
    if (!fields.engineAction || !fields.runsOnEngine) { setNotice({kind: 'error', text: 'Add Runs on Engine and Engine Action to this page, then try again.'}); return false; }
    if (pressLock.current || lockedFor(record)) { setNotice({kind: 'info', text: LOCKED_HINT}); return false; }
    pressLock.current = true;
    setPressing(record.id);
    try {
      setNotice({kind: 'info', text: `Sending ${action} to the engine…`});
      // Clicking a button blurs a field being edited; let that save land first.
      await sleep(500);
      const current = campaignsRef.current.find(candidate => candidate.id === record.id);
      if (!current) throw new Error('This campaign is no longer available. Reload and try again.');
      if (engineBusy(current)) { setNotice({kind: 'info', text: LOCKED_HINT}); return false; }
      await updateCampaign(current, {[fields.runsOnEngine.id]: true, [fields.engineAction.id]: {name: action}}, `send ${action}`);
      setNotice({kind: 'info', text: `${action} sent for ${campaignName(current) || 'this campaign'}. The engine picks it up within about 30 seconds; its answer shows in Automation status.`});
      return true;
    } catch (error: any) {
      setNotice({kind: 'error', text: error?.message ?? `Could not send ${action} to the engine.`});
      return false;
    } finally {
      pressLock.current = false;
      setPressing(null);
    }
  }
  // Pure checks shown as disabled hints; the engine runs its own checks on every press.
  const buildIssue = (record: AnyRecord | null): string => {
    if (!record) return '';
    if (OUTPUT_SUFFIX.test(campaignName(record))) return 'Press Build Campaign on the main campaign, not on its Direct/Generic part.';
    if (hasBisonCampaign(record, fields)) return 'This campaign already has an EmailBison campaign; nothing is built again.';
    if (optionName(record, fields.status).toLowerCase() !== 'spintax generated') return 'Generate and validate the final spintax first: Campaign Status must be Spintax Generated.';
    const readiness = leadReadinessIssue(record);
    if (readiness) return readiness;
    if (record.id === selected?.id && senderSelectionTooSmall) return `Select at least ${minimumOutputSenders} inbox${minimumOutputSenders === 1 ? '' : 'es'} so every output gets one.`;
    if (record.id === selected?.id && senderSelectionTooLarge) return `Select no more than ${recommendedSenderCount} inboxes for this campaign.`;
    return lockedFor(record) ? LOCKED_HINT : '';
  };
  const launchIssue = (record: AnyRecord) => !hasBisonCampaign(record, fields) ? 'Build the campaign first: it has no EmailBison campaign yet.' : leadReadinessIssue(record) || (lockedFor(record) ? LOCKED_HINT : '');
  const pauseIssue = (record: AnyRecord) => lockedFor(record) ? LOCKED_HINT : '';
  const selectedBuildIssue = buildIssue(selected);
  const selectedTopUpIssue = (() => {
    if (!selected) return '';
    if (!hasBisonCampaign(selected, fields)) return 'Build the campaign first: it has no EmailBison campaign yet.';
    if (selectedTopUpLeadListIds.length > 1) return 'Link exactly one Top-up Lead List.';
    if (!selectedTopUpLeadList) return 'Create the top-up lead list first and finish it in Lead List Center.';
    if (selectedTopUpLeadListId === selectedLeadListId) return 'Choose a different list; the original campaign list is already attached.';
    const stage = optionName(selectedTopUpLeadList, leadListFields.stage), qa = optionName(selectedTopUpLeadList, leadListFields.qaStatus);
    if (!['ready', 'uploaded'].includes(stage.toLowerCase()) || qa.toLowerCase() !== 'passed') return `Finish the top-up list in Lead List Center first (stage ${stage || 'not set'}, QA ${qa || 'not passed'}).`;
    if (!selectedTopUpGenericCount && !selectedTopUpDirectCount) return 'The top-up list has no Final Generic or Final Direct leads yet.';
    return locked ? LOCKED_HINT : '';
  })();
  const selectedSendersIssue = !selected ? '' : !hasBisonCampaign(selected, fields) ? 'Build the campaign first.' : !selectedEmailAccountIds.length ? 'Select at least one inbox.'
    : missingSenderIds ? `${missingSenderIds} selected inbox${missingSenderIds === 1 ? ' has' : 'es have'} no Email ID; press Sync Bison Senders first.` : locked ? LOCKED_HINT : '';

  const clearCampaignAutomationStatus = async () => {
    setBusy('clear-status');
    try {
      if (!selected) throw new Error('Select a campaign first.');
      const update: Record<string, any> = {};
      for (const field of [fields.processing, fields.message, fields.error]) if (field) update[field.id] = null;
      if (!Object.keys(update).length) throw new Error('Processing Status, Workflow Message and Workflow Error are not on this page.');
      await updateCampaign(selected, update, 'clear this campaign’s saved status');
      setNotice({kind: 'success', text: 'Saved status cleared. Engine fields were not changed.'});
    } catch (error) {
      setNotice({kind: 'error', text: error instanceof Error ? error.message : 'Could not clear the saved status.'});
    } finally {
      setBusy(null);
    }
  };

  // ---------- Spintax (kept on the Airtable automation) ----------
  const trackedRecord = trackedSpintax ? campaigns.find(record => record.id === trackedSpintax.recordId) ?? null : null;
  const trackedStatus = optionName(trackedRecord, fields.status).toLowerCase();
  const trackedStage = optionName(trackedRecord, fields.workflowStage).toLowerCase();
  useEffect(() => {
    if (!trackedSpintax || !trackedRecord) return;
    const running = trackedStage === 'spintax in progress' || trackedStatus !== 'spintax generated';
    if (!trackedSpintax.sawRunningState && running) { setTrackedSpintax({...trackedSpintax, sawRunningState: true}); return; }
    if (trackedSpintax.sawRunningState && !running) { setNotice({kind: 'success', text: `Spintax generation and validation complete for ${trackedSpintax.campaignName}.`}); setTrackedSpintax(null); }
  }, [trackedSpintax, trackedRecord, trackedStatus, trackedStage]);

  const saveSelectedField = (field: AnyField | null, value: any, label: string) => runAction(`Save ${label}`, async () => {
    if (!selected || !field) throw new Error(`${label} is not on this page.`);
    await updateCampaign(selected, {[field.id]: value}, `update ${label}`);
  }, null);
  const saveClientPivot = (field: AnyField | null, enabled: boolean, label: string) => runAction(`Save ${label}`, async () => {
    if (!selectedClientRecord) throw new Error('Link this campaign to a client before changing client-wide pivot options.');
    if (!clientsTable || !field) throw new Error(`${label} is not on this page.`);
    const update = {[field.id]: selectWriteValue(field, enabled ? 'Enabled' : 'Disabled')};
    if (!clientsTable.hasPermissionToUpdateRecord(selectedClientRecord, update)) throw new Error(`You do not have permission to update ${label} for this client.`);
    await clientsTable.updateRecordAsync(selectedClientRecord, update);
  }, `${label} saved for this client and every linked campaign.`);
  const saveEmailAccounts = async (ids: string[]) => {
    if (!selected || !fields.emailAccounts) throw new Error('Add the Email Accounts field to this page.');
    await updateCampaign(selected, {[fields.emailAccounts.id]: ids.map(id => ({id}))}, 'change campaign email accounts');
  };
  const accountAction = (label: string, action: () => Promise<void>, successText: string | null = null) => runAction(label, async () => { if (!locked) await action(); }, successText);
  const toggleCampaignEmailAccount = (accountId: string, attach: boolean) => accountAction(attach ? 'Attach email account' : 'Remove email account', () => saveEmailAccounts(attach ? [...new Set([...selectedEmailAccountIds, accountId])] : selectedEmailAccountIds.filter(id => id !== accountId)));
  const selectAvailableEmailAccounts = () => accountAction('Select available email accounts', async () => {
    if (!visibleSelectableWorkspaceEmailAccounts.length) throw new Error('No more free inboxes match the current filters.');
    await saveEmailAccounts([...new Set([...selectedEmailAccountIds, ...visibleSelectableWorkspaceEmailAccounts.slice(0, Math.max(1, Math.floor(accountSelectionCount || 1))).map(account => account.id)])]);
  });
  const selectAllMatchingEmailAccounts = () => accountAction('Select all matching email accounts', async () => {
    if (!visibleSelectableWorkspaceEmailAccounts.length) throw new Error('No more free inboxes match the current filters.');
    await saveEmailAccounts([...new Set([...selectedEmailAccountIds, ...visibleSelectableWorkspaceEmailAccounts.map(account => account.id)])]);
  });
  const unselectAllEmailAccounts = () => accountAction('Unselect all email accounts', async () => {
    if (!selectedEmailAccountIds.length || !window.confirm(`Unselect all ${selectedEmailAccountIds.length} email accounts from this campaign?`)) return;
    await saveEmailAccounts([]);
  });
  const useRecommendedEmailAccounts = () => accountAction('Use recommended email accounts', async () => {
    if (!recommendedSenderCount) throw new Error('Link a completed lead list before calculating the recommended inbox count.');
    const keep = selectedEmailAccountIds.filter(id => { const account = safeEmailAccountRecords.find(record => record.id === id); return account ? getEmailAccountState(account).connected : false; });
    const ids = [...new Set([...keep, ...availableWorkspaceEmailAccounts.map(account => account.id)])].slice(0, recommendedSenderCount);
    if (ids.length < minimumOutputSenders) throw new Error(`Only ${ids.length} eligible inbox(es) are available; ${minimumOutputSenders} are needed so each output gets one.`);
    await saveEmailAccounts(ids);
    setAccountSelectionCount(ids.length);
  }, 'Eligible inboxes selected within the campaign maximum.');
  const saveLeadListField = (field: AnyField | null, value: any, label: string) => runAction(`Save ${label}`, async () => {
    if (!selectedLeadList || !leadListsTable || !field) throw new Error(`${label} is not available on the linked Lead List.`);
    if (!leadListsTable.hasPermissionToUpdateRecord(selectedLeadList, {[field.id]: value})) throw new Error(`You do not have permission to update ${label}.`);
    await leadListsTable.updateRecordAsync(selectedLeadList, {[field.id]: value});
  }, null);
  const linkLeadListToCampaign = (leadListId: string) => runAction('Link lead list', async () => {
    if (!selected || !campaignLeadListLinkField) throw new Error('Add the Lead List link field to this page.');
    if (!leadListId) return;
    if (!clientLeadListOptions.some(record => record.id === leadListId)) throw new Error('Choose a Lead List that belongs to this campaign’s client.');
    await updateCampaign(selected, {[campaignLeadListLinkField.id]: [{id: leadListId}]}, 'link this Lead List');
  }, null);
  const addWeekdayHours = (start: Date, hours: number) => {
    const result = new Date(start);
    for (let left = hours; left > 0;) { result.setHours(result.getHours() + 1); if (![0, 6].includes(result.getDay())) left -= 1; }
    return result;
  };
  const moveWorkflow = (stage: string) => runAction(`Move to ${stage}`, async () => {
    if (!selected || !fields.workflowStage) throw new Error('Workflow Stage is not on this page.');
    if (!hasChoice(fields.workflowStage, stage)) throw new Error(`Workflow Stage is missing “${stage}”.`);
    const update: Record<string, any> = {[fields.workflowStage.id]: selectWriteValue(fields.workflowStage, stage)};
    if (stage === 'Client Review') {
      if (!fields.clientReviewSubmittedAt || !fields.clientReviewAutoApproveAt) throw new Error('Client review timing fields are not on this page. Reload Airtable once, then try again.');
      const submittedAt = new Date();
      update[fields.clientReviewSubmittedAt.id] = submittedAt.toISOString();
      update[fields.clientReviewAutoApproveAt.id] = addWeekdayHours(submittedAt, 48).toISOString();
      if (fields.campaignApprovalSource) update[fields.campaignApprovalSource.id] = '';
    }
    await updateCampaign(selected, update, 'update Workflow Stage');
  });
  const approveAndPrepareSequence = (skipClientApproval = false) => runAction(skipClientApproval ? 'Internally approve and prepare sequence' : 'Approve and prepare sequence', async () => {
    if (!selected) throw new Error('Select a campaign first.');
    if (!skipClientApproval && !clientHasApproved) throw new Error('Client feedback must say Approve Campaign first.');
    if (skipClientApproval && !skipApprovalConfirmed) throw new Error('Confirm that client approval is not required before using the exception.');
    const update: Record<string, any> = {};
    const seed = (target: AnyField | null, source: AnyField | null) => { const value = target && source ? cellValue(selected, source) : null; if (target && value !== null && value !== '') update[target.id] = value; };
    [[fields.subject1, fields.body1], [fields.subject2, fields.body2], [fields.subject3, fields.body3], [fields.subject4, fields.body4]].forEach(([subject, body], index) => {
      const step = index + 1;
      seed(findField(campaignsTable, [`Campaign Email ${step} Subject Version 1`, `Campaign Email ${step} Subject`, `Campaign Subject ${step} Version 1`, `Campaign Email ${step} Subject Spintax 1`]), subject);
      seed(findField(campaignsTable, [`Campaign Body ${step} Version 1`, `Campaign Email ${step} Body Spintax 1`]), body);
    });
    if (fields.workflowStage) {
      if (!hasChoice(fields.workflowStage, 'Approved')) throw new Error('Workflow Stage is missing “Approved”.');
      update[fields.workflowStage.id] = selectWriteValue(fields.workflowStage, 'Approved');
    }
    if (fields.campaignApprovalSource) update[fields.campaignApprovalSource.id] = skipClientApproval ? 'Internal approval exception' : 'Client approved';
    if (!Object.keys(update).length) throw new Error('No sequence fields are on this page. Add the Campaign Subject/Body Version fields.');
    await updateCampaign(selected, update, 'prepare this sequence');
    setSkipApprovalConfirmed(false);
    setTab('sequence');
  });
  const prepareSequenceFromReview = () => selected && runAction('Prepare sequence from approved copy', async () => {
    const update: Record<string, any> = {};
    const counts: Record<number, number> = {};
    [{n: 1, subject: fields.subject1, body: fields.body1, count: fields.variants1}, {n: 2, subject: fields.subject2, body: fields.body2, count: fields.variants2},
      {n: 3, subject: fields.subject3, body: fields.body3, count: fields.variants3}, {n: 4, subject: fields.subject4, body: fields.body4, count: fields.variants4}].forEach(step => {
      const subjects = parseReviewVariants(step.subject ? cellValue(selected, step.subject) : '', `Email ${step.n} subject`, true);
      const bodies = parseReviewVariants(step.body ? cellValue(selected, step.body) : '', `Email ${step.n} body`);
      if (!subjects.values.length && !bodies.values.length) return;
      if (!bodies.values.length) throw new Error(`Email ${step.n} has a subject but no approved email body.`);
      if (subjects.structured && bodies.structured && subjects.values.length !== bodies.values.length) throw new Error(`Email ${step.n} has ${subjects.values.length} labelled subjects but ${bodies.values.length} labelled bodies; the counts must match.`);
      const detected = Math.max(subjects.structured ? subjects.values.length : 1, bodies.structured ? bodies.values.length : 1);
      if (detected > 10) throw new Error(`Email ${step.n} contains more than 10 variants.`);
      counts[step.n] = detected;
      for (let index = 0; index < detected; index += 1) {
        const target = sequenceVersionFields(campaignsTable, step.n, index + 1);
        const subject = subjects.structured ? subjects.values[index] : (subjects.values[0] ?? '');
        const body = bodies.structured ? bodies.values[index] : bodies.values[0];
        if (!target.body) throw new Error(`Email ${step.n} has Variant ${index + 1}, but its Campaign Body Version ${index + 1} field is missing.`);
        if (subject && !target.subject) throw new Error(`Email ${step.n} has a subject for Variant ${index + 1}, but its Campaign Subject Version ${index + 1} field is missing.`);
        update[target.body.id] = body;
        if (target.subject) update[target.subject.id] = subject;
      }
      if (step.count) {
        const text = String(detected);
        if (step.count.type === FieldType.SINGLE_SELECT && !hasChoice(step.count, text)) throw new Error(`${step.count.name} is missing the “${text}” option.`);
        update[step.count.id] = step.count.type === FieldType.SINGLE_SELECT ? selectWriteValue(step.count, text) : step.count.type === FieldType.NUMBER ? detected : text;
      }
    });
    if (!Object.keys(update).length) throw new Error('No approved Email 1–4 review copy is available to copy.');
    const preview = Object.entries(counts).map(([step, count]) => `Email ${step}: ${count} ${count === 1 ? 'variant' : 'variants'}`).join('\n');
    if (!window.confirm(`Refresh the sequence from approved copy?\n\n${preview}\n\nDetected variants replace the matching sequence cards; later variants stay unchanged.`)) return;
    await updateCampaign(selected, update, 'update the final sequence');
    setSequenceVariantLimits(previous => ({...previous, ...Object.fromEntries(Object.entries(counts).map(([step, count]) => [`${selected.id}-${step}`, count]))}));
    setSequenceStepLimits(previous => ({...previous, [selected.id]: Math.max(...Object.keys(counts).map(Number))}));
    setNotice({kind: 'success', text: 'Approved copy refreshed; detected split-test variants now show in Sequence.'});
  }, null);
  const automationRequestUpdate = (record: AnyRecord, kind: string, label: string) => {
    if (!fields.automationRequest) throw new Error('Add Campaign Automation Request to this page before starting this automation.');
    return {[fields.automationRequest.id]: JSON.stringify({kind, label, requestedAt: new Date().toISOString(), baselineStatus: optionName(record, fields.status), baselineBisonId: textValue(record, fields.bisonId)})};
  };
  const generateValidatedSpintax = () => {
    if (!selected || !window.confirm('Send this final sequence to the spintax generation and validation automation now?')) return;
    return runAction('Spintax generation request', async () => {
      if (!fields.createSpintax) throw new Error('Add the create_spintax field to this page first.');
      const update: Record<string, any> = {...automationRequestUpdate(selected, 'spintax', 'Generate and validate spintax'), [fields.createSpintax.id]: true};
      if (fields.workflowStage && hasChoice(fields.workflowStage, 'Spintax in Progress')) update[fields.workflowStage.id] = selectWriteValue(fields.workflowStage, 'Spintax in Progress');
      setTrackedSpintax({recordId: selected.id, campaignName: campaignName(selected), sawRunningState: optionName(selected, fields.status).toLowerCase() !== 'spintax generated'});
      try { await updateCampaign(selected, update, 'trigger spintax generation'); } catch (error) { setTrackedSpintax(null); throw error; }
    }, null);
  };
  const removeSequenceVariant = (step: number, variant: string, subject: AnyField | null, body: AnyField | null) => {
    if (!selected || variant.endsWith('A') || !window.confirm(`Delete Variant ${variant}? Its saved subject and email copy will be cleared.`)) return;
    return runAction(`Delete Variant ${variant}`, async () => {
      const update: Record<string, any> = {};
      if (subject) update[subject.id] = null;
      if (body) update[body.id] = null;
      if (Object.keys(update).length) await updateCampaign(selected, update, `delete Variant ${variant}`);
      setSequenceVariantLimits({...sequenceVariantLimits, [`${selected.id}-${step}`]: Math.max(1, visibleVariantLimitForStep(step) - 1)});
    });
  };

  // ---------- Top-up list (pure Airtable): copies the source targeting and excludes this campaign's attached lists ----------
  const createTopUpBuild = (record: AnyRecord, outsideKpi = false) => runAction('Create top-up list', async () => {
    if (outsideKpi && !manualTopUpAcknowledged) throw new Error('Tick the KPI exception before starting this top-up.');
    const scopeField = leadListFields.topUpScope;
    if (!leadListsTable || !leadListFields.name || !fields.topUpLeadList || !campaignLeadListLinkField) throw new Error('Add the Lead List, Top-up Lead List and lead list Name fields to this page first.');
    if (!scopeField) throw new Error('Add Top-up Build Scope JSON to this page before creating a top-up.');
    const attached = new Set([...linkedIds(record, campaignLeadListLinkField), ...linkedIds(record, fields.topUpLeadList)]);
    const hasLeads = (list: AnyRecord) => leadCount(list, leadListFields.finalGenericCount) + leadCount(list, leadListFields.finalDirectCount) > 0;
    const sourceLists = leadListRecords.filter(list => attached.has(list.id) && hasLeads(list));
    if (!sourceLists.length) throw new Error('This campaign has no attached completed list to use as the source.');
    const clientIds = linkedIds(record, fields.client);
    const sameClient = (list: AnyRecord) => linkedIds(list, leadListFields.client).some(id => clientIds.includes(id));
    const readScope = (list: AnyRecord) => { try { return JSON.parse(textValue(list, scopeField) || '{}'); } catch { return null; } };
    // Reuse an unfinished top-up for this campaign instead of creating a second one.
    const existing = leadListRecords.find(list => {
      const scope = readScope(list);
      return scope?.version === 1 && scope.mode === 'this-build-only' && scope.campaignRecordId === record.id && (scope.buildRecordId === list.id || scope.buildRecordId === 'pending')
        && Array.isArray(scope.sources) && scope.sources.length > 0 && sameClient(list) && !hasLeads(list);
    });
    if (existing) {
      const scope = readScope(existing);
      if (scope.buildRecordId === 'pending') await leadListsTable.updateRecordAsync(existing.id, {[scopeField.id]: JSON.stringify({...scope, buildRecordId: existing.id})});
      await updateCampaign(record.id, {[fields.topUpLeadList.id]: [{id: existing.id}]}, 'link the top-up list');
      setNotice({kind: 'success', text: `Linked the unfinished top-up list ${leadListName(existing)}; finish it in Lead List Center.`});
      return;
    }
    const source = sourceLists.find(list => list.id === linkedIds(record, campaignLeadListLinkField)[0]) ?? sourceLists[0];
    if (!sameClient(source)) throw new Error('Source list and campaign client do not match.');
    const sources = sourceLists.map(list => {
      if (!sameClient(list)) throw new Error('An attached exclusion list belongs to a different client.');
      const sheetId = textValue(list, leadListFields.link).match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)?.[1];
      if (!sheetId) throw new Error('An attached source list is missing its Google Sheet.');
      return {recordId: list.id, sheetId, tabs: [...(leadCount(list, leadListFields.finalDirectCount) ? ['Final Direct'] : []), ...(leadCount(list, leadListFields.finalGenericCount) ? ['Final Generic'] : [])]};
    });
    // Keep the earlier exclusion chain when a campaign gets more than one top-up.
    for (const list of sourceLists) {
      if (!textValue(list, scopeField)) continue;
      const prior = readScope(list);
      if (!prior || prior.version !== 1 || prior.mode !== 'this-build-only' || prior.buildRecordId !== list.id || prior.campaignRecordId !== record.id || !Array.isArray(prior.sources)) throw new Error('An attached top-up belongs to a different build or campaign.');
      for (const entry of prior.sources) {
        if (!/^rec[a-zA-Z0-9]+$/.test(entry.recordId) || !/^[-_a-zA-Z0-9]+$/.test(entry.sheetId) || !Array.isArray(entry.tabs) || !entry.tabs.length || entry.tabs.some((t: string) => !['Final Direct', 'Final Generic'].includes(t))) throw new Error('An earlier exclusion source is invalid.');
        const found = sources.find(item => item.recordId === entry.recordId);
        if (found && found.sheetId !== entry.sheetId) throw new Error('An earlier exclusion source has conflicting sheet links.');
        if (found) found.tabs = [...new Set([...found.tabs, ...entry.tabs])];
        else sources.push({recordId: entry.recordId, sheetId: entry.sheetId, tabs: [...entry.tabs]});
      }
    }
    const scope = {version: 1, mode: 'this-build-only', buildRecordId: 'pending', campaignRecordId: record.id, createdAt: new Date().toISOString(), sources};
    const values: Record<string, any> = {};
    for (const name of TOP_UP_COPY_FIELDS) {
      const field = findField(leadListsTable, [name]);
      const value = field ? cellValue(source, field) : null;
      if (!field || value === null) continue;
      values[field.id] = field.type === FieldType.MULTIPLE_RECORD_LINKS ? (value as any[]).map(item => ({id: item.id})) : field.type === FieldType.SINGLE_SELECT ? {name: value.name}
        : field.type === FieldType.MULTIPLE_SELECTS ? (value as any[]).map(item => ({name: item.name})) : value;
    }
    values[leadListFields.name.id] = `${leadListName(source)} — Top-up ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
    values[scopeField.id] = JSON.stringify(scope);
    // Not linked through "Which Campaign?": that is the campaign's Lead List link and would double-link the campaign.
    for (const field of [leadListFields.automationAction, leadListFields.enrichmentAction, leadListFields.qaAction]) if (field) values[field.id] = null;
    if (leadListFields.stage && hasChoice(leadListFields.stage, 'Source & ICP')) values[leadListFields.stage.id] = selectWriteValue(leadListFields.stage, 'Source & ICP');
    if (leadListFields.processingStatus && hasChoice(leadListFields.processingStatus, 'Not Started')) values[leadListFields.processingStatus.id] = selectWriteValue(leadListFields.processingStatus, 'Not Started');
    if (!leadListsTable.hasPermissionToCreateRecord(values)) throw new Error('You do not have permission to create the top-up list.');
    if (!campaignsTable.hasPermissionToUpdateRecord(record, {[fields.topUpLeadList.id]: []})) throw new Error('You do not have permission to link the top-up list.');
    const id = await leadListsTable.createRecordAsync(values);
    await leadListsTable.updateRecordAsync(id, {[scopeField.id]: JSON.stringify({...scope, buildRecordId: id})});
    await campaignsTable.updateRecordAsync(record.id, {[fields.topUpLeadList.id]: [{id}]});
  }, 'Top-up lead list created and linked. Build it in Lead List Center, then press Top up campaign.');

  // ---------- Delete (kept on the Airtable automation: Bison Action = Delete) ----------
  const deleteCampaign = () => {
    if (!selected) return;
    const record = selected, name = campaignName(record) || 'this campaign';
    const typed = window.prompt(`Permanently delete “${name}”?\n\nType DELETE to continue.`);
    if (typed === null) return;
    if (typed.trim() !== 'DELETE') { setNotice({kind: 'error', text: 'Campaign was not deleted. You must type DELETE exactly.'}); return; }
    if (!window.confirm(`Final confirmation: request deletion of “${name}”? The automation deletes EmailBison first when an ID exists, then Airtable.`)) return;
    // Campaign Center never deletes records itself: the automation removes the EmailBison campaign first.
    return runAction('Delete campaign', async () => {
      if (!fields.bisonAction || !hasChoice(fields.bisonAction, 'Delete')) throw new Error('Add the Bison Action field (with a Delete choice) to this page.');
      const update = {...automationRequestUpdate(record, 'Delete', 'Delete campaign'), [fields.bisonAction.id]: selectWriteValue(fields.bisonAction, 'Delete')};
      if (!campaignsTable.hasPermissionToUpdateRecord(record, update)) throw new Error('You do not have permission to request deletion.');
      // The automation fires when Bison Action becomes non-empty, so clear an older action first.
      if (optionName(record, fields.bisonAction)) { await campaignsTable.updateRecordAsync(record, {[fields.bisonAction.id]: null}); await sleep(500); }
      await campaignsTable.updateRecordAsync(record, update);
      setSelectedId(null);
    }, 'Delete request sent to the Airtable automation. Check its run history for the result.');
  };

  const openCampaignCreator = () => {
    setNewCampaignName(''); setNewCampaignThesis(''); setNewLeadListName(''); setNewLeadListNameEdited(false);
    setBuildLeadList(true); setLeadListCreationMode('new'); setExistingLeadListId(''); setShowCampaignCreator(true);
  };
  const createCampaign = () => runAction('New campaign', async () => {
    if (!fields.name) throw new Error('The campaign Name field is required.');
    if (clientFilter === 'all') throw new Error('Choose one client in the filter before creating a campaign.');
    if (!creationClientRecord || !creationClientName) throw new Error(`Could not match the client “${clientFilter}” to its Airtable Client record.`);
    if (!campaignTitleDraft) throw new Error('Enter a campaign name without the client prefix.');
    if (buildLeadList && leadListCreationMode === 'existing' && !creationLeadListOptions.some(record => record.id === existingLeadListId)) throw new Error('Choose an existing Lead List belonging to the selected client.');
    const thesis = newCampaignThesis.trim();
    const values: Record<string, any> = {[fields.name.id]: clientPrefixedName(creationClientDisplayName || creationClientName, campaignTitleDraft)};
    if (fields.thesis && thesis) values[fields.thesis.id] = thesis;
    // Each new campaign gets a slightly different daily send window (still editable).
    if (fields.startTime) values[fields.startTime.id] = randomizedTimeWithinHour(8);
    if (fields.endTime) values[fields.endTime.id] = randomizedTimeWithinHour(18);
    let clientValue: any = null;
    if (fields.client) {
      if (fields.client.type === FieldType.MULTIPLE_RECORD_LINKS) clientValue = [{id: creationClientRecord.id}];
      else if (hasChoice(fields.client, creationClientName)) clientValue = selectWriteValue(fields.client, creationClientName);
      else throw new Error(`The Campaign Client field cannot accept the client “${creationClientName}”.`);
      values[fields.client.id] = clientValue;
    }
    if (fields.workflowStage && hasChoice(fields.workflowStage, 'Strategy Draft')) values[fields.workflowStage.id] = selectWriteValue(fields.workflowStage, 'Strategy Draft');
    if (fields.status && hasChoice(fields.status, 'Draft')) values[fields.status.id] = selectWriteValue(fields.status, 'Draft');
    if (!campaignsTable.hasPermissionToCreateRecord(values)) throw new Error('You do not have permission to create campaigns.');
    const newCampaignId = await campaignsTable.createRecordAsync(values);
    if (buildLeadList) {
      if (!leadListsTable) throw new Error('The campaign was created, but Lead Lists is not configured in Custom properties.');
      if (!campaignLeadListLinkField && !leadListFields.campaign) throw new Error('The campaign was created, but no Campaign ↔ Lead List link field is on this page.');
      let leadListId = existingLeadListId;
      if (leadListCreationMode === 'new') {
        if (!leadListFields.name) throw new Error('The campaign was created, but the lead list Name field is not on this page.');
        const listValues: Record<string, any> = {[leadListFields.name.id]: clientPrefixedName(creationClientDisplayName || creationClientName, leadListTitleDraft || campaignTitleDraft)};
        if (leadListFields.icpDescription && thesis) listValues[leadListFields.icpDescription.id] = thesis;
        if (leadListFields.client && clientValue !== null) listValues[leadListFields.client.id] = clientValue;
        if (leadListFields.campaign) listValues[leadListFields.campaign.id] = [{id: newCampaignId}];
        if (leadListFields.sourceType && hasChoice(leadListFields.sourceType, 'DiscoLike')) listValues[leadListFields.sourceType.id] = selectWriteValue(leadListFields.sourceType, 'DiscoLike');
        const firstStage = ['Source & ICP', 'Unconfigured'].find(stage => hasChoice(leadListFields.stage, stage));
        if (leadListFields.stage && firstStage) listValues[leadListFields.stage.id] = selectWriteValue(leadListFields.stage, firstStage);
        if (leadListFields.processingStatus && hasChoice(leadListFields.processingStatus, 'Not Started')) listValues[leadListFields.processingStatus.id] = selectWriteValue(leadListFields.processingStatus, 'Not Started');
        // Clear the action during creation so no automation runs a field default.
        if (leadListFields.automationAction) listValues[leadListFields.automationAction.id] = null;
        if (!leadListsTable.hasPermissionToCreateRecord(listValues)) throw new Error('The campaign was created, but you do not have permission to create its Lead List.');
        leadListId = await leadListsTable.createRecordAsync(listValues);
      } else if (!leadListId) {
        throw new Error('The campaign was created, but no existing Lead List was selected.');
      }
      if (campaignLeadListLinkField) await campaignsTable.updateRecordAsync(newCampaignId, {[campaignLeadListLinkField.id]: [{id: leadListId}]});
      // Final write once both records exist: link, the new targeting sentence, and no stale retry command.
      const sync: Record<string, any> = {};
      if (leadListFields.campaign) sync[leadListFields.campaign.id] = [{id: newCampaignId}];
      if (leadListFields.icpDescription && thesis) sync[leadListFields.icpDescription.id] = thesis;
      if (leadListFields.automationAction) sync[leadListFields.automationAction.id] = null;
      if (Object.keys(sync).length) await leadListsTable.updateRecordAsync(leadListId, sync);
    }
    setShowCampaignCreator(false);
    setSelectedId(newCampaignId);
    setTab('strategy');
  }, buildLeadList ? 'Campaign created and its Lead List was linked.' : 'Campaign created.');

  // Webhooks kept outside the engine. Neither sends an API key or any campaign data.
  const postWebhook = (url: string, host: string, label: string, question: string) => {
    if (!window.confirm(question)) return;
    return runAction(label, async () => {
      let parsed: URL;
      try { parsed = new URL(url); } catch { throw new Error(`The ${label} URL is invalid.`); }
      if (parsed.protocol !== 'https:' || parsed.hostname !== host) throw new Error(`The ${label} URL is invalid.`);
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch(url, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({source: 'Campaign Center', requestedAt: new Date().toISOString()}), signal: controller.signal});
        if (!response.ok) throw new Error(`The ${label} was rejected (${response.status}).`);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') throw new Error(`The ${label} timed out. Check the automation history before trying again.`);
        throw error;
      } finally {
        window.clearTimeout(timeout);
      }
    });
  };
  const syncBison = () => postWebhook(BISON_SYNC_WEBHOOK_URL, 'bison-sync-relay.scale-f9d.workers.dev', 'Bison sync request', 'Run the full Bison campaign sync now? This updates all campaign records.');
  const syncBisonSenders = () => postWebhook(BISON_SENDER_SYNC_WEBHOOK_URL, 'n8n.dulcy.io', 'Bison sender sync request', 'Sync sender assignments from EmailBison now? This refreshes the inbox links of every active campaign.');

  // Clone copies the reusable build only: never the Lead List link, inboxes, EmailBison identity, results or action flags.
  const cloneCampaign = (record: AnyRecord) => runAction('Clone campaign', async () => {
    if (!window.confirm(`Create a draft copy of “${campaignName(record)}”?`)) return;
    const values: Record<string, any> = {};
    const copy = (field: AnyField | null) => { const value = field && !(field.id in values) ? cellValue(record, field) : null; if (field && value !== null) values[field.id] = value; };
    [fields.client, fields.type, fields.workspace, fields.campaignApproach, fields.prepDate, fields.launchDate, fields.thesis,
      fields.subject1, fields.body1, fields.subject2, fields.body2, fields.subject3, fields.body3, fields.subject4, fields.body4, fields.threadReply2, fields.threadReply3, fields.threadReply4,
      fields.daysBetween, fields.variants1, fields.variants2, fields.variants3, fields.variants4, fields.backupVariants,
      fields.monday, fields.tuesday, fields.wednesday, fields.thursday, fields.friday, fields.saturday, fields.sunday,
      fields.startTime, fields.endTime, fields.timezone, fields.maxEmails, fields.maxNewLeads, fields.plainText, fields.startDate, fields.endDate, fields.skipBounceNotification, fields.skipBouncePause].forEach(copy);
    // Every populated sequence subject/body version (variants run through J).
    campaignsTable.fields.filter((field: AnyField) => /^(?:Campaign Email \d+ Subject(?: Version \d+)?|Campaign Subject \d+ Version \d+|Campaign (?:Email )?Body \d+ Version \d+)$/i.test(field.name)).forEach(copy);
    if (fields.name) values[fields.name.id] = `${campaignName(record) || 'Campaign'} Copy`;
    if (fields.status && hasChoice(fields.status, 'Draft')) values[fields.status.id] = selectWriteValue(fields.status, 'Draft');
    if (fields.startTime) values[fields.startTime.id] = randomizedTimeWithinHour(8);
    if (fields.endTime) values[fields.endTime.id] = randomizedTimeWithinHour(18);
    if (!campaignsTable.hasPermissionToCreateRecord(values)) throw new Error('You do not have permission to clone campaigns.');
    setSelectedId(await campaignsTable.createRecordAsync(values));
  }, 'Draft copy created without the lead list or inboxes; link them before building.');

  const finalVariantLabels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
  const finalSequenceSteps = [1, 2, 3, 4].map(step => ({number: step, threadReply: step === 1 ? null : (fields as any)[`threadReply${step}`] as AnyField | null,
    variants: finalVariantLabels.map((label, index) => ({name: `${step}${label}`, ...sequenceVersionFields(campaignsTable, step, index + 1)}))}));
  const filledVariant = (variant: {subject: AnyField | null; body: AnyField | null}) => Boolean(textValue(selected, variant.subject) || textValue(selected, variant.body));
  const inferredSequenceStepLimit = selected ? Math.max(1, finalSequenceSteps.reduce((last, step) => step.variants.some(filledVariant) ? step.number : last, 1)) : 1;
  const visibleSequenceStepLimit = selectedId ? sequenceStepLimits[selectedId] ?? inferredSequenceStepLimit : 1;
  const visibleVariantLimitForStep = (step: number) => {
    if (!selected || !selectedId) return 1;
    return sequenceVariantLimits[`${selectedId}-${step}`] ?? Math.max(1, finalSequenceSteps[step - 1].variants.reduce((last, variant, index) => filledVariant(variant) ? index + 1 : last, 1));
  };
  const threadReplySubjectForVariant = (step: number, variantName: string): string => {
    if (!selected || step <= 1) return '';
    const index = Math.max(0, variantName.charCodeAt(variantName.length - 1) - 65);
    const first = textValue(selected, (finalSequenceSteps[0].variants[index] ?? finalSequenceSteps[0].variants[0]).subject).replace(/^re:\s*/i, '');
    return first ? `Re: ${first}` : 'Re: [add the Step 1 subject first]';
  };

  const missingRequired = [!fields.name && 'Name', !fields.client && 'Client'].filter(Boolean) as string[];
  const filterSelect = (label: string, value: string, setter: (value: string) => void, values: string[]) => <select aria-label={label} value={value} onChange={e => setter(e.target.value)} className={filterControl}><option value="all">All {label}</option>{values.map(item => <option key={item} value={item}>{item}</option>)}</select>;
  const rawText = (record: AnyRecord, field: AnyField | null) => String(cellValue(record, field) ?? '');
  const kpiChip = (kpi: {label: string; chip: string}, extra = '') => <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${kpi.chip} ${extra}`}>{kpi.label}</span>;
  const benchLine = (label: string, pct: number | null | undefined, unit: string, per: number | null | undefined, first = false) => <div className={first ? '' : 'border-t border-current/10 pt-2'}><div className="font-semibold">{label}</div><div className="opacity-80">{pct === null || pct === undefined ? 'No data' : `${pct.toFixed(1)}% of ${unit}`}</div><div className="opacity-70">{per === null || per === undefined ? 'No email ratio' : `1 per ${fmt(Math.round(per))} emails`}</div></div>;
  const fieldInput = (field: AnyField | null, label: string, kind: 'number' | 'text' | 'date', placeholder?: string) => field && <div key={label}><label className={editorLabel}>{label}</label><input type={kind === 'text' ? undefined : kind} min={kind === 'number' ? '0' : undefined} placeholder={placeholder} className={editorControl}
    key={`live:${String(kind === 'number' ? numericValue(selected, field) ?? '' : kind === 'date' ? dateInputValue(selected, field) : textValue(selected, field))}`} defaultValue={kind === 'number' ? numericValue(selected, field) ?? '' : kind === 'date' ? dateInputValue(selected, field) : textValue(selected, field)}
    onBlur={event => { const value = event.currentTarget.value; saveSelectedField(field, kind === 'number' ? (value ? Number(value) : null) : kind === 'date' ? value || null : value, label.toLowerCase()); }}/></div>;
  const selectInput = (field: AnyField | null, label: string, placeholder: string) => field && <div key={label}><label className={editorLabel}>{label}</label><select className={editorControl} value={optionName(selected, field)} onChange={event => saveSelectedField(field, selectWriteValue(field, event.currentTarget.value), label.toLowerCase())}><option value="">{placeholder}</option>{selectOptions(field, campaigns).map(choice => <option key={choice} value={choice}>{choice}</option>)}</select></div>;
  const BANNER = {
    blue: ['border-blue-300 bg-blue-50', 'text-blue-600', 'text-blue-950', 'text-blue-800', 'border-blue-200 text-blue-700'], orange: ['border-orange-300 bg-orange-50', 'text-orange-600', 'text-orange-950', 'text-orange-800', 'border-orange-200 text-orange-700'],
    emerald: ['border-emerald-300 bg-emerald-50', 'text-emerald-600', 'text-emerald-950', 'text-emerald-800', 'border-emerald-200 text-emerald-700'], amber: ['border-amber-200 bg-amber-50', 'text-amber-600', 'text-amber-950', 'text-amber-800', 'border-amber-200 text-amber-700'],
  };
  const decisionBanner = (tone: keyof typeof BANNER, kicker: string, title: string, text: string, chip: string) => <div className={`rounded-2xl border p-5 shadow-sm ${BANNER[tone][0]}`}><div className="flex items-start justify-between gap-3"><div><div className={`text-[10px] font-bold uppercase tracking-wider ${BANNER[tone][1]}`}>{kicker}</div><h3 className={`mt-1 text-xl font-bold ${BANNER[tone][2]}`}>{title}</h3><p className={`mt-1 text-sm ${BANNER[tone][3]}`}>{text}</p></div><span className={`shrink-0 rounded-full border bg-white px-3 py-1 text-xs font-semibold ${BANNER[tone][4]}`}>{chip}</span></div></div>;
  const senderTone = (state: string) => TONE[SENDER_STATES.find(item => item.key === state)?.tone ?? 'emerald'];
  const sending = (record: AnyRecord) => pressing === record.id;
  // The creator's name inputs: a fixed [Client] prefix, the typed title and the saved name preview.
  const prefixedInput = (value: string, onTitle: (title: string) => void, placeholder: string, preview: string, autoFocus = false) => <><div className="flex items-center overflow-hidden rounded-xl border border-gray-300 bg-white focus-within:border-purple-500 focus-within:ring-2 focus-within:ring-purple-100"><span className="shrink-0 border-r border-gray-200 bg-slate-50 px-4 py-3 font-semibold text-gray-700">[{creationClientName || 'Client'}]</span><input autoFocus={autoFocus} className="min-w-0 flex-1 border-0 bg-transparent px-4 py-3 outline-none" value={value} onChange={event => onTitle(stripBracketedClientPrefixForInput(event.currentTarget.value))} placeholder={placeholder}/></div><span className="mt-2 block text-xs text-gray-500">Saved as: <strong className="text-gray-700">{preview}</strong></span></>;

  // One top-up panel for both cases: the KPI rule met (green) or a manual exception (amber).
  const topUpPanel = (manual: boolean) => {
    const issue = selectedTopUpIssue || (manual && !manualTopUpAcknowledged ? 'Tick the KPI exception first.' : '');
    return <div className={manual ? 'mt-3 rounded-xl border border-amber-300 bg-amber-50/90 p-3 text-amber-950' : 'mt-3 rounded-xl border border-emerald-200 bg-white/70 p-3'}>
      {manual && <><div className="font-semibold">Manual top-up</div><p className="mt-1 text-xs leading-5 text-amber-800">This campaign has not met the top-up rule; you can still add a list after ticking the exception.</p></>}
      <div className={`${manual ? 'mt-3 ' : ''}grid gap-3`}>
        <div className="rounded-lg border bg-white p-3"><div className="text-sm font-semibold">{selectedTopUpLeadList ? leadListName(selectedTopUpLeadList) : 'Create a new top-up list'}</div><p className="mt-1 text-xs">Copies this campaign's targeting and excludes contacts already in its lists.</p><button disabled={!!busy || (manual && !manualTopUpAcknowledged)} onClick={() => createTopUpBuild(selected, manual)} className="mt-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Top up · Create lead list</button></div>
        {manual && <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-white p-3 text-xs font-medium"><input type="checkbox" checked={manualTopUpAcknowledged} onChange={event => setManualTopUpAcknowledged(event.currentTarget.checked)} className="mt-0.5 h-4 w-4 accent-amber-600"/><span>I know this campaign has not met the top-up rule and want to proceed.</span></label>}
        <div className="flex items-center justify-between gap-3">
          <div><div className={`text-sm font-semibold ${manual ? '' : 'text-emerald-900'}`}>{selectedTopUpLeadList ? `${fmt(selectedTopUpGenericCount + selectedTopUpDirectCount)} qualified leads selected` : 'Continue the new build in Lead List Center'}</div><div className={`mt-0.5 text-xs ${manual ? 'text-amber-800' : 'text-emerald-800/75'}`}>{selectedTopUpLeadList ? `${fmt(selectedTopUpGenericCount)} generic · ${fmt(selectedTopUpDirectCount)} direct · duplicates are skipped` : 'The original lead list stays attached to the campaign.'}</div></div>
          <button title={issue || 'Send Top Up Campaign to the engine'} disabled={!!busy || !!issue} onClick={() => requestEngine(selected, 'Top Up Campaign')} className={`shrink-0 rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm ${manual ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'} ${DIS}`}><PlusIcon size={15} className="mr-1 inline"/>{sending(selected) ? 'Sending…' : 'Top up campaign'}</button>
        </div>
        {issue && <p className="text-xs opacity-80">{issue}</p>}
        {optionName(selected, fields.topUpStatus) && <div className="rounded-lg border border-emerald-100 bg-emerald-50/70 px-3 py-2 text-xs text-emerald-900"><span className="font-semibold">{optionName(selected, fields.topUpStatus)}</span>
          {[[fields.topUpAdded, 'added'], [fields.topUpSkipped, 'skipped'], [fields.topUpFailed, 'failed']].map(([field, label]) => field && <React.Fragment key={label as string}> · {fmt(numericValue(selected, field as AnyField) ?? 0)} {label as string}</React.Fragment>)}
          {rawText(selected, fields.topUpLastRun) && <> · last run {new Date(rawText(selected, fields.topUpLastRun)).toLocaleString()}</>}
          {textValue(selected, fields.topUpMessage) && <div className="mt-1 whitespace-pre-wrap text-emerald-800/80">{textValue(selected, fields.topUpMessage)}</div>}</div>}
      </div>
    </div>;
  };

  return <div className="min-h-screen flex flex-col bg-slate-50">
    <header className={`relative overflow-hidden border-b px-6 py-5 ${panel}`}>
      <div className="pointer-events-none absolute -right-16 -top-24 h-56 w-56 rounded-full bg-purple-100 opacity-60 blur-3xl"/>
      <div className="relative flex items-center justify-between gap-4 mb-5">
        <div><div className="mb-1 flex items-center gap-2"><div className="h-8 w-1.5 rounded-full bg-gradient-to-b from-purple-500 to-indigo-600"/><h1 className="text-2xl font-bold tracking-tight text-gray-950">Campaign Center</h1></div><p className={`ml-3.5 text-sm ${muted}`}>Plan, approve, launch, and monitor outbound campaigns</p></div>
        <div className="flex gap-2">
          <button disabled={!!busy} onClick={openCampaignCreator} className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-2.5 font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50"><PlusIcon size={16}/>New Campaign</button>
          <button disabled={!!busy} onClick={syncBison} className={`${control} flex items-center gap-2 disabled:opacity-50`}><ArrowsClockwiseIcon className={busy === 'Bison sync request' ? 'animate-spin' : ''} size={16}/>{busy === 'Bison sync request' ? 'Starting sync…' : 'Sync with Bison'}</button>
        </div>
      </div>
      {missingRequired.length > 0 && <div className="mb-3 rounded-md border border-amber-400 bg-amber-50 text-amber-900 px-3 py-2 text-sm">Add these Campaigns fields to this page: {missingRequired.join(', ')}.</div>}
      {trackedSpintax && <div className="mb-3 flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900"><ArrowsClockwiseIcon className="shrink-0 animate-spin" size={16}/><strong>Generating and validating spintax…</strong><span>{trackedSpintax.campaignName}. You can keep working; this message changes when the automation finishes.</span></div>}
      {notice && <div className={`mb-3 rounded-md px-3 py-2 text-sm flex justify-between ${notice.kind === 'error' ? 'bg-red-100 text-red-800' : notice.kind === 'success' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}><span className="whitespace-pre-wrap">{notice.text}</span><button onClick={() => setNotice(null)}><XIcon size={16}/></button></div>}
      <div className="relative rounded-xl border border-gray-200 bg-gray-50/80 p-4 shadow-inner"><div className="flex items-center gap-3 flex-wrap">
        {fields.client && filterSelect('Clients', clientFilter, setClientFilter, options.clients)}
        <div className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2.5 shadow-sm transition-all focus-within:border-purple-500 focus-within:ring-2 focus-within:ring-purple-100"><MagnifyingGlassIcon size={17} className="text-gray-400"/><input aria-label="Search campaigns" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search campaigns..." className="w-64 bg-transparent text-sm outline-none"/></div>
        <FunnelIcon size={19} className={muted}/>
        {fields.status && filterSelect('Statuses', statusFilter, setStatusFilter, options.statuses)}
        {fields.workspace && filterSelect('Workspaces', workspaceFilter, setWorkspaceFilter, options.workspaces)}
        {fields.health && filterSelect('Health', healthFilter, setHealthFilter, options.health)}
        {fields.created && <select aria-label="Created date" value={dateRange} onChange={e => setDateRange(e.target.value as DateRange)} className={filterControl}><option value="all">Any created date</option>{['10', '30', '60', '120'].map(days => <option key={days} value={days}>Created in {days} days</option>)}</select>}
        <button onClick={resetFilters} className={`${control} min-w-0 px-4 font-semibold hover:opacity-80`}>Clear</button>
        <span className={`ml-auto text-xs ${muted}`}>Newest first</span>
      </div></div>
      <div className="relative mt-3 flex flex-wrap items-center gap-2 text-xs">
        {SENDER_STATES.map(state => <span key={state.key} className={`rounded-full border px-3 py-1.5 font-semibold shadow-sm ${TONE[state.tone].pill}`}><strong className={TONE[state.tone].strong}>{senderStatusCounts[state.key]}</strong> {state.label.toLowerCase()}</span>)}
        <span className="text-[11px] font-medium text-slate-500">{workspaceEmailAccounts.length} total senders</span>
        <label className="ml-auto flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-600 shadow-sm"><input type="checkbox" checked={showHiddenHistory} onChange={event => setShowHiddenHistory(event.currentTarget.checked)} className="h-3.5 w-3.5 accent-purple-600"/><span>Show hidden history{hiddenHistoryCount ? ` (${hiddenHistoryCount})` : ''}</span></label>
      </div>
    </header>

    <div className="flex flex-1 overflow-hidden">
      <main className="flex-1 overflow-auto p-5">
        <div className={`overflow-hidden rounded-xl border shadow-sm ${panel}`}>
          <div className="overflow-x-auto"><table className="w-full min-w-[2100px]">
            <thead className="sticky top-0 z-10 bg-slate-100"><tr>{['Campaign', 'Status', 'KPI Health', 'Next Move', 'Progress', 'Total Leads', 'Contacted', 'Emails Sent', 'Emails / Positive Reply', 'Emails / Meeting', 'Replies · %', 'Bounces · %', 'Interested · %', 'Meetings · %', 'Actions'].map(label => <th key={label} className={`border-b px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider ${muted}`}>{label}</th>)}</tr></thead>
            <tbody className="divide-y divide-gray-200">
              {filtered.map(record => {
                const selectedRow = record.id === selectedId;
                const kpis = kpisFor(record);
                const rowStatus = optionName(record, fields.status);
                const rowNextMove = nextMovePresentation(record, fields, pivotOptionsFor(clientRecordForCampaign(record)));
                const stageLabel = campaignStageLabel(record, fields);
                const ratioCell = (value: number | null) => <td className="px-4 py-3 tabular-nums whitespace-nowrap">{value === null ? '—' : `1 / ${fmt(Math.round(value))}`}</td>;
                const metricCell = (dataField: AnyField | null, count: AnyField | null, rate: AnyField | null, denominator: AnyField | null, kpi: {label: string; chip: string}) => <td className="px-4 py-3 tabular-nums whitespace-nowrap"><div className="flex min-h-[76px] flex-col items-start justify-between gap-2"><div className="min-h-[42px] leading-6">{dataField ? <CellRenderer record={record} field={dataField}/> : formatMetric(record, count, rate, denominator)}</div>{kpiChip(kpi)}</div></td>;
                const launch = launchIssue(record), pause = pauseIssue(record);
                return <tr key={record.id} onClick={() => setSelectedId(selectedRow ? null : record.id)} className={`group cursor-pointer transition-colors ${selectedRow ? 'bg-purple-50' : 'hover:bg-slate-50'}`}>
                  <td className="px-4 py-4 font-medium"><div className="flex items-start gap-2"><span className="mt-0.5 rounded-md p-1 text-gray-400 transition-colors group-hover:bg-purple-100 group-hover:text-purple-600">{selectedRow ? <CaretDownIcon size={14}/> : <CaretRightIcon size={14}/>}</span><div><div className="text-gray-900">{campaignName(record) || record.id}</div>{stageLabel && <span className="mt-2 inline-flex whitespace-nowrap rounded-full border border-purple-200 bg-purple-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-purple-700 shadow-sm">{stageLabel}</span>}</div></div></td>
                  <td className="px-4 py-3">{fields.status ? <span className={`${CHIP} px-3 ${campaignStatusPresentation(rowStatus)}`}>{rowStatus || '—'}</span> : '—'}</td>
                  <td className="px-4 py-3"><span className={`${CHIP} ${kpis.overall.chip}`}>{kpis.overall.label}</span></td>
                  <td className="px-4 py-3"><span title={rowNextMove.detail} className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-none shadow-sm ${rowNextMove.chip}`}>{rowNextMove.label}</span></td>
                  <td className="px-4 py-3"><div>{fields.progress ? <CellRenderer record={record} field={fields.progress}/> : <span>{textValue(record, fields.contacted) || '0'} / {textValue(record, fields.totalLeads) || '0'}</span>}</div><div className="mt-2 h-1.5 w-24 overflow-hidden rounded-full bg-gray-200"><div className="h-full rounded-full bg-gradient-to-r from-purple-500 to-indigo-500" style={{width: Math.max(0, Math.min(100, progressPercent(record, fields.progress) ?? 0)) + '%'}}/></div></td>
                  <td className="px-4 py-3 tabular-nums">{formatCount(record, fields.totalLeads)}</td>
                  <td className="px-4 py-3 tabular-nums">{formatCount(record, fields.contacted)}</td>
                  <td className="px-4 py-3 tabular-nums">{fields.emailsSent ? <CellRenderer record={record} field={fields.emailsSent}/> : '—'}</td>
                  {ratioCell(kpis.emailsPerLead)}
                  {ratioCell(kpis.emailsPerMeeting)}
                  {metricCell(fields.repliesData, fields.replies, fields.replyRate, fields.emailsSent, kpis.reply)}
                  {metricCell(fields.bouncesData, fields.bounces, fields.bounceRate, fields.emailsSent, kpis.bounce)}
                  {metricCell(fields.interestedData, fields.interested, fields.interestedRate, fields.emailsSent, kpis.interested)}
                  {metricCell(fields.meetingsData, fields.meetings, fields.meetingRate, fields.interested, kpis.meeting)}
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}><div className="flex gap-1">
                    <button title={pause || 'Pause in EmailBison (engine)'} disabled={!!busy || !!pause} onClick={() => requestEngine(record, 'Pause Campaign')} className={ICON_BTN}><PauseIcon size={16}/></button>
                    <button title={launch || 'Launch or resume in EmailBison (engine launch checks)'} disabled={!!busy || !!launch} onClick={() => requestEngine(record, 'Launch Campaign')} className={ICON_BTN}><PlayIcon size={16}/></button>
                    <button title="Clone" disabled={!!busy} onClick={() => cloneCampaign(record)} className={ICON_BTN}><CopyIcon size={16}/></button>
                    <button title="Open Airtable record" onClick={() => campaignsTable.hasPermissionToExpandRecords() ? expandRecord(record) : setNotice({kind: 'error', text: 'You do not have permission to expand records.'})} className="p-1.5 rounded hover:bg-gray-200"><EyeIcon size={16}/></button>
                  </div></td>
                </tr>;
              })}
              {!filtered.length && <tr><td colSpan={15} className={`px-6 py-16 text-center ${muted}`}><p className="font-medium">No campaigns match these filters.</p><button onClick={resetFilters} className="mt-2 text-purple-600">Clear filters</button></td></tr>}
            </tbody>
          </table></div>
        </div>
      </main>

      {selected && selectedKpis && <aside key={selected.id} className={`w-[580px] max-w-[56vw] border-l overflow-auto shadow-2xl ${panel}`}>
        <div className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 px-5 py-4 backdrop-blur">
          <div className="flex justify-between gap-3"><div className="min-w-0"><div className="mb-1 flex items-center gap-2">{campaignStageLabel(selected, fields) && <span className="rounded-full border border-purple-200 bg-purple-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-purple-700 shadow-sm">{campaignStageLabel(selected, fields)}</span>}{fields.status && <span className="text-xs"><CellRenderer record={selected} field={fields.status}/></span>}</div><h2 className="truncate text-lg font-semibold text-gray-950">{campaignName(selected) || selected.id}</h2><p className={`text-sm ${muted}`}>{textValue(selected, fields.client) || 'No client linked'}</p></div><button title="Close campaign" onClick={() => setSelectedId(null)} className="h-9 w-9 shrink-0 rounded-lg border border-gray-200 bg-white p-2 text-gray-500 shadow-sm transition-colors hover:bg-gray-100 hover:text-gray-900"><XIcon size={18}/></button></div>
          <div className="mt-4 grid grid-cols-5 gap-2">
            <button title={pauseIssue(selected) || 'Pause in EmailBison (engine)'} disabled={!!busy || !!pauseIssue(selected)} onClick={() => requestEngine(selected, 'Pause Campaign')} className={`${control} flex items-center justify-center gap-1 px-2 disabled:opacity-40`}><PauseIcon size={15}/>Pause</button>
            <button title={launchIssue(selected) || 'Launch or resume in EmailBison; the engine runs its launch checks'} disabled={!!busy || !!launchIssue(selected)} onClick={() => requestEngine(selected, 'Launch Campaign')} className="flex items-center justify-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-2.5 text-sm font-semibold text-emerald-700 shadow-sm hover:bg-emerald-100 disabled:opacity-40"><PlayIcon size={15}/>{sending(selected) ? 'Sending…' : 'Launch'}</button>
            <button type="button" title={selectedBisonView.title} disabled={!selectedBisonView.url} onClick={() => selectedBisonView.url && window.open(selectedBisonView.url, '_blank', 'noopener,noreferrer')} className={`flex items-center justify-center gap-1 rounded-lg border border-blue-300 bg-blue-50 px-2 py-2.5 text-sm font-semibold text-blue-700 shadow-sm hover:bg-blue-100 ${DIS}`}><EyeIcon size={15}/>View</button>
            <button disabled={!!busy} onClick={() => cloneCampaign(selected)} className={`${control} flex items-center justify-center gap-1 px-2`}><CopyIcon size={15}/>Clone</button>
            <button title={locked ? LOCKED_HINT : 'Delete through the Airtable automation'} disabled={!!busy || locked} onClick={deleteCampaign} className="flex items-center justify-center gap-1 rounded-lg border border-red-300 bg-red-50 px-2 py-2.5 text-sm font-semibold text-red-700 shadow-sm hover:bg-red-100 disabled:opacity-40"><TrashIcon size={15}/>Delete</button>
          </div>
          {selectedLeadReadinessIssue && <div role="status" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><div className="font-semibold">Lead list not ready</div><p className="mt-1 leading-5">{selectedLeadReadinessIssue}</p></div>}
          <CampaignAutomationStatus status={optionName(selected, fields.processing)} message={textValue(selected, fields.message)} error={textValue(selected, fields.error)} startedAt={rawText(selected, fields.startedAt)} completedAt={rawText(selected, fields.completedAt)}
            engineStatus={engineStatusOf(selected)} engineJobId={textValue(selected, fields.engineJobId)} engineMessage={textValue(selected, fields.engineMessage)} engineAction={engineActionOf(selected)} pressedAt={rawText(selected, fields.engineActionSetAt)} onRequestClear={clearCampaignAutomationStatus}/>
          <div className="mt-4 grid grid-cols-8 gap-1 rounded-xl bg-gray-100 p-1 text-xs">{(['overview', 'strategy', 'copy', 'approval', 'sequence', 'senders', 'settings', 'analytics'] as Tab[]).map(name => <button key={name} onClick={() => setTab(name)} className={`min-w-0 rounded-lg px-1 py-2 font-medium capitalize transition-all ${tab === name ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:bg-white/70 hover:text-gray-800'}`}>{name}</button>)}</div>
        </div>
        <div className="bg-slate-50/60 p-5">
          {tab === 'overview' && <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {fields.status && <div className="rounded-xl border border-purple-200 bg-purple-50 p-3"><div className="text-[11px] font-semibold uppercase tracking-wide text-purple-500">Status</div><div className="mt-1"><CellRenderer record={selected} field={fields.status}/></div></div>}
              {selectedLifecycle && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3"><div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-600">Lifecycle · automatic</div><div className="mt-1.5 flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${selectedLifecycle.badge}`}>{selectedLifecycle.label}</span><span className="text-xs text-emerald-900/75">{selectedLifecycle.detail}</span></div></div>}
            </div>
            {selectedNextMove && <div className={`rounded-2xl border p-4 shadow-sm ${selectedNextMove.chip}`}>
              <div className="flex items-start justify-between gap-4"><div><div className="text-[10px] font-semibold uppercase tracking-wider opacity-70">Recommended next move</div><div className="mt-1 text-xl font-bold">{selectedNextMove.label}</div><p className="mt-1 text-sm opacity-90">{selectedNextMove.detail}</p></div><span className="shrink-0 rounded-full bg-white/70 px-2.5 py-1 text-xs font-semibold">{selectedProgress === null ? 'No progress' : `${selectedProgress.toFixed(0)}% complete`}</span></div>
              {selectedBounceWatch && <div className={`mt-3 rounded-lg border px-3 py-2 text-xs font-semibold ${selectedBounceWatch.chip}`}>Bounce {selectedBounceWatch.label.toLowerCase()}: {selectedBounceWatch.text}</div>}
              {selectedNextMove.action === 'top-up-leads' ? topUpPanel(false) : hasBisonCampaign(selected, fields) && topUpPanel(true)}
              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-current/10 pt-3 text-xs">
                <div className="rounded-xl bg-white/60 p-3"><div className="mb-2 font-semibold uppercase tracking-wide opacity-70">Positive replies</div><div className="space-y-2">{benchLine('Agency', agencyBenchmark.positiveReplyPercent, 'replies', agencyBenchmark.emailsPerPositiveReply, true)}{benchLine('Current client', selectedClientBenchmark?.positiveReplyPercent, 'replies', selectedClientBenchmark?.emailsPerPositiveReply)}</div></div>
                <div className="rounded-xl bg-white/60 p-3"><div className="mb-2 font-semibold uppercase tracking-wide opacity-70">Meetings booked</div><div className="space-y-2">{benchLine('Agency', agencyBenchmark.meetingBookedPercent, 'positive replies', agencyBenchmark.emailsPerMeeting, true)}{benchLine('Current client', selectedClientBenchmark?.meetingBookedPercent, 'positive replies', selectedClientBenchmark?.emailsPerMeeting)}</div></div>
              </div>
            </div>}

            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between"><div><h3 className="font-semibold text-gray-950">KPI performance</h3><p className={`text-xs ${muted}`}>Benchmarked against Dulcy's campaign targets</p></div><span className="rounded-full bg-purple-50 px-2.5 py-1 text-[11px] font-semibold text-purple-700">Current results</span></div>
              <div className="grid grid-cols-2 gap-3">
                {([['Reply rate', selectedKpis.replyRate, selectedKpis.reply], ['Interested rate', selectedKpis.interestedRate, selectedKpis.interested], ['Bounce rate', selectedKpis.bounceRate, selectedKpis.bounce], ['Meeting booked rate', selectedKpis.meetingRate, selectedKpis.meeting]] as [string, number | null, ReturnType<typeof kpiPresentation>][]).map(([label, rate, kpi]) => <div key={label} className={`rounded-xl border p-3 ${kpi.chip}`}>
                  <div className="text-[10px] font-semibold uppercase tracking-wide opacity-75">{label}</div><div className="mt-1 text-xl font-bold">{rate === null ? '—' : `${rate.toFixed(1)}%`}</div><div className="mt-1 text-xs font-semibold">{kpi.label}</div>
                  {label === 'Bounce rate' && <div className="mt-1 text-[11px]">Watch over 2.5% · pause over 4% at 35%+ progress{selectedBounceWatch ? ` · now: ${selectedBounceWatch.label}` : ''}</div>}
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/70"><div className={`h-full rounded-full ${kpi.bar}`} style={{width: kpi.score === null ? '0%' : ((kpi.score + 1) * 20) + '%'}}/></div></div>)}
              </div>
              {selectedKpis.replyRate !== null && selectedKpis.replyRate >= 5 && selectedKpis.interestedRate !== null && selectedKpis.interestedRate < 15 && selectedKpis.emailsPerLead !== null && selectedKpis.emailsPerLead <= 250 && <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs leading-5 text-blue-800"><strong>High-reply context:</strong> heavy reply volume dilutes the interested share, but one positive reply per {fmt(Math.round(selectedKpis.emailsPerLead))} emails is still healthy.</div>}
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3"><div className="text-[10px] font-semibold uppercase tracking-wide text-indigo-500">Emails per positive reply</div><div className="mt-1 text-xl font-bold text-indigo-900">{selectedKpis.emailsPerLead === null ? '—' : `1 per ${fmt(Math.round(selectedKpis.emailsPerLead))}`}</div><div className="mt-1 text-xs text-indigo-600">Emails sent ÷ interested replies</div></div>
                <div className="rounded-xl border border-cyan-100 bg-cyan-50 p-3"><div className="text-[10px] font-semibold uppercase tracking-wide text-cyan-600">Emails per meeting</div><div className="mt-1 text-xl font-bold text-cyan-900">{selectedKpis.emailsPerMeeting === null ? '—' : `1 per ${fmt(Math.round(selectedKpis.emailsPerMeeting))}`}</div><div className="mt-1 text-xs text-cyan-700">Emails sent ÷ meetings booked</div></div>
              </div>
              <details className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600"><summary className="cursor-pointer font-semibold text-gray-700">View KPI ranges</summary><div className="mt-2 grid grid-cols-2 gap-3 leading-5"><div><strong>Reply</strong><br/>Bad: under 1%<br/>Ideal: 3–5%<br/>Good: 5%+</div><div><strong>Interested</strong><br/>Bad: under 5%<br/>Ideal: 15–20%<br/>Good: 20%+</div><div><strong>Bounce</strong><br/>Good: under 1%<br/>Watch: over 2.5%<br/>Pause rule: over 4% at 35%+ progress</div><div><strong>Meeting booked</strong><br/>Bad: under 10%<br/>Ideal: 30–40%<br/>Good: 40%+</div><div className="col-span-2"><strong>Top-up rule</strong>: reply rate 2%+ and interested 15%+ of replies.</div></div></details>
            </div>

            {fields.progress && <div className="rounded-xl border border-purple-200 bg-gradient-to-br from-purple-50 to-indigo-50 p-4">
              <div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wide text-purple-600">Campaign progress</span><span className="font-semibold text-purple-900"><CellRenderer record={selected} field={fields.progress}/></span></div>
              <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white shadow-inner"><div className="h-full rounded-full bg-gradient-to-r from-purple-500 to-indigo-500 transition-all" style={{width: selectedProgressBarWidth + '%'}}/></div>
            </div>}
            <div className="grid grid-cols-2 gap-3">
              {([[fields.totalLeads, 'Total leads', 'border-slate-200 bg-slate-50 text-slate-700'], [fields.contacted, 'Contacted', 'border-blue-200 bg-blue-50 text-blue-700'], [fields.emailsSent, 'Emails sent', 'border-indigo-200 bg-indigo-50 text-indigo-700'], [fields.repliesData, 'Replies', 'border-cyan-200 bg-cyan-50 text-cyan-700'],
                [fields.bouncesData, 'Bounces', 'border-rose-200 bg-rose-50 text-rose-700'], [fields.interestedData, 'Interested', 'border-emerald-200 bg-emerald-50 text-emerald-700'], [fields.meetingsData, 'Meetings booked', 'border-amber-200 bg-amber-50 text-amber-700'], [fields.workspace, 'Workspace', 'border-gray-200 bg-gray-50 text-gray-700']] as [AnyField | null, string, string][])
                .filter(([field]) => field).map(([field, label, tone]) => <div key={label} className={`min-h-[92px] rounded-xl border p-3 ${tone}`}><div className={KICKER}>{label}</div><div className="mt-2 text-lg font-semibold text-gray-900"><CellRenderer record={selected} field={field}/></div></div>)}
            </div>
            {fields.bisonUrl && <button onClick={() => { const link = textValue(selected, fields.bisonUrl); if (link.toLowerCase().startsWith('https://')) window.open(link, '_blank', 'noopener,noreferrer'); else setNotice({kind: 'error', text: 'The Bison URL must be a valid HTTPS URL.'}); }} className="w-full bg-purple-600 text-white rounded-md py-2">Open in Bison</button>}
          </div>}

          {tab === 'senders' && <div className="space-y-4">
            {hasBisonCampaign(selected, fields) && <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
              <div className="font-semibold text-blue-950">Apply selected senders to this campaign</div>
              <p className="mt-1 text-sm text-blue-800">After changing the selection below, press Update senders; the engine swaps the inboxes in EmailBison.</p>
              <button title={selectedSendersIssue || 'Send Update Senders to the engine'} disabled={!!busy || !!selectedSendersIssue} onClick={() => requestEngine(selected, 'Update Senders')} className={`mt-3 bg-blue-600 ${PRIMARY_BTN} ${DIS}`}>{sending(selected) ? 'Sending…' : `Update senders (${selectedEmailAccountIds.length})`}</button>
              {selectedSendersIssue && <p className="mt-2 text-xs text-blue-900">{selectedSendersIssue}</p>}
            </div>}
            <div className="flex items-center justify-between gap-3 rounded-xl border border-purple-200 bg-purple-50/70 px-4 py-3">
              <div><div className="text-sm font-semibold text-purple-950">Sender data</div><div className="text-xs text-purple-700">Refresh assignments from EmailBison before choosing inboxes.</div></div>
              <button disabled={!!busy} onClick={syncBisonSenders} className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-purple-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-purple-700 disabled:opacity-50"><ArrowsClockwiseIcon className={busy === 'Bison sender sync request' ? 'animate-spin' : ''} size={14}/>{busy === 'Bison sender sync request' ? 'Syncing…' : 'Sync Bison Senders'}</button>
            </div>
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4"><h3 className="font-semibold text-indigo-950">Sender accounts</h3><p className="mt-1 text-sm text-indigo-700">Sending and Reserved Next inboxes are busy in another campaign: you can still pick them, so check the warning first.</p>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-6">{SENDER_STATES.map(state => <div key={state.key} className={`rounded-lg border ${TONE[state.tone].tile} bg-white p-2`}><div className={`text-[10px] font-semibold uppercase ${TONE[state.tone].label}`}>{state.label}</div><div className={`text-xl font-bold ${TONE[state.tone].value}`}>{senderStatusCounts[state.key]}</div></div>)}</div>
              <div className="mt-2 text-xs font-semibold text-indigo-800">{workspaceEmailAccounts.length} unique sender accounts in this workspace</div>
              <div className="mt-3 flex flex-wrap items-end gap-2"><label className="text-xs font-semibold text-indigo-900">Number to select<input type="number" min={1} max={Math.max(1, visibleSelectableWorkspaceEmailAccounts.length)} value={accountSelectionCount} onChange={event => setAccountSelectionCount(Math.max(1, Number(event.currentTarget.value) || 1))} className="mt-1 block w-28 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none"/></label>
                <button disabled={locked || !!busy || !visibleSelectableWorkspaceEmailAccounts.length} onClick={selectAvailableEmailAccounts} className={`bg-indigo-600 ${PRIMARY_BTN} disabled:opacity-50`}>{senderStatusFilter === 'available' ? 'Select available' : 'Select matching'}</button>
                <button disabled={locked || !!busy || !visibleSelectableWorkspaceEmailAccounts.length} onClick={selectAllMatchingEmailAccounts} className="rounded-lg border border-indigo-300 bg-white px-4 py-2 text-sm font-semibold text-indigo-700 disabled:opacity-50">Select all matches</button>
                <button disabled={locked || !!busy || !selectedEmailAccountIds.length} onClick={unselectAllEmailAccounts} className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50">Unselect all</button>
                <div className="pb-2 text-xs text-indigo-700">{visibleSelectableWorkspaceEmailAccounts.length} free after filters · {selectedEmailAccountIds.length} selected · {selectedSenderDailyCapacity.toLocaleString()} combined daily limit</div></div>
              {selectedVerifiedLeadCount > 0 && <div className={`mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 ${senderSelectionBlocked ? 'border-red-200 bg-red-50 text-red-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}><div className="text-sm"><div className="font-semibold">Maximum: {recommendedSenderCount} sender account{recommendedSenderCount === 1 ? '' : 's'}</div><div className="mt-1 text-xs">{selectedVerifiedLeadCount.toLocaleString()} verified leads with a {selectedStepDelayDays}-day delay support about {supportedNewLeadsPerDay.toLocaleString()} new leads per day; {selectedEmailAccountIds.length} selected, and fewer is fine.</div></div>{senderSelectionBlocked && <button disabled={locked || !!busy} onClick={useRecommendedEmailAccounts} className="rounded-lg bg-red-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Select up to {recommendedSenderCount}</button>}</div>}
              <div className="mt-3 grid grid-cols-[minmax(0,1fr)_170px] gap-2"><input value={accountSearch} onChange={event => setAccountSearch(event.currentTarget.value)} placeholder="Search email or domain, e.g. usedulcy.io" className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none placeholder:text-gray-400"/><select aria-label="Sender account status" value={senderStatusFilter} onChange={event => setSenderStatusFilter(event.currentTarget.value)} className="rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm font-semibold text-indigo-900 outline-none"><option value="all">All statuses</option>{SENDER_STATES.map(state => <option key={state.key} value={state.key}>{state.label}</option>)}</select></div>
            </div>
            {!fields.emailAccounts && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Add the <strong>Email Accounts</strong> link field to this page.</div>}
            {emailAccountsTable && !visibleWorkspaceEmailAccounts.length && <div className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">No accounts match this workspace, search and status filter.</div>}
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"><div className="max-h-[620px] divide-y divide-gray-100 overflow-auto">{visibleWorkspaceEmailAccounts.map(account => {
              const isSelected = selectedEmailAccountIds.includes(account.id);
              const s = getEmailAccountState(account);
              const cannotSelect = !s.selectable && !isSelected;
              const dailyLimit = numericValue(account, emailAccountFields.dailyLimit);
              return <label key={account.id} className={`flex items-center gap-3 p-3 ${cannotSelect ? 'cursor-not-allowed bg-gray-50' : 'cursor-pointer hover:bg-indigo-50/50'} ${isSelected ? 'bg-indigo-50' : ''}`}><input type="checkbox" checked={isSelected} disabled={locked || !!busy || cannotSelect} onChange={event => toggleCampaignEmailAccount(account.id, event.currentTarget.checked)} className="h-4 w-4 shrink-0 accent-indigo-600"/>
                <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-gray-950">{accountLabel(account)}</div><div className="mt-1 flex flex-wrap gap-2 text-xs text-gray-600">{s.status && <span>{s.status}</span>}{s.busyElsewhere && !isSelected && <span className="font-semibold text-amber-700">Warning: busy in another campaign</span>}</div></div>
                <span className="shrink-0 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-800">Daily: {dailyLimit === null ? 'Not set' : dailyLimit.toLocaleString()}</span><span className={`shrink-0 ${CHIP} ${senderTone(s.state).pill}`}>{SENDER_STATES.find(item => item.key === s.state)?.label ?? 'Available'}</span>{s.warming && s.state !== 'warming' && <span className={`shrink-0 ${CHIP} ${TONE.orange.pill}`}>Warming</span>}</label>;
            })}</div></div>
            <div className="flex justify-end"><button onClick={() => setTab('settings')} className={`bg-blue-600 ${PRIMARY_BTN}`}>Continue to settings</button></div>
          </div>}

          {tab === 'strategy' && <div className="space-y-5">
            <div className="rounded-xl border border-purple-200 bg-purple-50 p-4"><h3 className="font-semibold text-purple-900">Campaign strategy</h3><p className="mt-1 text-sm text-purple-700">The brief, thesis, lead list and timeline; changes save to the campaign.</p></div>
            <div><label className={editorLabel}>Campaign name</label><input className={editorControl} key={`live:${String(campaignName(selected))}`} defaultValue={campaignName(selected)} onBlur={event => saveSelectedField(fields.name, event.currentTarget.value, 'campaign name')}/></div>
            <div className="grid grid-cols-2 gap-3">{selectInput(fields.campaignApproach, 'Campaign approach', 'Select approach')}{fieldInput(fields.prepDate, 'Campaign prep date', 'date')}{fieldInput(fields.launchDate, 'Estimated launch date', 'date')}</div>
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4"><div className="mb-3"><div className="font-semibold text-blue-900">Client-wide pivot options</div><p className="text-sm text-blue-700">Saved once for {clientName(selectedClientRecord) || 'the linked client'} and used by all its campaigns (both on by default).</p></div>
              <div className="grid grid-cols-2 gap-3">{([[clientFields.newVerticalPivot, selectedPivotOptions.newVertical, 'new vertical pivot', 'Can enter a new vertical'], [clientFields.newOfferPivot, selectedPivotOptions.newOffer, 'new offer pivot', 'Can create a new offer']] as [AnyField | null, boolean, string, string][]).filter(([field]) => field).map(([field, checked, label, text]) => <label key={label} className="flex items-center gap-2 rounded-lg border border-blue-200 bg-white p-3 text-sm font-medium text-gray-800"><input type="checkbox" checked={checked} disabled={!selectedClientRecord || !!busy} onChange={event => saveClientPivot(field, event.currentTarget.checked, label)}/><span>{text}</span></label>)}</div>
              {!selectedClientRecord && <div className={`mt-3 ${NOTE_AMBER}`}>Link this campaign to a client to save the shared pivot settings.</div>}</div>
            {fields.thesis && <div><label className={editorLabel}>Campaign thesis</label><textarea rows={8} className={editorControl} key={`live:${String(textValue(selected, fields.thesis))}`} defaultValue={textValue(selected, fields.thesis)} onBlur={event => saveSelectedField(fields.thesis, event.currentTarget.value.trim(), 'campaign thesis')}/><p className="mt-2 text-xs leading-5 text-gray-500">Saved on the campaign only; the lead list's ICP is not changed.</p></div>}
            {selectedLeadList && leadListFields.link && <div><label className={editorLabel}>Lead list link</label><input key={selectedLeadList.id} type="url" className={editorControl} defaultValue={textValue(selectedLeadList, leadListFields.link)} onBlur={event => saveLeadListField(leadListFields.link, event.currentTarget.value || null, 'lead list link')}/></div>}
            {campaignLeadListLinkField && <div className={CARD}><div className={editorLabel}>Linked lead-list record</div>
              {selectedLeadList ? <div><div className="rounded-lg border border-gray-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-gray-900">{leadListName(selectedLeadList)}</div><button className="mt-3 rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 text-sm font-semibold text-purple-700 hover:bg-purple-100" onClick={() => leadListsTable?.hasPermissionToExpandRecords() ? expandRecord(selectedLeadList) : setNotice({kind: 'error', text: 'You do not have permission to open the linked Lead List record.'})}>Open linked lead list in Airtable</button></div> : <div className={NOTE_AMBER}>No Lead List record is linked to this campaign yet.</div>}
              <div className="mt-4"><label className={editorLabel}>{selectedLeadList ? 'Change lead list' : 'Select a lead list for this client'}</label>
                {!leadListsTable ? <div className={NOTE_AMBER}>Configure the Lead lists table in Custom properties first.</div> : !leadListFields.client ? <div className={NOTE_AMBER}>Add the Lead Lists Client field to this page so the choices can be filtered safely.</div>
                  : clientLeadListOptions.length ? <select className={editorControl} value={selectedLeadList?.id ?? ''} disabled={!!busy} onChange={event => linkLeadListToCampaign(event.currentTarget.value)}><option value="">Select a lead list…</option>{clientLeadListOptions.map(list => <option key={list.id} value={list.id}>{leadListName(list)}</option>)}</select>
                  : <div className="rounded-lg border border-gray-200 bg-slate-50 p-3 text-sm text-gray-600">No Lead Lists are linked to {textValue(selected, fields.client) || clientFilter}; add the client to a Lead List first.</div>}</div></div>}
            <div className="flex justify-end"><button onClick={() => setTab('copy')} className={`bg-purple-600 ${PRIMARY_BTN}`}>Continue to copy</button></div>
          </div>}

          {tab === 'copy' && <div className="space-y-5">
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4"><h3 className="font-semibold text-indigo-900">Campaign copy</h3><p className="mt-1 text-sm text-indigo-700">Write the client-review version here; it stays separate from the spintax and EmailBison build.</p><p className="mt-2 text-sm text-indigo-700"><span className="font-semibold">Split tests:</span> start each subject and copy block on its own line with <span className="font-mono">Variant 1</span>, <span className="font-mono">Variant 2</span> (or A, B, C).</p></div>
            {([[1, fields.subject1, fields.body1, null], [2, fields.subject2, fields.body2, fields.threadReply2], [3, fields.subject3, fields.body3, fields.threadReply3], [4, fields.subject4, fields.body4, fields.threadReply4]] as [number, AnyField | null, AnyField | null, AnyField | null][]).map(([step, subjectField, bodyField, threadField]) => {
              const isThreadReply = step > 1 && Boolean(cellValue(selected, threadField));
              const replySubject = `Re: ${textValue(selected, fields.subject1).replace(/^re:\s*/i, '')}`;
              return <div key={step} className={CARD}><div className="mb-3 flex items-center justify-between gap-3"><h4 className="font-semibold text-gray-900">Email {step}</h4>{step > 1 && (threadField ? <label className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800"><input type="checkbox" checked={isThreadReply} onChange={event => saveSelectedField(threadField, event.currentTarget.checked, `step ${step} thread reply`)}/><span>Thread reply</span></label> : <span className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">Add Thread Reply - Step {step}</span>)}</div>
                {subjectField && <div><label className={editorLabel}>Subject line</label><input className={`${editorControl} ${isThreadReply ? 'bg-slate-100 text-gray-500' : ''}`} disabled={isThreadReply} value={isThreadReply ? replySubject : undefined} key={`live:${String(isThreadReply ? undefined : textValue(selected, subjectField))}`} defaultValue={isThreadReply ? undefined : textValue(selected, subjectField)} onBlur={event => { if (!isThreadReply) saveSelectedField(subjectField, event.currentTarget.value, `email ${step} subject`); }}/>{isThreadReply && <p className="mt-1.5 text-xs text-blue-700">Uses the Step 1 subject automatically.</p>}</div>}
                {bodyField && <div className="mt-3"><label className={editorLabel}>Email copy</label><textarea rows={8} className={editorControl} key={`live:${String(textValue(selected, bodyField))}`} defaultValue={textValue(selected, bodyField)} onBlur={event => saveSelectedField(bodyField, event.currentTarget.value, `email ${step} copy`)}/></div>}</div>;
            })}
            <div className="flex items-center justify-between rounded-xl border border-purple-200 bg-purple-50 p-4"><div><div className="font-semibold text-purple-900">Ready for client review?</div><div className="text-sm text-purple-700">This moves the workflow to Client Review.</div></div><button onClick={() => moveWorkflow('Client Review')} className={`bg-purple-600 ${PRIMARY_BTN}`}>Send for approval</button></div>
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="font-semibold text-amber-950">Client approval exception</div><div className="mt-1 text-sm leading-5 text-amber-800">Only when the agreement does not need client approval: records Approved - Dulcy and prepares the sequence.</div></div><button disabled={!skipApprovalConfirmed || !!busy} onClick={() => approveAndPrepareSequence(true)} className={`shrink-0 bg-amber-600 hover:bg-amber-700 ${PRIMARY_BTN} ${DIS}`}>Skip approval + prepare</button></div><label className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-white p-3 text-sm font-medium text-amber-950"><input type="checkbox" checked={skipApprovalConfirmed} onChange={event => setSkipApprovalConfirmed(event.currentTarget.checked)} className="mt-0.5 h-4 w-4 accent-amber-600"/><span>I confirm client approval is not required for this campaign.</span></label></div>
          </div>}

          {tab === 'approval' && <div className="space-y-4">
            {campaignApprovedByDulcy && decisionBanner('blue', 'Approval decision', 'Approved - Dulcy', 'Dulcy approved this campaign internally because client approval was not required.', 'Internal approval')}
            {clientRequestedChanges && decisionBanner('orange', 'Client decision', 'Changes requested', 'Make the revisions below, then resubmit the campaign.', 'Action required')}
            {clientHasApproved && decisionBanner('emerald', 'Client decision', 'Campaign approved', 'Prepare the final sequence when ready.', 'Approved')}
            {!campaignApprovedByDulcy && !clientRequestedChanges && !clientHasApproved && decisionBanner('amber', 'Client decision', selectedClientDecision || 'Waiting for response', 'The client has not submitted a final approval yet.', 'Pending')}
            {clientRequestedChanges && <div className="space-y-3"><div className="rounded-xl border border-orange-200 bg-white p-4 shadow-sm"><div className="text-[10px] font-semibold uppercase tracking-wider text-orange-500">Requested change area</div><div className="mt-2 text-lg font-bold text-gray-950">{selectedRequestedChangeArea || 'Not specified'}</div></div><div className="rounded-xl border border-purple-200 bg-white p-4 shadow-sm"><div className="text-[10px] font-semibold uppercase tracking-wider text-purple-500">What the client said</div><div className="mt-2 whitespace-pre-wrap text-sm font-medium leading-6 text-gray-900">{selectedPrimaryFeedback || 'No written feedback was provided.'}</div></div></div>}
            {!clientRequestedChanges && fields.selectChanges && selectedRequestedChangeArea && <div className="rounded-xl border border-gray-200 bg-white p-4"><div className={editorLabel}>Requested change area</div><div className="font-semibold text-gray-900">{selectedRequestedChangeArea}</div></div>}
            {!clientRequestedChanges && fields.reviewCopy && selectedPrimaryFeedback && <div className="rounded-xl border border-gray-200 bg-white p-4"><div className={editorLabel}>Copy feedback</div><div className="whitespace-pre-wrap text-sm leading-6 text-gray-900">{selectedPrimaryFeedback}</div></div>}
            {!!selectedAdditionalFeedback.length && <div className={CARD}><div className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Additional feedback</div><div className="space-y-3">{selectedAdditionalFeedback.map(([field, label]) => <div key={label} className="rounded-lg border border-gray-100 bg-slate-50 p-3"><div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</div><div className="mt-1 whitespace-pre-wrap text-sm text-gray-900">{textValue(selected, field)}</div></div>)}</div></div>}
            {!campaignApprovedByDulcy && (clientRequestedChanges ? <button disabled={!!busy} onClick={() => moveWorkflow('Changes Requested')} className="w-full rounded-xl border border-orange-300 bg-orange-600 px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-orange-700 disabled:opacity-40">Move campaign to revision</button>
              : <div className="grid grid-cols-2 gap-3"><button onClick={() => moveWorkflow('Changes Requested')} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700">Mark changes requested</button><button disabled={!clientHasApproved || !!busy} onClick={() => approveAndPrepareSequence()} className={`bg-emerald-600 ${PRIMARY_BTN} ${DIS}`}>Approve + prepare sequence</button></div>)}
          </div>}

          {tab === 'sequence' && <div className="space-y-5">
            <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-emerald-950">Final campaign sequence</h3><p className="mt-1 text-sm text-emerald-800">Variant A comes from the approved Email 1–4 copy; add split tests, set the delay, then generate spintax.</p></div><span className="shrink-0 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">Approved copy</span></div></div>
            <div className="flex flex-wrap gap-2"><button disabled={!!busy} onClick={prepareSequenceFromReview} className="rounded-lg border border-purple-300 bg-white px-3 py-2 text-sm font-semibold text-purple-700 hover:bg-purple-50 disabled:opacity-40">Refresh from approved copy</button><button disabled={!!busy || !fields.createSpintax || Boolean(trackedSpintax)} onClick={generateValidatedSpintax} className={`flex items-center gap-2 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:shadow-md ${DIS}`}>{trackedSpintax && <ArrowsClockwiseIcon className="animate-spin" size={15}/>} {trackedSpintax ? 'Spintax running…' : 'Generate + validate spintax'}</button></div>
            {!fields.createSpintax && <div className={NOTE_AMBER}>Add <strong>create_spintax</strong> to this page to turn on the spintax button.</div>}
            {finalSequenceSteps.slice(0, visibleSequenceStepLimit).map((step, stepIndex) => {
              const variantLimit = visibleVariantLimitForStep(step.number);
              return <React.Fragment key={step.number}>
                {step.number > 1 && (step.threadReply ? <label className="flex items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900"><span><span className="block font-semibold">Thread reply</span><span className="block text-xs text-blue-700">When on, EmailBison uses <strong>{threadReplySubjectForVariant(step.number, `${step.number}A`)}</strong> and keeps this step in the original thread.</span></span><input type="checkbox" checked={Boolean(cellValue(selected, step.threadReply))} onChange={event => saveSelectedField(step.threadReply, event.currentTarget.checked, `step ${step.number} thread reply`)} className="h-4 w-4 shrink-0 accent-blue-600"/></label> : <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Add <strong>Thread Reply - Step {step.number}</strong> to this page.</div>)}
                <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-gray-200 bg-slate-50 px-4 py-3"><div><div className="text-xs font-semibold uppercase tracking-wider text-purple-600">Step {step.number}</div><div className="text-sm text-gray-500">{variantLimit} {variantLimit === 1 ? 'variant' : 'split-test variants'}</div></div><span className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-600">Email {step.number}</span></div>
                  <div className="space-y-4 p-4">{step.variants.slice(0, variantLimit).map(variant => <div key={variant.name} className="rounded-xl border border-gray-200 bg-white p-4 transition-all hover:border-purple-200 hover:shadow-sm">
                    <div className="mb-3 flex items-center justify-between">{variant.name.endsWith('A') ? <span className="text-xs font-medium text-emerald-600">Primary approved version</span> : variant.name === step.variants[variantLimit - 1]?.name && <button title={`Delete Variant ${variant.name}`} disabled={!!busy} onClick={() => removeSequenceVariant(step.number, variant.name, variant.subject, variant.body)} className="flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-40"><XIcon size={14}/> Delete</button>}</div>
                    {variant.subject ? <div><label className={editorLabel}>Subject line</label><input className={editorControl} key={`live:${String(textValue(selected, variant.subject))}`} defaultValue={textValue(selected, variant.subject)} onBlur={event => saveSelectedField(variant.subject, event.currentTarget.value, `variant ${variant.name} subject`)}/></div> : <div className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">Add this subject field to this page.</div>}
                    {variant.body ? <div className="mt-3"><label className={editorLabel}>Email copy</label><textarea rows={8} className={editorControl} key={`live:${String(textValue(selected, variant.body))}`} defaultValue={textValue(selected, variant.body)} onBlur={event => saveSelectedField(variant.body, event.currentTarget.value, `variant ${variant.name} body`)}/></div> : <div className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">Add this body field to this page.</div>}
                  </div>)}
                    {step.variants.length > variantLimit && <button onClick={() => setSequenceVariantLimits({...sequenceVariantLimits, [`${selected.id}-${step.number}`]: variantLimit + 1})} className="w-full rounded-xl border-2 border-dashed border-purple-200 bg-purple-50/50 px-4 py-3 text-sm font-semibold text-purple-700 hover:border-purple-400 hover:bg-purple-50"><PlusIcon className="mr-1 inline" size={16}/> Add split-test variant</button>}</div></section>
                {stepIndex < visibleSequenceStepLimit - 1 && <div className="flex items-center gap-3 px-3"><div className="h-px flex-1 bg-gray-200"/><div className="flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700"><span>Wait</span>
                  {!fields.daysBetween ? <span className="rounded-md bg-amber-100 px-2 py-1 text-amber-900">field not on page</span> : fields.daysBetween.type === FieldType.SINGLE_SELECT
                    ? <select aria-label="Days between sequence steps" value={optionName(selected, fields.daysBetween)} onChange={event => saveSelectedField(fields.daysBetween, selectWriteValue(fields.daysBetween, event.currentTarget.value), 'days between emails')} className="rounded-md border border-blue-200 bg-white px-2 py-1 text-xs text-blue-800 outline-none"><option value="">—</option>{selectOptions(fields.daysBetween, campaigns).map(choice => <option key={choice} value={choice}>{choice}</option>)}</select>
                    : <input aria-label="Days between sequence steps" type="number" min="0" value={sequenceDelayDraft} onChange={event => setSequenceDelayDraft(event.currentTarget.value)} onBlur={event => saveSelectedField(fields.daysBetween, event.currentTarget.value ? Number(event.currentTarget.value) : null, 'days between emails')} className="w-14 rounded-md border border-blue-200 bg-white px-2 py-1 text-center text-xs text-blue-800 outline-none"/>}
                  <span>days, then</span></div><div className="h-px flex-1 bg-gray-200"/></div>}
              </React.Fragment>;
            })}
            {visibleSequenceStepLimit < finalSequenceSteps.length && <button onClick={() => setSequenceStepLimits({...sequenceStepLimits, [selected.id]: visibleSequenceStepLimit + 1})} className="w-full rounded-2xl border-2 border-dashed border-indigo-300 bg-indigo-50/50 px-4 py-4 text-sm font-semibold text-indigo-700 hover:border-indigo-500 hover:bg-indigo-50"><PlusIcon className="mr-1 inline" size={17}/> Add sequence step {visibleSequenceStepLimit + 1}</button>}
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-900"><div className="font-semibold">What the spintax automation does</div><p className="mt-1">It adds <code>{'{option|option}'}</code> choices without touching merge tags such as <code>{'{FIRST_NAME}'}</code>, then checks every combination reads naturally.</p></div>
            <div className="flex justify-end"><button onClick={() => setTab('senders')} className={`bg-blue-600 ${PRIMARY_BTN}`}>Continue to senders</button></div>
          </div>}

          {tab === 'settings' && <div className="space-y-5">
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4"><h3 className="font-semibold text-blue-900">Campaign build settings</h3><p className="mt-1 text-sm text-blue-700">Set the sending schedule before Build Campaign.</p></div>
            <div><div className={editorLabel}>Sending days</div><div className="grid grid-cols-2 gap-2">{([[fields.monday, 'Monday'], [fields.tuesday, 'Tuesday'], [fields.wednesday, 'Wednesday'], [fields.thursday, 'Thursday'], [fields.friday, 'Friday'], [fields.saturday, 'Saturday'], [fields.sunday, 'Sunday']] as [AnyField | null, string][])
              .filter(([field]) => field).map(([field, day]) => <label key={day} className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"><input type="checkbox" checked={Boolean(cellValue(selected, field))} onChange={event => saveSelectedField(field, event.currentTarget.checked, day)}/><span>{day}</span></label>)}</div></div>
            <div className="grid grid-cols-2 gap-3">
              {fieldInput(fields.maxEmails, 'Max emails per day', 'number')}{fieldInput(fields.maxNewLeads, 'Max new leads per day', 'number')}
              {fieldInput(fields.startTime, 'Start time', 'text', '09:00')}{fieldInput(fields.endTime, 'End time', 'text', '17:00')}
              {selectInput(fields.timezone, 'Time zone', 'Select time zone')}{fieldInput(fields.startDate, 'Start date', 'date')}{fieldInput(fields.endDate, 'End date', 'date')}
            </div>
            {fields.plainText && <label className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4"><div><div className="font-medium">Plain-text sending</div><div className={`text-sm ${muted}`}>Send without HTML formatting.</div></div><input type="checkbox" checked={Boolean(cellValue(selected, fields.plainText))} onChange={event => saveSelectedField(fields.plainText, event.currentTarget.checked, 'plain text')}/></label>}
            {selectedLeadList && (selectedGenericLeadCount > 0 || selectedDirectLeadCount > 0) && <div className="rounded-xl border border-purple-200 bg-purple-50 p-4"><div className="font-semibold text-purple-950">Campaign-output split (done by the engine)</div><p className="mt-1 text-sm leading-6 text-purple-800">Build Campaign makes one EmailBison draft per non-empty lead type and splits the selected inboxes by lead share.</p>
              <div className="mt-3 grid grid-cols-2 gap-3">{([[selectedGenericLeadCount, 'Generic Emails', 'Generic-safe greeting; no {FIRST_NAME}'], [selectedDirectLeadCount, 'Direct Emails', 'Original approved sequence']] as [number, string, string][]).filter(([count]) => count > 0).map(([count, label, text]) => <div key={label} className="rounded-lg border border-purple-200 bg-white p-3"><div className="text-xs font-semibold uppercase tracking-wide text-purple-600">{label}</div><div className="mt-1 font-bold text-gray-950">{count.toLocaleString()} leads</div><div className="text-sm text-gray-500">{text}</div></div>)}</div>
              {fields.emailAccounts && <div className="mt-3 text-sm font-semibold text-purple-900">Selected sender accounts: {selectedEmailAccountIds.length}</div>}</div>}
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><div className="mb-3"><div className="font-semibold text-amber-950">Bounce safeguards</div><p className="mt-1 text-sm text-amber-800">Watch over 2.5% bounce; the engine pauses a campaign over 4% at 35%+ progress.</p></div><div className="space-y-2">
              {([[fields.skipBounceNotification, 'Skip bounce notification', 'No automated bounce warning for this campaign.', 'border-amber-200', 'text-gray-900'], [fields.skipBouncePause, 'Skip bounce pause', "The engine's bounce check will not pause this campaign while ticked.", 'border-red-200', 'text-red-800']] as [AnyField | null, string, string, string, string][]).map(([field, label, hint, border, title]) => field
                ? <label key={label} className={`flex items-center justify-between rounded-lg border ${border} bg-white p-3`}><div><div className={`text-sm font-semibold ${title}`}>{label}</div><div className="text-xs text-gray-500">{hint}</div></div><input type="checkbox" checked={Boolean(cellValue(selected, field))} onChange={event => saveSelectedField(field, event.currentTarget.checked, label.toLowerCase())}/></label>
                : <div key={label} className="rounded-lg border border-amber-200 bg-white p-3 text-sm text-amber-900">Add <strong>{label}</strong> to this page.</div>)}</div></div>
            {senderSelectionBlocked && <div className={NOTE_RED}>Build Campaign is locked: open <strong>Senders</strong> and select between {minimumOutputSenders} and {recommendedSenderCount} inbox{recommendedSenderCount === 1 ? '' : 'es'}.</div>}
            {selectedBuildIssue && !senderSelectionBlocked && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{selectedBuildIssue}</div>}
            <div className="flex items-center justify-end gap-3"><span className="text-xs text-gray-500">Creates EmailBison drafts on the engine; never launches.</span><button title={selectedBuildIssue || 'Send Build Campaign to the engine'} disabled={!!selectedBuildIssue || !!busy} onClick={() => requestEngine(selected, 'Build Campaign')} className={`flex items-center gap-2 bg-blue-600 ${PRIMARY_BTN} ${DIS}`}>{sending(selected) && <ArrowsClockwiseIcon className="animate-spin" size={15}/>} {sending(selected) ? 'Sending…' : 'Build campaign'}</button></div>
          </div>}

          {tab === 'analytics' && <div>
            <CampaignReviewPanel key={`review-${selected.id}`} record={selected} field={fields.reviewNotes} name={campaignName(selected)}/>
            <VerificationPerformancePanel key={`verification-${selected.id}`} record={selected} field={fields.verificationJson}/>
            <section className="mb-6 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-base font-semibold text-gray-900">Sequence performance</h3><p className="mt-1 text-sm text-gray-500">Campaign-to-date results by EmailBison step and split-test variant.</p></div>
                {!!relatedSequenceAnalytics.length && <div className="rounded-lg border border-gray-200 bg-slate-50 px-3 py-2 text-xs text-gray-600"><strong>{relatedSequenceAnalytics.length}</strong> variants tracked · <strong>{fmt(sequenceAnalyticsTotals.sent)}</strong> emails sent</div>}</div>
              {!sequenceAnalyticsTable && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Configure the <strong>Sequence Analytics</strong> table in Custom properties.</div>}
              {sequenceAnalyticsTable && !sequenceAnalyticsFields.campaign && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">Add the Sequence Analytics <strong>Campaign</strong> link field to this page.</div>}
              {sequenceAnalyticsTable && sequenceAnalyticsFields.campaign && !relatedSequenceAnalytics.length && <div className="rounded-xl border border-gray-200 bg-slate-50 p-6 text-center text-sm text-gray-500">No sequence analytics have synced for this campaign yet.</div>}
              {!!relatedSequenceAnalytics.length && <>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{([['Emails sent', sequenceAnalyticsTotals.sent, 'text-blue-700', 'bg-blue-50 border-blue-200'], ['Replies', sequenceAnalyticsTotals.replies, 'text-indigo-700', 'bg-indigo-50 border-indigo-200'], ['Interested', sequenceAnalyticsTotals.interested, 'text-emerald-700', 'bg-emerald-50 border-emerald-200'], ['Bounces', sequenceAnalyticsTotals.bounces, 'text-red-700', 'bg-red-50 border-red-200']] as [string, number, string, string][])
                  .map(([label, value, valueClass, cardClass]) => <div key={label} className={`rounded-xl border p-3 ${cardClass}`}><div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">{label}</div><div className={`mt-1 text-2xl font-bold tabular-nums ${valueClass}`}>{fmt(value)}</div></div>)}</div>
                {sequenceAnalyticsLeader && <div className={`rounded-xl border p-4 ${sequenceAnalyticsLeader.sampleStatus === 'Not ideal' ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}><div className="flex flex-wrap items-center justify-between gap-2"><div><div className="text-xs font-bold uppercase tracking-wider text-purple-700">{sequenceAnalyticsLeader.sampleStatus === 'Not ideal' ? 'Early leader' : 'Current leader'}</div><div className="mt-1 font-semibold text-gray-900">Step {sequenceAnalyticsLeader.step} · Variant {sequenceAnalyticsLeader.variant}</div></div><div className="text-right"><div className="text-lg font-bold text-emerald-700">{sequenceAnalyticsLeader.interestedRate.toFixed(2)}% interested</div><div className="text-xs text-gray-600">{sequenceAnalyticsLeader.replyRate.toFixed(2)}% reply rate · {fmt(sequenceAnalyticsLeader.sent)} sent</div></div></div>{sequenceAnalyticsLeader.sampleStatus === 'Not ideal' && <p className="mt-2 text-xs text-amber-800">Directional only: fewer than 1,000 sends.</p>}</div>}
                <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white"><table className="w-full min-w-[980px] text-sm">
                  <thead className="bg-slate-50"><tr>{['Step', 'Variant', 'Open', 'Sent', 'Replies', 'Reply rate', 'Interested', 'Interested rate', 'Bounces', 'Bounce rate', 'Sample', 'Sample size'].map(label => <th key={label} className="border-b border-gray-200 px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500">{label}</th>)}</tr></thead>
                  <tbody>{relatedSequenceAnalytics.map(row => {
                    const sampleChip = row.sampleStatus === 'Ideal' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : row.sampleStatus === 'Okay' ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-amber-200 bg-amber-50 text-amber-700';
                    const bar = (rate: number, max: number, tone: string) => <div className="mt-1 h-1 w-16 overflow-hidden rounded-full bg-gray-100"><div className={`h-full rounded-full ${tone}`} style={{width: `${Math.min(100, rate / max * 100)}%`}}/></div>;
                    return <tr key={row.record.id} className={`border-t border-gray-100 ${sequenceAnalyticsLeader?.record.id === row.record.id ? 'bg-purple-50/60' : 'hover:bg-slate-50'}`}>
                      <td className="px-3 py-3 font-semibold text-gray-900">{row.step || '—'}</td>
                      <td className="px-3 py-3"><span className="inline-flex min-w-7 justify-center rounded-full bg-purple-100 px-2 py-1 text-xs font-bold text-purple-700">{row.variant}</span></td>
                      <td className="px-3 py-3"><button onClick={() => sequenceAnalyticsTable?.hasPermissionToExpandRecords() ? expandRecord(row.record) : setNotice({kind: 'error', text: 'Turn on record details for Sequence Analytics, then try again.'})} className="inline-flex items-center gap-1.5 rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 text-xs font-semibold text-purple-700 transition-colors hover:bg-purple-100"><EyeIcon size={14}/> Open</button></td>
                      <td className="px-3 py-3 font-semibold tabular-nums">{fmt(row.sent)}</td>
                      <td className="px-3 py-3 tabular-nums">{fmt(row.replies)}</td>
                      <td className="px-3 py-3 tabular-nums"><div className="font-semibold">{row.replyRate.toFixed(2)}%</div>{bar(row.replyRate, 5, 'bg-indigo-500')}</td>
                      <td className="px-3 py-3 tabular-nums">{fmt(row.interested)}</td>
                      <td className="px-3 py-3 tabular-nums"><div className="font-semibold text-emerald-700">{row.interestedRate.toFixed(2)}%</div>{bar(row.interestedRate, 20, 'bg-emerald-500')}</td>
                      <td className="px-3 py-3 tabular-nums">{fmt(row.bounces)}</td>
                      <td className={`px-3 py-3 font-semibold tabular-nums ${row.bounceRate > 4 ? 'text-red-700' : row.bounceRate > 2.5 ? 'text-amber-700' : 'text-emerald-700'}`}>{row.bounceRate.toFixed(2)}%</td>
                      <td className="px-3 py-3"><span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold ${sampleChip}`}>{row.sampleStatus}</span></td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs font-semibold tabular-nums text-gray-600">{fmt(row.sent)} / {row.sampleStatus === 'Ideal' ? '2,000+' : row.sampleStatus === 'Okay' ? '2,000' : '1,000'}</td>
                    </tr>;
                  })}</tbody>
                </table></div>
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs leading-5 text-blue-800"><strong>How to read this:</strong> interested rate (interested ÷ replies) picks the winner; reply rate adds context and the sample badge stops an early call.</div>
              </>}
            </section>
          </div>}
        </div>
      </aside>}
    </div>
    {showCampaignCreator && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-6"><div className="w-full max-w-2xl rounded-3xl bg-white p-7 shadow-2xl">
      <div className="flex items-start justify-between gap-4"><div><h2 className="text-2xl font-bold text-gray-950">Create a campaign</h2><p className="mt-1 text-sm text-gray-500">Client: <strong className="text-gray-800">{clientFilter === 'all' ? 'Choose a client first' : clientFilter}</strong></p></div><button aria-label="Close campaign creator" onClick={() => setShowCampaignCreator(false)} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"><XIcon size={20}/></button></div>
      <div className="mt-6 space-y-5">
        <label className="block"><span className={editorLabel}>Campaign name</span>{prefixedInput(newCampaignName, title => { setNewCampaignName(title); if (!newLeadListNameEdited) setNewLeadListName(title); }, 'Florida Marketing Agencies', campaignNamePreview || `[${creationClientName || 'Client'}] Campaign name`, true)}</label>
        <label className="block"><span className={editorLabel}>Initial targeting sentence <span className="font-normal normal-case tracking-normal text-gray-400">(optional)</span></span><textarea className={editorControl} rows={3} value={newCampaignThesis} onChange={event => setNewCampaignThesis(event.currentTarget.value)} placeholder="Example: B2B marketing agencies located in Florida, USA with 1–50 employees"/><span className="mt-2 block text-xs leading-5 text-gray-500">Saved as the campaign thesis and copied into the new Lead List targeting sentence.</span></label>
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-purple-200 bg-purple-50 p-5"><input type="checkbox" checked={buildLeadList} onChange={event => setBuildLeadList(event.currentTarget.checked)} className="mt-1 h-5 w-5 accent-purple-600"/><span><span className="block font-bold text-purple-950">Build or connect a lead list for this campaign</span><span className="mt-1 block text-sm leading-6 text-purple-800">Links the records now; sourcing starts only after you review the plan in Lead List Center.</span></span></label>
        {buildLeadList && <div className="space-y-4 rounded-2xl border border-gray-200 bg-slate-50 p-5"><div className="grid grid-cols-2 gap-3">{([['new', 'Create a new lead list', 'Recommended for a new targeting plan.'], ['existing', 'Connect an existing list', 'Reuse a list this client already owns.']] as ['new' | 'existing', string, string][]).map(([mode, title, text]) => <button key={mode} type="button" onClick={() => setLeadListCreationMode(mode)} className={`rounded-xl border p-4 text-left ${leadListCreationMode === mode ? 'border-purple-500 bg-white ring-2 ring-purple-100' : 'border-gray-200 bg-white'}`}><div className="font-bold text-gray-950">{title}</div><div className="mt-1 text-sm text-gray-500">{text}</div></button>)}</div>
          {leadListCreationMode === 'new' ? <label className="block"><span className={editorLabel}>Lead-list name</span>{prefixedInput(newLeadListName, title => { setNewLeadListName(title); setNewLeadListNameEdited(true); }, campaignTitleDraft || 'Same as campaign name', leadListNamePreview || campaignNamePreview || `[${creationClientName || 'Client'}] Lead-list name`)}</label>
            : <label className="block"><span className={editorLabel}>Existing lead list</span><select className={editorControl} value={existingLeadListId} onChange={event => setExistingLeadListId(event.currentTarget.value)}><option value="">Select a lead list…</option>{creationLeadListOptions.map(list => <option key={list.id} value={list.id}>{leadListName(list)}</option>)}</select>{!creationLeadListOptions.length && <span className="mt-2 block text-xs text-amber-700">No Lead Lists were found for {clientFilter}. Create a new one instead.</span>}</label>}
        </div>}
      </div>
      <div className="mt-7 flex justify-end gap-3"><button onClick={() => setShowCampaignCreator(false)} className="rounded-xl border border-gray-300 px-5 py-3 font-semibold text-gray-700">Cancel</button><button disabled={!!busy || !campaignTitleDraft || !creationClientRecord || clientFilter === 'all' || (buildLeadList && leadListCreationMode === 'existing' && !existingLeadListId)} onClick={createCampaign} className="rounded-xl bg-purple-600 px-5 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{busy === 'New campaign' ? 'Creating…' : buildLeadList ? 'Create campaign and connect list' : 'Create campaign'}</button></div>
    </div></div>}
  </div>;
}

type CampaignCenterErrorBoundaryState = {error: Error | null};
class CampaignCenterErrorBoundary extends React.Component<React.PropsWithChildren, CampaignCenterErrorBoundaryState> {
  state: CampaignCenterErrorBoundaryState = {error: null};
  static getDerivedStateFromError(error: Error): CampaignCenterErrorBoundaryState { return {error}; }
  // Airtable otherwise replaces the element with a generic error page that hides the message.
  componentDidCatch(error: Error): void { console.error('Campaign Center render failed', error); }
  render(): React.ReactNode {
    if (!this.state.error) return this.props.children;
    return <div className="min-h-screen bg-slate-50 p-8 text-gray-900"><div className="mx-auto max-w-2xl rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
      <div className="text-xs font-bold uppercase tracking-wider text-red-600">Campaign Center error</div>
      <h1 className="mt-2 text-xl font-bold">The interface hit a runtime error</h1>
      <p className="mt-2 text-sm text-gray-600">Copy the message below; it names the field or table Airtable rejected.</p>
      <pre className="mt-4 whitespace-pre-wrap break-words rounded-xl bg-red-50 p-4 text-sm text-red-900">{this.state.error.message || String(this.state.error)}</pre>
      <button onClick={() => this.setState({error: null})} className="mt-4 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white">Try again</button>
    </div></div>;
  }
}

initializeBlock({interface: () => <CampaignCenterErrorBoundary><CampaignCenter/></CampaignCenterErrorBoundary>});
