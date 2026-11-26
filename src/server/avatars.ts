// Each bot's mascot, as Orca's own bot list draws it. A bot's folder holds `bot.json` with
// `"avatar": "mascot:N1"`, and the Orca app ships the drawings; both are read from disk, so the panel
// gets them as data URLs and never touches the network.
import { readdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

const BOTS_DIR = join(homedir(), '.orca', 'bots')
const APP_ASSETS = ['/Applications/Orca.app', join(homedir(), 'Applications', 'Orca.app')].map((app) =>
  join(app, 'Contents/Resources/app.asar.unpacked/out/renderer/assets')
)
const MASCOT = /^mascot:([A-Z]\d)$/

/** The mascot id each bot named in its folder wears, keyed by bot name. */
export async function mascotsByBot(botsDir = BOTS_DIR): Promise<Map<string, string>> {
  const found = new Map<string, string>()
  const folders = await readdir(botsDir).catch(() => [] as string[])
  await Promise.all(
    folders.map(async (folder) => {
      try {
        const bot = JSON.parse(await readFile(join(botsDir, folder, 'bot.json'), 'utf8')) as {
          name?: unknown
          avatar?: unknown
        }
        const mascot = typeof bot.avatar === 'string' ? MASCOT.exec(bot.avatar)?.[1] : undefined
        if (typeof bot.name === 'string' && mascot) found.set(bot.name, mascot)
      } catch {
        // a folder without a readable bot.json is not a bot
      }
    })
  )
  return found
}

/** `N1-<hash>.svg` in Orca's renderer assets: the tile with its background, as the bot list shows it. */
export function mascotFile(files: readonly string[], mascot: string): string | undefined {
  return files.find((file) => new RegExp(`^${mascot}-[A-Za-z0-9_-]+\\.svg$`).test(file))
}

const cache = new Map<string, string>()

export async function botAvatars(names: readonly string[]): Promise<Record<string, string>> {
  const mascots = await mascotsByBot()
  for (const dir of APP_ASSETS) {
    const files = await readdir(dir).catch(() => null)
    if (!files) continue
    const avatars: Record<string, string> = {}
    for (const name of names) {
      const mascot = mascots.get(name)
      const file = mascot && mascotFile(files, mascot)
      if (!file) continue
      if (!cache.has(file)) {
        const svg = await readFile(join(dir, file))
        cache.set(file, `data:image/svg+xml;base64,${svg.toString('base64')}`)
      }
      avatars[name] = cache.get(file)!
    }
    return avatars
  }
  return {}
}
