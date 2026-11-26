// One item's full content, from `orca bot item show --json`, shaped for the detail view: the
// decision first (questions and replies), the text that explains it, then the description and an
// activity log that does not repeat what is already above it.
import type { ItemDetail } from './protocol'
import { t } from './i18n.ts'

/** Lists in the detail view stop at five, as the owner's reading style asks. */
export const MAX_DECISIONS = 5
const MAX_HISTORY = 20

type RawEvent = {
  kind?: unknown
  at?: unknown
  actor?: { kind?: unknown } | null
  data?: Record<string, unknown> | null
}
type RawDecision = { question?: unknown; replies?: { label?: unknown; recommended?: unknown }[] }
type RawShow = {
  item?: {
    description?: unknown
    question?: { text?: unknown; gist?: unknown; decisions?: RawDecision[] } | null
  }
  events?: RawEvent[]
}

const str = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null)

/** Markdown links keep their text only, in one-line places such as the history. */
export function plainText(markdown: string): string {
  return markdown
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
}

/** The question's prose before its numbered or bulleted decisions: what explains the ask. */
export function contextOf(text: string, decisions: string[], replies: string[] = []): string | null {
  const lines = text.split('\n')
  const first = lines.findIndex((line) => {
    const bare = line
      .replace(/^\s*(?:\d+[.)]|[-*])\s+/, '')
      .replace(/\s*\(recommended\)\s*$/, '')
      .trim()
    // the prose ends at the first decision, or at the first reply when the decision line differs
    return bare !== '' && (decisions.includes(bare) || (/^\s*[-*]\s/.test(line) && replies.includes(bare)))
  })
  const prose = (first < 0 ? lines : lines.slice(0, first)).join('\n').trim()
  return prose && !decisions.includes(prose) ? prose : null
}

function firstLine(text: string): string {
  return plainText(text.split('\n').find((line) => line.trim()) ?? text).trim()
}

function eventText(event: RawEvent): string | null {
  const data = event.data ?? {}
  switch (event.kind) {
    case 'commented':
      return str(data.text) && firstLine(str(data.text)!)
    case 'status': {
      if (data.from === data.to) return null
      const to = (t().status as Record<string, string>)[String(data.to)] ?? String(data.to)
      return data.cause === 'answer' ? t().movedAfterAnswer(to) : t().moved(to)
    }
    case 'made':
      return t().created
    case 'edited': {
      const fields = Array.isArray(data.fields)
        ? data.fields.map((field) => t().fields[String(field)] ?? String(field))
        : []
      return fields.length ? t().editedFields(fields.join(', ')) : t().edited
    }
    default:
      return null
  }
}

const sameText = (a: string, b: string) => a.replace(/\s+/g, ' ').trim() === b.replace(/\s+/g, ' ').trim()

export function toItemDetail(raw: RawShow): ItemDetail {
  const item = raw.item ?? {}
  const asked = item.question ?? null
  const decisions = (asked?.decisions ?? []).flatMap((decision) => {
    const question = str(decision.question)
    if (!question) return []
    const replies = (decision.replies ?? []).flatMap((reply) =>
      str(reply.label) ? [{ label: str(reply.label)!, recommended: reply.recommended === true }] : []
    )
    return [{ question, replies }]
  })
  const askedText = str(asked?.text)
  const fromQuestion = askedText
    ? contextOf(
        askedText,
        decisions.map((decision) => decision.question),
        decisions.flatMap((decision) => decision.replies.map((reply) => reply.label))
      )
    : null
  // a question with no decision block is itself the ask
  const loneQuestion = askedText && !decisions.length ? (fromQuestion ?? askedText) : null

  const events = (raw.events ?? []).filter((event) => typeof event.at === 'number')
  const comments = events
    .filter((event) => event.kind === 'commented' && event.actor?.kind !== 'owner' && str(event.data?.text))
    .sort((a, b) => (b.at as number) - (a.at as number))
  const latestComment = comments[0] ? str(comments[0].data?.text)! : null
  const explanation = loneQuestion ? null : (fromQuestion ?? latestComment)

  const history = events
    .filter((event) => {
      const said = str(event.data?.text)
      // the comment shown above, or the one that only restates the question, is not listed twice
      if (
        event.kind === 'commented' &&
        said &&
        explanation &&
        (sameText(said, explanation) || said.includes(explanation))
      )
        return false
      if (event.kind === 'commented' && said && askedText && sameText(said, askedText)) return false
      return true
    })
    .flatMap((event) => {
      const said = eventText(event)
      return said
        ? [
            {
              at: event.at as number,
              who: event.actor?.kind === 'owner' ? ('owner' as const) : ('bot' as const),
              text: said
            }
          ]
        : []
    })
    .sort((a, b) => b.at - a.at)

  return {
    decisions: loneQuestion ? [{ question: loneQuestion, replies: [] }] : decisions.slice(0, MAX_DECISIONS),
    moreDecisions: Math.max(0, decisions.length - MAX_DECISIONS),
    explanation,
    description: str(item.description),
    history: history.slice(0, MAX_HISTORY)
  }
}
