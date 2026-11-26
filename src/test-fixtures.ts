import type { BotItem } from './protocol'
import { language, setLanguage, type Language } from './i18n'

// the assertions are written in French, whatever language the machine running them speaks
setLanguage('fr')

/** Runs a check in another language, then puts French back, even when the check throws. */
export async function inLanguage(next: Language, check: () => unknown): Promise<void> {
  const before = language()
  setLanguage(next)
  try {
    await check()
  } finally {
    setLanguage(before)
  }
}

export const NOW = Date.parse('2026-11-25T12:00:00Z')
export const DAY = 86_400_000

export function item(fields: Partial<BotItem> & Pick<BotItem, 'number'>): BotItem {
  return {
    bot: 'Cofounder',
    status: 'needs_you',
    title: `Carte ${fields.number}`,
    question: null,
    waitsOn: null,
    createdAt: NOW - DAY,
    deadline: null,
    chatId: null,
    prs: [],
    snoozedUntil: null,
    questionId: null,
    answeredAt: null,
    quickReply: null,
    ...fields
  }
}
