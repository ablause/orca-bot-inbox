import { assert, test } from 'orca/testing'
import {
  linkedPrs,
  ageLabel,
  whenLabel,
  applyFilters,
  choices,
  dateMention,
  deadlineOf,
  shorten,
  groupItems,
  needsYou,
  toBotItem
} from './items'
import { DAY, NOW, inLanguage, item } from './test-fixtures'

test('groups come in a fixed order: needs you, in progress, waiting, planned', () => {
  const groups = groupItems([
    item({ number: 1, status: 'planned' }),
    item({ number: 2, status: 'waiting' }),
    item({ number: 3, status: 'in_progress' }),
    item({ number: 4, status: 'needs_you' })
  ])
  assert.deepEqual(
    groups.map((group) => group.label),
    ['Besoin de toi', 'En cours', 'En attente', 'Prévu']
  )
})

test('empty groups are left out', () => {
  assert.deepEqual(
    groupItems([item({ number: 1, status: 'waiting' })]).map((group) => group.status),
    ['waiting']
  )
})

test('within a group, a deadline comes first, the nearest first, then the oldest', () => {
  const [group] = groupItems([
    item({ number: 10, createdAt: NOW - 1 * DAY }),
    item({ number: 11, createdAt: NOW - 9 * DAY }),
    item({ number: 12, createdAt: NOW - 2 * DAY, deadline: { label: 'Demain', at: NOW + DAY, overdue: false } }),
    item({ number: 13, createdAt: NOW - 5 * DAY, deadline: { label: 'Le 29/11', at: NOW + 4 * DAY, overdue: false } })
  ])
  assert.deepEqual(
    group.items.map((row) => row.number),
    [12, 13, 11, 10]
  )
})

test('the same age falls back to the number, so the order never flickers', () => {
  const [group] = groupItems([item({ number: 8 }), item({ number: 3 })])
  assert.deepEqual(
    group.items.map((row) => row.number),
    [3, 8]
  )
})

test('a deadline is a date still to come or announced as one, never a past event', () => {
  const mention = (...texts: (string | null)[]) => dateMention(NOW, ...texts)
  assert.equal(mention('mon rappel du 27/11 à 10h vérifie sa mise en ligne'), 'Le 27/11')
  assert.equal(mention('le 1er décembre'), 'Le 1er décembre')
  assert.equal(mention('livrer avant le 2026-11-20'), 'Dépassée le 2026-11-20')
  assert.equal(mention('à rendre au plus tard le 25/11'), "Aujourd'hui")
  assert.equal(mention('reprise le 05/01'), 'Le 05/01')
  assert.equal(mention(null, 'à rendre vendredi'), 'Vendredi')
  assert.equal(mention("Revue de l'incident du 25/11 : décider"), null)
  assert.equal(mention('Secrets à changer après le 12/11'), null)
  assert.equal(mention('lancer la mise à jour 3.4.1', 'étape 2/13', '3/40 des tests'), null)
  assert.equal(mention('ouverte depuis 13 jours', 'dimanches', 'mardigras'), null)
})

test('an overdue deadline says so, and a relative word expires with its card', () => {
  assert.deepEqual(deadlineOf(NOW, NOW, 'à livrer avant le 20/11'), {
    label: 'Dépassée le 20/11',
    at: new Date(2026, 10, 20).getTime(),
    overdue: true
  })
  assert.equal(deadlineOf(NOW, NOW - DAY, 'je regarde ça demain')?.label, 'Demain')
  assert.equal(deadlineOf(NOW, NOW - 5 * DAY, 'je regarde ça demain'), null)
  assert.equal(deadlineOf(NOW, NOW, 'Deux ont une échéance'), null)
  assert.equal(deadlineOf(NOW, NOW, "l'échéance du 2026-11-20")?.label, 'Dépassée le 2026-11-20')
  const today = new Date(new Date(NOW).toDateString()).getTime()
  assert.equal(deadlineOf(NOW, NOW, 'je regarde ça demain')?.at, today + DAY)
  assert.equal(deadlineOf(NOW, NOW, 'à rendre vendredi')?.at, today + 2 * DAY)
})

test('a deadline with no day ranks after every dated one, still before undated cards', () => {
  const [group] = groupItems([
    item({ number: 1, createdAt: NOW - 9 * DAY }),
    item({ number: 2, deadline: { label: 'Échéance', at: null, overdue: false } }),
    item({ number: 3, deadline: { label: 'Dépassée le 20/11', at: NOW - 5 * DAY, overdue: true } }),
    item({ number: 4, deadline: { label: 'Demain', at: NOW + DAY, overdue: false } })
  ])
  assert.deepEqual(
    group.items.map((row) => row.number),
    [3, 4, 2, 1]
  )
})

test('a CLI row keeps what the item shows and drops closed items', () => {
  const raw = {
    number: 90,
    status: 'needs_you',
    title: 'Kinkslap : envoyer les e-mails',
    createdAt: NOW - 3 * DAY,
    description: 'not shown',
    chat: { id: 'chat-9' },
    question: {
      text: 'Long context\n\nComment je déclare ?\n   - Plus tard',
      gist: 'Long context',
      decisions: [{ question: "Comment je déclare l'adresse chez Apple ?" }]
    },
    wait: null
  }
  assert.deepEqual(toBotItem('Cofounder', raw), {
    bot: 'Cofounder',
    number: 90,
    status: 'needs_you',
    title: 'Kinkslap : envoyer les e-mails',
    question: "Comment je déclare l'adresse chez Apple ?",
    waitsOn: null,
    createdAt: NOW - 3 * DAY,
    chatId: 'chat-9',
    deadline: null,
    prs: [],
    snoozedUntil: null,
    questionId: null,
    answeredAt: null,
    quickReply: null
  })
  assert.equal(toBotItem('Cofounder', { ...raw, status: 'done' }), null)
  assert.equal(toBotItem('Cofounder', { ...raw, status: 'canceled' }), null)
  const waiting = toBotItem(
    'Bot Father',
    {
      ...raw,
      status: 'waiting',
      question: null,
      wait: { text: 'rappel du 02/12' }
    },
    NOW
  )
  assert.equal(waiting?.waitsOn, 'rappel du 02/12')
  assert.equal(waiting?.deadline?.label, 'Le 02/12')
  assert.equal(toBotItem('Bot Father', { ...raw, question: { gist: 'Une seule ligne' } })?.question, 'Une seule ligne')
})

test('filters by bot, and counts what needs you', () => {
  const items = [
    item({ number: 1, bot: 'Cofounder', createdAt: NOW - 7 * DAY }),
    item({ number: 2, bot: 'Release Manager', createdAt: NOW - 2 * DAY }),
    item({ number: 3, bot: 'Release Manager', status: 'waiting', createdAt: NOW - 30 * DAY })
  ]
  assert.deepEqual(
    applyFilters(items, { bot: 'Release Manager' }).map((row) => row.number),
    [2, 3]
  )
  assert.deepEqual(needsYou(items), { count: 2, oldestAt: NOW - 7 * DAY })
  assert.deepEqual(needsYou([]), { count: 0, oldestAt: null })
  assert.deepEqual(choices(['Écrire', 'Bot', null, 'Bot']), ['Bot', 'Écrire'])
})

test('a long question is cut at a word, a short one is kept', () => {
  assert.equal(shorten('Tu fusionnes ?', 90), 'Tu fusionnes ?')
  assert.equal(
    shorten('Je prépare une surveillance extérieure des quatre adresses', 30),
    'Je prépare une surveillance…'
  )
  assert.equal(shorten('ligne\n\n  suivante', 90), 'ligne suivante')
})

test('ages read short and in French', () => {
  assert.equal(ageLabel(NOW - 10_000, NOW), '1 min')
  assert.equal(ageLabel(NOW - 3 * 3_600_000, NOW), '3 h')
  assert.equal(ageLabel(NOW - 12 * DAY, NOW), '12 j')
  assert.equal(whenLabel(NOW - 2 * DAY, NOW), '2 j')
  assert.equal(whenLabel(NOW - 12 * DAY, NOW), '13/11')
})

test("an item's pull requests keep Orca's cached state, and one Orca never checked still links to GitHub", () => {
  const prs = linkedPrs([
    {
      kind: 'pr',
      ref: 'acme/app#12',
      pr: { url: 'https://github.com/acme/app/pull/12', title: 'Fix', state: 'open', checks: 'failure' }
    },
    { kind: 'pr', ref: 'acme/app#12', pr: null },
    { kind: 'pr', ref: 'acme/web#7', pr: null },
    { kind: 'file', ref: 'item:80' },
    { kind: 'pr', ref: 'not a ref' }
  ])
  assert.deepEqual(prs, [
    {
      repo: 'acme/app',
      number: 12,
      url: 'https://github.com/acme/app/pull/12',
      title: 'Fix',
      state: 'open',
      checks: 'failure'
    },
    { repo: 'acme/web', number: 7, url: 'https://github.com/acme/web/pull/7', title: null, state: null, checks: null }
  ])
})

test('a snooze set in Orca holds until its date, and one already over is dropped', () => {
  const raw = { number: 3, status: 'needs_you', title: 'Trois', createdAt: NOW - DAY }
  assert.equal(toBotItem('Cofounder', { ...raw, snoozedUntil: NOW + DAY }, NOW)?.snoozedUntil, NOW + DAY)
  assert.equal(toBotItem('Cofounder', { ...raw, snoozedUntil: NOW - 1 }, NOW)?.snoozedUntil, null)
})

test('a single question with a recommended reply is offered on the row, several questions are not', () => {
  const raw = (decisions: unknown) => ({
    number: 7,
    status: 'needs_you',
    title: 'T',
    createdAt: NOW,
    question: { decisions }
  })
  const one = [
    { question: 'Je fusionne la PR 433 ?', replies: [{ label: 'Fusionne', recommended: true }, { label: 'Plus tard' }] }
  ]
  assert.deepEqual(toBotItem('Cofounder', raw(one), NOW)?.quickReply, {
    question: 'Je fusionne la PR 433 ?',
    label: 'Fusionne'
  })
  assert.equal(toBotItem('Cofounder', raw([...one, ...one]), NOW)?.quickReply, null)
  assert.equal(toBotItem('Cofounder', raw([{ question: 'Q', replies: [{ label: 'A' }] }]), NOW)?.quickReply, null)
})

test('English groups, ages and dates', async () => {
  await inLanguage('en', () => {
    assert.deepEqual(
      groupItems([item({ number: 1, status: 'planned' }), item({ number: 2 })]).map((group) => group.label),
      ['Needs you', 'Planned']
    )
    assert.equal(ageLabel(NOW - 10_000, NOW), '1m')
    assert.equal(ageLabel(NOW - 3 * 3_600_000, NOW), '3h')
    assert.equal(whenLabel(NOW - 2 * DAY, NOW), '2d')
    assert.equal(whenLabel(NOW - 12 * DAY, NOW), 'Nov 13')
  })
})

test('an English deadline is found, and so is a French one, labelled in English', async () => {
  await inLanguage('en', () => {
    const mention = (...texts: (string | null)[]) => dateMention(NOW, ...texts)
    assert.equal(mention('ship it by Friday'), 'Friday')
    assert.equal(mention('merge before Dec 1'), 'Dec 1')
    assert.equal(mention('due tomorrow'), 'Tomorrow')
    assert.equal(mention('the launch on December 1st'), 'Dec 1')
    assert.equal(mention('renew the key no later than 3 Jan'), 'Jan 3')
    assert.equal(mention('answer today'), 'Today')
    assert.equal(mention('à rendre vendredi'), 'Friday')
    assert.equal(mention('mon rappel du 27/11'), 'Nov 27')
    assert.equal(mention('12/01 release'), 'Jan 12')
    assert.equal(mention('the outage of Nov 20: decide'), null)
    assert.equal(mention('nearby 25/11'), null)
    assert.equal(mention('it may take 2 days', 'Mondays are busy'), null)
  })
})

test('an overdue English deadline says so, and an English date reads as a French day in French', async () => {
  await inLanguage('en', () => {
    assert.deepEqual(deadlineOf(NOW, NOW, 'due by Nov 20'), {
      label: 'Overdue since Nov 20',
      at: new Date(2026, 10, 20).getTime(),
      overdue: true
    })
    assert.equal(deadlineOf(NOW, NOW, 'à livrer avant le 20/11')?.label, 'Overdue since Nov 20')
    assert.equal(deadlineOf(NOW, NOW, 'until Nov 25')?.label, 'Today')
    assert.equal(deadlineOf(NOW, NOW - 5 * DAY, "I'll look at it tomorrow"), null)
  })
  assert.equal(dateMention(NOW, 'merge before Dec 1'), 'Le 01/12')
  assert.equal(dateMention(NOW, 'due by Nov 20'), 'Dépassée le 20/11')
  assert.equal(dateMention(NOW, 'ship it by Friday'), 'Vendredi')
})

test('the Language setting wins over the machine, and auto or anything else follows the machine', async () => {
  const { resolveLanguage, detectLanguage } = await import('./i18n.ts')
  assert.equal(resolveLanguage('fr'), 'fr')
  assert.equal(resolveLanguage('en'), 'en')
  assert.equal(resolveLanguage('auto'), detectLanguage())
  assert.equal(resolveLanguage(undefined), detectLanguage())
})
