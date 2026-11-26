import { assert, test } from 'orca/testing'
import { parseInline, parseMarkdown } from './markdown'

test('blocks: headings, paragraphs joined across lines, lists, code, rules and quotes', () => {
  const blocks = parseMarkdown(
    '### Détail\n\nPremière ligne\nsuite.\n\n- un\n- deux\n  suite de deux\n1. a\n2. b\n\n```\nx = 1\n```\n---\n> note'
  )
  assert.deepEqual(
    blocks.map((block) => block.kind),
    ['heading', 'paragraph', 'list', 'list', 'code', 'rule', 'quote']
  )
  assert.deepEqual(blocks[1], { kind: 'paragraph', inline: [{ kind: 'text', text: 'Première ligne suite.' }] })
  assert.deepEqual(blocks[2], {
    kind: 'list',
    ordered: false,
    items: [
      [{ kind: 'text', text: 'un' }],
      [
        { kind: 'text', text: 'deux' },
        { kind: 'text', text: ' suite de deux' }
      ]
    ]
  })
  assert.equal(blocks[3].kind === 'list' && blocks[3].ordered, true)
  assert.deepEqual(blocks[4], { kind: 'code', text: 'x = 1' })
})

test('inline: bold, italics and code, links reduced to their text, no markup passed through', () => {
  assert.deepEqual(parseInline('**Le problème.** voir `cmd` et [PR 140](https://x) *vite* <b>'), [
    { kind: 'strong', text: 'Le problème.' },
    { kind: 'text', text: ' voir ' },
    { kind: 'code', text: 'cmd' },
    { kind: 'text', text: ' et ' },
    { kind: 'text', text: 'PR 140' },
    { kind: 'text', text: ' ' },
    { kind: 'em', text: 'vite' },
    { kind: 'text', text: ' <b>' }
  ])
})
