// Every string the plugin shows or sends, in English and French. The worker and the panel both read
// it, so it imports nothing: the panel loads modules without an extension, the worker with `.ts`.
import type { ItemStatus } from './protocol'

export type Language = 'en' | 'fr'

type Host = {
  document?: unknown
  navigator?: { language?: string }
  process?: { env?: Record<string, string | undefined> }
}

/** The machine's language: the panel asks its page, the worker its runtime, then `LANG`. French or English. */
export function detectLanguage(): Language {
  const host = globalThis as Host
  let locale = ''
  if (host.document !== undefined) locale = host.navigator?.language ?? ''
  else {
    try {
      locale = Intl.DateTimeFormat().resolvedOptions().locale
    } catch {
      locale = ''
    }
    if (!locale || locale === 'und') locale = host.process?.env?.LANG ?? ''
  }
  return locale.toLowerCase().startsWith('fr') ? 'fr' : 'en'
}

let current: Language = detectLanguage()

export const language = (): Language => current

/** The language the person picked in the plugin's settings, or the machine's when they left it on auto. */
export function resolveLanguage(setting: unknown): Language {
  return setting === 'en' || setting === 'fr' ? setting : detectLanguage()
}

/** Set from the plugin's Language setting, and by tests so they do not depend on the machine. */
export function setLanguage(next: Language): void {
  current = next
}

/** A day a relative word names, whatever language the bot wrote it in. */
export type RelativeDay = 'today' | 'tonight' | 'tomorrow' | 0 | 1 | 2 | 3 | 4 | 5 | 6

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many)

const enDate = (at: number, options: Intl.DateTimeFormatOptions) => new Date(at).toLocaleDateString('en-US', options)
const enShortDate = (at: number) => enDate(at, { month: 'short', day: 'numeric' })

const en = {
  locale: 'en-US',
  status: {
    needs_you: 'Needs you',
    in_progress: 'In progress',
    waiting: 'Waiting',
    planned: 'Planned',
    done: 'Done',
    canceled: 'Canceled'
  } as Record<ItemStatus | 'done' | 'canceled', string>,
  snoozedGroup: 'Snoozed',

  age: (count: number, unit: 'minute' | 'hour' | 'day') => `${count}${{ minute: 'm', hour: 'h', day: 'd' }[unit]}`,
  shortDate: enShortDate,
  dayLabel: (at: number) => enDate(at, { weekday: 'short', month: 'short', day: 'numeric' }),
  time: (at: number) => new Date(at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),

  deadlineOn: (_token: string, at: number) => enShortDate(at),
  overdueSince: (_token: string, at: number) => `Overdue since ${enShortDate(at)}`,
  dueToday: 'Today',
  relativeDay: (day: RelativeDay) =>
    typeof day === 'number'
      ? ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day]!
      : { today: 'Today', tonight: 'Tonight', tomorrow: 'Tomorrow' }[day],

  needYou: (count: number) => plural(count, '1 item needs you', `${count} items need you`),
  acrossBots: (count: number) => ` across ${count} bots`,
  forBot: (bot: string, text: string) => `${bot}: ${text}`,
  oldestFor: (age: string) => `Oldest one waiting for ${age}.`,
  oldestSince: (date: string) => `Oldest one waiting since ${date}.`,
  waitsOn: (note: string) => `Waiting on: ${note}`,
  more: (hidden: number) => `Show ${hidden} more`,
  pr: {
    failing: 'checks failing',
    running: 'checks running',
    passed: 'checks passed',
    open: 'open',
    draft: 'draft',
    merged: 'merged',
    closed: 'closed'
  },
  snooze: {
    tomorrow: 'tomorrow',
    monday: 'Monday',
    week: 'in a week',
    name: (day: number) => `Snooze until ${enDate(day, { weekday: 'long', month: 'long', day: 'numeric' })}, 9 AM`,
    when: (day: number) => `${enDate(day, { weekday: 'short', month: 'short', day: 'numeric' })}, 9 AM`
  },

  cutAt: (count: number) => `cut off at ${count} items`,
  answerBody: (number: number, title: string, answers: readonly { question: string; reply: string }[]) =>
    [
      `Answer from your owner to item ${number} "${title}", sent from the Bot items panel.`,
      '',
      ...answers.map((answer) =>
        answers.length > 1
          ? `- ${answer.question}\n  Answer: ${answer.reply}`
          : `Question: ${answer.question}\nAnswer: ${answer.reply}`
      ),
      '',
      `Carry on accordingly, then reply in this chat or update item ${number} with orca bot item comment or set.`
    ].join('\n'),
  answerSubject: (number: number) => `Your answer to item ${number}`,
  pickAnAnswer: 'Pick or write an answer',
  noLongerNeedsYou: 'This item no longer needs your answer',
  alreadyAnswered: (bot: string) => `You already answered; ${bot} has not read it yet`,
  chatGone: 'This chat is no longer open in Orca',
  readingYourAnswer: (bot: string, time: string) => `${bot} to read your answer, sent at ${time}`,
  unreadable: (bots: readonly string[]) =>
    bots.length === 1 ? `${bots[0]} unreadable` : `${bots.length} bots unreadable`,
  tooltipNothing: (missing: string) => `Bot items: nothing needs you${missing}`,
  tooltipWaiting: (cards: string, bots: string, missing: string) => `Bot items: ${cards}${bots}${missing}`,
  tooltipFailed: (reason: string) => `Bot items: could not read the bots (${reason})`,
  notifyOne: (bot: string) => `${bot} needs you`,
  notifyMany: (count: number) => `${count} new items need you`,

  fields: { title: 'title', description: 'description', doneMeans: 'done criteria', status: 'status' } as Record<
    string,
    string
  >,
  movedAfterAnswer: (to: string) => `Moved to ${to} after your answer`,
  moved: (to: string) => `Moved to ${to}`,
  created: 'Item created',
  editedFields: (fields: string) => `Edited: ${fields}`,
  edited: 'Edited',

  panel: {
    title: 'Bot items',
    filterByBot: 'Filter by bot',
    all: 'All',
    botTitle: (bot: string, needsYou: number, open: number) =>
      `${bot}: ${needsYou ? `${needsYou} ${plural(needsYou, 'needs', 'need')} you, ` : ''}${open} open`,
    botLabel: (bot: string, needsYou: number) =>
      `${bot}${needsYou ? `, ${needsYou} ${plural(needsYou, 'needs', 'need')} you` : ''}`,
    linkedPrs: 'Linked pull requests',
    openPr: (ref: string, state: string | null) => `Open pull request ${ref} on GitHub${state ? `, ${state}` : ''}`,
    snoozedBringBack: (day: string) => `Snoozed until ${day} · Bring back`,
    snoozedInOrca: (day: string) => `Snoozed in Orca until ${day}`,
    snoozedUntil: (day: string) => `Snoozed until ${day}`,
    snooze: 'Snooze',
    snoozeMenu: 'Snooze the item until',
    waitLine: {
      needsYou: 'needs your answer',
      answered: 'has your answer, not read yet',
      waiting: 'is waiting',
      working: 'is working on it',
      planned: 'has it planned'
    },
    notSent: 'The answer was not sent',
    send: (reply: string | null) => (reply ? `Send "${reply}"` : 'Send answer'),
    sending: 'Sending…',
    openChatOf: (bot: string) => `Open ${bot}'s chat`,
    openChat: 'Open chat',
    sentTo: (bot: string) => `Sent to ${bot}, who picks the item back up.`,
    loadingItem: 'Loading the item',
    unreadableContent: (reason: string) => `Could not read the item: ${reason}`,
    botAsks: 'What the bot asks you',
    itemStands: 'Where the item stands',
    suggested: 'Suggested answers',
    recommended: 'recommended',
    moreReplies: (count: number) => `+ ${count} more ${plural(count, 'answer', 'answers')} in the chat`,
    ownAnswer: 'Or your own answer',
    yourAnswer: 'Your answer',
    writeOwn: 'Or write your answer…',
    write: 'Write your answer…',
    freeAnswer: 'Free answer, in the chat',
    moreQuestions: (count: number) => `+ ${count} more ${plural(count, 'question', 'questions')} in the chat`,
    showLess: 'Show less',
    readMore: 'Read more',
    details: 'Details',
    history: 'History',
    older: (count: number) => `Show ${count} older`,
    you: 'You',
    newSince: 'New since your last visit',
    newPrefix: 'New, ',
    prOf: (ref: string, label: string) => `${ref}: ${label}`,
    undoTitle: (reply: string) => `Undo sending "${reply}" (4s)`,
    undoLabel: (reply: string) => `Undo sending ${reply}`,
    undo: 'Undo',
    sendingNow: 'Sending',
    sentShort: (bot: string) => `Sent to ${bot}`,
    replyTip: (reply: string, bot: string) => `Reply "${reply}" to ${bot}`,
    replyLabel: (reply: string, bot: string) => `Reply ${reply} to ${bot}`,
    snoozeTomorrowKey: 'Snooze until tomorrow, 9 AM (R)',
    snoozeTomorrow: 'Snooze until tomorrow, 9 AM',
    quickSent: (reply: string, bot: string, number: number, group: string) =>
      `"${reply}" sent to ${bot}. Item ${number} moves to ${group}.`,
    chatNotOpened: 'The chat could not be opened',
    refresh: 'Refresh',
    readFailed: 'The items could not be read.',
    reading: 'Reading the items…',
    cannotRead: 'Could not read',
    nothingFor: (bot: string) => `${bot}: nothing needs you`,
    nothing: 'Nothing needs you',
    unread: (count: number) => `${count} unread`,
    carryOn: 'The bots carry on; their next request lands here.',
    partial: 'Some bots could not be read',
    failure: (bot: string, reason: string) => `${bot}: ${reason}`,
    refreshFailed: 'Last refresh failed',
    noneFiltered: 'No items for this filter',
    pickOther: 'Pick another bot.',
    keysTitle: 'Keyboard shortcuts',
    keys: {
      move: 'next, previous item',
      send: 'send the recommended answer',
      fold: 'expand, collapse',
      snooze: 'snooze until tomorrow, 9 AM',
      chat: "open the bot's chat",
      help: 'show or hide this help'
    }
  }
}

export type Strings = typeof en

const frDate = (at: number, options: Intl.DateTimeFormatOptions) => new Date(at).toLocaleDateString('fr-FR', options)

const FRENCH_MONTH =
  /janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre/iu

const frShortDate = (at: number) => frDate(at, { day: '2-digit', month: '2-digit' })
/** A date the bot wrote in French is shown as written; one written in English as a French day. */
const frToken = (token: string, at: number) =>
  /\p{L}/u.test(token) && !FRENCH_MONTH.test(token) ? frShortDate(at) : token

const fr: Strings = {
  locale: 'fr-FR',
  status: {
    needs_you: 'Besoin de toi',
    in_progress: 'En cours',
    waiting: 'En attente',
    planned: 'Prévu',
    done: 'Terminée',
    canceled: 'Annulée'
  },
  snoozedGroup: 'Reportées',

  age: (count, unit) => `${count} ${{ minute: 'min', hour: 'h', day: 'j' }[unit]}`,
  shortDate: frShortDate,
  dayLabel: (at) => frDate(at, { weekday: 'short', day: '2-digit', month: '2-digit' }),
  time: (at) => new Date(at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),

  deadlineOn: (token, at) => `Le ${frToken(token, at)}`,
  overdueSince: (token, at) => `Dépassée le ${frToken(token, at)}`,
  dueToday: "Aujourd'hui",
  relativeDay: (day) =>
    typeof day === 'number'
      ? ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'][day]!
      : { today: "Aujourd'hui", tonight: 'Ce soir', tomorrow: 'Demain' }[day],

  needYou: (count) => plural(count, "1 carte t'attend", `${count} cartes t'attendent`),
  acrossBots: (count) => ` chez ${count} bots`,
  forBot: (bot, text) => `${bot} : ${text}`,
  oldestFor: (age) => `La plus ancienne depuis ${age}.`,
  oldestSince: (date) => `La plus ancienne depuis le ${date}.`,
  waitsOn: (note) => `Attend : ${note}`,
  more: (hidden) => (hidden === 1 ? "Voir l'autre carte" : `Voir les ${hidden} autres`),
  pr: {
    failing: 'checks en échec',
    running: 'checks en cours',
    passed: 'checks OK',
    open: 'ouverte',
    draft: 'brouillon',
    merged: 'mergée',
    closed: 'fermée'
  },
  snooze: {
    tomorrow: 'demain',
    monday: 'lundi',
    week: 'dans une semaine',
    name: (day) => `Reporter à ${frDate(day, { weekday: 'long', day: 'numeric', month: 'long' })}, 9 h`,
    when: (day) => `${frDate(day, { weekday: 'short', day: 'numeric', month: 'short' })}, 9 h`
  },

  cutAt: (count) => `coupé à ${count} cartes`,
  answerBody: (number, title, answers) =>
    [
      `Réponse de ton propriétaire à la carte ${number} « ${title} », envoyée depuis le panneau Suivi des bots.`,
      '',
      ...answers.map((answer) =>
        answers.length > 1
          ? `- ${answer.question}\n  Réponse : ${answer.reply}`
          : `Question : ${answer.question}\nRéponse : ${answer.reply}`
      ),
      '',
      `Continue en conséquence, puis réponds dans ce chat ou mets la carte ${number} à jour avec orca bot item comment ou set.`
    ].join('\n'),
  answerSubject: (number) => `Ta réponse à la carte ${number}`,
  pickAnAnswer: 'Choisis ou écris une réponse',
  noLongerNeedsYou: "La carte n'attend plus ta réponse",
  alreadyAnswered: (bot) => `Tu as déjà répondu ; ${bot} ne l'a pas encore lu`,
  chatGone: "Ce chat n'est plus ouvert dans Orca",
  readingYourAnswer: (bot, time) => `que ${bot} lise ta réponse, envoyée à ${time}`,
  unreadable: (bots) => (bots.length === 1 ? `${bots[0]} illisible` : `${bots.length} bots illisibles`),
  tooltipNothing: (missing) => `Suivi des bots : rien ne t'attend${missing}`,
  tooltipWaiting: (cards, bots, missing) => `Suivi des bots : ${cards}${bots}${missing}`,
  tooltipFailed: (reason) => `Suivi des bots : lecture impossible (${reason})`,
  notifyOne: (bot) => `${bot} a besoin de toi`,
  notifyMany: (count) => `${count} nouvelles cartes t'attendent`,

  fields: { title: 'titre', description: 'description', doneMeans: 'critère de fin', status: 'statut' },
  movedAfterAnswer: (to) => `Passée en ${to} après ta réponse`,
  moved: (to) => `Passée en ${to}`,
  created: 'Carte créée',
  editedFields: (fields) => `Modifiée : ${fields}`,
  edited: 'Modifiée',

  panel: {
    title: 'Suivi des bots',
    filterByBot: 'Filtrer par bot',
    all: 'Tous',
    botTitle: (bot, needsYou, open) => `${bot} : ${needsYou ? `${needsYou} t'attendent, ` : ''}${open} ouvertes`,
    botLabel: (bot, needsYou) => `${bot}${needsYou ? `, ${needsYou} t'attendent` : ''}`,
    linkedPrs: 'Pull requests liées',
    openPr: (ref, state) => `Ouvrir sur GitHub la PR ${ref}${state ? `, ${state}` : ''}`,
    snoozedBringBack: (day) => `Reportée au ${day} · Remettre`,
    snoozedInOrca: (day) => `Reportée dans Orca au ${day}`,
    snoozedUntil: (day) => `Reportée au ${day}`,
    snooze: 'Reporter',
    snoozeMenu: "Reporter la carte jusqu'à",
    waitLine: {
      needsYou: 'attend ta réponse',
      answered: 'a ta réponse, pas encore lue',
      waiting: 'attend',
      working: 'y travaille',
      planned: "l'a prévue"
    },
    notSent: "La réponse n'est pas partie",
    send: (reply) => `Envoyer ${reply ? `« ${reply} »` : 'la réponse'}`,
    sending: 'Envoi…',
    openChatOf: (bot) => `Ouvrir le chat de ${bot}`,
    openChat: 'Ouvrir le chat',
    sentTo: (bot) => `Envoyée à ${bot}, qui reprend la carte.`,
    loadingItem: 'Lecture de la carte',
    unreadableContent: (reason) => `Contenu illisible : ${reason}`,
    botAsks: 'Ce que le bot te demande',
    itemStands: 'Où en est la carte',
    suggested: 'Réponses proposées',
    recommended: 'conseillé',
    moreReplies: (count) => `+ ${count} autres réponses dans le chat`,
    ownAnswer: 'Ou ta propre réponse',
    yourAnswer: 'Ta réponse',
    writeOwn: 'Ou écris ta réponse…',
    write: 'Écris ta réponse…',
    freeAnswer: 'Réponse libre, dans le chat',
    moreQuestions: (count) => `+ ${count} autres questions dans le chat`,
    showLess: 'Réduire',
    readMore: 'Lire la suite',
    details: 'Détail',
    history: 'Historique',
    older: (count) => `Voir les ${count} plus anciens`,
    you: 'Toi',
    newSince: 'Nouvelle depuis ton passage',
    newPrefix: 'Nouvelle, ',
    prOf: (ref, label) => `${ref} : ${label}`,
    undoTitle: (reply) => `Annuler l'envoi de « ${reply} » (4 s)`,
    undoLabel: (reply) => `Annuler l'envoi de ${reply}`,
    undo: 'Annuler',
    sendingNow: 'Envoi en cours',
    sentShort: (bot) => `Envoyée à ${bot}`,
    replyTip: (reply, bot) => `Répondre « ${reply} » à ${bot}`,
    replyLabel: (reply, bot) => `Répondre ${reply} à ${bot}`,
    snoozeTomorrowKey: 'Reporter à demain, 9 h (R)',
    snoozeTomorrow: 'Reporter à demain, 9 h',
    quickSent: (reply, bot, number, group) => `« ${reply} » envoyé à ${bot}. La carte ${number} passe ${group}.`,
    chatNotOpened: "Le chat n'a pas pu être ouvert",
    refresh: 'Rafraîchir',
    readFailed: "Les cartes n'ont pas pu être lues.",
    reading: 'Lecture des cartes…',
    cannotRead: 'Lecture impossible',
    nothingFor: (bot) => `${bot} : rien ne t'attend`,
    nothing: "Rien ne t'attend",
    unread: (count) => (count === 1 ? '1 non lue' : `${count} non lues`),
    carryOn: 'Les bots continuent ; leur prochaine demande arrive ici.',
    partial: 'Lecture incomplète',
    failure: (bot, reason) => `${bot} : ${reason}`,
    refreshFailed: 'Dernier rafraîchissement en échec',
    noneFiltered: 'Aucune carte pour ce filtre',
    pickOther: 'Choisis un autre bot ou un autre projet.',
    keysTitle: 'Raccourcis clavier',
    keys: {
      move: 'carte suivante, précédente',
      send: 'envoyer la réponse conseillée',
      fold: 'déplier, replier',
      snooze: 'reporter à demain, 9 h',
      chat: 'ouvrir le chat du bot',
      help: 'afficher ou masquer cette aide'
    }
  }
}

/** The strings of the language in use, read at each call so a test can switch it. */
export const t = (): Strings => (current === 'fr' ? fr : en)
