// Pure logic shared by the worker (reading the CLI's JSON) and the panel (grouping and sorting).
import type { BotItem, Deadline, ItemStatus, LinkedPr } from './protocol'
import { language, t, type RelativeDay } from './i18n.ts'

/** The open statuses, in the order the panel shows their groups. */
export const STATUSES: readonly ItemStatus[] = ['needs_you', 'in_progress', 'waiting', 'planned']

const OPEN = new Set<string>(STATUSES)

/** Set aside and not back yet: out of what waits on you until its day comes. */
export const isSnoozed = (item: BotItem, now: number) => item.snoozedUntil !== null && item.snoozedUntil > now

const MONTH_NAMES = [
  'janvier',
  'février|fevrier',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août|aout',
  'septembre',
  'octobre',
  'novembre',
  'décembre|decembre'
]
const MONTHS = MONTH_NAMES.join('|')
const ENGLISH_MONTH_NAMES = [
  'january|jan',
  'february|feb',
  'march|mar',
  'april|apr',
  'may',
  'june|jun',
  'july|jul',
  'august|aug',
  'september|sept|sep',
  'october|oct',
  'november|nov',
  'december|dec'
]
const ENGLISH_MONTHS = ENGLISH_MONTH_NAMES.join('|')
const ORDINAL = '(?:st|nd|rd|th)?'

/** The day each relative word names, French or English: bots write either, whatever the panel speaks. */
const RELATIVE_WORDS = new Map<string, RelativeDay>([
  ["aujourd'hui", 'today'],
  ['ce soir', 'tonight'],
  ['demain', 'tomorrow'],
  ['today', 'today'],
  ['tonight', 'tonight'],
  ['tomorrow', 'tomorrow'],
  ...['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'].map(
    (day, index) => [day, index as RelativeDay] as const
  ),
  ...['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].map(
    (day, index) => [day, index as RelativeDay] as const
  )
])
/** Words that set a deadline on their own, whatever date follows or not. */
const DEADLINE_WORDS = ['échéance', 'echeance', 'deadline', 'due', ...RELATIVE_WORDS.keys()].join('|')
/** What turns a date already past or today into a deadline rather than an event ("l'incident du 25/11"). */
const DEADLINE_CUE = /(?:avant|au plus tard|d'ici|pour|échéance|echeance|deadline)(?:\s+(?:le|au|du))?\s*$/iu
/** The same in English ("before Dec 1", "due by the 20/11"), as whole words: "nearby 25/11" is no cue. */
const ENGLISH_CUE = /(?<![\p{L}])(?:by|before|due|no later than|until|deadline)(?:\s+(?:on|the))?\s*$/iu

/**
 * `27/11`, `02/12/2026`, `2026-12-01`, `1er décembre`, `Dec 1`, `December 1st`, `1 Dec`, or a deadline
 * word; never a version (`3.4.1`) or a ratio beyond a day and month (`2/13`). A numeric date is always
 * day first: `12/01` is the 12th of January, never December the 1st.
 */
const DATE_PATTERN = new RegExp(
  [
    String.raw`(?<!\d)(?<d>0?[1-9]|[12]\d|3[01])/(?<m>0?[1-9]|1[0-2])(?:/(?<y>\d{2,4}))?(?![\d/])`,
    String.raw`(?<!\d)(?<iy>\d{4})-(?<im>\d{2})-(?<id>\d{2})(?!\d)`,
    String.raw`(?<!\d)(?<nd>\d{1,2})(?:er)?\s+(?<nm>${MONTHS})(?![\p{L}])`,
    String.raw`(?<![\p{L}])(?<em>${ENGLISH_MONTHS})\.?\s+(?<ed>\d{1,2})${ORDINAL}(?![\d\p{L}])(?:,?\s+(?<ey>\d{4})(?!\d))?`,
    String.raw`(?<!\d)(?<fd>\d{1,2})${ORDINAL}\s+(?:of\s+)?(?<fm>${ENGLISH_MONTHS})(?![\p{L}])`,
    String.raw`(?<![\p{L}])(?<word>${DEADLINE_WORDS})(?![\p{L}])`
  ].join('|'),
  'giu'
)

const monthOf = (months: readonly string[], name: string) =>
  months.findIndex((names) => names.split('|').includes(name.toLowerCase())) + 1

const DAY_MS = 86_400_000

/** The calendar day a date token names; a year left out is this year's, or next year's when that is half a year past. */
function dayOf(groups: Record<string, string | undefined>, now: number): number | null {
  const today = new Date(now)
  let day: number, month: number, year: number | null
  if (groups.d) [day, month, year] = [Number(groups.d), Number(groups.m), groups.y ? Number(groups.y) : null]
  else if (groups.iy) [day, month, year] = [Number(groups.id), Number(groups.im), Number(groups.iy)]
  else if (groups.nd) [day, month, year] = [Number(groups.nd), monthOf(MONTH_NAMES, groups.nm!), null]
  else if (groups.ed)
    [day, month, year] = [
      Number(groups.ed),
      monthOf(ENGLISH_MONTH_NAMES, groups.em!),
      groups.ey ? Number(groups.ey) : null
    ]
  else if (groups.fd) [day, month, year] = [Number(groups.fd), monthOf(ENGLISH_MONTH_NAMES, groups.fm!), null]
  else return null
  if (day < 1 || day > 31) return null
  if (year !== null && year < 100) year += 2000
  let at = new Date(year ?? today.getFullYear(), month - 1, day).getTime()
  if (year === null && at < now - 180 * DAY_MS) at = new Date(today.getFullYear() + 1, month - 1, day).getTime()
  return at
}

/** The day a relative word names: today, tomorrow, or a weekday's next occurrence. */
function relativeDay(day: RelativeDay, startOfToday: number): number {
  if (day === 'today' || day === 'tonight') return startOfToday
  if (day === 'tomorrow') return startOfToday + DAY_MS
  return startOfToday + ((day - new Date(startOfToday).getDay() + 7) % 7) * DAY_MS
}

/** Relative words only mean something near the day they were written: "demain" in a three-week-old card is long gone. */
const RELATIVE_FOR_MS = 2 * DAY_MS

/**
 * The first deadline the texts name. A date counts when it is still to come, or when a word such as
 * "avant" or "échéance" announces it, and is overdue when so announced and already past; a date
 * today or past with no such word is an event ("l'incident du 25/11") and is left out. A relative
 * word ("demain", "vendredi") counts only on a card raised in the last two days.
 */
export function deadlineOf(now: number, createdAt: number, ...texts: (string | null)[]): Deadline | null {
  const startOfToday = new Date(new Date(now).toDateString()).getTime()
  for (const text of texts) {
    if (text === null) continue
    for (const found of text.matchAll(DATE_PATTERN)) {
      const groups = found.groups ?? {}
      if (groups.word) {
        const day = RELATIVE_WORDS.get(groups.word.toLowerCase())
        // "échéance" with no day says a deadline exists somewhere, not when: a chip could only say "Échéance"
        if (day === undefined || now - createdAt > RELATIVE_FOR_MS) continue
        return { label: t().relativeDay(day), at: relativeDay(day, startOfToday), overdue: false }
      }
      const at = dayOf(groups, now)
      if (at === null) continue
      const before = text.slice(Math.max(0, found.index! - 30), found.index)
      const cued = DEADLINE_CUE.test(before) || ENGLISH_CUE.test(before)
      if (at >= startOfToday + DAY_MS) return { label: t().deadlineOn(found[0], at), at, overdue: false }
      if (cued)
        return at < startOfToday
          ? { label: t().overdueSince(found[0], at), at, overdue: true }
          : { label: t().dueToday, at, overdue: false }
    }
  }
  return null
}

/** The label of `deadlineOf` for a card raised now. */
export function dateMention(now: number, ...texts: (string | null)[]): string | null {
  return deadlineOf(now, now, ...texts)?.label ?? null
}

/** A word that reads as a name: capitalised (`Kinkslap`, `CRM`) or a slug (`youinv-web`, `v2`). */

type RawDecision = { question?: unknown; replies?: { label?: unknown; recommended?: unknown }[] }

/** One question with a recommended reply: the row can offer it; several questions need the detail. */
function quickReplyOf(raw: RawItem['question']): BotItem['quickReply'] {
  const decisions = Array.isArray(raw?.decisions) ? (raw!.decisions as RawDecision[]) : []
  if (decisions.length !== 1) return null
  const question = text(decisions[0]!.question)
  const recommended = (decisions[0]!.replies ?? []).find((reply) => reply?.recommended === true)
  const label = text(recommended?.label)
  return question && label ? { question, label } : null
}
type RawItem = {
  number?: unknown
  status?: unknown
  title?: unknown
  createdAt?: unknown
  question?: { eventId?: unknown; text?: unknown; gist?: unknown; decisions?: unknown } | null
  wait?: { text?: unknown } | null
  chat?: { id?: unknown } | null
  links?: unknown
  snoozedUntil?: unknown
}

type RawLink = {
  kind?: unknown
  ref?: unknown
  pr?: { url?: unknown; title?: unknown; state?: unknown; checks?: unknown } | null
}

const PR_REF = /^([\w.-]+\/[\w.-]+)#(\d+)$/
const PR_STATES = new Set(['open', 'draft', 'merged', 'closed'])
const CHECKS = new Set(['success', 'failure', 'pending'])

/** The item's pull request links, each with the state Orca cached for it, once per pull request. */
export function linkedPrs(links: unknown): LinkedPr[] {
  if (!Array.isArray(links)) return []
  const seen = new Set<string>()
  return (links as RawLink[]).flatMap((link) => {
    const match = link?.kind === 'pr' && typeof link.ref === 'string' ? PR_REF.exec(link.ref) : null
    if (!match || seen.has(link.ref as string)) return []
    seen.add(link.ref as string)
    const [, repo, number] = match as unknown as [string, string, string]
    const pr = link.pr ?? null
    const url =
      typeof pr?.url === 'string' && pr.url.startsWith('https://')
        ? pr.url
        : `https://github.com/${repo}/pull/${number}`
    return [
      {
        repo,
        number: Number(number),
        url,
        title: text(pr?.title),
        state: typeof pr?.state === 'string' && PR_STATES.has(pr.state) ? (pr.state as LinkedPr['state']) : null,
        checks: typeof pr?.checks === 'string' && CHECKS.has(pr.checks) ? (pr.checks as LinkedPr['checks']) : null
      }
    ]
  })
}

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null)

/** What the bot asks: its decisions' own questions, else the gist, else the first line of the text. */
function questionOf(raw: RawItem['question']): string | null {
  if (!raw) return null
  const decisions = Array.isArray(raw.decisions)
    ? (raw.decisions as RawDecision[]).map((decision) => text(decision.question)).filter((q) => q !== null)
    : []
  if (decisions.length) return decisions.join(' · ')
  return text(raw.gist) ?? text(raw.text)?.split('\n')[0] ?? null
}

/** One row of `orca bot item list --json`, or null when it is closed or not an item. */
export function toBotItem(bot: string, raw: RawItem, now = Date.now()): BotItem | null {
  const status = raw.status
  const title = text(raw.title)
  if (typeof status !== 'string' || !OPEN.has(status) || typeof raw.number !== 'number' || !title) return null
  const question = questionOf(raw.question)
  const waitsOn = status === 'waiting' ? text(raw.wait?.text) : null
  const createdAt = typeof raw.createdAt === 'number' ? raw.createdAt : now
  return {
    bot,
    number: raw.number,
    status: status as ItemStatus,
    title,
    question,
    questionId: typeof raw.question?.eventId === 'string' ? raw.question.eventId : null,
    answeredAt: null,
    quickReply: status === 'needs_you' ? quickReplyOf(raw.question) : null,
    waitsOn,
    createdAt,
    chatId: typeof raw.chat?.id === 'string' ? raw.chat.id : null,
    deadline: deadlineOf(now, createdAt, title, question, waitsOn),
    prs: linkedPrs(raw.links),
    snoozedUntil: typeof raw.snoozedUntil === 'number' && raw.snoozedUntil > now ? raw.snoozedUntil : null
  }
}

/**
 * Items with a deadline first, the nearest first, an "échéance" that names no day after every
 * dated one; then the oldest. The number breaks a tie so the order never flickers.
 */
export function compareItems(a: BotItem, b: BotItem): number {
  if (!a.deadline !== !b.deadline) return a.deadline ? -1 : 1
  if (a.deadline && b.deadline) {
    const gap = (a.deadline.at ?? Number.MAX_SAFE_INTEGER) - (b.deadline.at ?? Number.MAX_SAFE_INTEGER)
    if (gap) return gap
  }
  return a.createdAt - b.createdAt || a.number - b.number
}

export type Filters = { bot: string | null }

export function applyFilters(items: readonly BotItem[], filters: Filters): BotItem[] {
  return items.filter((item) => filters.bot === null || item.bot === filters.bot)
}

export type Group = { status: ItemStatus; label: string; items: BotItem[] }

/** Non-empty groups in their fixed order, each sorted by `compareItems`. */
export function groupItems(items: readonly BotItem[]): Group[] {
  return STATUSES.map((status) => ({
    status,
    label: t().status[status],
    items: items.filter((item) => item.status === status).sort(compareItems)
  })).filter((group) => group.items.length > 0)
}

export function needsYou(items: readonly BotItem[]): { count: number; oldestAt: number | null } {
  const waiting = items.filter((item) => item.status === 'needs_you')
  const oldestAt = waiting.length ? Math.min(...waiting.map((item) => item.createdAt)) : null
  return { count: waiting.length, oldestAt }
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** A short age: "5m", "3h", "12d" in English, "5 min", "3 h", "12 j" in French. */
export function ageLabel(since: number, now: number): string {
  const elapsed = Math.max(0, now - since)
  if (elapsed < HOUR) return t().age(Math.max(1, Math.floor(elapsed / MINUTE)), 'minute')
  if (elapsed < DAY) return t().age(Math.floor(elapsed / HOUR), 'hour')
  return t().age(Math.floor(elapsed / DAY), 'day')
}

/** Cuts at a word before `max` characters, so a long question stays a glance, not a paragraph. */
export function shorten(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat.length <= max) return flat
  const cut = flat.slice(0, max - 1)
  const space = cut.lastIndexOf(' ')
  return `${(space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:·-]+$/, '')}…`
}

/** A row's age: short while recent, then the day it was raised, since "45 j" reads worse than a date. */
export function whenLabel(since: number, now: number): string {
  if (now - since < 7 * DAY) return ageLabel(since, now)
  return t().shortDate(since)
}

/** Distinct values for a filter, in the alphabetical order of the language in use. */
export function choices(values: readonly (string | null)[]): string[] {
  return [...new Set(values.filter((value): value is string => value !== null))].sort((a, b) =>
    a.localeCompare(b, language())
  )
}
