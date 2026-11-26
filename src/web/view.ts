// What the panel draws, computed from the board and the person's choices, with no DOM: tested in Node.
import { ageLabel, applyFilters, choices, groupItems, isSnoozed, needsYou, whenLabel } from '../items'
import { language, t } from '../i18n'

export { isSnoozed }
import type { Board, BotItem, ItemStatus, LinkedPr } from '../protocol'

/** Rows shown before "Show N more": more for what waits on you, so the folded headers stay near. */
export const ROW_CAP = 6
export const NEEDS_YOU_CAP = 10
export const DEFAULT_OPEN: GroupKey[] = ['needs_you', 'in_progress']

/** A status group, or the items set aside until a later day, whatever their status. */
export type GroupKey = ItemStatus | 'snoozed'

export type Choices = {
  bot: string | null
  open: GroupKey[]
  uncapped: GroupKey[]
}

export type BotChip = { name: string; avatar: string | null; needsYou: number; open: number }

export type GroupView = {
  status: GroupKey
  label: string
  count: number
  open: boolean
  rows: BotItem[]
  hidden: number
  /** Unfolded past its cap, so "Show less" can fold it back. */
  canCollapse: boolean
}

export type View = {
  headline: string | null
  since: string | null
  bots: BotChip[]
  bot: string | null
  groups: GroupView[]
  empty: 'none' | 'filtered' | null
}

/** The bots in the strip: those with something waiting on you first, then by name. */
function botChips(board: Board): BotChip[] {
  return choices(board.items.map((item) => item.bot))
    .map((name) => {
      const own = board.items.filter((item) => item.bot === name)
      return {
        name,
        avatar: board.avatars[name] ?? null,
        needsYou: own.filter((item) => item.status === 'needs_you' && !isSnoozed(item, board.loadedAt)).length,
        open: own.length
      }
    })
    .sort((a, b) => b.needsYou - a.needsYou || a.name.localeCompare(b.name, language()))
}

export function buildView(board: Board, chosen: Choices): View {
  const bots = botChips(board)
  // a stored choice whose bot left the board falls back to all, instead of hiding everything
  const bot = chosen.bot !== null && bots.some((chip) => chip.name === chosen.bot) ? chosen.bot : null
  const now = board.loadedAt
  const filtered = applyFilters(board.items, { bot })
  const shown = filtered.filter((item) => !isSnoozed(item, now))
  const snoozed = filtered
    .filter((item) => isSnoozed(item, now))
    .sort((a, b) => (a.snoozedUntil ?? 0) - (b.snoozedUntil ?? 0) || a.number - b.number)
  const { count, oldestAt } = needsYou(shown)
  const waitingBots = new Set(shown.filter((item) => item.status === 'needs_you').map((item) => item.bot)).size
  const sections: { status: GroupKey; label: string; items: BotItem[] }[] = [
    ...groupItems(shown),
    ...(snoozed.length ? [{ status: 'snoozed' as const, label: t().snoozedGroup, items: snoozed }] : [])
  ]
  const groups = sections.map((group) => {
    const uncapped = chosen.uncapped.includes(group.status)
    const cap = group.status === 'needs_you' ? NEEDS_YOU_CAP : ROW_CAP
    const rows = uncapped ? group.items : group.items.slice(0, cap)
    return {
      status: group.status,
      label: group.label,
      count: group.items.length,
      open: chosen.open.includes(group.status),
      rows,
      hidden: group.items.length - rows.length,
      canCollapse: uncapped && group.items.length > cap
    }
  })
  const strings = t()
  return {
    headline:
      count === 0
        ? null
        : bot !== null
          ? strings.forBot(bot, strings.needYou(count))
          : `${strings.needYou(count)}${waitingBots > 1 ? strings.acrossBots(waitingBots) : ''}`,
    since:
      oldestAt === null
        ? null
        : now - oldestAt < 7 * 86_400_000
          ? strings.oldestFor(ageLabel(oldestAt, now))
          : strings.oldestSince(whenLabel(oldestAt, now)),
    bots,
    bot,
    groups,
    empty: groups.length ? null : board.items.length ? 'filtered' : 'none'
  }
}

/** What a row says it waits on: the bot's question, else its waits-on note. */
export function askOf(item: BotItem): string | null {
  return item.question ?? (item.waitsOn ? t().waitsOn(item.waitsOn) : null)
}

export const moreLabel = (hidden: number) => t().more(hidden)

/** What a linked pull request needs, worst first: `rank` orders them, `tone` colours the chip. */
export function prSummary(pr: LinkedPr): { label: string; tone: '' | 'danger' | 'success' | 'muted'; rank: number } {
  const labels = t().pr
  if (pr.state === 'open' && pr.checks === 'failure') return { label: labels.failing, tone: 'danger', rank: 0 }
  if (pr.state === 'open' && pr.checks === 'pending') return { label: labels.running, tone: '', rank: 1 }
  if (pr.state === 'open')
    return { label: pr.checks === 'success' ? labels.passed : labels.open, tone: 'success', rank: 2 }
  if (pr.state === 'draft') return { label: labels.draft, tone: '', rank: 3 }
  if (pr.state === null) return { label: `#${pr.number}`, tone: '', rank: 4 }
  return { label: pr.state === 'merged' ? labels.merged : labels.closed, tone: 'muted', rank: 5 }
}

const MORNING_HOUR = 9

function morning(from: number, days: number): number {
  const date = new Date(from)
  date.setDate(date.getDate() + days)
  date.setHours(MORNING_HOUR, 0, 0, 0)
  return date.getTime()
}

/** Tomorrow, next Monday and a week from now, each at nine in the morning, local time. */
export function snoozeChoices(now: number): { label: string; until: number; name: string; when: string }[] {
  const weekday = new Date(now).getDay()
  const toMonday = (8 - weekday) % 7 || 7
  const strings = t().snooze
  const choices = [
    { label: strings.tomorrow, until: morning(now, 1) },
    { label: strings.monday, until: morning(now, toMonday) },
    { label: strings.week, until: morning(now, 7) }
  ]
  // on a Sunday Monday is tomorrow, on a Monday it is a week out: the first name of a day wins
  return choices
    .filter((choice, index) => choices.findIndex((other) => other.until === choice.until) === index)
    .map((choice) => ({ ...choice, name: strings.name(choice.until), when: strings.when(choice.until) }))
}
