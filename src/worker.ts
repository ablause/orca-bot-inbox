// The plugin's worker: reads every bot's open items through the `orca` CLI, since no host method
// lists them, and keeps reading them while Orca runs, to count what waits on you in the status bar
// and notify what newly does. It answers, changes and closes nothing; it stores only the snoozes.
import type { OrcaWorkerApi } from 'orca/worker'
import { isSnoozed, toBotItem } from './items.ts'
import { toItemDetail } from './detail.ts'
import { resolveLanguage, setLanguage, t } from './i18n.ts'
import type { Board, BotItem, ItemDetail } from './protocol.ts'
import { botAvatars } from './server/avatars.ts'
import { run } from './server/exec.ts'

/** Pages of 100, the CLI's maximum; a bot past this many open items is cut short. */
const PAGE = 100
const MAX_PAGES = 5
const PARALLEL = 3

type Runner = (args: string[]) => Promise<string>

const orcaCli: Runner = (args) => run('orca', args)

type Envelope<T> = { ok?: boolean; result?: T; error?: { message?: string } }

async function cli<T>(runner: Runner, args: string[]): Promise<T> {
  const parsed = JSON.parse(await runner([...args, '--json'])) as Envelope<T>
  if (parsed.ok === false || parsed.result === undefined) throw new Error(parsed.error?.message ?? 'no result')
  return parsed.result
}

async function botNames(runner: Runner): Promise<string[]> {
  const { bots } = await cli<{ bots?: { name?: unknown }[] }>(runner, ['bot', 'list'])
  return (bots ?? []).flatMap((bot) => (typeof bot.name === 'string' ? [bot.name] : []))
}

async function openItems(runner: Runner, bot: string): Promise<{ items: BotItem[]; cut: boolean }> {
  const items: BotItem[] = []
  let cursor: string | null = null
  for (let page = 0; page < MAX_PAGES; page++) {
    const args = ['bot', 'item', 'list', '--bot', bot, '--limit', String(PAGE)]
    if (cursor) args.push('--cursor', cursor)
    const result = await cli<{ items?: unknown[]; nextCursor?: unknown }>(runner, args)
    for (const raw of result.items ?? []) {
      const item = toBotItem(bot, raw as Parameters<typeof toBotItem>[1])
      if (item) items.push(item)
    }
    cursor = typeof result.nextCursor === 'string' ? result.nextCursor : null
    if (!cursor) break
  }
  return { items, cut: cursor !== null }
}

export async function loadBoard(
  runner: Runner = orcaCli,
  avatars: (names: string[]) => Promise<Board['avatars']> = botAvatars
): Promise<Board> {
  const names = await botNames(runner)
  const items: BotItem[] = []
  const failures: Board['failures'] = []
  for (let at = 0; at < names.length; at += PARALLEL) {
    await Promise.all(
      names.slice(at, at + PARALLEL).map((bot) =>
        openItems(runner, bot).then(
          (found) => {
            items.push(...found.items)
            if (found.cut) failures.push({ bot, reason: t().cutAt(PAGE * MAX_PAGES) })
          },
          (error: unknown) =>
            void failures.push({ bot, reason: error instanceof Error ? error.message : String(error) })
        )
      )
    )
  }
  return { items, failures, loadedAt: Date.now(), avatars: await avatars(names).catch(() => ({})), snoozedHere: [] }
}

export async function showItem(runner: Runner, number: number): Promise<ItemDetail> {
  return toItemDetail(await cli(runner, ['bot', 'item', 'show', String(number)]))
}

/** One question of the item and the reply the person chose or wrote for it. */
export type Answer = { question: string; reply: string }

const MAX_REPLY = 1000
// control characters would break the bot's reading of the message, or pass for a new line of it
const clean = (text: string) => text.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim()

/** The message the bot reads in the item's chat: whose answer it is, to what, and what to do with it. */
export function answerBody(number: number, title: string, answers: readonly Answer[]): string {
  return t().answerBody(number, title, answers)
}

/**
 * Sends the person's answer into the chat that owns the item, as Orca's mail between bots does: no
 * host or CLI call answers a question as the owner, so the bot reads it as a message and goes on.
 * The item is read again first, so an answer never lands on a question already settled.
 */
export async function answerItem(
  runner: Runner,
  number: number,
  answers: readonly Answer[],
  alreadyAnswered: string | null = null
): Promise<{ sent: boolean; reason?: string; question?: string }> {
  const given = answers
    .map((answer) => ({ question: clean(answer.question), reply: clean(answer.reply).slice(0, MAX_REPLY) }))
    .filter((answer) => answer.reply)
  if (!given.length) return { sent: false, reason: t().pickAnAnswer }
  const { item } = await cli<{
    item?: { status?: unknown; title?: unknown; owner?: { name?: unknown }; question?: { eventId?: unknown } | null }
  }>(runner, ['bot', 'item', 'show', String(number)])
  const bot = item?.owner?.name
  if (item?.status !== 'needs_you' || typeof bot !== 'string') return { sent: false, reason: t().noLongerNeedsYou }
  const question = typeof item.question?.eventId === 'string' ? item.question.eventId : ''
  if (question && question === alreadyAnswered) return { sent: false, reason: t().alreadyAnswered(bot) }
  const title = typeof item.title === 'string' ? item.title : ''
  await cli(runner, [
    'orchestration',
    'send',
    '--from',
    'plugin:bot-items',
    '--to',
    `bot:${bot}`,
    '--type',
    'status',
    '--item',
    String(number),
    '--subject',
    t().answerSubject(number),
    '--body',
    answerBody(number, title, given)
  ])
  return { sent: true, question }
}

type OpenWorkspace = (workspaceId: string) => Promise<unknown>

/** The chat's workspace, as `orca agent list` names it, shown in Orca: the person answers there. */
export async function openChat(
  runner: Runner,
  open: OpenWorkspace,
  chatId: string
): Promise<{ opened: boolean; reason?: string }> {
  const { agents } = await cli<{ agents?: { orcaSessionId?: unknown; worktreeId?: unknown }[] }>(runner, [
    'agent',
    'list'
  ])
  const workspaceId = agents?.find((agent) => agent.orcaSessionId === chatId)?.worktreeId
  if (typeof workspaceId !== 'string') return { opened: false, reason: t().chatGone }
  await open(workspaceId)
  return { opened: true }
}

/** Snoozes kept by this plugin, by item number, with the time each one ends. */
export type Snoozes = Record<string, number>

/** This panel's snoozes on top of Orca's: the later date holds, an ended one is ignored. */
export function withSnoozes(board: Board, snoozes: Snoozes, now: number): Board {
  const snoozedHere: number[] = []
  const items = board.items.map((item) => {
    const until = snoozes[String(item.number)]
    if (typeof until !== 'number' || until <= now) return item
    snoozedHere.push(item.number)
    return { ...item, snoozedUntil: Math.max(until, item.snoozedUntil ?? 0) }
  })
  return { ...board, items, snoozedHere }
}

/** Answers sent from this panel, by item number: the question they answered and when they left. */
export type Answered = Record<string, { question: string; at: number }>

/**
 * An item whose current question this panel already answered waits on its bot, not on you, until
 * the bot moves it or asks something else; then the record no longer matches and is ignored.
 */
export function withAnswers(board: Board, answered: Answered): Board {
  const items = board.items.map((item) => {
    const sent = answered[String(item.number)]
    if (!sent || item.status !== 'needs_you' || item.questionId === null || sent.question !== item.questionId)
      return item
    return {
      ...item,
      status: 'waiting' as const,
      answeredAt: sent.at,
      waitsOn: t().readingYourAnswer(item.bot, t().time(sent.at))
    }
  })
  return { ...board, items }
}

/** What waits on you now: the items that ask for you, less those set aside. */
export function waitingOnYou(board: Board, now: number): BotItem[] {
  return board.items.filter((item) => item.status === 'needs_you' && !isSnoozed(item, now))
}

/** The status bar item: a count you can read at a glance, coloured only when something waits. */
export function attentionLine(
  waiting: readonly BotItem[],
  unread: readonly string[] = []
): {
  text: string
  tone: 'neutral' | 'warning'
  tooltip: string
} {
  const bots = new Set(waiting.map((item) => item.bot)).size
  // a bot that could not be read may hold more: the count says it is a floor
  const partial = unread.length ? '+' : ''
  const missing = unread.length ? `\n${t().unreadable(unread)}` : ''
  if (!waiting.length) return { text: `Bots 0${partial}`, tone: 'neutral', tooltip: t().tooltipNothing(missing) }
  return {
    text: `Bots ${waiting.length}${partial}`,
    tone: 'warning',
    tooltip: t().tooltipWaiting(t().needYou(waiting.length), bots > 1 ? t().acrossBots(bots) : '', missing)
  }
}

/** The status bar item when no read succeeds: it says so instead of keeping a count it cannot vouch for. */
export const failedLine = (reason: string) => ({
  text: 'Bots !',
  tone: 'neutral' as const,
  tooltip: t().tooltipFailed(reason)
})

/** What newly waits on you since the last read; the first read only sets what is already known. */
export function arrivals(known: ReadonlyMap<number, string> | null, waiting: readonly BotItem[]): BotItem[] {
  return known === null ? [] : waiting.filter((item) => !known.has(item.number))
}

/**
 * What the next read compares against: what waits now, plus what an unreadable bot had, so its
 * items do not all read as new once it answers again.
 */
export function nextKnown(
  known: ReadonlyMap<number, string> | null,
  waiting: readonly BotItem[],
  unread: readonly string[]
): Map<number, string> {
  const next = new Map(waiting.map((item) => [item.number, item.bot] as const))
  for (const [number, bot] of known ?? []) if (unread.includes(bot)) next.set(number, bot)
  return next
}

/** One notification for one arrival, a single summary for several. */
export function notificationOf(items: readonly BotItem[]): { title: string; body: string } | null {
  if (!items.length) return null
  if (items.length === 1) return { title: t().notifyOne(items[0]!.bot), body: `${items[0]!.number} ${items[0]!.title}` }
  const bots = [...new Set(items.map((item) => item.bot))]
  return { title: t().notifyMany(items.length), body: bots.join(', ') }
}

/** What a read changed, without the time it was made: a panel hears of a change, not of every read. */
const fingerprint = (board: Board) => JSON.stringify([board.items, board.failures, board.snoozedHere])

/** Shows this plugin's panel: no host method does, so the CLI opens it by the key Orca gave the plugin. */
async function openPanel(runner: Runner): Promise<void> {
  const { plugins } = await cli<{ plugins?: { pluginKey?: unknown }[] }>(runner, ['plugin', 'list'])
  const key = plugins?.map((plugin) => plugin.pluginKey).find((k) => typeof k === 'string' && k.endsWith('.bot-items'))
  if (typeof key === 'string') await runner(['plugin', 'open', key, '--panel', 'bot-items', '--json'])
}

const POLL_MS = 45_000
/** An agent's status moves in bursts: one read once the burst settles. */
const SETTLE_MS = 3_000
const FRESH_MS = 15_000
const SNOOZES_KEY = 'snoozes'
const ANSWERS_KEY = 'answers'
const STATUS_ITEM = 'needs-you'

export default function activate(orca: OrcaWorkerApi): void {
  let latest: Board | null = null
  // as the CLI read it: a snooze removed must not keep the date it put on the item
  let latestRead: Board | null = null
  let shown = ''
  let known: Map<number, string> | null = null
  // two panels, the timer, or a timed-out request retried, share the read already running
  let inFlight: Promise<Board> | null = null

  async function answered(): Promise<Answered> {
    const stored = await orca.storage.get(ANSWERS_KEY).catch(() => null)
    return stored && typeof stored === 'object' && !Array.isArray(stored) ? (stored as Answered) : {}
  }

  async function snoozes(): Promise<Snoozes> {
    const stored = await orca.storage.get(SNOOZES_KEY).catch(() => null)
    return stored && typeof stored === 'object' && !Array.isArray(stored) ? (stored as Snoozes) : {}
  }

  /** Applies the snoozes, updates the count, notifies what is new, and tells the panels of a change. */
  async function publish(raw: Board): Promise<Board> {
    const now = Date.now()
    latestRead = raw
    const board = withAnswers(withSnoozes(raw, await snoozes(), now), await answered())
    latest = board
    const waiting = waitingOnYou(board, now)
    const unread = board.failures.map((failure) => failure.bot)
    await orca.host
      .call('statusBar.update', { id: STATUS_ITEM, ...attentionLine(waiting, unread) })
      .catch(() => undefined)
    const note = notificationOf(arrivals(known, waiting))
    known = nextKnown(known, waiting, unread)
    if (note) await orca.host.call('notifications.show', note).catch(() => undefined)
    const print = fingerprint(board)
    if (print !== shown) {
      shown = print
      orca.panels.post('board.changed', board)
    }
    return board
  }

  function read(): Promise<Board> {
    inFlight ??= loadBoard()
      .then(publish)
      .finally(() => {
        inFlight = null
      })
    return inFlight
  }

  const log = (error: unknown) => {
    const reason = error instanceof Error ? error.message : String(error)
    orca.log(`read failed: ${reason}`)
    void orca.host.call('statusBar.update', { id: STATUS_ITEM, ...failedLine(reason) }).catch(() => undefined)
  }
  // the Language setting picks the strings the worker writes (deadlines, status bar, notifications,
  // answers to bots): read it before the first read, and read the bots again when it changes
  const applyLanguage = async () =>
    setLanguage(resolveLanguage(await orca.settings.get('language').catch(() => undefined)))
  void applyLanguage()
    .then(() => read())
    .catch(log)
  orca.settings.onDidChange(() => {
    void applyLanguage()
      .then(() => read())
      .catch(log)
  })
  setInterval(() => void read().catch(log), POLL_MS)
  let settle: ReturnType<typeof setTimeout> | undefined
  orca.events.on('agent.status.changed', () => {
    clearTimeout(settle)
    settle = setTimeout(() => void read().catch(log), SETTLE_MS)
  })

  orca.commands.register('bot-items.open', () => openPanel(orcaCli))
  orca.panels.handle('board.load', () => (latest && Date.now() - latest.loadedAt < FRESH_MS ? latest : read()))
  orca.panels.handle('item.answer', async ({ number, answers }) => {
    const sent = await answered()
    const result = await answerItem(orcaCli, number, answers, sent[String(number)]?.question ?? null)
    if (result.sent && result.question) {
      // only what still matches an open question is kept, so the store never grows
      const open = new Map((latestRead?.items ?? []).map((item) => [String(item.number), item.questionId]))
      const kept = Object.fromEntries(Object.entries(sent).filter(([key, entry]) => open.get(key) === entry.question))
      kept[String(number)] = { question: result.question, at: Date.now() }
      await orca.storage.set(ANSWERS_KEY, kept)
      if (latestRead) await publish(latestRead)
    }
    // the bot picks it up within seconds: read again soon so the card leaves Needs you
    if (result.sent) setTimeout(() => void read().catch(log), SETTLE_MS)
    return result
  })
  orca.panels.handle('item.snooze', async ({ number, until }) => {
    const now = Date.now()
    // ended snoozes are dropped as the next one is written, so the store never grows
    const kept = Object.fromEntries(Object.entries(await snoozes()).filter(([, end]) => end > now))
    if (until === null || until <= now) {
      delete kept[String(number)]
      // brought back by hand, it is no news: only a snooze reaching its day notifies
      known?.set(number, latestRead?.items.find((item) => item.number === number)?.bot ?? '')
    } else kept[String(number)] = until
    await orca.storage.set(SNOOZES_KEY, kept)
    return latestRead ? publish(latestRead) : read()
  })
  orca.panels.handle('item.show', ({ number }) => showItem(orcaCli, number))
  orca.panels.handle('chat.open', ({ chatId }) =>
    openChat(orcaCli, (workspaceId) => orca.host.call('workspace.open', { workspaceId }), chatId)
  )
  orca.panels.handle('item.focus', (request) => {
    orca.panels.post('item.focus', { number: request.number, open: request.open ?? [], unfold: request.unfold })
    return { posted: true }
  })
}
