import { assert, test } from 'orca/testing'
import { contextOf, plainText, toItemDetail } from './detail'
import { inLanguage } from './test-fixtures'

const context = 'La panne du 25/11 a été vue avec 1 h 44 de retard.\nJe propose un service extérieur.'
const questionText = `${context}\n\n1. Je prépare cette surveillance ?\n   - Oui (recommended)\n   - Non\n\n2. Vers quelle heure as-tu su ?`

const raw = {
  item: {
    description: '**Le problème.** Rien ne surveillait.\n\n- API : 504\n- CRM : 502',
    question: {
      text: questionText,
      decisions: [
        {
          question: 'Je prépare cette surveillance ?',
          replies: [
            { label: 'Oui', recommended: true },
            { label: 'Non', recommended: false }
          ]
        },
        { question: 'Vers quelle heure as-tu su ?', replies: [] }
      ]
    }
  },
  events: [
    { kind: 'made', at: 1, actor: { kind: 'bot' }, data: {} },
    { kind: 'commented', at: 2, actor: { kind: 'bot' }, data: { text: 'Première analyse.\nDétail long.' } },
    { kind: 'status', at: 3, actor: { kind: 'bot' }, data: { from: 'needs_you', to: 'needs_you' } },
    { kind: 'commented', at: 4, actor: { kind: 'owner' }, data: { text: 'Oui, vas-y' } },
    {
      kind: 'status',
      at: 4,
      actor: { kind: 'owner' },
      data: { from: 'needs_you', to: 'in_progress', cause: 'answer' }
    },
    { kind: 'commented', at: 5, actor: { kind: 'bot' }, data: { text: questionText } },
    { kind: 'linked', at: 6, actor: { kind: 'bot' }, data: {} }
  ]
}

test('the decision comes first: every question with its replies, the recommended one marked', () => {
  const detail = toItemDetail(raw)
  assert.deepEqual(detail.decisions, [
    {
      question: 'Je prépare cette surveillance ?',
      replies: [
        { label: 'Oui', recommended: true },
        { label: 'Non', recommended: false }
      ]
    },
    { question: 'Vers quelle heure as-tu su ?', replies: [] }
  ])
  assert.equal(detail.moreDecisions, 0)
  assert.equal(detail.explanation, context)
  assert.equal(detail.description, raw.item.description)
})

test('the history skips what is already shown above and status changes that change nothing', () => {
  assert.deepEqual(toItemDetail(raw).history, [
    { at: 4, who: 'owner', text: 'Oui, vas-y' },
    { at: 4, who: 'owner', text: 'Passée en En cours après ta réponse' },
    { at: 2, who: 'bot', text: 'Première analyse.' },
    { at: 1, who: 'bot', text: 'Carte créée' }
  ])
})

test('the history speaks English on an English machine', async () => {
  await inLanguage('en', () => {
    assert.deepEqual(
      toItemDetail(raw).history.map((event) => event.text),
      ['Oui, vas-y', 'Moved to In progress after your answer', 'Première analyse.', 'Item created']
    )
    const edited = toItemDetail({
      events: [{ kind: 'edited', at: 1, actor: { kind: 'bot' }, data: { fields: ['title', 'doneMeans'] } }]
    })
    assert.equal(edited.history[0]!.text, 'Edited: title, done criteria')
  })
})

test("without a question, the bot's latest comment explains the item and leaves the history", () => {
  const detail = toItemDetail({
    item: { description: null, question: null },
    events: [
      { kind: 'commented', at: 1, actor: { kind: 'bot' }, data: { text: 'Ancien' } },
      { kind: 'commented', at: 2, actor: { kind: 'bot' }, data: { text: 'Dernier mot, avec un [lien](http://x).' } }
    ]
  })
  assert.deepEqual(detail.decisions, [])
  assert.equal(detail.explanation, 'Dernier mot, avec un [lien](http://x).')
  assert.deepEqual(detail.history, [{ at: 1, who: 'bot', text: 'Ancien' }])
})

test('more than five questions keep five and count the rest; a question with no decision is the ask', () => {
  const decisions = Array.from({ length: 7 }, (_, at) => ({ question: `Q${at + 1} ?`, replies: [] }))
  const many = toItemDetail({ item: { question: { text: 'Contexte', decisions } } })
  assert.deepEqual([many.decisions.length, many.moreDecisions], [5, 2])
  const lone = toItemDetail({ item: { question: { text: 'Première liste, 9 lignes.' } } })
  assert.deepEqual(lone.decisions, [{ question: 'Première liste, 9 lignes.', replies: [] }])
  assert.equal(lone.explanation, null)
  assert.deepEqual(toItemDetail({}), {
    decisions: [],
    moreDecisions: 0,
    explanation: null,
    description: null,
    history: []
  })
})

test('prose helpers', () => {
  assert.equal(contextOf("Pourquoi.\n\nJ'envoie ?\n - Oui", ["J'envoie ?"]), 'Pourquoi.')
  assert.equal(contextOf("J'envoie ?", ["J'envoie ?"]), null)
  assert.equal(
    contextOf('Pourquoi.\n\nOn y va ?\n   - Oui (recommended)\n   - Non', ['Autre libellé ?'], ['Oui', 'Non']),
    'Pourquoi.\n\nOn y va ?'
  )
  assert.equal(plainText('[a](b) **c** `d`'), 'a c d')
})
