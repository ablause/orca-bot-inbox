// The panel: a header that says what waits on you, a strip of bot tiles to filter by, then the
// items grouped by status. A press unfolds an item; its bot's chat is one more press away.
import { html, useEffect, useMemo, useRef, useState } from '../vendor/preact.mjs'
import { whenLabel } from '../items'
import { t } from '../i18n'
import type { Board, BotItem, FocusRequest, ItemDetail, LinkedPr } from '../protocol'
import { plainText } from '../detail'
import { parseInline, parseMarkdown, type Inline } from './markdown'
import {
  askOf,
  buildView,
  DEFAULT_OPEN,
  isSnoozed,
  moreLabel,
  prSummary,
  snoozeChoices,
  type BotChip,
  type GroupKey,
  type GroupView
} from './view'

const REFRESH_EVERY_MS = 3 * 60_000
const SEEN_KEY = 'seen'
/** How long a reply sent from a row can still be taken back. */
const UNDO_MS = 4_000
const FIRST_READ_RETRIES = 3
const RETRY_AFTER_MS = 3_000

const PATHS = {
  refresh: [
    'M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8',
    'M21 3v5h-5',
    'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16',
    'M8 16H3v5'
  ],
  chevron: ['m9 18 6-6-6-6'],
  keyboard: [
    'M10 8h.01',
    'M12 12h.01',
    'M14 8h.01',
    'M16 12h.01',
    'M18 8h.01',
    'M6 8h.01',
    'M7 16h10',
    'M8 12h.01',
    'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z'
  ],
  clock: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M12 7v5l3 2'],
  check: ['M20 6 9 17l-5-5'],
  external: ['M15 3h6v6', 'M10 14 21 3', 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6']
} as const

function Icon({ name, size = 14, spin = false }: { name: keyof typeof PATHS; size?: number; spin?: boolean }) {
  return html`<svg
    class=${`icon${spin ? ' spin' : ''}`}
    width=${size}
    height=${size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    ${PATHS[name].map((d) => html`<path d=${d} />`)}
  </svg>`
}

/** Linear-style status rings: needs you is a filled amber dot, in progress half full, waiting a quarter, planned dashed. */
function StatusRing({ status }: { status: GroupKey }) {
  if (status === 'snoozed')
    return html`<svg class="icon" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <circle cx="7" cy="7" r="5.5" fill="none" stroke="var(--waiting)" stroke-width="1.5" />
      <path d="M7 4.2V7l1.9 1.2" fill="none" stroke="var(--waiting)" stroke-width="1.3" stroke-linecap="round" />
    </svg>`
  const color = {
    needs_you: 'var(--needs)',
    in_progress: 'var(--progress)',
    waiting: 'var(--waiting)',
    planned: 'var(--waiting)'
  }[status]
  return html`<svg class="icon" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
    <circle
      cx="7"
      cy="7"
      r="5.5"
      fill="none"
      stroke=${color}
      stroke-width="1.5"
      stroke-dasharray=${status === 'planned' ? '2 1.6' : 'none'}
    />
    ${status === 'needs_you' ? html`<circle cx="7" cy="7" r="2.6" fill=${color} />` : null}
    ${status === 'in_progress' ? html`<path d="M7 3.5 A3.5 3.5 0 0 1 7 10.5 Z" fill=${color} />` : null}
    ${status === 'waiting' ? html`<path d="M7 7 L7 3.5 A3.5 3.5 0 0 1 10.5 7 Z" fill=${color} />` : null}
  </svg>`
}

function Avatar({ name, src, size }: { name: string; src: string | null; size: number }) {
  if (src)
    return html`<img
      class="avatar"
      src=${src}
      alt=""
      width=${size}
      height=${size}
      style=${`width:${size}px;height:${size}px`}
    />`
  const initials = name
    .split(/\s+/)
    .map((word) => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
  return html`<span class="avatar fallback" style=${`width:${size}px;height:${size}px`} aria-hidden="true"
    >${initials}</span
  >`
}

function BotStrip({
  bots,
  current,
  onPick
}: {
  bots: BotChip[]
  current: string | null
  onPick: (bot: string | null) => void
}) {
  const strings = t().panel
  return html`<div class="bots" role="group" aria-label=${strings.filterByBot}>
    <button class="bot all" aria-pressed=${current === null} onClick=${() => onPick(null)}>${strings.all}</button>
    ${bots.map(
      (bot) =>
        html`<button
          class="bot"
          aria-pressed=${current === bot.name}
          title=${strings.botTitle(bot.name, bot.needsYou, bot.open)}
          aria-label=${strings.botLabel(bot.name, bot.needsYou)}
          onClick=${() => onPick(current === bot.name ? null : bot.name)}
        >
          <${Avatar} name=${bot.name} src=${bot.avatar} size=${26} />
          ${bot.needsYou ? html`<span class="count" aria-hidden="true">${bot.needsYou}</span>` : null}
        </button>`
    )}
  </div>`
}

type DetailState =
  { status: 'loading' } | { status: 'ready'; detail: ItemDetail } | { status: 'failed'; reason: string }

/** Past this many characters the description folds under "Details", so the decision stays on screen. */
const LONG_DESCRIPTION = 480
const HISTORY_SHOWN = 5

function InlineText({ parts }: { parts: Inline[] }) {
  return parts.map((part) =>
    part.kind === 'strong'
      ? html`<strong>${part.text}</strong>`
      : part.kind === 'em'
        ? html`<em>${part.text}</em>`
        : part.kind === 'code'
          ? html`<code>${part.text}</code>`
          : part.text
  )
}

function Markdown({ source }: { source: string }) {
  return html`<div class="md">
    ${parseMarkdown(source).map((block) => {
      switch (block.kind) {
        case 'heading':
          return html`<p class=${`md-h md-h${Math.min(block.level, 3)}`}><${InlineText} parts=${block.inline} /></p>`
        case 'paragraph':
          return html`<p><${InlineText} parts=${block.inline} /></p>`
        case 'quote':
          return html`<blockquote><${InlineText} parts=${block.inline} /></blockquote>`
        case 'code':
          return html`<pre><code>${block.text}</code></pre>`
        case 'rule':
          return html`<hr />`
        case 'list':
          return block.ordered
            ? html`<ol>
                ${block.items.map((parts) => html`<li><${InlineText} parts=${parts} /></li>`)}
              </ol>`
            : html`<ul>
                ${block.items.map((parts) => html`<li><${InlineText} parts=${parts} /></li>`)}
              </ul>`
      }
    })}
  </div>`
}

/** A fold with its label and a count, as the groups have: closed until the person opens it. */
function Fold({
  label,
  note,
  open,
  onToggle,
  children
}: {
  label: string
  note?: string
  open: boolean
  onToggle: () => void
  children: unknown
}) {
  return html`<section class="fold">
    <button class="fold-head" aria-expanded=${open} onClick=${onToggle}>
      <span class="chevron"><${Icon} name="chevron" size=${11} /></span>
      <span class="fold-label">${label}</span>
      ${note ? html`<span class="muted tabular">${note}</span>` : null}
    </button>
    ${open ? html`<div class="fold-body">${children}</div>` : null}
  </section>`
}

/** The pull requests linked to the item, each opening on GitHub: merging stays where its checks are. */
function PullRequests({ prs }: { prs: LinkedPr[] }) {
  if (!prs.length) return null
  return html`<section class="prs" aria-label=${t().panel.linkedPrs}>
    ${prs.map((pr) => {
      const summary = prSummary(pr)
      return html`<button
        class="pr"
        title=${pr.url}
        aria-label=${t().panel.openPr(`${pr.repo}#${pr.number}`, pr.state ? summary.label : null)}
        onClick=${() => void orca.shell?.openExternal(pr.url)}
      >
        ${pr.state ? html`<span class=${`chip ${summary.tone}`}>${summary.label}</span>` : html`<span class="chip muted">PR</span>`}
        <span class="pr-title clamp1">${pr.title ?? `${pr.repo}#${pr.number}`}</span>
        <span class="muted tabular">${pr.title ? `${pr.repo.split('/')[1]}#${pr.number}` : ''}</span>
        <${Icon} name="external" size=${11} />
      </button>`
    })}
  </section>`
}

/**
 * Sets the item aside until a later morning, or brings it back; a snooze made in Orca is only
 * shown. A quiet action beside the answer, never its equal: its menu names each day and hour.
 */
function Snooze({
  item,
  local,
  onSnooze
}: {
  item: BotItem
  local: boolean
  onSnooze: (until: number | null) => void
}) {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLSpanElement | null>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)
  const now = Date.now()
  const strings = t().panel
  const close = (refocus: boolean) => {
    setOpen(false)
    if (refocus) trigger.current?.focus()
  }
  useEffect(() => {
    if (!open) return
    anchor.current?.querySelector<HTMLButtonElement>('.menu button')?.focus()
    const outside = (event: PointerEvent) => {
      if (!anchor.current?.contains(event.target as Node)) close(false)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])
  if (isSnoozed(item, now))
    return local
      ? html`<button class="quiet" onClick=${() => onSnooze(null)}>
          <${Icon} name="clock" size=${13} />${strings.snoozedBringBack(dayLabel(item.snoozedUntil!))}
        </button>`
      : html`<span class="quiet static"
          ><${Icon} name="clock" size=${13} />${strings.snoozedInOrca(dayLabel(item.snoozedUntil!))}</span
        >`
  return html`<span
    class="menu-anchor"
    ref=${anchor}
    onKeyDown=${(event: KeyboardEvent) => {
      if (event.key === 'Escape' && open) {
        event.stopPropagation()
        close(true)
      }
    }}
    onFocusOut=${(event: FocusEvent) => {
      if (open && !anchor.current?.contains(event.relatedTarget as Node | null)) close(false)
    }}
  >
    <button
      class="quiet"
      ref=${trigger}
      aria-expanded=${open}
      aria-controls=${`snooze-${item.number}`}
      onClick=${() => setOpen(!open)}
    >
      <${Icon} name="clock" size=${13} />${strings.snooze}
    </button>
    ${
      open
        ? html`<span class="menu" id=${`snooze-${item.number}`} aria-label=${strings.snoozeMenu}>
            ${snoozeChoices(now).map(
              (choice) =>
                html`<button
                  aria-label=${choice.name}
                  onClick=${() => {
                    setOpen(false)
                    onSnooze(choice.until)
                  }}
                >
                  <span>${choice.label[0]!.toUpperCase()}${choice.label.slice(1)}</span>
                  <span class="muted tabular">${choice.when}</span>
                </button>`
            )}
          </span>`
        : null
    }
  </span>`
}

/** The detail's first line after the bot's name: what the bot does with the card now. */
function waitLine(item: BotItem): string {
  const line = t().panel.waitLine
  if (item.status === 'needs_you') return line.needsYou
  if (item.status === 'waiting') return item.answeredAt ? line.answered : line.waiting
  if (item.status === 'in_progress') return line.working
  return line.planned
}

const dayLabel = (at: number) => t().dayLabel(at)

function Detail({
  item,
  state,
  onOpenChat,
  openNote,
  snoozedHere,
  onSnooze,
  folds = []
}: {
  item: BotItem
  state: DetailState | undefined
  onOpenChat: () => void
  openNote: string | null
  snoozedHere: boolean
  onSnooze: (until: number | null) => void
  folds?: FocusRequest['open']
}) {
  const later = html`<${Snooze} item=${item} local=${snoozedHere} onSnooze=${onSnooze} />`
  const strings = t().panel
  const [explained, setExplained] = useState(false)
  // "Read more" only when three lines really cut the text, measured once it is drawn
  const clampRef = useRef<HTMLDivElement | null>(null)
  const [clipped, setClipped] = useState(false)
  useEffect(() => {
    const element = clampRef.current
    if (element && !explained) setClipped(element.scrollHeight > element.clientHeight + 1)
  })
  const [descriptionOpen, setDescriptionOpen] = useState<boolean | null>(folds.includes('detail') ? true : null)
  const [historyOpen, setHistoryOpen] = useState(folds.includes('history'))
  const [historyAll, setHistoryAll] = useState(false)
  // per question: the reply picked in its list, or what the person typed instead
  const [picked, setPicked] = useState<Record<number, string>>({})
  const [typed, setTyped] = useState<Record<number, string>>({})
  const [sending, setSending] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [sendNote, setSendNote] = useState<string | null>(null)
  const now = Date.now()
  const decisions = state?.status === 'ready' ? state.detail.decisions : []
  const replyOf = (index: number) => (typed[index]?.trim() ? typed[index]!.trim() : (picked[index] ?? ''))
  // the panel answers what the bot asks; the chat stays one press away for anything longer
  const canAnswer = item.status === 'needs_you' && decisions.length > 0 && sending !== 'sent'
  const ready = canAnswer && decisions.every((_, index) => replyOf(index))
  async function send(): Promise<void> {
    setSending('sending')
    setSendNote(null)
    try {
      const answer = await orca.plugin.request('item.answer', {
        number: item.number,
        answers: decisions.map((decision, index) => ({ question: plainText(decision.question), reply: replyOf(index) }))
      })
      setSending(answer.sent ? 'sent' : 'idle')
      setSendNote(answer.sent ? null : (answer.reason ?? strings.notSent))
    } catch (failure) {
      setSending('idle')
      setSendNote(failure instanceof Error ? failure.message : String(failure))
    }
  }
  const single = decisions.length === 1 && replyOf(0) && !typed[0]?.trim() ? replyOf(0) : null
  const submit = canAnswer
    ? html`<button class="answer" disabled=${!ready || sending === 'sending'} onClick=${() => void send()}>
        ${sending === 'sending' ? strings.sending : strings.send(single)}
      </button>`
    : null
  const chat = item.chatId
    ? html`<button class="quiet" onClick=${onOpenChat} aria-label=${strings.openChatOf(item.bot)}>
        <span>${strings.openChat}</span><${Icon} name="external" size=${11} />
      </button>`
    : null
  // setting aside is for what waits on you: a card the bot holds is not yours to postpone
  const snoozable = item.status === 'needs_you' || isSnoozed(item, now)
  const actions = html`<div class="actions">${submit}${chat}${sending === 'sent' || !snoozable ? null : later}</div>`
  const sentNote =
    sending === 'sent'
      ? html`<p class="sent" role="status"><${Icon} name="check" size=${12} />${strings.sentTo(item.bot)}</p>`
      : sendNote
        ? html`<p class="note error" role="alert">${sendNote}</p>`
        : null
  if (!state || state.status === 'loading')
    return html`<div class="detail">
      <div class="skeleton small" role="status" aria-label=${strings.loadingItem}></div>
      ${actions}
    </div>`
  if (state.status === 'failed')
    return html`<div class="detail">
      <p class="note error" role="alert">${strings.unreadableContent(state.reason)}</p>
      ${actions}
    </div>`
  const { detail } = state
  const asks = detail.decisions.length > 0
  const longDescription = (detail.description?.length ?? 0) > LONG_DESCRIPTION
  // with an explanation above, the description folds even when short: the same facts are not shown twice
  const showDescription = descriptionOpen ?? (!longDescription && !detail.explanation)
  const history = historyAll ? detail.history : detail.history.slice(0, HISTORY_SHOWN)
  return html`<div class="detail">
    <section class="decision" aria-label=${asks ? strings.botAsks : strings.itemStands}>
      <p class="who"><span class=${`dot ${item.status}`}></span><strong>${item.bot}</strong> ${waitLine(item)}</p>
      ${
        asks
          ? detail.decisions.map(
              (decision, index) =>
                html`<div class="ask-block">
                  <p class="q">
                    ${detail.decisions.length > 1 ? html`<span class="q-n tabular">${index + 1}.</span>` : null}<${InlineText}
                      parts=${parseInline(decision.question)}
                    />
                  </p>
                  ${
                    decision.replies.length
                      ? html`<ol class="replies" aria-label=${strings.suggested}>
                            ${decision.replies.slice(0, 5).map((reply, at) => {
                              const label = plainText(reply.label)
                              const chosen = picked[index] === label && !typed[index]?.trim()
                              const inner = html`<span class="k tabular">${at + 1}</span>
                                <span>${label}</span>
                                ${reply.recommended ? html`<span class="tag">${strings.recommended}</span>` : html`<span></span>`}`
                              return html`<li class=${reply.recommended ? 'recommended' : ''}>
                                ${
                                  canAnswer
                                    ? html`<button
                                        class=${`reply${chosen ? ' chosen' : ''}`}
                                        aria-pressed=${chosen}
                                        onClick=${() => {
                                          setPicked((all) => ({ ...all, [index]: label }))
                                          setTyped((all) => ({ ...all, [index]: '' }))
                                        }}
                                      >
                                        ${inner}
                                      </button>`
                                    : inner
                                }
                              </li>`
                            })}
                          </ol>
                          ${decision.replies.length > 5 ? html`<p class="muted small">${strings.moreReplies(decision.replies.length - 5)}</p>` : null}`
                      : null
                  }
                  ${
                    canAnswer
                      ? html`<input
                          class="own"
                          type="text"
                          maxlength="1000"
                          aria-label=${decision.replies.length ? strings.ownAnswer : strings.yourAnswer}
                          placeholder=${decision.replies.length ? strings.writeOwn : strings.write}
                          value=${typed[index] ?? ''}
                          onInput=${(event: Event) => {
                            const value = (event.target as HTMLInputElement).value
                            setTyped((all) => ({ ...all, [index]: value }))
                          }}
                          onKeyDown=${(event: KeyboardEvent) => {
                            if (event.key === 'Enter' && ready) void send()
                          }}
                        />`
                      : decision.replies.length
                        ? null
                        : html`<p class="free muted">${strings.freeAnswer}</p>`
                  }
                </div>`
            )
          : item.waitsOn
            ? html`<p class="q waits">${item.waitsOn}</p>`
            : null
      }
      ${detail.moreDecisions ? html`<p class="muted small">${strings.moreQuestions(detail.moreDecisions)}</p>` : null}
      ${
        asks
          ? html`${actions} ${sentNote} ${openNote ? html`<p class="note error" role="status">${openNote}</p>` : null}`
          : null
      }
    </section>
    ${
      detail.explanation
        ? html`<div class=${`explanation${asks ? '' : ' news'}`}>
            <div class=${explained ? '' : 'clamp3'} ref=${clampRef}><${Markdown} source=${detail.explanation} /></div>
            ${
              explained || clipped
                ? html`<button class="link" aria-expanded=${explained} onClick=${() => setExplained(!explained)}>
                    ${explained ? strings.showLess : strings.readMore}
                  </button>`
                : null
            }
          </div>`
        : null
    }
    ${asks ? null : html`${actions}${openNote ? html`<p class="note error" role="status">${openNote}</p>` : null}`}
    <${PullRequests} prs=${item.prs} />
    ${
      detail.description
        ? html`<${Fold}
            label=${strings.details}
            open=${showDescription}
            onToggle=${() => setDescriptionOpen(!showDescription)}
          >
            <${Markdown} source=${detail.description} />
          <//>`
        : null
    }
    ${
      detail.history.length
        ? html`<${Fold}
            label=${strings.history}
            note=${String(detail.history.length)}
            open=${historyOpen}
            onToggle=${() => setHistoryOpen(!historyOpen)}
          >
            <ol class="events">
              ${history.map(
                (event) =>
                  html`<li title=${event.text}>
                    <span class="muted tabular when">${whenLabel(event.at, now)}</span>
                    <span class="clamp2"
                      >${event.who === 'owner' ? html`<strong>${strings.you} · </strong>` : null}${event.text}</span
                    >
                  </li>`
              )}
            </ol>
            ${
              detail.history.length > HISTORY_SHOWN
                ? html`<button class="link" onClick=${() => setHistoryAll(!historyAll)}>
                    ${historyAll ? strings.showLess : strings.older(detail.history.length - HISTORY_SHOWN)}
                  </button>`
                : null
            }
          <//>`
        : null
    }
  </div>`
}

function Row({
  item,
  avatar,
  now,
  showBot,
  expanded,
  detail,
  openNote,
  folds,
  snoozedHere,
  fresh,
  quick,
  selected,
  onToggle,
  onOpenChat,
  onSnooze,
  onQuick,
  onUndo
}: {
  item: BotItem
  avatar: string | null
  now: number
  showBot: boolean
  expanded: boolean
  detail: DetailState | undefined
  openNote: string | null
  folds: { open: FocusRequest['open']; seq: number } | null
  snoozedHere: boolean
  fresh: boolean
  quick: QuickState | undefined
  selected: boolean
  onToggle: () => void
  onOpenChat: () => void
  onSnooze: (until: number | null) => void
  onQuick: () => void
  onUndo: () => void
}) {
  // what waits on you gets a bar under the row, shown on hover or keyboard focus: one card moves at a time
  const triage = !expanded && item.status === 'needs_you' && !isSnoozed(item, now)
  const ask = askOf(item)
  // the pull request that most needs a look stands for all of them on the row
  const lead = [...item.prs].sort((a, b) => prSummary(a).rank - prSummary(b).rank)[0]
  const leadSummary = lead ? prSummary(lead) : null
  const strings = t().panel
  return html`<li
    id=${`item-${item.number}`}
    class=${[expanded ? 'expanded' : triage ? 'triage' : '', selected ? 'selected' : ''].join(' ').trim()}
  >
    <button
      class="item"
      data-number=${item.number}
      aria-expanded=${expanded}
      title=${`${item.number} ${item.title}${ask ? `\n${ask}` : ''}`}
      onClick=${onToggle}
    >
      <${Avatar} name=${item.bot} src=${avatar} size=${28} />
      <span class="text">
        <span class=${`title ${expanded ? '' : 'clamp1'}`}
          >${fresh ? html`<span class="fresh" title=${strings.newSince}><span class="visually-hidden">${strings.newPrefix}</span></span>` : null}<span
            class="number tabular"
            >${item.number}</span
          >${item.title}</span
        >
        ${
          !expanded && (showBot || ask)
            ? html`<span class="ask clamp1"
                >${showBot ? html`<span class="by">${item.bot}</span>` : null}${showBot && ask ? ' · ' : ''}${ask ?? ''}</span
              >`
            : null
        }
      </span>
      <span class="side">
        <span class="age tabular">${whenLabel(item.createdAt, now)}</span>
        ${(() => {
          // one chip under the age, so a row is never taller than its two lines of text: the one that
          // most needs a look wins, and both stay in its tooltip and in the unfolded card
          const prChip =
            lead && leadSummary && !expanded
              ? {
                  tone: leadSummary.tone,
                  text: `PR ${leadSummary.label}${item.prs.length > 1 ? ` +${item.prs.length - 1}` : ''}`
                }
              : null
          const dueChip = item.deadline
            ? { tone: item.deadline.overdue ? 'overdue' : '', text: item.deadline.label }
            : null
          const title = [
            dueChip?.text,
            ...item.prs.map((pr) => strings.prOf(`${pr.repo}#${pr.number}`, prSummary(pr).label))
          ]
            .filter(Boolean)
            .join('\n')
          if (isSnoozed(item, now))
            return expanded
              ? null
              : html`<span class="chip">${strings.snoozedUntil(dayLabel(item.snoozedUntil!))}</span>`
          const chip = dueChip?.tone === 'overdue' ? dueChip : prChip?.tone === 'danger' ? prChip : (dueChip ?? prChip)
          return chip ? html`<span class=${`chip ${chip.tone}`.trim()} title=${title}>${chip.text}</span>` : null
        })()}
      </span>
    </button>
    ${
      triage
        ? html`<div class=${`quickbar${quick ? ' active' : ''}`}>
            ${
              quick === 'pending'
                ? html`<button
                    class="icon-button small undo"
                    onClick=${onUndo}
                    title=${strings.undoTitle(item.quickReply?.label ?? '')}
                    aria-label=${strings.undoLabel(item.quickReply?.label ?? '')}
                  >
                    ${strings.undo}
                  </button>`
                : quick === 'sending'
                  ? html`<span class="quick-note" role="status" aria-label=${strings.sendingNow}>…</span>`
                  : quick === 'sent'
                    ? html`<span class="quick-note sent" role="status" aria-label=${strings.sentShort(item.bot)}
                        ><${Icon} name="check" size=${14}
                      /></span>`
                    : html`${
                          quick
                            ? html`<span
                                class="quick-note error"
                                role="alert"
                                title=${(quick as { error: string }).error}
                                >!</span
                              >`
                            : item.quickReply
                              ? html`<button
                                  class="icon-button small send"
                                  onClick=${onQuick}
                                  data-tip=${strings.replyTip(item.quickReply.label, item.bot)}
                                  aria-label=${strings.replyLabel(item.quickReply.label, item.bot)}
                                >
                                  <${Icon} name="check" size=${14} />
                                </button>`
                              : null
                        }
                        <button
                          class="icon-button small"
                          onClick=${() => onSnooze(snoozeChoices(Date.now())[0]!.until)}
                          title=${strings.snoozeTomorrowKey}
                          aria-label=${strings.snoozeTomorrow}
                        >
                          <${Icon} name="clock" size=${14} />
                        </button>`
            }
          </div>`
        : null
    }
    ${
      expanded
        ? html`<${Detail}
            key=${folds?.seq ?? 0}
            item=${item}
            state=${detail}
            onOpenChat=${onOpenChat}
            openNote=${openNote}
            snoozedHere=${snoozedHere}
            onSnooze=${onSnooze}
            folds=${folds?.open ?? []}
          />`
        : null
    }
  </li>`
}

/** A one-gesture answer from the row: under way, gone, or refused with why. */
type QuickState = 'pending' | 'sending' | 'sent' | { error: string }

type RowActions = {
  fresh: (item: BotItem) => boolean
  quick: (item: BotItem) => QuickState | undefined
  onQuick: (item: BotItem) => void
  onUndo: (item: BotItem) => void
  selected: number | null
  expanded: number | null
  details: Record<number, DetailState>
  openNote: { number: number; text: string } | null
  foldsOpen: { number: number; open: FocusRequest['open']; seq: number } | null
  onToggle: (item: BotItem) => void
  onOpenChat: (item: BotItem) => void
  onSnooze: (item: BotItem, until: number | null) => void
}

function Group({
  group,
  board,
  showBot,
  actions,
  onToggle,
  onMore
}: {
  group: GroupView
  board: Board
  showBot: boolean
  actions: RowActions
  onToggle: () => void
  onMore: () => void
}) {
  return html`<section class="group">
    <button class="group-head" aria-expanded=${group.open} onClick=${onToggle}>
      <span class="chevron"><${Icon} name="chevron" size=${12} /></span>
      <${StatusRing} status=${group.status} />
      <span class="group-label">${group.label}</span>
      <span class="group-count tabular">${group.count}</span>
    </button>
    ${
      group.open
        ? html`<ul class="rows" aria-label=${group.label}>
              ${group.rows.map(
                (item) =>
                  html`<${Row}
                    key=${item.number}
                    item=${item}
                    avatar=${board.avatars[item.bot] ?? null}
                    now=${board.loadedAt}
                    showBot=${showBot}
                    expanded=${actions.expanded === item.number}
                    detail=${actions.details[item.number]}
                    openNote=${actions.openNote?.number === item.number ? actions.openNote.text : null}
                    folds=${actions.foldsOpen?.number === item.number ? actions.foldsOpen : null}
                    snoozedHere=${board.snoozedHere.includes(item.number)}
                    fresh=${actions.fresh(item)}
                    quick=${actions.quick(item)}
                    selected=${actions.selected === item.number}
                    onToggle=${() => actions.onToggle(item)}
                    onOpenChat=${() => actions.onOpenChat(item)}
                    onSnooze=${(until: number | null) => actions.onSnooze(item, until)}
                    onQuick=${() => actions.onQuick(item)}
                    onUndo=${() => actions.onUndo(item)}
                  />`
              )}
            </ul>
            ${
              group.hidden > 0 || group.canCollapse
                ? html`<button class="more" onClick=${onMore}>
                    ${group.hidden > 0 ? moreLabel(group.hidden) : t().panel.showLess}
                  </button>`
                : null
            }`
        : null
    }
  </section>`
}
const toggle = (list: GroupKey[], status: GroupKey) =>
  list.includes(status) ? list.filter((s) => s !== status) : [...list, status]

export function App() {
  const [board, setBoard] = useState<Board | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [bot, setBot] = useState<string | null>(null)
  const [open, setOpen] = useState<GroupKey[]>(DEFAULT_OPEN)
  const [uncapped, setUncapped] = useState<GroupKey[]>([])
  const [expanded, setExpanded] = useState<number | null>(null)
  const [details, setDetails] = useState<Record<number, DetailState>>({})
  const [openNote, setOpenNote] = useState<{ number: number; text: string } | null>(null)

  const retry = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  /** A worker that restarts (an update, a reload) drops the first read: retried a few times, quickly. */
  async function refresh(attempt = 0): Promise<void> {
    setLoading(true)
    let retrying = false
    try {
      setBoard(await orca.plugin.request('board.load', undefined, { timeoutMs: 45_000 }))
      setDetails({})
      setError(null)
    } catch (failure) {
      if (attempt < FIRST_READ_RETRIES) {
        retrying = true
        retry.current = setTimeout(() => void refresh(attempt + 1), RETRY_AFTER_MS)
        return
      }
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      // between attempts the read is still under way, so the refresh button stays busy
      if (!retrying) setLoading(false)
    }
  }

  // unread: a card whose current question was never opened, answered or set aside here
  const [seen, setSeen] = useState<Record<string, string> | null>(null)
  const seenKey = (item: BotItem) => item.questionId ?? `${item.status}:${item.createdAt}`
  const isFresh = (item: BotItem) =>
    seen !== null &&
    item.status === 'needs_you' &&
    !isSnoozed(item, Date.now()) &&
    seen[String(item.number)] !== seenKey(item)
  function markSeen(item: BotItem): void {
    setSeen((all) => {
      if (!all || all[String(item.number)] === seenKey(item)) return all
      const next = { ...all, [String(item.number)]: seenKey(item) }
      void orca.host.call('storage.set', { key: SEEN_KEY, value: next }).catch(() => undefined)
      return next
    })
  }
  // null until read; 'first' when the store never held anything, so what already waits starts read
  const [seenState, setSeenState] = useState<'loading' | 'first' | 'ready' | 'unavailable'>('loading')
  useEffect(() => {
    orca.host.call('storage.get', { key: SEEN_KEY }).then(
      (stored) => {
        const value = stored.value
        const valid = value && typeof value === 'object' && !Array.isArray(value)
        setSeen(valid ? (value as Record<string, string>) : {})
        setSeenState(valid ? 'ready' : 'first')
      },
      // without the store, nothing is marked unread rather than everything
      () => setSeenState('unavailable')
    )
  }, [])
  useEffect(() => {
    if (seenState !== 'first' || !board) return
    const first = Object.fromEntries(
      board.items.filter((item) => item.status === 'needs_you').map((item) => [String(item.number), seenKey(item)])
    )
    setSeen(first)
    setSeenState('ready')
    void orca.host.call('storage.set', { key: SEEN_KEY, value: first }).catch(() => undefined)
  }, [board, seenState])

  // a reply from the row leaves after a few seconds, so a slip of the finger can still be taken back
  const [quick, setQuick] = useState<Record<string, QuickState>>({})
  const quickKey = (item: BotItem) => `${item.number}:${item.questionId ?? ''}`
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const [announce, setAnnounce] = useState<string | null>(null)
  function say(text: string): void {
    setAnnounce(text)
    setTimeout(() => setAnnounce((current) => (current === text ? null : current)), 6_000)
  }
  function quickAnswer(item: BotItem): void {
    const key = quickKey(item)
    if (!item.quickReply || quick[key]) return
    markSeen(item)
    setQuick((all) => ({ ...all, [key]: 'pending' }))
    timers.current[key] = setTimeout(() => void deliver(item, key), UNDO_MS)
  }
  function undoQuick(item: BotItem): void {
    const key = quickKey(item)
    clearTimeout(timers.current[key])
    delete timers.current[key]
    setQuick((all) => {
      const next = { ...all }
      delete next[key]
      return next
    })
    document.querySelector<HTMLButtonElement>(`button.item[data-number="${item.number}"]`)?.focus()
  }
  async function deliver(item: BotItem, key: string): Promise<void> {
    delete timers.current[key]
    setQuick((all) => ({ ...all, [key]: 'sending' }))
    // the card is about to leave Needs you: the keyboard goes on with the next one
    const rows = [...document.querySelectorAll<HTMLButtonElement>('button.item[data-number]')]
    const at = rows.findIndex((row) => row.dataset.number === String(item.number))
    const hadFocus = at >= 0 && rows[at]!.closest('li')?.contains(document.activeElement)
    try {
      const answer = await orca.plugin.request('item.answer', {
        number: item.number,
        answers: [{ question: item.quickReply!.question, reply: item.quickReply!.label }]
      })
      setQuick((all) => ({
        ...all,
        [key]: answer.sent ? 'sent' : { error: answer.reason ?? t().panel.notSent }
      }))
      if (answer.sent) {
        say(t().panel.quickSent(item.quickReply!.label, item.bot, item.number, t().status.waiting))
        if (hadFocus) (rows[at + 1] ?? rows[at - 1])?.focus()
      }
    } catch (failure) {
      setQuick((all) => ({ ...all, [key]: { error: failure instanceof Error ? failure.message : String(failure) } }))
    }
  }

  async function toggleItem(item: BotItem): Promise<void> {
    if (expanded === item.number) return setExpanded(null)
    markSeen(item)
    setExpanded(item.number)
    setOpenNote(null)
    if (details[item.number]?.status === 'ready') return
    setDetails((all) => ({ ...all, [item.number]: { status: 'loading' } }))
    try {
      const detail = await orca.plugin.request('item.show', { number: item.number })
      setDetails((all) => ({ ...all, [item.number]: { status: 'ready', detail } }))
    } catch (failure) {
      const reason = failure instanceof Error ? failure.message : String(failure)
      setDetails((all) => ({ ...all, [item.number]: { status: 'failed', reason } }))
    }
  }

  async function openChat(item: BotItem): Promise<void> {
    if (!item.chatId) return
    try {
      const answer = await orca.plugin.request('chat.open', { chatId: item.chatId })
      setOpenNote(answer.opened ? null : { number: item.number, text: answer.reason ?? t().panel.chatNotOpened })
    } catch (failure) {
      setOpenNote({ number: item.number, text: failure instanceof Error ? failure.message : String(failure) })
    }
  }

  async function snooze(item: BotItem, until: number | null): Promise<void> {
    if (until !== null) markSeen(item)
    try {
      setBoard(await orca.plugin.request('item.snooze', { number: item.number, until }))
      // set aside, it leaves its group: fold it rather than follow it to Snoozed
      if (until !== null) setExpanded(null)
    } catch (failure) {
      setOpenNote({ number: item.number, text: failure instanceof Error ? failure.message : String(failure) })
    }
  }

  // an answered card moves to Waiting: its group opens so the card stays in sight, still unfolded
  useEffect(() => {
    if (expanded === null || !board) return
    const item = board.items.find((candidate) => candidate.number === expanded)
    if (!item || isSnoozed(item, board.loadedAt)) return
    setOpen((list) => (list.includes(item.status) ? list : [...list, item.status]))
  }, [board])

  // the worker reads the bots on its own and says when what they show changed
  useEffect(() => {
    const subscription = orca.plugin.on('board.changed', (next) => setBoard(next))
    return () => subscription.dispose()
  }, [])

  // an item another surface asked to show: unfolded once the board holds it
  const [focus, setFocus] = useState<FocusRequest | null>(null)
  const [foldsOpen, setFoldsOpen] = useState<{ number: number; open: FocusRequest['open']; seq: number } | null>(null)
  useEffect(() => {
    const subscription = orca.plugin.on('item.focus', (request) => setFocus(request))
    return () => subscription.dispose()
  }, [])
  useEffect(() => {
    if (focus === null || !board) return
    const item = board.items.find((candidate) => candidate.number === focus.number)
    // an item no longer open is dropped rather than unfolded on a later refresh
    if (!item) return setFocus(null)
    setFoldsOpen({ number: item.number, open: focus.open ?? [], seq: Date.now() })
    setFocus(null)
    setBot(null)
    const key: GroupKey = isSnoozed(item, Date.now()) ? 'snoozed' : item.status
    setOpen((list) => (list.includes(key) ? list : [...list, key]))
    setUncapped((list) => (list.includes(key) ? list : [...list, key]))
    // unfold: false only selects the card, as J and K do, so its triage bar shows
    if (focus.unfold === false) {
      setSelected(item.number)
      setTimeout(
        () => document.querySelector<HTMLButtonElement>(`button.item[data-number="${item.number}"]`)?.focus(),
        100
      )
      return
    }
    if (expanded !== item.number) void toggleItem(item)
    setTimeout(() => document.getElementById(`item-${item.number}`)?.scrollIntoView({ block: 'start' }), 100)
  }, [focus, board])

  useEffect(() => {
    void refresh()
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh(FIRST_READ_RETRIES)
    }, REFRESH_EVERY_MS)
    return () => {
      clearInterval(timer)
      clearTimeout(retry.current)
    }
  }, [])

  const view = useMemo(() => (board ? buildView(board, { bot, open, uncapped }) : null), [board, bot, open, uncapped])

  // the keyboard walks the rows on screen, top to bottom; a row's own keys act on the selected card
  const [keysShown, setKeysShown] = useState(false)
  // the card J and K reached: Enter sends only there, never on a card focused by a click or Tab
  const [selected, setSelected] = useState<number | null>(null)
  const latest = useRef({ view, board, expanded, selected })
  latest.current = { view, board, expanded, selected }
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (event.metaKey || event.ctrlKey || event.altKey || target.closest('input, textarea, select, [role="menu"]'))
        return
      const rows = [...document.querySelectorAll<HTMLButtonElement>('button.item[data-number]')]
      const own = target.closest('li')?.querySelector<HTMLButtonElement>('button.item[data-number]')
      const at = own ? rows.indexOf(own) : -1
      const { board: current, expanded: open, selected: picked } = latest.current
      const item = at >= 0 ? current?.items.find((one) => String(one.number) === rows[at]!.dataset.number) : undefined
      const move = (step: number) => {
        const next = rows[at < 0 ? (step > 0 ? 0 : rows.length - 1) : Math.max(0, Math.min(rows.length - 1, at + step))]
        if (!next) return
        next.focus()
        next.scrollIntoView({ block: 'nearest' })
        setSelected(Number(next.dataset.number))
      }
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
      // arrows scroll the panel as usual until a card has the focus; J and K start from the top
      if (key === 'j' || (key === 'ArrowDown' && at >= 0)) move(1)
      else if (key === 'k' || (key === 'ArrowUp' && at >= 0)) move(-1)
      else if (key === '?') setKeysShown((shown) => !shown)
      else if (key === 'Escape' && keysShown) setKeysShown(false)
      else if (!item) return
      else if (key === 'Enter' && !event.repeat && picked === item.number && open !== item.number && item.quickReply)
        quickAnswer(item)
      else if (key === 'ArrowRight' && open !== item.number) void toggleItem(item)
      else if ((key === 'ArrowLeft' || key === 'Escape') && open === item.number) void toggleItem(item)
      else if (key === 'r' && item.status === 'needs_you') void snooze(item, snoozeChoices(Date.now())[0]!.until)
      else if (key === 'c' && item.chatId) void openChat(item)
      else return
      event.preventDefault()
    }
    // a click elsewhere ends the keyboard selection, so Enter goes back to unfolding
    const onPointer = () => setSelected(null)
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  })

  const strings = t().panel
  const refreshButton = html`<button
    class="icon-button"
    aria-label=${strings.refresh}
    title=${strings.refresh}
    aria-disabled=${loading}
    aria-busy=${loading}
    onClick=${() => !loading && void refresh(FIRST_READ_RETRIES)}
  >
    <${Icon} name="refresh" spin=${loading} />
  </button>`

  if (!board || !view) {
    return html`<main>
      <div class="header">
        <div style="flex:1">
          <p class="headline">${strings.title}</p>
          <p class="since">${error ? strings.readFailed : strings.reading}</p>
        </div>
        ${refreshButton}
      </div>
      ${
        error
          ? html`<div class="notice danger" role="alert"><strong>${strings.cannotRead}</strong>${error}</div>`
          : html`<div class="skeleton"></div>
              <div class="skeleton"></div>
              <div class="skeleton"></div>`
      }
    </main>`
  }

  const fresh = board.items.filter((item) => isFresh(item) && !isSnoozed(item, board.loadedAt))
  return html`<main>
    <div class="header">
      <div style="flex:1;min-width:0">
        <p class="headline">${view.headline ?? (view.bot ? strings.nothingFor(view.bot) : strings.nothing)}</p>
        <p class="since">
          ${fresh.length ? html`<strong class="fresh-count">${strings.unread(fresh.length)}</strong>${view.since ? ' · ' : ''}` : null}${view.since ? (fresh.length ? view.since.charAt(0).toLowerCase() + view.since.slice(1) : view.since) : fresh.length ? null : strings.carryOn}
        </p>
      </div>
      <button
        class="icon-button"
        aria-label=${strings.keysTitle}
        title=${`${strings.keysTitle} (?)`}
        aria-expanded=${keysShown}
        onClick=${() => setKeysShown(!keysShown)}
      >
        <${Icon} name="keyboard" />
      </button>
      ${refreshButton}
    </div>
    ${
      keysShown
        ? html`<dl class="keys" aria-label=${strings.keysTitle}>
            <dt><kbd>J</kbd> <kbd>K</kbd></dt>
            <dd>${strings.keys.move}</dd>
            <dt><kbd>↵</kbd></dt>
            <dd>${strings.keys.send}</dd>
            <dt><kbd>→</kbd> <kbd>←</kbd></dt>
            <dd>${strings.keys.fold}</dd>
            <dt><kbd>R</kbd></dt>
            <dd>${strings.keys.snooze}</dd>
            <dt><kbd>C</kbd></dt>
            <dd>${strings.keys.chat}</dd>
            <dt><kbd>?</kbd></dt>
            <dd>${strings.keys.help}</dd>
          </dl>`
        : null
    }
    <p class="announce" role="status" aria-live="polite">${announce ?? ''}</p>
    <${BotStrip} bots=${view.bots} current=${view.bot} onPick=${setBot} />
    ${
      board.failures.length
        ? html`<div class="notice" role="status">
            <strong>${strings.partial}</strong
            >${board.failures.map((failure) => html`<div>${strings.failure(failure.bot, failure.reason)}</div>`)}
          </div>`
        : null
    }
    ${error ? html`<div class="notice danger" role="alert"><strong>${strings.refreshFailed}</strong>${error}</div>` : null}
    ${
      view.empty
        ? html`<div class="empty">
            <strong>${view.empty === 'filtered' ? strings.noneFiltered : strings.nothing}</strong>
            <span class="muted">${view.empty === 'filtered' ? strings.pickOther : strings.carryOn}</span>
          </div>`
        : view.groups.map(
            (group) =>
              html`<${Group}
                key=${group.status}
                group=${group}
                board=${board}
                showBot=${view.bot === null}
                actions=${{
                  expanded,
                  details,
                  openNote,
                  foldsOpen,
                  fresh: isFresh,
                  quick: (item: BotItem) => quick[quickKey(item)],
                  onQuick: quickAnswer,
                  onUndo: undoQuick,
                  selected,
                  onToggle: toggleItem,
                  onOpenChat: openChat,
                  onSnooze: snooze
                }}
                onToggle=${() => setOpen((list) => toggle(list, group.status))}
                onMore=${() => setUncapped((list) => toggle(list, group.status))}
              />`
          )
    }
  </main>`
}
