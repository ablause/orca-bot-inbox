// The panel <-> worker contract, declared once: src/panel.tsx and src/worker.ts both read it.
export type ItemStatus = 'needs_you' | 'in_progress' | 'waiting' | 'planned'

/** One open item of one bot, reduced to what the item itself already shows. */
export type BotItem = {
  bot: string
  number: number
  status: ItemStatus
  title: string
  /** The question the bot asked, when it asked one. */
  question: string | null
  /** What the item waits on, when it waits. */
  waitsOn: string | null
  /** The event of the question the bot asks now: an answer is tied to it, a new question is not. */
  questionId: string | null
  /** The reply the bot recommends when it asks one question: what the row offers in one gesture. */
  quickReply: { question: string; label: string } | null
  /** When an answer to that question left this panel, while the bot has not taken it yet. */
  answeredAt: number | null
  createdAt: number
  /** The chat the item belongs to, whose workspace a press opens. */
  chatId: string | null
  /** The first deadline the title, question or waits-on note names, or null. */
  deadline: Deadline | null
  /** The pull requests the bot linked to the item, as Orca last checked them. */
  prs: LinkedPr[]
  /** Set aside until then, in Orca or in this panel; null when it is not. */
  snoozedUntil: number | null
}

/** A pull request linked to an item; Orca fills its state when it has checked it, else only the ref. */
export type LinkedPr = {
  repo: string
  number: number
  url: string
  title: string | null
  state: 'open' | 'draft' | 'merged' | 'closed' | null
  checks: 'success' | 'failure' | 'pending' | null
}

export type Deadline = {
  /** As the row shows it, in the panel's language: `Dec 1`, `Friday`, or `Le 27/11`, `Vendredi`. */
  label: string
  /** The day it names, or null for a word such as "échéance" that names none. */
  at: number | null
  /** Announced as a deadline ("avant le 20/11") and already past. */
  overdue: boolean
}

/** One item to unfold, optionally with its description or history folds open. */
export type FocusRequest = { number: number; open?: ('detail' | 'history')[]; unfold?: boolean }

export type ItemDetail = {
  /** What the bot asks, at most five, each with the replies it offers (the recommended one marked). */
  decisions: { question: string; replies: { label: string; recommended: boolean }[] }[]
  /** Questions past the fifth, left to the chat. */
  moreDecisions: number
  /** The text that explains the ask: the question's own prose, else the bot's latest comment. Markdown. */
  explanation: string | null
  /** The item's description, Markdown as the bot wrote it. */
  description: string | null
  /** The activity, newest first, without what the explanation already shows. */
  history: { at: number; who: 'owner' | 'bot'; text: string }[]
}

export type Board = {
  items: BotItem[]
  /** Bots whose items could not be read, with why. */
  failures: { bot: string; reason: string }[]
  loadedAt: number
  /** Each bot's mascot as Orca draws it, a data URL keyed by bot name; a bot without one is left out. */
  avatars: Record<string, string>
  /** Items this panel set aside, which it can bring back; one set aside in Orca is only shown. */
  snoozedHere: number[]
}

declare module 'orca' {
  interface PluginRequests {
    /** Every open item of every bot on this computer, read through the `orca` CLI. */
    'board.load': { output: Board }
    /** One item's full content, as `orca bot item show` gives it. */
    'item.show': { input: { number: number }; output: ItemDetail }
    /** Shows the bot's workspace holding this chat, where the person answers. */
    'chat.open': { input: { chatId: string }; output: { opened: boolean; reason?: string } }
    /** Unfolds one item in every open panel: what a command or `orca plugin dev request` uses to show it. */
    'item.focus': { input: FocusRequest; output: { posted: boolean } }
    /** Sends the person's answers into the chat that owns the item, once the item still waits on them. */
    'item.answer': {
      input: { number: number; answers: { question: string; reply: string }[] }
      output: { sent: boolean; reason?: string }
    }
    /** Sets an item aside until a time, or brings it back with null; kept in the plugin's own store. */
    'item.snooze': { input: { number: number; until: number | null }; output: Board }
  }
  interface PluginPanelEvents {
    'item.focus': FocusRequest
    /** What the bots show changed since the panel last heard. */
    'board.changed': Board
  }
}
