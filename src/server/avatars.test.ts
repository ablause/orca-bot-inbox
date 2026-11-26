import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { assert, test } from 'orca/testing'
import { mascotFile, mascotsByBot } from './avatars'

test("reads each bot's mascot from its folder and skips what is not a bot", async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bots-'))
  const bot = async (folder: string, json: string) => {
    await mkdir(join(dir, folder))
    await writeFile(join(dir, folder, 'bot.json'), json)
  }
  await bot('release-manager', '{"name":"Release Manager","avatar":"mascot:L2"}')
  await bot('custom', '{"name":"Custom","avatar":"file:me.png"}')
  await bot('broken', '{')
  await mkdir(join(dir, 'empty'))
  assert.deepEqual([...(await mascotsByBot(dir))], [['Release Manager', 'L2']])
})

test('picks the tile drawing, never the cut-out or rim variants', () => {
  const files = ['L2-Cj9bbzLy.webp', 'L2-cut-Xx.webp', 'L2-DQuNyW1r.svg', 'L22-Ab.svg']
  assert.equal(mascotFile(files, 'L2'), 'L2-DQuNyW1r.svg')
  assert.equal(mascotFile(files, 'K2'), undefined)
})
