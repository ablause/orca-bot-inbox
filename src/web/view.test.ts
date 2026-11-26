import { assert, test } from 'orca/testing'
import type { Board, LinkedPr } from '../protocol'
import { DAY, NOW, inLanguage, item } from '../test-fixtures'
import { buildView, DEFAULT_OPEN, moreLabel, NEEDS_YOU_CAP, prSummary, ROW_CAP, snoozeChoices } from './view'

const board = (items: Board['items'], avatars: Board['avatars'] = {}): Board => ({
  loadedAt: NOW,
  failures: [],
  items,
  avatars,
  snoozedHere: []
})
const chosen = { bot: null, open: DEFAULT_OPEN, uncapped: [] }

const sample = board(
  [
    item({ number: 81, bot: 'Release Manager', createdAt: NOW - 8 * DAY }),
    item({ number: 82, bot: 'Release Manager', createdAt: NOW - DAY }),
    item({ number: 23, bot: 'DevEx Engineer', createdAt: NOW - 2 * DAY }),
    item({ number: 88, bot: 'Bot Father', status: 'waiting' }),
    item({ number: 98, bot: 'Bot Father', status: 'in_progress' })
  ],
  { 'Release Manager': 'data:image/svg+xml;base64,AA' }
)

test('the header says how many wait, at how many bots, and since when', () => {
  const view = buildView(sample, chosen)
  assert.equal(view.headline, "3 cartes t'attendent chez 2 bots")
  assert.equal(view.since, 'La plus ancienne depuis le 17/11.')
  assert.equal(buildView(board([item({ number: 1, createdAt: NOW - 3 * DAY })]), chosen).headline, "1 carte t'attend")
  assert.equal(
    buildView(board([item({ number: 1, createdAt: NOW - 3 * DAY })]), chosen).since,
    'La plus ancienne depuis 3 j.'
  )
})

test('the bot strip puts who waits on you first, with its mascot', () => {
  assert.deepEqual(
    buildView(sample, chosen).bots.map((bot) => [bot.name, bot.needsYou, bot.open, bot.avatar !== null]),
    [
      ['Release Manager', 2, 2, true],
      ['DevEx Engineer', 1, 1, false],
      ['Bot Father', 0, 2, false]
    ]
  )
})

test('groups come in order, waiting folded, and a long group shows six rows then the rest', () => {
  const view = buildView(sample, chosen)
  assert.deepEqual(
    view.groups.map((group) => [group.label, group.count, group.open]),
    [
      ['Besoin de toi', 3, true],
      ['En cours', 1, true],
      ['En attente', 1, false]
    ]
  )
  const needs = board(Array.from({ length: NEEDS_YOU_CAP + 3 }, (_, at) => item({ number: at + 1 })))
  const [capped] = buildView(needs, chosen).groups
  assert.deepEqual([capped.rows.length, capped.hidden, capped.canCollapse], [NEEDS_YOU_CAP, 3, false])
  assert.equal(moreLabel(capped.hidden), 'Voir les 3 autres')
  assert.equal(moreLabel(1), "Voir l'autre carte")
  const [all] = buildView(needs, { ...chosen, uncapped: ['needs_you'] }).groups
  assert.deepEqual([all.rows.length, all.hidden, all.canCollapse], [NEEDS_YOU_CAP + 3, 0, true])
  const waiting = board(Array.from({ length: ROW_CAP + 2 }, (_, at) => item({ number: at + 1, status: 'waiting' })))
  const [folded] = buildView(waiting, { ...chosen, open: ['waiting'] }).groups
  assert.deepEqual([folded.rows.length, folded.hidden], [ROW_CAP, 2])
})

test('filters narrow the list, fall back when their value left, and tell a filtered list from an empty one', () => {
  assert.deepEqual(
    buildView(sample, { ...chosen, bot: 'Bot Father' }).groups.map((group) => group.label),
    ['En cours', 'En attente']
  )
  assert.equal(buildView(sample, { ...chosen, bot: 'Bot Father' }).headline, null)
  assert.equal(
    buildView(sample, { ...chosen, bot: 'Release Manager' }).headline,
    "Release Manager : 2 cartes t'attendent"
  )
  assert.equal(buildView(sample, { ...chosen, bot: 'Gone' }).bot, null)
  assert.equal(
    buildView(board(sample.items.filter((row) => row.bot !== 'DevEx Engineer')), { ...chosen, bot: 'DevEx Engineer' })
      .bot,
    null
  )
  assert.equal(buildView(board([]), chosen).empty, 'none')
})

test('a snoozed item leaves its group and the count for a folded Reportées group, soonest first', () => {
  const view = buildView(
    board([
      item({ number: 1 }),
      item({ number: 2, snoozedUntil: NOW + 3 * DAY }),
      item({ number: 3, status: 'in_progress', snoozedUntil: NOW + DAY })
    ]),
    { bot: null, open: DEFAULT_OPEN, uncapped: [] }
  )
  assert.equal(view.headline, "1 carte t'attend")
  assert.deepEqual(
    view.groups.map((group) => [group.status, group.open, group.rows.map((row) => row.number)]),
    [
      ['needs_you', true, [1]],
      ['snoozed', false, [3, 2]]
    ]
  )
})

test('a pull request reads worst first: failing checks, running, open, draft, unchecked, then done', () => {
  const pr = (fields: Partial<LinkedPr>): LinkedPr => ({
    repo: 'a/b',
    number: 1,
    url: 'u',
    title: null,
    state: 'open',
    checks: null,
    ...fields
  })
  const labels = [
    pr({ state: 'merged' }),
    pr({ state: null }),
    pr({ state: 'draft' }),
    pr({ checks: 'success' }),
    pr({ checks: 'pending' }),
    pr({ checks: 'failure' })
  ]
    .sort((x, y) => prSummary(x).rank - prSummary(y).rank)
    .map((one) => prSummary(one).label)
  assert.deepEqual(labels, ['checks en échec', 'checks en cours', 'checks OK', 'brouillon', '#1', 'mergée'])
})

test('a snooze ends on a later morning at nine: tomorrow, the next Monday, a week out', () => {
  // a Wednesday afternoon
  const now = new Date(2026, 10, 25, 15, 30).getTime()
  assert.deepEqual(
    snoozeChoices(now).map((choice) => [choice.label, new Date(choice.until).toString().slice(0, 21)]),
    [
      ['demain', new Date(2026, 10, 26, 9).toString().slice(0, 21)],
      ['lundi', new Date(2026, 10, 30, 9).toString().slice(0, 21)],
      ['dans une semaine', new Date(2026, 11, 2, 9).toString().slice(0, 21)]
    ]
  )
})

test('on a Sunday Monday is tomorrow, and on a Monday it is a week out: each day is offered once', () => {
  const sunday = new Date(2026, 10, 29, 15).getTime()
  const monday = new Date(2026, 10, 30, 15).getTime()
  assert.deepEqual(
    snoozeChoices(sunday).map((choice) => choice.label),
    ['demain', 'dans une semaine']
  )
  assert.deepEqual(
    snoozeChoices(monday).map((choice) => choice.label),
    ['demain', 'lundi']
  )
  assert.match(snoozeChoices(sunday)[0]!.name, /^Reporter à lundi 30 novembre, 9 h$/)
})

test('the English header counts with plurals, and the folds and snoozes read in English', async () => {
  await inLanguage('en', () => {
    const view = buildView(sample, chosen)
    assert.equal(view.headline, '3 items need you across 2 bots')
    assert.equal(view.since, 'Oldest one waiting since Nov 17.')
    assert.equal(buildView(board([item({ number: 1, createdAt: NOW - 3 * DAY })]), chosen).headline, '1 item needs you')
    assert.equal(buildView(sample, { ...chosen, bot: 'Release Manager' }).headline, 'Release Manager: 2 items need you')
    assert.deepEqual(
      view.groups.map((group) => group.label),
      ['Needs you', 'In progress', 'Waiting']
    )
    assert.equal(moreLabel(1), 'Show 1 more')
    assert.equal(moreLabel(3), 'Show 3 more')
    assert.equal(
      prSummary({ repo: 'a/b', number: 1, url: 'u', title: null, state: 'open', checks: 'failure' }).label,
      'checks failing'
    )
    const sunday = new Date(2026, 10, 29, 15).getTime()
    assert.deepEqual(
      snoozeChoices(sunday).map((choice) => [choice.label, choice.name, choice.when]),
      [
        ['tomorrow', 'Snooze until Monday, November 30, 9 AM', 'Mon, Nov 30, 9 AM'],
        ['in a week', 'Snooze until Sunday, December 6, 9 AM', 'Sun, Dec 6, 9 AM']
      ]
    )
  })
})
