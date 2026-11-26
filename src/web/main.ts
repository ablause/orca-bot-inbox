// The panel's page: Orca wraps this module in a generated document. Preact draws the views.
import { html, render } from '../vendor/preact.mjs'
import { language, resolveLanguage, setLanguage } from '../i18n'
import { App } from './app'
import { STYLES } from './style'

const style = document.createElement('style')
style.textContent = STYLES
document.head.append(style)

orca.on('theme', ({ colorScheme }) => document.documentElement.classList.toggle('light', colorScheme === 'light'))

const root = document.createElement('div')
document.body.append(root)

// the Language setting picks the strings; changing it redraws the panel in the new language
async function draw(): Promise<void> {
  const setting = await orca.settings.get('language').catch(() => undefined)
  setLanguage(resolveLanguage(setting))
  render(html`<${App} key=${language()} />`, root)
}
orca.settings.onDidChange(() => void draw())
void draw()
