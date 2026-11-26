// The Markdown bots write (headings, lists, bold, code, rules), parsed into blocks and drawn as
// Preact elements: no HTML string ever reaches the page, so a bot's text cannot inject markup.

export type Inline = { kind: 'text' | 'strong' | 'em' | 'code'; text: string }
export type Block =
  | { kind: 'heading'; level: number; inline: Inline[] }
  | { kind: 'paragraph'; inline: Inline[] }
  | { kind: 'list'; ordered: boolean; items: Inline[][] }
  | { kind: 'code'; text: string }
  | { kind: 'quote'; inline: Inline[] }
  | { kind: 'rule' }

const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*\s][^*]*\*)|(\[[^\]]+\]\([^)]+\))/g

/** Bold, italics and code; a link keeps its text, since the panel opens nothing outside Orca. */
export function parseInline(text: string): Inline[] {
  const parts: Inline[] = []
  let at = 0
  for (const match of text.matchAll(INLINE)) {
    if (match.index! > at) parts.push({ kind: 'text', text: text.slice(at, match.index) })
    const token = match[0]
    if (match[1]) parts.push({ kind: 'code', text: token.slice(1, -1) })
    else if (match[2] || match[3]) parts.push({ kind: 'strong', text: token.slice(2, -2) })
    else if (match[4]) parts.push({ kind: 'em', text: token.slice(1, -1) })
    else parts.push({ kind: 'text', text: token.replace(/^\[([^\]]+)\].*$/, '$1') })
    at = match.index! + token.length
  }
  if (at < text.length) parts.push({ kind: 'text', text: text.slice(at) })
  return parts
}

const BULLET = /^\s*[-*+]\s+(.*)$/
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/

export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = []
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  let paragraph: string[] = []
  const flush = () => {
    if (paragraph.length) blocks.push({ kind: 'paragraph', inline: parseInline(paragraph.join(' ')) })
    paragraph = []
  }
  for (let at = 0; at < lines.length; at++) {
    const line = lines[at]
    if (/^\s*```/.test(line)) {
      flush()
      const code: string[] = []
      while (++at < lines.length && !/^\s*```/.test(lines[at])) code.push(lines[at])
      blocks.push({ kind: 'code', text: code.join('\n') })
      continue
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      flush()
      blocks.push({ kind: 'heading', level: heading[1].length, inline: parseInline(heading[2].trim()) })
      continue
    }
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flush()
      blocks.push({ kind: 'rule' })
      continue
    }
    if (/^\s*>/.test(line)) {
      flush()
      blocks.push({ kind: 'quote', inline: parseInline(line.replace(/^\s*>\s?/, '')) })
      continue
    }
    const item = BULLET.exec(line) ?? NUMBERED.exec(line)
    if (item) {
      flush()
      const ordered = NUMBERED.test(line)
      const last = blocks[blocks.length - 1]
      if (last?.kind === 'list' && last.ordered === ordered) last.items.push(parseInline(item[1]))
      else blocks.push({ kind: 'list', ordered, items: [parseInline(item[1])] })
      continue
    }
    if (!line.trim()) {
      flush()
      continue
    }
    // a line indented under a list item continues it
    const last = blocks[blocks.length - 1]
    if (!paragraph.length && /^\s{2,}\S/.test(line) && last?.kind === 'list') {
      last.items[last.items.length - 1].push({ kind: 'text', text: ` ${line.trim()}` })
      continue
    }
    paragraph.push(line.trim())
  }
  flush()
  return blocks
}
