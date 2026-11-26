import { assert, test } from 'orca/testing'
import { loadBoard, openChat } from './worker'
import { DAY, NOW, inLanguage, item } from './test-fixtures'

const envelope = (result: unknown) => JSON.stringify({ ok: true, result })

test('reads every bot, follows cursors, and names a bot that failed', async () => {
  const calls: string[][] = []
  const runner = async (args: string[]) => {
    calls.push(args)
    if (args[1] === 'list') return envelope({ bots: [{ name: 'Cofounder' }, { name: 'Broken' }, { name: 'Busy' }] })
    const bot = args[args.indexOf('--bot') + 1]
    if (bot === 'Broken') throw new Error('bot not found')
    if (bot === 'Busy') return envelope({ items: [], nextCursor: 'more' })
    if (!args.includes('--cursor'))
      return envelope({ items: [{ number: 1, status: 'needs_you', title: 'Un', createdAt: 1 }], nextCursor: 'c1' })
    return envelope({ items: [{ number: 2, status: 'done', title: 'Deux', createdAt: 2 }], nextCursor: null })
  }
  const board = await loadBoard(runner, async (names) => ({ [names[0]]: 'data:image/svg+xml;base64,AA' }))
  assert.deepEqual(
    board.items.map((row) => [row.bot, row.number]),
    [['Cofounder', 1]]
  )
  assert.deepEqual(board.failures, [
    { bot: 'Broken', reason: 'bot not found' },
    { bot: 'Busy', reason: 'coupé à 500 cartes' }
  ])
  assert.deepEqual(board.avatars, { Cofounder: 'data:image/svg+xml;base64,AA' })
  assert.ok(calls.every((args) => args.at(-1) === '--json'))
  assert.ok(
    calls.every((args) => ['list', 'item'].includes(args[1]) && !['set', 'done', 'cancel', 'comment'].includes(args[2]))
  )
})

test("opens the workspace that holds the item's chat, and says so when it is gone", async () => {
  const runner = async () =>
    envelope({ agents: [{ orcaSessionId: 'chat-1', worktreeId: 'folder:abc' }, { orcaSessionId: 'other' }] })
  const opened: string[] = []
  const open = async (id: string) => void opened.push(id)
  assert.deepEqual(await openChat(runner, open, 'chat-1'), { opened: true })
  assert.deepEqual(opened, ['folder:abc'])
  assert.deepEqual(await openChat(runner, open, 'gone'), {
    opened: false,
    reason: "Ce chat n'est plus ouvert dans Orca"
  })
})

test("a snooze kept here holds until its date and wins over Orca's earlier one; an ended one is ignored", async () => {
  const { withSnoozes, waitingOnYou } = await import('./worker')
  const board = {
    loadedAt: NOW,
    failures: [],
    avatars: {},
    snoozedHere: [],
    items: [item({ number: 1 }), item({ number: 2, snoozedUntil: NOW + DAY }), item({ number: 3 })]
  }
  const snoozed = withSnoozes(board, { '1': NOW + 2 * DAY, '2': NOW + 3 * DAY, '3': NOW - 1 }, NOW)
  assert.deepEqual(
    snoozed.items.map((row) => row.snoozedUntil),
    [NOW + 2 * DAY, NOW + 3 * DAY, null]
  )
  assert.deepEqual(snoozed.snoozedHere, [1, 2])
  assert.deepEqual(
    waitingOnYou(snoozed, NOW).map((row) => row.number),
    [3]
  )
  // the day comes: the item waits on you again
  assert.deepEqual(
    waitingOnYou(snoozed, NOW + 2 * DAY + 1).map((row) => row.number),
    [1, 3]
  )
})

test('the first read notifies nothing; later, one arrival names its bot and several are summed up', async () => {
  const { arrivals, notificationOf, attentionLine } = await import('./worker')
  const a = item({ number: 1, bot: 'Cofounder', title: 'Choisir' })
  const b = item({ number: 2, bot: 'Release Manager' })
  assert.deepEqual(arrivals(null, [a]), [])
  assert.deepEqual(arrivals(new Map([[1, 'Cofounder']]), [a, b]), [b])
  assert.deepEqual(notificationOf([a]), { title: 'Cofounder a besoin de toi', body: '1 Choisir' })
  assert.deepEqual(notificationOf([a, b]), {
    title: "2 nouvelles cartes t'attendent",
    body: 'Cofounder, Release Manager'
  })
  assert.equal(notificationOf([]), null)
  assert.deepEqual(attentionLine([a, b]), {
    text: 'Bots 2',
    tone: 'warning',
    tooltip: "Suivi des bots : 2 cartes t'attendent chez 2 bots"
  })
  assert.equal(attentionLine([]).tone, 'neutral')
})

test('an unreadable bot keeps its items known, so its answer is no flood, and the count says it is a floor', async () => {
  const { nextKnown, arrivals, attentionLine } = await import('./worker')
  const a = item({ number: 1, bot: 'Cofounder' })
  const b = item({ number: 2, bot: 'Broken' })
  const known = nextKnown(
    new Map([
      [1, 'Cofounder'],
      [2, 'Broken']
    ]),
    [a],
    ['Broken']
  )
  assert.deepEqual([...known.keys()], [1, 2])
  assert.deepEqual(arrivals(known, [a, b]), [])
  assert.deepEqual(attentionLine([a], ['Broken']), {
    text: 'Bots 1+',
    tone: 'warning',
    tooltip: "Suivi des bots : 1 carte t'attend\nBroken illisible"
  })
})

test('an answer goes to the chat that owns the item, only while the item still waits on you', async () => {
  const { answerItem } = await import('./worker')
  const calls: string[][] = []
  let status = 'needs_you'
  const runner = async (args: string[]) => {
    calls.push(args)
    if (args[0] === 'bot')
      return envelope({
        item: {
          number: 62,
          status,
          title: 'Jeton Sentry',
          owner: { name: 'Security Officer' },
          question: { eventId: 'e1066' }
        }
      })
    return envelope({ sent: true })
  }
  assert.deepEqual(await answerItem(runner, 62, [{ question: 'Tu les changes ?', reply: '  Oui\u0007 ' }]), {
    sent: true,
    question: 'e1066'
  })
  const send = calls.find((args) => args[0] === 'orchestration')!
  assert.deepEqual(send.slice(0, 10), [
    'orchestration',
    'send',
    '--from',
    'plugin:bot-items',
    '--to',
    'bot:Security Officer',
    '--type',
    'status',
    '--item',
    '62'
  ])
  assert.match(send[send.indexOf('--body') + 1]!, /Question : Tu les changes \?\nRéponse : Oui\n/)
  calls.length = 0
  status = 'done'
  assert.deepEqual(await answerItem(runner, 62, [{ question: 'Q', reply: 'Oui' }]), {
    sent: false,
    reason: "La carte n'attend plus ta réponse"
  })
  assert.ok(calls.every((args) => args[0] !== 'orchestration'))
  assert.deepEqual(await answerItem(runner, 62, [{ question: 'Q', reply: '   ' }]), {
    sent: false,
    reason: 'Choisis ou écris une réponse'
  })
})

test('a question already answered from here is not answered twice, and a new question can be', async () => {
  const { answerItem } = await import('./worker')
  let question = 'e1066'
  const runner = async (args: string[]) =>
    args[0] === 'bot'
      ? envelope({
          item: { status: 'needs_you', title: 'T', owner: { name: 'Cofounder' }, question: { eventId: question } }
        })
      : envelope({ sent: true })
  assert.deepEqual(await answerItem(runner, 5, [{ question: 'Q', reply: 'Oui' }], 'e1066'), {
    sent: false,
    reason: "Tu as déjà répondu ; Cofounder ne l'a pas encore lu"
  })
  question = 'e2000'
  assert.equal((await answerItem(runner, 5, [{ question: 'Q', reply: 'Oui' }], 'e1066')).sent, true)
})

test('an answered card waits on its bot until the bot asks something else or moves it', async () => {
  const { withAnswers, waitingOnYou } = await import('./worker')
  const at = NOW - 60_000
  const board = {
    loadedAt: NOW,
    failures: [],
    avatars: {},
    snoozedHere: [],
    items: [
      item({ number: 1, questionId: 'e1' }),
      item({ number: 2, questionId: 'e9' }),
      item({ number: 3, questionId: 'e3' })
    ]
  }
  const shown = withAnswers(board, { '1': { question: 'e1', at }, '2': { question: 'e2', at } })
  assert.deepEqual(
    shown.items.map((row) => [row.number, row.status, row.answeredAt]),
    [
      [1, 'waiting', at],
      [2, 'needs_you', null],
      [3, 'needs_you', null]
    ]
  )
  assert.match(shown.items[0]!.waitsOn!, /^que Cofounder lise ta réponse, envoyée à/)
  assert.deepEqual(
    waitingOnYou(shown, NOW).map((row) => row.number),
    [2, 3]
  )
})

test('on an English machine the bot gets its answer in English, and the status bar and notifications speak it', async () => {
  const { answerBody, answerItem, attentionLine, notificationOf, failedLine } = await import('./worker')
  await inLanguage('en', async () => {
    assert.equal(
      answerBody(62, 'Sentry token', [{ question: 'Rotate them?', reply: 'Yes' }]),
      [
        'Answer from your owner to item 62 "Sentry token", sent from the Bot items panel.',
        '',
        'Question: Rotate them?\nAnswer: Yes',
        '',
        'Carry on accordingly, then reply in this chat or update item 62 with orca bot item comment or set.'
      ].join('\n')
    )
    assert.match(
      answerBody(5, 'T', [
        { question: 'A?', reply: 'x' },
        { question: 'B?', reply: 'y' }
      ]),
      /\n- A\?\n {2}Answer: x\n- B\?\n {2}Answer: y\n/
    )
    const calls: string[][] = []
    const runner = async (args: string[]) => {
      calls.push(args)
      return args[0] === 'bot'
        ? envelope({
            item: { status: 'needs_you', title: 'T', owner: { name: 'Cofounder' }, question: { eventId: 'e1' } }
          })
        : envelope({ sent: true })
    }
    await answerItem(runner, 5, [{ question: 'Q', reply: 'Yes' }])
    const send = calls.find((args) => args[0] === 'orchestration')!
    assert.equal(send[send.indexOf('--subject') + 1], 'Your answer to item 5')
    assert.deepEqual(await answerItem(runner, 5, [{ question: 'Q', reply: ' ' }]), {
      sent: false,
      reason: 'Pick or write an answer'
    })
    const a = item({ number: 1, bot: 'Cofounder', title: 'Pick' })
    const b = item({ number: 2, bot: 'Release Manager' })
    assert.deepEqual(attentionLine([a, b], ['Broken']), {
      text: 'Bots 2+',
      tone: 'warning',
      tooltip: 'Bot items: 2 items need you across 2 bots\nBroken unreadable'
    })
    assert.equal(attentionLine([a]).tooltip, 'Bot items: 1 item needs you')
    assert.equal(attentionLine([]).tooltip, 'Bot items: nothing needs you')
    assert.equal(failedLine('timeout').tooltip, 'Bot items: could not read the bots (timeout)')
    assert.deepEqual(notificationOf([a]), { title: 'Cofounder needs you', body: '1 Pick' })
    assert.equal(notificationOf([a, b])?.title, '2 new items need you')
  })
})
