// The shapes /hq/api/portal/* answers (engine/src/hq/portal.ts builds them for the session's client only).
import type { User } from '../api';

export type Health = 'healthy' | 'watching' | 'fixing';
export interface HealthText { status: Health; text: string }
export interface FileRef { name: string; href: string }

export interface Session {
  user: User; client: { name: string };
  channels: { email: boolean; linkedin: boolean; aiCaller: boolean; directMail: boolean };
  go: { meeting: string; esp: string; partnership: string };
  badges: { unread: number; tasks: number; review: number; feedback: number };
}
export interface Home {
  hello: string; client: string; verdict: string;
  month: { interested: number; booked: number; live: number; sent30: number };
  next: { title: string; day: string } | null;
  lastBooked: { key: string; name: string; company: string; bookedOn: string } | null;
  tasks: { open: number; top: { key: string; name: string; stage: TaskStage }[] };
  todo: { review: number; feedback: number; unread: number };
  health: HealthText; readAt: string;
}
export type CampaignState = 'review' | 'changes' | 'building' | 'live' | 'paused' | 'finished';
export interface CampaignRow {
  key: string; name: string; state: CampaignState; label: string; contacted: number; sent: number; replies: number; interested: number; booked: number;
  deliverability: Health | null; launch: string; started: string; finished: string;
}
export interface CampaignDetail extends CampaignRow {
  approach: string; thesis: string; targeting: { what: string; value: string }[]; emails: { step: number; subject: string; body: string }[];
  answer: { feedback: string; changes: string; comments: string; context: string }; canReview: boolean;
  choices: { feedback: readonly string[]; changes: readonly string[]; targeting: readonly string[] };
}
export interface Period { period: string; updated: string; [k: string]: string | number }
export interface EmailResults { active: boolean; periods: Period[]; total: { contacted: number; sent: number; replies: number; interested: number; booked: number }; campaigns: CampaignRow[]; health: HealthText; readAt: string }
export interface LinkedinResults { active: boolean; periods: Period[]; campaigns: { key: string; name: string; status: string; leads: number; sent: number; accepted: number; replies: number; booked: number }[]; readAt: string }
export interface AiCaller { active: boolean; calls: number; answered: number; interested: number; readAt: string }
export interface PipelineLead { key: string; name: string; company: string; stage: string; date: string; bookedOn: string; feedback: boolean; deal: boolean }
export interface Pipeline { stages: { stage: string; leads: PipelineLead[] }[]; total: number; deals: { count: number; value: number }; readAt: string }
export interface FeedbackGiven { key: string; status: string; rating: number; comments: string; recording: string; newDate: string; date: string }
export interface LeadDetail {
  key: string; name: string; company: string; email: string; campaign: string; message: string; date: string; stage: string; bookedOn: string;
  feedback: FeedbackGiven[]; deal: { value: number; day: string; type: string; why: string } | null;
  canFeedback: boolean; feedbackDue: boolean; canCloseDeal: boolean; choices: { status: readonly string[]; deal: readonly string[] };
}
export interface Lead { key: string; name: string; company: string; email: string; message: string; date: string; status: 'booked' | 'sent'; bookedOn: string }
export interface Meeting { key: string; name: string; company: string; bookedOn: string }
export interface Feedback {
  missing: Meeting[]; given: { key: string; lead: string; name: string; company: string; status: string; rating: number; comments: string; date: string }[]; choices: readonly string[]; readAt: string;
}
export type TaskStage = 'open' | 'blocked' | 'done';
export interface Task { key: string; name: string; details: string; stage: TaskStage; updated: string; files: FileRef[] }
export interface Doc { key: string; title: string; details: string; by: 'you' | 'dulcy'; updated: string; files: FileRef[] }
export interface OurMeeting { key: string; title: string; summary: string; day: string; recording: string }
export interface Bill { key: string; number: string; amount: number; currency: string; day: string; state: string; from: string; to: string }
export interface Note { key: string; title: string; message: string; kind: string; date: string }
export interface OnbField { key: string; label: string; kind: 'text' | 'long' | 'url' | 'email' | 'select'; group: string; choices: string[]; value: string }
export interface Calendar { events: { key: string; name: string; what: 'launch' | 'started' | 'finished'; day: string; label: string }[]; readAt: string }
