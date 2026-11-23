import React, {useEffect, useMemo, useRef, useState} from 'react';
import {expandRecord, initializeBlock, useBase, useCustomProperties, useRecords} from '@airtable/blocks/interface/ui';
import {FieldType} from '@airtable/blocks/interface/models';
import {ArrowRightIcon, CaretRightIcon, FileArrowUpIcon, FunnelIcon, MagnifyingGlassIcon, PlusIcon, TrashIcon, XIcon} from '@phosphor-icons/react';

type AnyField = any;
type AnyRecord = any;
type AnyTable = any;
type Fields = Record<string, AnyField | null>;
type Tab = 'overview' | 'targeting' | 'companies' | 'contacts' | 'verification' | 'enrichment' | 'qa';
// What a button asked the engine to do; drives the waiting banner and the "done" notice.
type JobKind = 'filters' | 'company-sample' | 'company-expansion' | 'company-restart' | 'contact-sample' | 'contact-expansion' | 'verification' | 'recovery' | 'enrichment-prompt' | 'enrichment' | 'skip-enrichment' | 'qa';

// ---------- Shared class strings ----------
const inputClass = 'w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-[15px] text-slate-900 shadow-sm outline-none transition focus:border-purple-500 focus:ring-2 focus:ring-purple-100 disabled:bg-slate-100 disabled:text-slate-500';
const labelClass = 'mb-2 block text-xs font-bold uppercase tracking-[0.08em] text-slate-600';
const cardClass = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm';
const LBL = 'text-xs font-bold uppercase tracking-wider text-slate-500';
const BIG = 'mt-2 text-2xl font-black text-slate-900';
const BIG3 = 'mt-2 text-3xl font-black text-slate-900';
const PILL = 'rounded-full border px-3 py-1 text-xs font-bold';
const OK = 'border-emerald-200 bg-emerald-50 text-emerald-700';
const WARN = 'border-amber-200 bg-amber-50 text-amber-700';
const INFO = 'border-blue-200 bg-blue-50 text-blue-700';
const ERR = 'border-red-200 bg-red-50 text-red-700';
const MUTED = 'border-slate-200 bg-slate-50 text-slate-600';
const DIS = 'disabled:cursor-not-allowed disabled:opacity-60';
const PRIMARY = 'rounded-xl bg-purple-600 px-5 py-3 font-bold text-white';
const OVERLAY = 'fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-6';
const HELP = 'text-xs leading-5 text-slate-500';
const AMBER_NOTE = 'rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900';
const CHECK_BTN = 'flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm font-semibold transition';
const CHECK_BOX = 'flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs';
const PURPLE_TONE = ['border-purple-500 bg-purple-50 text-purple-800', 'border-slate-300 bg-white text-slate-600 hover:border-purple-300', 'border-purple-500 bg-purple-600 text-white'];
const BLUE_TONE = ['border-blue-500 bg-blue-50 text-blue-800', 'border-slate-300 bg-white text-slate-600 hover:border-blue-300', 'border-blue-500 bg-blue-600 text-white'];
const AMBER_TONE = ['border-amber-500 bg-amber-100 text-amber-950', 'border-slate-300 bg-white text-slate-600 hover:border-amber-300', 'border-amber-500 bg-amber-500 text-white'];

const splitList = (text: string) => text.split(/[\n,]+/).map(item => item.trim()).filter(Boolean);
const optionsFrom = (text: string) => text.split('|').map(item => { const [value, label] = item.split(':'); return {value, label}; });
const choicesOf = (field: AnyField | null): any[] => field?.config?.options?.choices ?? field?.options?.choices ?? [];
const linkedTableOf = (field: AnyField | null) => field?.options?.linkedTableId ?? field?.config?.options?.linkedTableId;
const HISTORY_CUTOFF = new Date('2026-07-15T00:00:00-04:00').getTime();
const RUNNING = ['running', 'waiting', 'queued', 'processing'];

const Spin = () => <span aria-hidden="true" className="inline-block text-lg leading-none animate-spin">↻</span>;
const Intro = ({title, children}: {title: string; children: React.ReactNode}) => <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
  <h3 className="font-bold text-blue-950">{title}</h3><p className="mt-1 text-sm leading-6 text-blue-800">{children}</p>
</div>;
function CheckOption({on, tone, onClick, disabled, children}: {on: boolean; tone: string[]; onClick: () => void; disabled?: boolean; children: React.ReactNode}) {
  return <button type="button" disabled={disabled} onClick={onClick} className={`${CHECK_BTN} ${on ? tone[0] : tone[1]}`}>
    <span className={`${CHECK_BOX} ${on ? tone[2] : 'border-slate-300 bg-white text-transparent'}`}>✓</span><span>{children}</span>
  </button>;
}
function ModeHeader({label, mode, setMode}: {label: string; mode: string; setMode: (mode: 'include' | 'exclude') => void}) {
  const button = (next: 'include' | 'exclude', on: string, text: string) => <button type="button" onClick={() => setMode(next)} className={`rounded-md px-2.5 py-1 text-[11px] font-bold ${mode === next ? on : 'text-slate-500'}`}>{text}</button>;
  return <div className="mb-2 flex items-center justify-between gap-3"><span className={labelClass}>{label}</span>
    <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">{button('include', 'bg-emerald-600 text-white', 'Include')}{button('exclude', 'bg-rose-600 text-white', 'Exclude')}</div>
  </div>;
}

// ---------- TAM Finder (free DiscoLike count) ----------
const TAM_COUNT_LIST_FIELDS = new Set('sub_industry negate_sub_industry phrase_match negate_phrase_match tech_stack negate_tech_stack country negate_country state negate_state category negate_category business_model negate_business_model social negate_social language negate_language'.split(' '));
const TAM_COUNT_FIELDS = new Set([...TAM_COUNT_LIST_FIELDS, 'employee_range', 'revenue_range', 'min_digital_footprint', 'max_digital_footprint', 'exclude_leadgen', 'redirect', 'start_date', 'geo', 'bbox', 'lat', 'lon', 'radius']);
const TAM_DEFAULTS = {min_digital_footprint: 0, max_digital_footprint: 800, redirect: 0, exclude_leadgen: false};
function tamCountParameters(raw: string) {
  const parsed = JSON.parse(raw);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw Error('Invalid company filters.');
  // Project before validation: Discover-only values cannot invalidate a Count result.
  const input = Object.fromEntries(Object.entries(parsed).filter(([key]) => TAM_COUNT_FIELDS.has(key)));
  const f = normalizeNativeFilters(input); if (!f || Array.isArray(f) || typeof f !== 'object') throw Error('Generate or save a company search plan first.');
  const params: Record<string, any> = {};
  for (const [k, v] of Object.entries(f)) {
    if (v === null || v === '' || (Array.isArray(v) && !v.length)) continue;
    if (TAM_COUNT_LIST_FIELDS.has(k)) {
      const a = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : null;
      if (!a || a.some(x => typeof x !== 'string' || !x.trim())) throw Error('Invalid ' + k + ' filter. Review the saved search plan.');
      const values = [...new Set(a.map(x => x.trim()))];
      const limit = /sub_industry/.test(k) ? 50 : /phrase_match|tech_stack/.test(k) ? 20 : k === 'negate_state' ? 100 : 300;
      if (values.length > limit) throw Error(k + ' allows at most ' + limit + ' values.');
      if (/phrase_match/.test(k) && values.some(x => x.length < 3)) throw Error('Each homepage keyword must have at least 3 characters.');
      params[k] = values.join(',');
    } else if (k === 'employee_range' || k === 'revenue_range') {
      const s = String(v).replace(/\s/g, ''); const m = s.match(/^(\d+),(\d+\+?|\+)$/);
      if (!m || !Number.isSafeInteger(Number(m[1])) || (m[2] !== '+' && !Number.isSafeInteger(Number(m[2].replace('+', '')))) || (!m[2].includes('+') && Number(m[1]) > Number(m[2]))) throw Error('Invalid ' + k + '. Use two whole numbers, such as 1,50.');
      params[k] = s;
    } else if (k === 'min_digital_footprint' || k === 'max_digital_footprint') {
      if (typeof v === 'boolean' || !/^\d+$/.test(String(v)) || Number(v) > 800) throw Error(k + ' must be a whole number from 0 to 800.'); params[k] = Number(v);
    } else if (k === 'exclude_leadgen' || k === 'redirect') {
      if (![true, false, 0, 1, 'true', 'false', '0', '1'].includes(v)) throw Error('Invalid ' + k + '.');
      const b = [true, 1, 'true', '1'].includes(v); params[k] = k === 'redirect' ? (b ? 1 : 0) : b;
    } else if (k === 'start_date') {
      const dates = String(v).split(',');
      if (dates.length > 2 || dates.some(d => !/^\d{4}-\d{2}-\d{2}$/.test(d) || !Number.isFinite(Date.parse(d)) || new Date(d).toISOString().slice(0, 10) !== d) || dates.length === 2 && dates[0] > dates[1]) throw Error('Invalid founding date range. Use YYYY-MM-DD or two dates separated by a comma.');
      params[k] = String(v);
    } else if (['geo', 'bbox', 'lat', 'lon', 'radius'].includes(k)) params[k] = v;
  }
  if (!Object.keys(params).some(k => !['redirect', 'exclude_leadgen', 'min_digital_footprint', 'max_digital_footprint'].includes(k))) throw Error('Add at least one count-compatible filter, such as country, industry, keywords, or company size. Lookalike text alone cannot be counted.');
  if ((params.state || params.negate_state) && (!params.country || params.country.split(',').length !== 1 || params.country.length !== 2)) throw Error('State filters need exactly one country code.');
  if ((params.min_digital_footprint ?? 0) > (params.max_digital_footprint ?? 800)) throw Error('Minimum digital footprint exceeds the maximum.');
  // Fill the count defaults so a saved check and the current plan compare the same way.
  for (const [k, v] of Object.entries(TAM_DEFAULTS)) if (params[k] === undefined) params[k] = v;
  return params;
}
function tamCountSignature(params: Record<string, any>): string {
  const effective: Record<string, any> = {...TAM_DEFAULTS, ...params};
  return JSON.stringify(Object.keys(effective).filter(key => TAM_COUNT_FIELDS.has(key)).sort().map(key => {
    let value = effective[key];
    if (TAM_COUNT_LIST_FIELDS.has(key)) value = [...new Set(String(value).split(',').map(part => part.trim()))].sort();
    else if (key === 'geo' || key === 'bbox') value = [...new Set(Array.isArray(value) ? value : [value])].sort();
    return [key, value];
  }));
}
function tamCountFiltersChanged(snapshot: any, raw: string): boolean {
  if (!snapshot) return false;
  try {
    const counted = snapshot.params && typeof snapshot.params === 'object' && !Array.isArray(snapshot.params) ? snapshot.params : tamCountParameters(snapshot.source);
    return tamCountSignature(counted) !== tamCountSignature(tamCountParameters(raw));
  } catch { return true; }
}
const TAM_LABELS: Record<string, string> = Object.fromEntries(optionsFrom('sub_industry:Subindustries|negate_sub_industry:Excluded subindustries|geo:Circular areas|bbox:Rectangles|lat:Centre latitude|lon:Centre longitude|radius:Centre radius|country:Countries|negate_country:Excluded countries|state:States|negate_state:Excluded states|category:Industries|negate_category:Excluded industries|phrase_match:Homepage keywords|negate_phrase_match:Excluded keywords|employee_range:Employees|revenue_range:Revenue|business_model:Business models|negate_business_model:Excluded business models|tech_stack:Technology|negate_tech_stack:Excluded technology|language:Languages|negate_language:Excluded languages|social:Social profiles|negate_social:Excluded social profiles|start_date:Founded|min_digital_footprint:Minimum footprint|max_digital_footprint:Maximum footprint|redirect:Redirects|exclude_leadgen:Exclude lead generators').map(({value, label}) => [value, label]));

function TamFinder({record, table, filtersField}: {record: AnyRecord; table: AnyTable; filtersField: AnyField}) {
  const field = table?.fields.find((item: AnyField) => item.id === 'fldKNUnxiySLsIUny' || item.name === 'TAM Check JSON');
  const raw = display(record, filtersField);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [clock, setClock] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 15000); return () => clearInterval(timer); }, []);
  let snapshot: any = null;
  try { snapshot = JSON.parse(display(record, field)); } catch {}
  const pending = ['requested', 'running'].includes(snapshot?.status);
  const delayed = pending && clock - Date.parse(snapshot.startedAt || snapshot.requestedAt) > 300000;
  const waiting = pending && !delayed;
  const stale = tamCountFiltersChanged(snapshot, raw);
  const complete = snapshot?.status === 'complete' && Number.isSafeInteger(snapshot.count) && snapshot.count >= 0;
  const request = async () => {
    if (!field || saving || waiting) return;
    setError(''); setSaving(true);
    try {
      const plan = JSON.parse(raw);
      if (!plan || Array.isArray(plan) || typeof plan !== 'object' || !Object.keys(plan).length) throw Error('Generate or save your company filters first.');
      const requestId = record.id + '-' + Date.now() + '-' + Math.random().toString(36).slice(2);
      await table.updateRecordAsync(record.id, {[field.id]: JSON.stringify({version: 1, status: 'requested', requestId, requestedAt: new Date().toISOString(), source: raw})});
    } catch (e: any) { setError(e.message || 'Could not request a TAM check.'); } finally { setSaving(false); }
  };
  return <section className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h3 className="text-lg font-bold text-indigo-950">TAM Finder</h3><p className="mt-1 text-sm text-indigo-800">Size your company audience before sourcing. Uses the saved search plan below.</p></div>
      <button type="button" onClick={request} disabled={!field || !raw.trim() || saving || waiting} className="rounded-xl bg-indigo-600 px-5 py-3 font-bold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50">{saving ? 'Requesting…' : waiting ? 'Checking TAM…' : 'Check TAM — free count'}</button>
    </div>
    <p className="mt-3 text-xs leading-5 text-indigo-800">Free count only: it does not source companies or contacts, verify emails, or spend discovery credits.</p>
    {!field && <p className="mt-3 text-sm text-amber-800">TAM setup needs the TAM Check JSON field enabled in this interface.</p>}
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    {pending && <p role="status" className="mt-4 text-sm font-semibold text-indigo-900">{delayed ? 'This check is taking longer than expected. You can request a new check.' : 'Requested. The engine answers within about 30 seconds.'}</p>}
    {snapshot?.status === 'error' && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-800">{snapshot.message || 'The count could not be completed. Try again.'}</p>}
    {complete && <div className="mt-4 rounded-xl border border-indigo-100 bg-white p-5">
      <div className="text-3xl font-bold text-indigo-950">{snapshot.count.toLocaleString()}</div>
      <div className="mt-1 text-sm font-semibold text-indigo-900">Companies matching the counted filters{stale ? ' — previous search plan' : ''}</div>
      <p className="mt-2 text-xs text-slate-500">Checked {new Date(snapshot.checkedAt).toLocaleString()}</p>
      {snapshot.count === 0 && <p className="mt-3 text-sm text-slate-700">No matching companies. Try broader keywords, geography, or company size.</p>}
    </div>}
    {stale && <p className="mt-3 text-sm font-bold text-amber-800">Your filters changed. Run a new TAM check for the current search plan.</p>}
    <p className="mt-4 text-sm leading-6 text-indigo-900">Market size only, before fit review and exclusions; not a count of new, qualified, or contactable leads.</p>
    {complete && <details className="mt-3 rounded-xl border border-indigo-200 bg-white"><summary className="cursor-pointer px-4 py-3 text-sm font-bold text-indigo-900">See exactly what was counted</summary>
      <div className="space-y-2 border-t border-indigo-100 p-4 text-sm text-slate-700">
        {Object.entries(snapshot.params || {}).map(([key, value]) => <div key={key}><strong>{TAM_LABELS[key] || key}:</strong> {String(value)}</div>)}
        {!!snapshot.ignored?.length && <p className="pt-3 text-amber-800">Not applied by the count endpoint: {snapshot.ignored.join(', ')}.</p>}
        {snapshot.notes?.map((note: string) => <p key={note} className="text-xs text-slate-500">{note}</p>)}
      </div>
    </details>}
  </section>;
}

// ---------- DiscoLike subindustries and native filter checks ----------
const NATIVE_SUBINDUSTRIES = [
  'CONSTRUCTION:ROOFING PLUMBING ELECTRICAL HVAC SOLAR_INSTALLATION GENERAL_CONTRACTING HOME_BUILDER REMODELING PAINTING SIDING_CONTRACTOR WINDOW_AND_DOOR_INSTALLER FLOORING CONCRETE_AND_MASONRY EXCAVATION_AND_DEMOLITION ARCHITECTURE RESTORATION|HEALTHCARE:PRIMARY_AND_URGENT_CARE DENTIST OPTOMETRIST MENTAL_HEALTH_PRACTICE REHAB_CENTER CHIROPRACTOR PHYSICAL_THERAPY MEDSPA_AND_DERMATOLOGY VETERINARIAN HOSPITAL SENIOR_CARE|CONSUMER_SERVICES:HOUSE_CLEANING_SERVICE LAWN_CARE TREE_SERVICE RESIDENTIAL_PEST_CONTROL MOVING_COMPANY HANDYMAN APPLIANCE_REPAIR PHOTOGRAPHER WEDDING_PLANNER HAIR_SALON PET_GROOMING FUNERAL_HOME|LEGAL:PERSONAL_INJURY_LAWYER FAMILY_LAWYER CRIMINAL_DEFENSE_LAWYER ESTATE_PLANNING_LAWYER IMMIGRATION_LAWYER BUSINESS_LAWYER EMPLOYMENT_LAWYER REAL_ESTATE_LAWYER IP_LAWYER BANKRUPTCY_LAWYER|REAL_ESTATE:REAL_ESTATE_AGENCY COMMERCIAL_BROKERAGE PROPERTY_MANAGEMENT REAL_ESTATE_DEVELOPER APARTMENT_OPERATOR TITLE_AND_ESCROW HOME_INSPECTOR|RESTAURANTS:PIZZERIA COFFEE_SHOP BAKERY BAR_AND_PUB FOOD_TRUCK CATERER FAST_FOOD|AUTOMOTIVE:CAR_DEALERSHIP AUTO_REPAIR_SHOP AUTO_BODY_SHOP TIRE_SHOP AUTO_DETAILING TOWING AUTO_PARTS_SUPPLIER|RETAIL:GROCERY_STORE CLOTHING_STORE FURNITURE_STORE HARDWARE_STORE JEWELRY_STORE PHARMACY',
  'WELLNESS_AND_LIFESTYLE:MASSAGE_THERAPY YOGA_STUDIO ACUPUNCTURE NUTRITIONIST LIFE_COACH DAY_SPA|FINANCIAL_SERVICES:BANK_AND_CREDIT_UNION MORTGAGE_LENDER FINANCIAL_ADVISOR BUSINESS_LENDER PAYMENT_PROCESSOR DEBT_COLLECTION|EDUCATION:K12_SCHOOL UNIVERSITY PRESCHOOL_AND_DAYCARE TRADE_SCHOOL TUTORING DRIVING_SCHOOL ONLINE_COURSE_PLATFORM|SPORTS_AND_RECREATION:GYM_AND_FITNESS PERSONAL_TRAINING MARTIAL_ARTS DANCE_STUDIO GOLF_COURSE|E-COMMERCE:MARKETPLACE APPAREL_STORE BEAUTY_STORE HOME_GOODS_STORE|ADVERTISING_AND_MARKETING:MARKETING_AGENCY SEO_AND_PPC_AGENCY SOCIAL_MEDIA_AGENCY BRANDING_AGENCY WEB_DESIGN_AGENCY PR_AGENCY LEAD_GENERATION|MANUFACTURING:MACHINE_SHOP METAL_FABRICATION INJECTION_MOLDING CONTRACT_MANUFACTURER PACKAGING_MANUFACTURER ROBOTICS_AND_AUTOMATION|SAAS:CRM_SOFTWARE MARKETING_SOFTWARE DEVELOPER_TOOLS AI_PLATFORM ANALYTICS_SOFTWARE HELPDESK_SOFTWARE|BUSINESS_PRODUCTS_AND_SERVICES:JANITORIAL UNIFORM_SUPPLIER OFFICE_SUPPLIES CALL_CENTER_AND_BPO MANAGEMENT_CONSULTING|SUPPLY_CHAIN_AND_PROCUREMENT:FREIGHT_BROKER TRUCKING_COMPANY WAREHOUSING_AND_FULFILLMENT FREIGHT_FORWARDER COURIER WHOLESALE_DISTRIBUTOR|CONSUMER_PRODUCTS:BEAUTY_BRAND HOME_GOODS_BRAND PET_PRODUCTS_BRAND OUTDOOR_GEAR_BRAND',
  'HOSPITALITY:HOTEL RESORT VACATION_RENTAL CAMPGROUND_AND_RV_PARK WEDDING_AND_CONFERENCE_VENUE|TRAVEL:TRAVEL_AGENCY TOUR_OPERATOR AIRLINE CRUISE_OPERATOR|MEDIA:NEWS_PUBLISHER MAGAZINE_PUBLISHER BOOK_PUBLISHER PODCAST RADIO_AND_TV_STATION|ENTERTAINMENT:MUSIC_LABEL_AND_STUDIO EVENT_PROMOTER FILM_PRODUCTION TALENT_AGENCY NIGHTCLUB|NONPROFIT_AND_PHILANTHROPY:CHURCH CHARITY FOUNDATION TRADE_ASSOCIATION MUSEUM|FASHION_TEXTILE_AND_APPAREL:WOMENS_APPAREL_BRAND MENS_APPAREL_BRAND FOOTWEAR_BRAND JEWELRY_BRAND CUSTOM_APPAREL_AND_EMBROIDERY|FOOD_AND_BEVERAGE:FOOD_MANUFACTURER BEVERAGE_BRAND COFFEE_ROASTER FOOD_DISTRIBUTOR|IT_SERVICES:MSP IT_CONSULTING IT_STAFFING|ENGINEERING:CIVIL_ENGINEERING_FIRM MECHANICAL_ENGINEERING_FIRM ELECTRICAL_ENGINEERING_FIRM LAND_SURVEYING|SOFTWARE:MOBILE_APP_DEVELOPER CUSTOM_SOFTWARE_DEVELOPER ENGINEERING_SOFTWARE|HUMAN_RESOURCES:STAFFING_AGENCY EXECUTIVE_SEARCH PEO_AND_PAYROLL BENEFITS_BROKER HR_CONSULTING|GAMING_AND_ESPORTS:GAME_STUDIO ESPORTS_ORGANIZATION ONLINE_CASINO_AND_BETTING|INSURANCE:INSURANCE_AGENCY INSURANCE_CARRIER|AGRICULTURE_AND_NATURAL_RESOURCES:CROP_FARM LIVESTOCK_RANCH FARM_EQUIPMENT_DEALER AGRICULTURAL_SUPPLIER|BLOCKCHAIN_AND_CRYPTOCURRENCY:CRYPTO_EXCHANGE CRYPTO_WALLET_AND_CUSTODY DEFI_PROTOCOL NFT_PLATFORM',
  'CYBERSECURITY:MSSP PENETRATION_TESTING SECURITY_COMPLIANCE|PRIVATE_EQUITY_AND_VENTURE_CAPITAL:VENTURE_CAPITAL_FIRM PRIVATE_EQUITY_FIRM|ALCOHOL_AND_TOBACCO:BREWERY WINERY DISTILLERY CANNABIS_DISPENSARY|SECURITY:SECURITY_GUARD_COMPANY ALARM_AND_ACCESS_CONTROL LOCKSMITH|ENVIRONMENTAL_SERVICES:WASTE_MANAGEMENT_COMPANY RECYCLING_CENTER ENVIRONMENTAL_CONSULTING|BIOTECHNOLOGY:THERAPEUTICS_DEVELOPER GENOMICS_COMPANY LAB_EQUIPMENT_SUPPLIER',
].join('|').split('|').flatMap(group => { const [parent, subs] = group.split(':'); return subs.split(' ').map(sub => parent + '/' + sub); });

function normalizeNativeFilters(input: Record<string, any>) {
  const f: Record<string, any> = {...input}; const known = new Set(NATIVE_SUBINDUSTRIES);
  if (f.relevance !== undefined && !['MAX_RELEVANCE', 'BALANCED', 'MAX_COVERAGE'].includes(f.relevance)) throw Error('Choose a valid relevance mode.');
  const arr = (v: any, key: string) => {
    if (v == null || v === '') return [];
    if (!Array.isArray(v) && typeof v !== 'string') throw Error(key + ' must be a list.');
    return (Array.isArray(v) ? v : [v]).map(x => { if (typeof x !== 'string' || !x.trim()) throw Error('Invalid ' + key + ' value.'); return x.trim(); });
  };
  for (const key of ['sub_industry', 'negate_sub_industry']) {
    const values = arr(f[key], key).flatMap(x => x.split(',')).map(x => x.trim().toUpperCase());
    if (values.length > 50) throw Error('Choose no more than 50 subindustries per include/exclude list.');
    const qualified: string[] = [];
    for (const value of values) {
      const matches = known.has(value) ? [value] : NATIVE_SUBINDUSTRIES.filter(x => x.split('/')[1] === value);
      if (!matches.length) throw Error('Unknown DiscoLike subindustry: ' + value);
      if (key === 'sub_industry' && matches.length > 1) throw Error('Choose the parent industry for ' + value);
      qualified.push(...matches);
    }
    if (new Set(qualified).size > 50) throw Error('Choose no more than 50 qualified subindustries.');
    if (qualified.length) f[key] = [...new Set(qualified)]; else delete f[key];
  }
  const cats = arr(f.category, 'category').flatMap(x => x.split(',')).map(x => x.toUpperCase().replace('E_COMMERCE', 'E-COMMERCE'));
  const excludedCats = arr(f.negate_category, 'negate_category').flatMap(x => x.split(',')).map(x => x.toUpperCase().replace('E_COMMERCE', 'E-COMMERCE'));
  for (const value of f.sub_industry || []) {
    const parent = value.split('/')[0];
    if (cats.length && !cats.includes(parent)) throw Error('Included subindustry ' + value + ' requires its parent ' + parent + ' in included industries.');
    if (excludedCats.includes(parent) || (f.negate_sub_industry || []).includes(value)) throw Error('A selected subindustry is also excluded: ' + value);
  }
  const number = (v: any, label: string, min: number, max: number) => {
    if (!['number', 'string'].includes(typeof v) || v == null || String(v).trim() === '' || !Number.isFinite(Number(v)) || Number(v) < min || Number(v) > max) throw Error(label + ' must be between ' + min + ' and ' + max + '.');
    return Number(v);
  };
  const radius = (v: any) => {
    const m = String(v ?? '50km').trim().match(/^(\d+(?:\.\d+)?)(km|mi)?$/i); if (!m) throw Error('Radius must be a positive number in km or mi.');
    const km = Number(m[1]) * (m[2]?.toLowerCase() === 'mi' ? 1.609344 : 1);
    if (km <= 0 || km > 1000) throw Error('Radius must be above zero and at most 1,000 km (about 621 miles).');
    return Number(m[1]) + (m[2]?.toLowerCase() || 'km');
  };
  let shapes = 0;
  const geo = arr(f.geo, 'geo').map(x => {
    const a = x.split(',').map(s => s.trim()); if (a.length < 2 || a.length > 3) throw Error('Each circular area needs latitude, longitude, and optional radius.');
    return number(a[0], 'Latitude', -90, 90) + ',' + number(a[1], 'Longitude', -180, 180) + ',' + radius(a[2]);
  });
  const boxes = arr(f.bbox, 'bbox').map(x => {
    const a = x.split(',').map(s => s.trim()); if (a.length !== 4) throw Error('Each rectangle needs south latitude, west longitude, north latitude, east longitude.');
    const b = [number(a[0], 'South latitude', -90, 90), number(a[1], 'West longitude', -180, 180), number(a[2], 'North latitude', -90, 90), number(a[3], 'East longitude', -180, 180)];
    if (b[0] >= b[2] || b[1] === b[3]) throw Error('Rectangle needs south below north and different east/west boundaries.');
    return b.join(',');
  });
  if (geo.length) f.geo = geo; else delete f.geo;
  if (boxes.length) f.bbox = boxes; else delete f.bbox;
  shapes += geo.length + boxes.length;
  const hasLat = f.lat != null && f.lat !== ''; const hasLon = f.lon != null && f.lon !== '';
  if (hasLat !== hasLon) throw Error('Set both latitude and longitude for the search centre.');
  if (hasLat) { f.lat = number(f.lat, 'Latitude', -90, 90); f.lon = number(f.lon, 'Longitude', -180, 180); f.radius = radius(f.radius); shapes++; }
  else { if (f.radius != null && f.radius !== '') throw Error('Radius requires a latitude and longitude.'); delete f.lat; delete f.lon; delete f.radius; }
  if (shapes > 10) throw Error('DiscoLike supports at most 10 geographic areas per search.');
  return f;
}

function NativeFilterEditor({raw, onSave, disabled}: {raw: string; onSave: (patch: Record<string, any>) => Promise<void>; disabled: boolean}) {
  const [mode, setMode] = useState<'sub_industry' | 'negate_sub_industry'>('sub_industry');
  const [search, setSearch] = useState(''); const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  const [lat, setLat] = useState(''); const [lon, setLon] = useState(''); const [radius, setRadius] = useState('30'); const [unit, setUnit] = useState('mi');
  const [box, setBox] = useState('');
  let plan: any = {}; try { plan = JSON.parse(raw || '{}'); } catch {}
  const values = (key: string): string[] => Array.isArray(plan[key]) ? plan[key] : plan[key] ? [String(plan[key])] : [];
  const label = (value: string) => value.split('/').map(part => part.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())).join(' / ');
  const save = async (patch: Record<string, any>) => {
    setError(''); setSaving(true);
    try {
      const merged = {...plan, ...patch}; for (const key of Object.keys(merged)) if (merged[key] === null) delete merged[key];
      normalizeNativeFilters(merged); await onSave(patch);
    } catch (e: any) { setError(e.message); } finally { setSaving(false); }
  };
  const addIndustry = (value: string) => {
    if (!value) return;
    const patch: Record<string, any> = {[mode]: [...values(mode), value]};
    if (mode === 'sub_industry') patch.category = [...new Set([...values('category'), value.split('/')[0]])];
    save(patch);
  };
  const disabledNow = disabled || saving;
  const include = mode === 'sub_industry';
  const matches = NATIVE_SUBINDUSTRIES.filter(value => !values(mode).includes(value) && label(value).toLowerCase().includes(search.trim().toLowerCase()));
  const modeButton = (next: typeof mode, on: string, text: string) => <button type="button" onClick={() => setMode(next)} className={'rounded-lg px-3 py-2 text-sm font-bold ' + (mode === next ? on : 'bg-white text-slate-600')}>{text}</button>;
  const coord = (text: string, aria: string, value: string, set: (v: string) => void, placeholder?: string) => <label className="text-xs">{text}<input aria-label={aria} className="mt-1 w-full rounded border p-2" value={value} onChange={e => set(e.target.value)} placeholder={placeholder}/></label>;
  return <div className="col-span-2 space-y-5 rounded-xl border border-indigo-200 bg-indigo-50 p-4">
    <div><h4 className="font-bold text-indigo-950">Subindustries</h4><p className="mt-1 text-xs leading-5 text-indigo-800">Pick DiscoLike business types; included ones also add their parent industry.</p></div>
    <div className="flex gap-2">{modeButton('sub_industry', 'bg-emerald-600 text-white', 'Include')}{modeButton('negate_sub_industry', 'bg-rose-600 text-white', 'Exclude')}</div>
    <input aria-label="Search subindustries" className="w-full rounded-lg border border-slate-300 bg-white p-3 text-sm" placeholder="Search subindustries, e.g. roofing, SEO, lead generation" value={search} onChange={e => setSearch(e.target.value)}/>
    <p role="status" aria-live="polite" className="text-xs text-indigo-900">{matches.length} matching options to {include ? 'include' : 'exclude'}.</p>
    <div aria-label="Matching subindustries" className="max-h-64 overflow-y-auto rounded-lg border border-slate-300 bg-white p-2">
      {matches.map(value => <button key={value} type="button" disabled={disabledNow} onClick={() => addIndustry(value)} className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-indigo-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 disabled:opacity-50">{include ? 'Include' : 'Exclude'} {label(value)}</button>)}
      {!matches.length && <p className="p-3 text-sm text-slate-600">No matching subindustries. Try a shorter term or clear the search.</p>}
    </div>
    <div className="flex flex-wrap gap-2">{values(mode).map(value => <button key={value} type="button" disabled={disabledNow} onClick={() => save({[mode]: values(mode).filter(x => x !== value)})} className={'rounded-full border bg-white px-3 py-2 text-xs ' + (include ? 'border-emerald-300 text-emerald-800' : 'border-rose-300 text-rose-800')}>{label(value)} ×</button>)}</div>
    <details className="rounded-xl border border-indigo-200 bg-white"><summary className="cursor-pointer p-4 text-sm font-bold text-indigo-950">Local areas: radius or rectangle (optional)</summary>
      <div className="space-y-3 border-t p-4">
        <p className="text-xs leading-5 text-slate-600">Company locations only: up to 10 areas (max radius 1,000 km), combined with OR and limited by your other filters.</p>
        <div className="grid grid-cols-2 gap-2">
          {coord('Latitude', 'Area latitude', lat, setLat, '30.27')}{coord('Longitude', 'Area longitude', lon, setLon, '-97.74')}{coord('Radius', 'Area radius', radius, setRadius)}
          <label className="text-xs">Units<select aria-label="Radius units" className="mt-1 w-full rounded border p-2" value={unit} onChange={e => setUnit(e.target.value)}><option value="mi">Miles</option><option value="km">Kilometres</option></select></label>
        </div>
        <button type="button" disabled={disabledNow || !lat.trim() || !lon.trim()} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-50" onClick={() => save({geo: [...values('geo'), lat + ',' + lon + ',' + radius + unit]})}>Add circular area</button>
        <label className="block text-xs">Rectangle: south latitude, west longitude, north latitude, east longitude<input aria-label="Rectangle boundaries" className="mt-1 w-full rounded border p-2" value={box} onChange={e => setBox(e.target.value)} placeholder="37.2,-122.6,37.9,-122.0"/></label>
        <button type="button" disabled={disabledNow || !box.trim()} className="rounded-lg border border-indigo-300 px-3 py-2 text-sm font-bold text-indigo-900 disabled:opacity-50" onClick={() => save({bbox: [...values('bbox'), box]})}>Add rectangle</button>
        {(['geo', 'bbox'] as const).map(key => values(key).map((value, i) => <div key={key + i} className="flex items-center justify-between gap-2 rounded-lg bg-indigo-50 p-2 text-xs"><span>{key === 'geo' ? 'Circle' : 'Rectangle'}: {value}</span><button type="button" disabled={disabledNow} onClick={() => save({[key]: values(key).filter((_, index) => index !== i)})}>Remove</button></div>))}
        {plan.lat != null && plan.lon != null && <div className="rounded-lg bg-indigo-50 p-2 text-xs">Search centre: {plan.lat}, {plan.lon}; radius {plan.radius || '50km'} <button type="button" disabled={disabledNow} onClick={() => save({lat: null, lon: null, radius: null})}>Remove</button></div>}
      </div>
    </details>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </div>;
}

// ---------- Email provider (ESP) snapshots ----------
const ESP_CATEGORIES = optionsFrom('Google:#2563eb|Outlook:#4f46e5|Custom Mail Server:#64748b|Zoho:#dc2626|Mimecast:#0891b2|Proofpoint:#d97706|Barracuda:#059669|Other:#9333ea|Unknown:#94a3b8').map(({value, label}) => ({name: value, color: label}));
type EspSnapshot = {
  version: 2; stage: 'production_leads'; recordId: string; total: number; counts: Record<string, number>; updatedAt: string;
  sourceCounts: {Direct: number; Generic: number; Unknown: number}; source: {spreadsheetId: string; tabs: {name: string; role: string}[]; hash: string};
} | {version: 1; stage: 'contacts_before_verification'; total: number; counts: Record<string, number>; updatedAt: string; unavailable: string[]};
function productionSpreadsheetId(link: string): string {
  return link.match(/https:\/\/docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]+)(?:[/?#]|$)/)?.[1] ?? '';
}
function parseEspSnapshot(raw: string, recordId: string, sheetLink: string, completedAt = ''): EspSnapshot | null {
  try {
    const data = JSON.parse(raw);
    const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
    if (!isCount(data?.total) || !data.counts || typeof data.counts !== 'object' || Array.isArray(data.counts) || typeof data.updatedAt !== 'string' || !Number.isFinite(Date.parse(data.updatedAt))) return null;
    if (data.version === 1 && data.stage === 'contacts_before_verification') {
      // Historical snapshot: shown, but never presented as production.
      const counts: Record<string, number> = Object.fromEntries(ESP_CATEGORIES.map(({name}) => [name, 0]));
      const reported = new Set<string>();
      let total = 0;
      for (const [provider, value] of Object.entries(data.counts)) {
        if (!isCount(value)) return null;
        const normalized = provider.trim().toLowerCase();
        const category = ['microsoft / outlook', 'microsoft', 'outlook'].includes(normalized) ? 'Outlook' : ESP_CATEGORIES.find(({name}) => name.toLowerCase() === normalized)?.name ?? (normalized ? 'Other' : 'Unknown');
        counts[category] += value; reported.add(category); total += value;
        if (!Number.isSafeInteger(total)) return null;
      }
      if (total !== data.total) return null;
      return {version: 1, stage: 'contacts_before_verification', total, counts, updatedAt: data.updatedAt, unavailable: ESP_CATEGORIES.filter(({name}) => !reported.has(name)).map(({name}) => name)};
    }
    const sheetId = productionSpreadsheetId(sheetLink);
    const tabs = data.source?.tabs;
    const sc = data.sourceCounts;
    if (data.version !== 2 || data.stage !== 'production_leads' || data.recordId !== recordId || !recordId || !sheetId || data.source?.spreadsheetId !== sheetId
      || typeof data.source?.hash !== 'string' || !/^[a-f0-9]{64}$/.test(data.source.hash)
      || !Array.isArray(tabs) || tabs.length === 0 || !tabs.every((tab: any) => typeof tab?.name === 'string' && tab.name.trim() && ['final_export', 'final_direct', 'final_generic'].includes(tab.role))
      || Object.keys(data.counts).length !== ESP_CATEGORIES.length || !ESP_CATEGORIES.every(({name}) => isCount(data.counts[name]))
      || !sc || Array.isArray(sc) || Object.keys(sc).length !== 3 || !['Direct', 'Generic', 'Unknown'].every(name => isCount(sc[name]))) return null;
    const roles = tabs.map((tab: any) => tab.role).sort().join(',');
    if (!['final_export', 'final_direct,final_generic'].includes(roles) || new Set(tabs.map((tab: any) => tab.name)).size !== tabs.length) return null;
    const providerTotal = ESP_CATEGORIES.reduce((sum, {name}) => sum + data.counts[name], 0);
    if (!Number.isSafeInteger(providerTotal) || providerTotal !== data.total || sc.Direct + sc.Generic + sc.Unknown !== data.total) return null;
    const completed = Date.parse(completedAt);
    if (Number.isFinite(completed) && Date.parse(data.updatedAt) < completed) return null;
    return data;
  } catch { return null; }
}
type EspShared = {recordId: string; sheetLink: string; productionLeads: number; finalDirect: number; finalGeneric: number; completedAt: string};
function EmailProviderSnapshot({kind, raw, recordId, sheetLink, productionLeads, finalDirect, finalGeneric, completedAt}: EspShared & {kind: 'pre_verification' | 'production'; raw: string}) {
  const parsed = useMemo(() => parseEspSnapshot(raw, recordId, sheetLink, completedAt), [raw, recordId, sheetLink, completedAt]);
  const isProd = kind === 'production';
  const snapshot = parsed?.version === (isProd ? 2 : 1) ? parsed : null;
  const production = snapshot?.version === 2 ? snapshot : null;
  const legacy = snapshot?.version === 1 ? snapshot : null;
  const unavailable = legacy?.unavailable ?? [];
  const n = (count: number) => count.toLocaleString();
  const mismatch = production && (production.total !== productionLeads || production.sourceCounts.Direct !== finalDirect || production.sourceCounts.Generic !== finalGeneric);
  let offset = 0;
  return <section aria-label={isProd ? 'Post-verification provider breakdown' : 'Pre-verification provider breakdown'} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5">
    <h4 className="font-bold text-slate-900">{isProd ? 'Post-verification · Final production' : 'Pre-verification'}</h4>
    <p className="mt-1 text-sm text-slate-500">{isProd ? 'Final output snapshot' : 'Pre-verification contacts · Historical snapshot'}</p>
    {!snapshot ? <p role="status" className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">{raw.trim()
      ? (isProd ? 'The production snapshot is invalid or out of date. No provider totals are shown.' : 'The pre-verification snapshot is invalid. No provider totals are shown.')
      : (isProd ? 'No production snapshot saved yet. It is calculated from the final output.' : 'No pre-verification snapshot saved for this list.')}</p>
    : <>
      {production && <p className="mt-3 text-sm text-slate-600">{n(production.sourceCounts.Direct)} direct · {n(production.sourceCounts.Generic)} generic{production.sourceCounts.Unknown > 0 ? ` · ${n(production.sourceCounts.Unknown)} source type unknown` : ''}. Only emails in the final output are counted.</p>}
      {legacy && <p role="status" className={`mt-3 ${AMBER_NOTE}`}>Contact candidates before verification and final selection; not a production-lead breakdown.</p>}
      {mismatch && production && <p role="status" className={`mt-3 ${AMBER_NOTE}`}>This snapshot has {n(production.total)} emails ({n(production.sourceCounts.Direct)} direct, {n(production.sourceCounts.Generic)} generic), but Airtable shows {n(productionLeads)} production leads ({n(finalDirect)} direct, {n(finalGeneric)} generic). Reconcile these; the chart uses the snapshot.</p>}
      <div className="mt-5 flex flex-wrap items-center gap-8">
        <div className="relative shrink-0" style={{width: 180, height: 180}}>
          <svg viewBox="0 0 180 180" role="img" aria-label={`${n(snapshot.total)} unique ${production ? 'production' : 'pre-verification'} emails. ${ESP_CATEGORIES.map(({name}) => `${name}: ${unavailable.includes(name) ? 'not separately reported' : snapshot.counts[name]}`).join(', ')}`}>
            <circle cx="90" cy="90" r="70" fill="none" stroke="#f1f5f9" strokeWidth="22"/>
            {snapshot.total > 0 && ESP_CATEGORIES.map(({name, color}) => {
              const share = snapshot.counts[name] / snapshot.total * 100;
              const start = offset; offset += share;
              return share > 0 ? <circle key={name} cx="90" cy="90" r="70" pathLength="100" fill="none" stroke={color} strokeWidth="22" strokeDasharray={`${share} ${100 - share}`} strokeDashoffset={-start} transform="rotate(-90 90 90)"><title>{`${name}: ${n(snapshot.counts[name])} (${share.toFixed(1)}%)`}</title></circle> : null;
            })}
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><strong className="text-2xl text-slate-900">{n(snapshot.total)}</strong><span className="text-xs text-slate-500">{production ? 'production emails' : 'candidate emails'}</span></div>
        </div>
        <ul className="min-w-0 flex-1 space-y-3" style={{minWidth: 210}}>
          {ESP_CATEGORIES.map(({name, color}) => <li key={name} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2 text-slate-700"><span className="h-3 w-3 shrink-0 rounded-full" style={{backgroundColor: color}}/>{name}</span>
            <span className="whitespace-nowrap font-semibold text-slate-900">{unavailable.includes(name) ? '—' : <>{n(snapshot.counts[name])} <span className="font-normal text-slate-500">· {snapshot.total ? (snapshot.counts[name] / snapshot.total * 100).toFixed(1) : '0.0'}%</span></>}</span>
          </li>)}
        </ul>
      </div>
      {unavailable.length > 0 && <p className={`mt-3 ${HELP}`}>— means this provider was not reported separately in this older build.</p>}
      {snapshot.total === 0 && <p className="mt-3 text-sm text-slate-500">{production ? 'No production emails in this final output.' : 'No contact candidate emails in this saved build.'}</p>}
      <p className={`mt-4 ${HELP}`}>{production ? `Saved ${new Date(production.updatedAt).toLocaleString()} from ${production.source.tabs.map(tab => tab.name).join(' + ')}.` : `Saved ${new Date(snapshot.updatedAt).toLocaleString()} at build time; later changes are not reflected.`} A saved snapshot, not a live EmailBison count.</p>
      <p className={`mt-1 ${HELP}`}>Mimecast, Proofpoint and Barracuda are security gateways; the mailbox provider behind them may differ. {production ? 'Unknown means provider evidence is missing or conflicting.' : 'Unknown means provider data was missing; unmatched providers are under Other.'}</p>
    </>}
  </section>;
}
function EmailProviderBreakdown({raw, productionRaw, ...shared}: EspShared & {raw: string; productionRaw: string}) {
  return <section aria-label="Email provider breakdown" className="space-y-4">
    <div><h3 className="font-bold text-slate-900">Email provider breakdown</h3><p className="mt-1 text-sm text-slate-500">Each chart uses its own saved cohort and date; the difference is not a verification pass rate.</p></div>
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2"><EmailProviderSnapshot kind="pre_verification" raw={raw} {...shared}/><EmailProviderSnapshot kind="production" raw={productionRaw} {...shared}/></div>
  </section>;
}

// ---------- Engine status ----------
function runDurationLabel(start: number, end: number) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 'Not recorded';
  const seconds = Math.floor((end - start) / 1000);
  if (seconds < 60) return `${seconds} sec`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes} min ${seconds % 60} sec` : `${Math.floor(minutes / 60)} hr ${minutes % 60} min`;
}
// Engine Status values while a job is waiting to run or running (written by the engine bridge).
const ENGINE_ACTIVE = ['Queued', 'Running', 'Waiting'];
function engineChip(status: string): string {
  if (status === 'Done') return 'border-emerald-300 bg-emerald-50 text-emerald-800';
  if (status === 'Failed') return 'border-red-300 bg-red-50 text-red-800';
  if (status === 'Needs Review') return 'border-amber-300 bg-amber-50 text-amber-800';
  if (ENGINE_ACTIVE.includes(status)) return 'border-blue-300 bg-blue-50 text-blue-800';
  return 'border-slate-300 bg-white text-slate-600';
}
const JOB_LABELS: Record<JobKind, string> = {
  'filters': 'Filter generation', 'company-sample': 'The first 100-company review', 'company-expansion': 'Company expansion', 'company-restart': 'Back up and restart',
  'contact-sample': 'The contact sample', 'contact-expansion': 'The contact search', 'verification': 'Verification', 'recovery': 'LeadMagic recovery',
  'enrichment-prompt': 'DiscoGen prompt preparation', 'enrichment': 'Enrichment', 'skip-enrichment': 'Skip enrichment', 'qa': 'Automated QA',
};

function SavedAutomationStatus({status, message, error, startedAt, completedAt, engineStatus, engineJobId, engineMessage, engineAction, onRequestClear}: {
  status: string; message: string; error: string; startedAt: string; completedAt: string;
  engineStatus: string; engineJobId: string; engineMessage: string; engineAction: string; onRequestClear: () => Promise<void>;
}) {
  const [now, setNow] = useState(Date.now());
  const [clearOpen, setClearOpen] = useState(false);
  const [clearAcknowledged, setClearAcknowledged] = useState(false);
  const [clearing, setClearing] = useState(false);
  const normalized = status.trim().toLowerCase();
  const running = ['running', 'waiting'].includes(normalized);
  const active = [...RUNNING].includes(normalized) || ENGINE_ACTIVE.includes(engineStatus) || Boolean(engineAction);
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active, startedAt]);
  const start = Date.parse(startedAt);
  const end = Date.parse(completedAt);
  const longRunning = running && Number.isFinite(start) && now - start >= 60 * 60 * 1000;
  const failed = ['failed', 'error'].includes(normalized) || ['Failed', 'Needs Review'].includes(engineStatus);
  const tone = failed || error ? 'border-red-200 bg-red-50 text-red-900'
    : longRunning ? 'border-amber-200 bg-amber-50 text-amber-950'
    : active ? 'border-blue-200 bg-blue-50 text-blue-950'
    : normalized === 'completed' || engineStatus === 'Done' ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
    : 'border-slate-200 bg-slate-50 text-slate-700';
  const dateLabel = (raw: string) => Number.isFinite(Date.parse(raw)) ? new Date(raw).toLocaleString() : '';
  const closeClear = () => { if (clearing) return; setClearOpen(false); setClearAcknowledged(false); };
  const confirmClear = async () => {
    if (!clearAcknowledged || clearing) return;
    setClearing(true);
    try { await onRequestClear(); setClearOpen(false); setClearAcknowledged(false); } finally { setClearing(false); }
  };
  const hasSavedStatus = Boolean(status.trim() || message.trim() || error.trim());
  // The engine writes Engine Message first; Workflow Message is the older shared field.
  const displayMessage = engineMessage.trim() || message;
  return <>
    <section aria-label="Saved automation status" className={`mt-4 rounded-xl border p-4 ${tone}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold">Automation status</h3>
        <div className="flex items-center gap-2">
          <span className={`rounded-full border px-3 py-1 text-xs font-bold ${engineChip(engineStatus)}`}>Engine: {engineStatus || 'Idle'}</span>
          <span className="rounded-full border border-current px-3 py-1 text-xs font-bold">{status || 'Not Started'}</span>
          {hasSavedStatus && <button type="button" className="rounded-md border border-current bg-white/70 px-2 py-1 text-[11px] font-bold hover:bg-white" onClick={() => setClearOpen(true)}>Clear status</button>}
        </div>
      </div>
      <div role="status" aria-live="polite" className="mt-2 whitespace-pre-wrap break-words text-sm">{displayMessage || (active ? 'The engine reports an active job. Waiting for its next update.' : 'No engine message has been saved for this list yet.')}</div>
      {engineAction && <p className="mt-2 text-xs font-semibold">Waiting for the engine to pick up: {engineAction}. It starts within about 30 seconds.</p>}
      {error && <div className="mt-3 whitespace-pre-wrap break-words rounded-lg border border-red-200 bg-white p-3 text-sm text-red-800"><strong>Saved error: </strong>{error}</div>}
      {longRunning && <p className="mt-3 text-sm font-semibold">Started over an hour ago. That is not proof of failure; read the engine message before pressing again.</p>}
      {failed && <p className="mt-3 text-sm font-semibold">Read the saved error before pressing the button again.</p>}
      {(hasSavedStatus || engineJobId) && <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs">
        {engineJobId && <span className="break-all">Engine job: {engineJobId}</span>}
        {dateLabel(startedAt) && <span>Started: {dateLabel(startedAt)}</span>}
        {!active && Number.isFinite(end) && (!Number.isFinite(start) || end >= start) && <span>Completed: {dateLabel(completedAt)}</span>}
        {running && Number.isFinite(start) && <span>Time since start: {runDurationLabel(start, now)}</span>}
      </div>}
      <p className="mt-2 text-xs opacity-75">Saved on this lead list and shared with your team; the engine updates it as the job moves.</p>
    </section>
    {clearOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-labelledby="clear-status-title">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 text-slate-900 shadow-2xl">
        <h3 id="clear-status-title" className="text-lg font-black">Clear saved automation status?</h3>
        <p className="mt-3 text-sm leading-6 text-slate-700">Clears only the processing status, workflow message and workflow error; it does not stop an engine job or change the Engine fields. Use it only once the job is stopped or stuck.</p>
        <label className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-950">
          <input type="checkbox" className="mt-0.5" checked={clearAcknowledged} onChange={event => setClearAcknowledged(event.target.checked)}/><span>I confirmed the job is stopped or stuck.</span>
        </label>
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" className="rounded-lg border border-slate-300 px-4 py-2 font-semibold hover:bg-slate-50" onClick={closeClear} disabled={clearing}>Cancel</button>
          <button type="button" className="rounded-lg bg-red-600 px-4 py-2 font-bold text-white disabled:cursor-not-allowed disabled:opacity-40" onClick={confirmClear} disabled={!clearAcknowledged || clearing}>{clearing ? 'Clearing…' : 'Clear saved status'}</button>
        </div>
      </div>
    </div>}
  </>;
}

// ---------- Static options ----------
const ACTIVE_CLIENT_STORAGE_KEY = 'dulcy.campaigns.active-client';
function savedClientFilter(): string {
  try { return window.localStorage.getItem(ACTIVE_CLIENT_STORAGE_KEY) || 'Dulcy'; } catch { return 'Dulcy'; }
}
const CAMPAIGN_THESIS_FIELD_ID = 'fldlixHfhzrd7nuSc';
const DISCOLIKE_INDUSTRY_GROUPS = 'ACCOUNTING ADVERTISING_AND_MARKETING AGRICULTURE_AND_NATURAL_RESOURCES ALCOHOL_AND_TOBACCO AUTOMOTIVE BIG_DATA_AND_ANALYTICS BIOTECHNOLOGY BLOCKCHAIN_AND_CRYPTOCURRENCY BUSINESS_PRODUCTS_AND_SERVICES CLOUD_COMPUTING COMPUTER_HARDWARE_AND_SEMICONDUCTORS CONGLOMERATES_SHELL_AND_HOLDING_COMPANIES CONSTRUCTION CONSUMER_PRODUCTS CONSUMER_SERVICES CYBERSECURITY DEFENSE_AND_AEROSPACE E-COMMERCE EDUCATION ENERGY ENGINEERING ENTERTAINMENT ENVIRONMENTAL_SERVICES FASHION_TEXTILE_AND_APPAREL FINANCIAL_SERVICES FOOD_AND_BEVERAGE GAMING_AND_ESPORTS GOVERNMENT_SERVICES HEALTHCARE HOSPITALITY HUMAN_RESOURCES INSURANCE IT_SERVICES LEGAL MANUFACTURING MEDIA MINING_AND_METALS NONPROFIT_AND_PHILANTHROPY OIL_AND_GAS PHARMACEUTICALS PRIVATE_EQUITY_AND_VENTURE_CAPITAL REAL_ESTATE RENEWABLE_ENERGY RESTAURANTS RETAIL SAAS SECURITY SOFTWARE SPORTS_AND_RECREATION SUPPLY_CHAIN_AND_PROCUREMENT TELECOMMUNICATIONS TRAVEL WELLNESS_AND_LIFESTYLE'.split(' ');
const DISCOLIKE_BUSINESS_MODELS = ['B2B', 'B2C', 'B2G', 'G2B', 'G2C', 'D2C', 'C2C', 'C2B'];
const DISCOLIKE_COUNTRY_CODES = 'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW EU LATAM MENA APAC NORDICS DACH BENELUX GCC ASEAN CEE ANZ'.split(' ');
type DiscoLikeOption = string | {value: string; label: string};
const REGION_LABELS: Record<string, string> = {EU: 'European Union', LATAM: 'Latin America', MENA: 'Middle East and North Africa', APAC: 'Asia-Pacific', NORDICS: 'Nordics', DACH: 'Germany, Austria and Switzerland', BENELUX: 'Belgium, Netherlands and Luxembourg', GCC: 'Gulf Cooperation Council', ASEAN: 'Southeast Asia', CEE: 'Central and Eastern Europe', ANZ: 'Australia and New Zealand'};
const countryDisplayNames = (() => { try { return new (Intl as any).DisplayNames(['en'], {type: 'region'}); } catch { return null; } })();
const countryLabel = (value: string) => { if (REGION_LABELS[value]) return REGION_LABELS[value]; try { return countryDisplayNames?.of(value) ?? value; } catch { return value; } };
const DISCOLIKE_COUNTRIES_REGIONS: DiscoLikeOption[] = DISCOLIKE_COUNTRY_CODES.map(value => ({value, label: countryLabel(value)}));
const DISCOLIKE_US_STATES = optionsFrom('AL:Alabama|AK:Alaska|AZ:Arizona|AR:Arkansas|CA:California|CO:Colorado|CT:Connecticut|DE:Delaware|FL:Florida|GA:Georgia|HI:Hawaii|ID:Idaho|IL:Illinois|IN:Indiana|IA:Iowa|KS:Kansas|KY:Kentucky|LA:Louisiana|ME:Maine|MD:Maryland|MA:Massachusetts|MI:Michigan|MN:Minnesota|MS:Mississippi|MO:Missouri|MT:Montana|NE:Nebraska|NV:Nevada|NH:New Hampshire|NJ:New Jersey|NM:New Mexico|NY:New York|NC:North Carolina|ND:North Dakota|OH:Ohio|OK:Oklahoma|OR:Oregon|PA:Pennsylvania|RI:Rhode Island|SC:South Carolina|SD:South Dakota|TN:Tennessee|TX:Texas|UT:Utah|VT:Vermont|VA:Virginia|WA:Washington|WV:West Virginia|WI:Wisconsin|WY:Wyoming|DC:District of Columbia');
// Lower-case state name -> code, the 50 states in the same order (no DC).
const US_STATES: Record<string, string> = Object.fromEntries(DISCOLIKE_US_STATES.filter(({value}) => value !== 'DC').map(({value, label}) => [label.toLowerCase(), value]));
const EMPLOYEE_RANGE_BUCKETS = [[1, 10], [11, 50], [51, 200], [201, 500], [501, 1000], [1001, 5000], [5001, 10000], [10001, 10001]].map(([start, end]) => ({start, end}));
const REVENUE_RANGE_STOPS = [0, 1000000, 10000000, 100000000, 1000000000, 1000000001];
const DISCOLIKE_SOCIAL_PLATFORMS: DiscoLikeOption[] = optionsFrom('amazon:Amazon Stores|applestore:Apple App Store|bluesky:Bluesky|facebook:Facebook|googleplay:Google Play|instagram:Instagram|linkedin:LinkedIn|pinterest:Pinterest|threads:Threads|tiktok:TikTok|vk:VK|x:X (Twitter)|xing:XING|yelp:Yelp|youtube:YouTube');
const DISCOLIKE_SITE_LANGUAGES: DiscoLikeOption[] = optionsFrom('en:English|sq:Albanian|ar:Arabic|az:Azerbaijani|eu:Basque|bn:Bengali|pb:Brazilian Portuguese|bg:Bulgarian|ca:Catalan|zh:Chinese (Simplified)|zt:Chinese (Traditional)|cs:Czech|da:Danish|nl:Dutch|eo:Esperanto|et:Estonian|fi:Finnish|fr:French|gl:Galician|de:German|el:Greek|he:Hebrew|hi:Hindi|hu:Hungarian|id:Indonesian|ga:Irish|it:Italian|ja:Japanese|ko:Korean|ky:Kyrgyz|lv:Latvian|lt:Lithuanian|ms:Malay|nb:Norwegian|fa:Persian|pl:Polish|pt:Portuguese|ro:Romanian|ru:Russian|sk:Slovak|sl:Slovenian|es:Spanish|sv:Swedish|sw:Swahili|th:Thai|tl:Tagalog|tr:Turkish|uk:Ukrainian|ur:Urdu|vi:Vietnamese');
const optionValue = (option: DiscoLikeOption) => typeof option === 'string' ? option : option.value;
const optionLabel = (option: DiscoLikeOption) => typeof option === 'string' ? option : option.label;
const normalizeOptionValue = (options: DiscoLikeOption[], value: string) => optionValue(options.find(option => optionValue(option).toLowerCase() === value.toLowerCase() || optionLabel(option).toLowerCase() === value.toLowerCase()) ?? value);

// ---------- Lead Lists fields ----------
const FIELD_IDS = {
  fileName: 'fldlOo9lL9jvvhGo9', sheetLink: 'fldSOTvnUxzKWXMDD', bisonListId: 'fldJ9qjlqs9taBGFE', client: 'fldEujtSLqwdpOyGD', campaign: 'fldepbn71awSjmZPV',
  numberOfLeads: 'fld2G5D1yCPFGFiVF', displayName: 'fldbg5PAnKyFHc3uy', stage: 'fld8nrebRFL0O8kgj', processingStatus: 'fldf9wpMGWg0SebHV', runId: 'fld4kyzDwnHq5V4Iy',
  startedAt: 'fldUZOY2Ubs58DQ3V', completedAt: 'fldMSv3547BOvfdmH', workflowMessage: 'fldVnH7Pn1PxlZI5b', workflowError: 'fldBiCrm8Xm1V6FxF', includeGeneric: 'fldIXN5t3bqfiZ0Wu',
  genericFootprint200: 'fldAFATYp9G26MmVj', includeDirect: 'fldfFcn3BB2RyiWer', genericVerifier: 'fldX8cOpx3TcGX2jf', directVerifier: 'fldlJtYONrHGdyXoh', leadMagicFallback: 'fldJbIiQ35ZFPsXPL',
  segRule: 'fldfmIbpySyuXFyhf', segProviders: 'fldkfozG1Mpfgq9mI', customVariables: 'fldTYRjTrpVW27tmG', sourceCount: 'fldRLtvugIxH9qun1', genericCandidateCount: 'fldejaM3vV9GMqT8K',
  directCandidateCount: 'fld1pgvOtgJL80iaK', verifiedGenericCount: 'fldd5zmRzTjz5bvPy', verifiedDirectCount: 'fldf3pl1RYHishCKV', finalGenericCount: 'fld0FHomkh3uyx0FD', finalDirectCount: 'fldQZJCpTofahmTkl',
  duplicateCount: 'fldSk4FJKAHo5yGhc', rejectedCount: 'fldllzDyi67HGc0FC', qaStatus: 'fldUB4WsLi5kq6rUy', qaSummary: 'fld9XB4gkZcizeHUg', requiredFields: 'fldWDSDICYaL9SQEa',
  duplicateCheck: 'fldgWhI2Nm2Y9c91O', finalSchema: 'fld9p2h93vRGm6D3e', sourceType: 'fldJSSY0QTMU5pzsQ', thirdPartyMethod: 'fldrwkcctpevJf4Em', domainSourceFile: 'fldVIpEks58Pgerne',
  icpDescription: 'fldcYwP7Dlq4uyC39', listThesis: 'fldg6HZIKqe8c8RtW', companyFiltersJson: 'fldC2hZQ3gSqLmi1y', includedCountries: 'fldja37uHGyGpZZLB', includedStates: 'fldoeQZ5utB7F9XkD',
  employeeRange: 'fldG2MXz5lccu7KKU', homepageKeywords: 'fldydpLzUzAJGLBBJ', companySampleSize: 'fldiedxTwtn6TikJi', companyGoodFit: 'fldAWCY4Tl9jpQtYc', companyBadFit: 'fldqaiJodYBS3GpRu',
  companyFitRate: 'fldDD7HGFq0j3Iwfp', companyValidationStatus: 'fldY1i1787UwZFOr6', companyValidationSummary: 'fld6BhZSLdGOkCJCZ', companyApproved: 'fldqGx4RU4zDYxitK', expansionTarget: 'fldYzvqGmQZxXL9AP',
  expansionApproval: 'fldCplE8kEMlL1fP3', contactPersonaDna: 'fldRIomZHeVxPWveE', contactSource: 'fldwoK7IcKH6NYgVJ', contactFiltersJson: 'fld8Y8iYpvUV4FDDX', contactSampleSize: 'fldE2XBsGSES6fT6X',
  contactGoodFit: 'fldkWL67N8ZaBIaDi', contactBadFit: 'flda4qjRC0sCeStBg', contactFitRate: 'fldbiciFuOmAzv38D', contactValidationStatus: 'fldVH77A3Ozjh4t8k', contactValidationSummary: 'fldnScb360OZ17VRt',
  contactApproved: 'fldVz983EKKiPSzjc', verificationProvider: 'fldscHbLN6C72xbRj', millionVerifierJobId: 'fld4B7jLPdcgzdkgF', leadMagicJobId: 'fld1UmiJ0PsIndCtO', verificationProviderState: 'fldflrzfkhmW7JarV',
  verificationGoodCount: 'fld8kUuSdLo5autI7', verificationRiskyCount: 'fldXl4sV7ma4YAOv7', verificationBadCount: 'fld9Jgzxc9JqeFAus', verificationCompletedAt: 'fldxehC2cjGGK8ruN',
  // Engine bridge fields (engine/src/airtable/bridge.ts).
  runsOnEngine: 'fldKPpOJP097SYrhS', engineAction: 'fldZgT9Rbnra2x5GP', engineStatus: 'fldpuekpeAVeP0Kqn', engineJobId: 'fldUjq8KXRscLHOWd', engineMessage: 'fld37FC33xjt25nSQ',
} as const;
// Fallback field names, tried when a field is not found by ID.
const FIELD_NAMES: Partial<Record<keyof typeof FIELD_IDS, string[]>> = {
  fileName: ['File Name'], displayName: ['Name of the Lead List'], campaign: ['Which Campaign?', 'Campaign', 'Campaigns'], stage: ['Lead List Stage', 'Stage'],
  genericFootprint200: ['Generic Emails Footprint 200 or Less'], leadMagicFallback: ['Use LeadMagic Fallback'], millionVerifierJobId: ['MillionVerifier Job ID'], leadMagicJobId: ['LeadMagic Job ID'],
  verificationProviderState: ['Verification Provider State'], verificationGoodCount: ['Verification Good Count'], verificationRiskyCount: ['Verification Risky Count'],
  verificationBadCount: ['Verification Bad Count'], verificationCompletedAt: ['Verification Completed At'], runsOnEngine: ['Runs on Engine'], engineAction: ['Engine Action'],
  engineStatus: ['Engine Status'], engineJobId: ['Engine Job ID'], engineMessage: ['Engine Message'],
};
// Extra Lead Lists fields: [field ID or '', ...fallback names].
const EXTRA_FIELDS: Record<string, string[]> = {
  espBreakdown: ['', 'ESP Breakdown JSON'], productionEspBreakdown: ['', 'Production ESP Breakdown JSON'], hidden: ['', 'Hide'],
  campaignThesis: ['', 'Campaign Thesis', 'Linked Campaign Thesis'], useDiscoGenDeepReview: ['', 'Use DiscoGen Deep Review'],
  deepReviewResults: ['fld0KlQqxFEG6wgfU', 'DiscoGen Review Results URL'], companyNeedsReview: ['fldmyD4PJ9mXdCJZ8', 'Company Needs Review Count'],
  deepReviewPrompt: ['fldVCKrDuXfEhxjZm', 'DiscoGen Deep Review Prompt'], deepReviewExtra: ['fldH7LfiagdudqYJn', 'DiscoGen Deep Review Additional Requirements'],
  contactQueueStatus: ['fldiRqsZug1W0Otvs', 'Contact Queue Status'],
};

const TABS: {id: Tab; label: string}[] = [
  {id: 'overview', label: 'Overview'}, {id: 'targeting', label: 'Source & ICP'}, {id: 'companies', label: 'Company Review'}, {id: 'contacts', label: 'Contact Review'},
  {id: 'verification', label: 'Verification'}, {id: 'enrichment', label: 'Enrichment'}, {id: 'qa', label: 'QA'},
];
const SENIOR = ['executive', 'vp', 'director'];
// The persona text is saved to Airtable and matched back exactly: do not edit it.
const CONTACT_ROLE_PRESETS = [
  {id: 'executives', label: 'Owners, founders & C-suite', persona: 'Owner, founder, or C-suite executive who owns company strategy, budget, growth, and major purchasing decisions.', seniority: ['executive']},
  {id: 'sales', label: 'Sales & growth', persona: 'Senior sales or business development leader responsible for pipeline, revenue growth, and the sales team.', seniority: SENIOR},
  {id: 'marketing', label: 'Marketing', persona: 'Senior marketing leader responsible for demand generation, customer acquisition, campaigns, and marketing performance.', seniority: SENIOR},
  {id: 'operations', label: 'Operations', persona: 'Senior operations leader responsible for day-to-day delivery, processes, people, and operational performance.', seniority: SENIOR},
  {id: 'finance', label: 'Finance', persona: 'Senior finance leader responsible for budgets, financial planning, purchasing oversight, and business performance.', seniority: SENIOR},
  {id: 'people', label: 'HR & recruiting', persona: 'Senior people or recruiting leader responsible for hiring, talent strategy, recruiting operations, and workforce planning.', seniority: SENIOR},
  {id: 'technical', label: 'IT & technical', persona: 'Senior technology leader responsible for technical strategy, systems, infrastructure, and technology purchasing decisions.', seniority: SENIOR},
];
function customPersonaOnly(personaText: string) {
  let customText = personaText.trim();
  for (const preset of CONTACT_ROLE_PRESETS) customText = customText.replace(preset.persona, '').trim();
  return customText.split(/\n{2,}/).map(part => part.trim()).filter(Boolean).join('\n\n');
}
const CONTACT_SENIORITY_OPTIONS = optionsFrom('executive:Executive / C-suite|vp:VP|director:Director|manager:Manager|senior_ic:Senior individual contributor|mid_level:Mid-level|entry_level:Entry-level');
const CONTACT_COUNTRY_OPTIONS = optionsFrom('US:United States|CA:Canada|GB:United Kingdom|AU:Australia|NZ:New Zealand|IE:Ireland|DE:Germany|FR:France|NL:Netherlands|BE:Belgium|CH:Switzerland|AT:Austria|ES:Spain|IT:Italy|PT:Portugal|SE:Sweden|NO:Norway|DK:Denmark|FI:Finland|PL:Poland|CZ:Czechia|AE:United Arab Emirates|SA:Saudi Arabia|IL:Israel|IN:India|SG:Singapore|JP:Japan|KR:South Korea|ZA:South Africa|MX:Mexico|BR:Brazil');
const CONTACT_REGION_OPTIONS = optionsFrom('ANZ:Australia & New Zealand|APAC:Asia-Pacific|ASEAN:Southeast Asia|BENELUX:Benelux|CEE:Central & Eastern Europe|DACH:Germany, Austria & Switzerland|EMEA:Europe, Middle East & Africa|EU:European Union|GCC:Gulf Cooperation Council|LATAM:Latin America|MENA:Middle East & North Africa|NORDICS:Nordic countries');

function inferContactGeography(text: string): {country?: string; state?: string} {
  const normalized = text.toLowerCase();
  let country = /\b(usa|u\.s\.a\.|united states|us-based|u\.s\.-based)\b/i.test(text) ? 'US' : undefined;
  const matchedStateEntry = Object.entries(US_STATES).find(([name, code]) => new RegExp(`\\b${name.replace(' ', '\\s+')}\\b`, 'i').test(text) || new RegExp(`\\b${code}\\b`).test(text));
  if (matchedStateEntry) country = 'US';
  if (!country && /\bcanada|canadian\b/.test(normalized)) country = 'CA';
  if (!country && /\b(united kingdom|uk-based|british)\b/.test(normalized)) country = 'GB';
  if (!country && /\baustralia|australian\b/.test(normalized)) country = 'AU';
  return {country, state: matchedStateEntry?.[1]};
}
// The contact filter keys this page never sends.
function stripContactKeys(filters: Record<string, any>) {
  delete filters.has_email; delete filters.department; delete filters.results_per_company;
  return filters;
}

function getCustomProperties(base: ReturnType<typeof useBase>) {
  const leadLists = base.tables.find(table => table.name === 'Lead Lists');
  const clients = base.tables.find(table => table.name === 'Workspace IDs');
  const campaigns = base.tables.find(table => table.name === 'Campaigns') ?? base.tables.find(table => table.fields?.some((field: AnyField) => field.id === CAMPAIGN_THESIS_FIELD_ID));
  return [
    {key: 'leadListsTable', label: 'Lead lists', type: 'table' as const, defaultValue: leadLists},
    {key: 'clientsTable', label: 'Clients', type: 'table' as const, defaultValue: clients},
    {key: 'campaignsTable', label: 'Campaigns', type: 'table' as const, defaultValue: campaigns},
  ];
}

// ---------- Cell helpers ----------
function fieldById(table: AnyTable | undefined, id: string, names: string[] = []): AnyField | null {
  if (!table) return null;
  return table.fields?.find((field: AnyField) => field.id === id) ?? names.map(name => table.getFieldIfExists?.(name)).find(Boolean) ?? null;
}
function value(record: AnyRecord | null, field: AnyField | null): any {
  if (!record || !field) return null;
  for (const key of [field.id, field.name, field]) {
    try { const resolved = record.getCellValue(key); if (resolved !== null && resolved !== undefined) return resolved; } catch {}
  }
  return null;
}
function display(record: AnyRecord | null, field: AnyField | null): string {
  if (!record || !field) return '';
  for (const key of [field.id, field.name, field]) {
    try { const rendered = record.getCellValueAsString(key)?.trim(); if (rendered) return rendered; } catch {}
  }
  const raw = value(record, field);
  return raw === null ? '' : String(raw);
}
function optionName(record: AnyRecord | null, field: AnyField | null): string {
  const raw = value(record, field);
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return String(raw.name ?? '');
  return display(record, field);
}
function linkedNames(record: AnyRecord | null, field: AnyField | null): string[] {
  const raw = value(record, field);
  return Array.isArray(raw) ? raw.map(item => String(item?.name ?? '')).filter(Boolean) : [];
}
function linkedIds(record: AnyRecord | null, field: AnyField | null): string[] {
  const raw = value(record, field);
  return Array.isArray(raw) ? raw.map(item => String(item?.id ?? '')).filter(Boolean) : [];
}
function comparableValues(record: AnyRecord | null, field: AnyField | null): string[] {
  if (!record || !field) return [];
  const raw = value(record, field);
  if (Array.isArray(raw)) return raw.map(item => item === null || item === undefined ? '' : typeof item === 'object' ? String(item.name ?? item.id ?? '') : String(item)).map(item => item.trim()).filter(Boolean);
  if (raw && typeof raw === 'object') return [String(raw.name ?? raw.id ?? '').trim()].filter(Boolean);
  const rendered = display(record, field).trim();
  return rendered ? [rendered] : [];
}
function numberValue(record: AnyRecord | null, field: AnyField | null): number {
  const parsed = Number(value(record, field));
  return Number.isFinite(parsed) ? parsed : 0;
}

// Manual QA changes are explicit events, never a status-observing backfill.
function manualQaUpdate(record: AnyRecord, fields: Fields, nextStatus: string, hasLocalJob: boolean): Record<string, any> {
  if (!record || !fields.qaStatus || !fields.stage) throw new Error('QA status and lead-list stage must be available before saving approval.');
  if (nextStatus && !choicesOf(fields.qaStatus).some((choice: any) => choice.name === nextStatus)) throw new Error('The selected QA status is not configured for this list.');
  const stage = optionName(record, fields.stage);
  const update: Record<string, any> = {[fields.qaStatus.id]: nextStatus ? {name: nextStatus} : null};
  if (nextStatus !== 'Passed') {
    // Keep imported history, but remove readiness when approval is withdrawn.
    if (stage === 'Ready') update[fields.stage.id] = {name: 'QA'};
    return update;
  }
  if (!['QA', 'Ready', 'Uploaded'].includes(stage)) throw new Error('Complete the lead-list workflow through QA before approving it.');
  if (!fields.processingStatus || optionName(record, fields.processingStatus) !== 'Completed') throw new Error('Wait for the current workflow to complete before approving QA.');
  // The engine clears Engine Action when it picks a press up, so a set value is still pending.
  const activeStatuses = ['running', 'queued', 'pending', 'processing', 'waiting'];
  const enginePending = ENGINE_ACTIVE.includes(optionName(record, fields.engineStatus).trim()) || Boolean(optionName(record, fields.engineAction).trim());
  if (hasLocalJob || enginePending || [fields.contactQueueStatus, fields.verificationProviderState].some(field => activeStatuses.includes(optionName(record, field).trim().toLowerCase()))) throw new Error('A workflow request is pending. Wait for it to finish before approving QA.');
  // A manual Pass is the operator's approval; automated check results and counts are left as recorded.
  if (stage !== 'Uploaded') update[fields.stage.id] = {name: 'Ready'};
  return update;
}
function manualQaReady(record: AnyRecord | null, fields: Fields): boolean {
  return optionName(record, fields.qaStatus) === 'Passed' && ['Ready', 'Uploaded'].includes(optionName(record, fields.stage));
}
function stageChip(stage: string): string {
  const normalized = stage.toLowerCase();
  if (normalized === 'ready' || normalized === 'uploaded') return OK;
  if (normalized === 'failed') return ERR;
  if (['verification', 'enrichment', 'searching', 'qa review'].includes(normalized)) return INFO;
  return 'border-purple-200 bg-purple-50 text-purple-700';
}
// Only an active contact queue overrides the processing status.
function effectiveProcessingStatus(record: AnyRecord | null, f: Fields): string {
  const queue = optionName(record, f.contactQueueStatus).trim();
  const processing = optionName(record, f.processingStatus).trim();
  return ['Queued', 'Running'].includes(queue) && ['Running', 'Processing', 'Queued', 'Waiting'].includes(processing) ? queue : processing;
}
const WORKFLOW_STAGES = ['Source & ICP', 'Company Review', 'Contact Review', 'Verification', 'Enrichment', 'QA', 'Ready'];
function workflowState(record: AnyRecord | null, f: Fields) {
  const text = (key: string) => display(record, f[key]).trim().toLowerCase();
  const count = (key: string) => numberValue(record, f[key]);
  const active = (status: string) => ['running', 'queued', 'waiting', 'processing', 'in progress', 'submitted', 'pending'].includes(status);
  const running = active(effectiveProcessingStatus(record, f).toLowerCase());
  const companyStatus = text('companyValidationStatus');
  const contactStatus = text('contactValidationStatus');
  const providerStatus = text('verificationProviderState');
  const verificationComplete = providerStatus === 'completed' && Boolean(text('verificationCompletedAt')) && count('verificationGoodCount') + count('verificationRiskyCount') + count('verificationBadCount') > 0;
  const saved = text('stage');
  let completed = Math.max(0, WORKFLOW_STAGES.findIndex(stage => stage.toLowerCase() === saved));
  if (['uploaded', 'completed'].includes(saved)) completed = 6;
  if (saved === 'source imported') completed = 1;
  if (saved === 'contacts ready') completed = 3;
  if (saved === 'qa review') completed = 5;
  // Evidence advances a stale stage, but an actively rerun section takes precedence below.
  if ((companyStatus && companyStatus !== 'not started') || count('companySampleSize') > 0 || count('sourceCount') > 0) completed = Math.max(completed, 1);
  if (value(record, f.companyApproved) || (contactStatus && contactStatus !== 'not started') || count('contactSampleSize') > 0) completed = Math.max(completed, 2);
  if (value(record, f.contactApproved) && !['needs review', 'failed'].includes(contactStatus)) completed = Math.max(completed, 3);
  if (verificationComplete) completed = Math.max(completed, 4);
  // Readiness must agree with the stored stage used by Campaign Center.
  if (manualQaReady(record, f)) completed = 6; else completed = Math.min(completed, 5);
  if (running && active(providerStatus)) completed = 3;
  if (running && active(contactStatus)) completed = 2;
  if (running && active(companyStatus)) completed = 1;
  if (active(text('contactQueueStatus'))) completed = 2;
  return {stage: WORKFLOW_STAGES[completed], completedSteps: completed, percent: Math.round(completed / 6 * 100)};
}
const workflowStage = (record: AnyRecord | null, f: Fields) => workflowState(record, f).stage;

function DualThumbRange({min, max, step = 1, lowMin = min, lowMax = max, highMin = min, highMax = max, low, high, formatValue = (value: number) => String(value), formatLowValue = formatValue, formatHighValue = formatValue, onCommit}: {
  min: number; max: number; step?: number; lowMin?: number; lowMax?: number; highMin?: number; highMax?: number; low: number; high: number;
  formatValue?: (value: number) => string; formatLowValue?: (value: number) => string; formatHighValue?: (value: number) => string; onCommit: (low: number, high: number) => void;
}) {
  const [draftLow, setDraftLow] = useState(low);
  const [draftHigh, setDraftHigh] = useState(high);
  useEffect(() => { setDraftLow(low); setDraftHigh(high); }, [low, high]);
  const span = Math.max(1, max - min);
  const lowPercent = ((draftLow - min) / span) * 100;
  const highPercent = ((draftHigh - min) / span) * 100;
  const commitLow = (value: number) => { const next = Math.min(value, draftHigh); setDraftLow(next); if (next !== low || draftHigh !== high) onCommit(next, draftHigh); };
  const commitHigh = (value: number) => { const next = Math.max(value, draftLow); setDraftHigh(next); if (draftLow !== low || next !== high) onCommit(draftLow, next); };
  return <div className="select-none touch-none"><div className="mb-2 flex justify-between text-sm font-bold text-slate-700"><span>{formatLowValue(draftLow)}</span><span>{formatHighValue(draftHigh)}</span></div><div className="relative h-8">
    <style>{`.dual-thumb-range{-webkit-appearance:none;appearance:none;position:absolute;inset:0;width:100%;height:2rem;margin:0;background:transparent;pointer-events:none}.dual-thumb-range::-webkit-slider-runnable-track{height:6px;background:transparent}.dual-thumb-range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:20px;height:20px;margin-top:-7px;border:1px solid #d8dee9;border-radius:9999px;background:#fff;box-shadow:0 1px 4px rgba(15,23,42,.18);cursor:grab;pointer-events:auto}.dual-thumb-range::-webkit-slider-thumb:active{cursor:grabbing;box-shadow:0 0 0 4px rgba(147,51,234,.15)}.dual-thumb-range::-moz-range-track{height:6px;background:transparent}.dual-thumb-range::-moz-range-thumb{width:20px;height:20px;border:1px solid #d8dee9;border-radius:9999px;background:#fff;box-shadow:0 1px 4px rgba(15,23,42,.18);cursor:grab;pointer-events:auto}`}</style>
    <div className="absolute left-2.5 right-2.5 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-slate-200"><div className="absolute inset-y-0 bg-purple-600" style={{left: `${lowPercent}%`, right: `${100 - highPercent}%`}}/></div>
    <input aria-label="Minimum" type="range" min={lowMin} max={lowMax} step={step} value={draftLow} onChange={event => setDraftLow(Math.min(Number(event.currentTarget.value), draftHigh))} onPointerUp={event => commitLow(Number(event.currentTarget.value))} onKeyUp={event => commitLow(Number(event.currentTarget.value))} className="dual-thumb-range" style={{zIndex: draftLow >= draftHigh ? 5 : 3}}/>
    <input aria-label="Maximum" type="range" min={highMin} max={highMax} step={step} value={draftHigh} onChange={event => setDraftHigh(Math.max(Number(event.currentTarget.value), draftLow))} onPointerUp={event => commitHigh(Number(event.currentTarget.value))} onKeyUp={event => commitHigh(Number(event.currentTarget.value))} className="dual-thumb-range" style={{zIndex: 4}}/>
  </div></div>;
}

class LeadListCenterErrorBoundary extends React.Component<{children: React.ReactNode}, {error: Error | null}> {
  state = {error: null as Error | null};
  static getDerivedStateFromError(error: Error) { return {error}; }
  render() {
    if (!this.state.error) return this.props.children;
    return <div className="min-h-screen bg-slate-50 p-10"><div className="mx-auto max-w-4xl rounded-3xl border border-red-200 bg-white p-8 shadow-lg">
      <div className="text-sm font-bold uppercase tracking-widest text-red-600">Lead List Center error</div>
      <h1 className="mt-3 text-2xl font-bold text-slate-900">The interface hit a runtime error</h1>
      <div className="mt-5 rounded-2xl bg-red-50 p-5 font-mono text-sm text-red-800">{this.state.error.message}</div>
      <button className="mt-5 rounded-xl bg-purple-600 px-5 py-3 font-semibold text-white" onClick={() => this.setState({error: null})}>Try again</button>
    </div></div>;
  }
}
