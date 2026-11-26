// Orca's own sidebar look (its theme tokens, 12 px text, 11 and 10 px metadata, rounded mascot
// tiles as in its Bots list) with Linear's inbox rows: status ring, number and title, the ask in
// grey, the age at the right. Fallbacks only show before Orca's tokens arrive.
export const STYLES = `
:root {
  --surface: var(--orca-card, #171717);
  --fg: var(--orca-card-foreground, var(--orca-foreground, #f0f0f0));
  --muted-fg: var(--orca-muted-foreground, #acacac);
  --muted: var(--orca-muted, #262626);
  --hover: color-mix(in srgb, var(--orca-accent, #404040) 55%, transparent);
  --border: var(--orca-border, #ffffff12);
  --input: var(--orca-input, #ffffff26);
  --ring: var(--orca-ring, #a1a1a1);
  --destructive: var(--orca-destructive, #ff6568);
  --needs: #f59e0b;
  --progress: #eab308;
  --waiting: #8b93a7;
  --success: #22c55e;
  --fresh: #60a5fa;
  --hover-solid: color-mix(in srgb, var(--orca-accent, #404040) 55%, var(--surface));
  color-scheme: dark;
}
:root.light { --needs: #d97706; --progress: #ca8a04; --waiting: #6b7280; --success: #16a34a; --fresh: #2563eb; color-scheme: light; }
* { box-sizing: border-box; }
::-webkit-scrollbar { width: 10px; }
::-webkit-scrollbar-thumb { background: color-mix(in srgb, var(--muted-fg) 30%, transparent); border: 3px solid transparent; border-radius: 999px; background-clip: padding-box; }
html, body { margin: 0; background: var(--surface); color: var(--fg); }
body { font: 12px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
button, select { font: inherit; color: inherit; }
.icon { flex: none; display: block; }
.muted { color: var(--muted-fg); }
.tabular { font-variant-numeric: tabular-nums; }
.clamp1, .clamp2 { display: -webkit-box; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
.clamp1 { -webkit-line-clamp: 1; }
.clamp2 { -webkit-line-clamp: 2; }

main { padding: 10px 8px 16px; display: flex; flex-direction: column; gap: 12px; }
.header { display: flex; align-items: flex-start; gap: 8px; padding: 0 4px; }
.headline { margin: 0; font-size: 13px; font-weight: 600; line-height: 1.35; }
.since { margin: 1px 0 0; font-size: 11px; color: var(--muted-fg); }
.icon-button { flex: none; display: grid; place-items: center; width: 26px; height: 26px; border: 0; border-radius: 6px; background: transparent; color: var(--muted-fg); cursor: pointer; }
.icon-button:hover { background: var(--hover); color: var(--fg); }
.icon-button:disabled { opacity: .5; cursor: default; }
.icon-button:focus-visible, .bot:focus-visible, .item:focus-visible, .group-head:focus-visible, .more:focus-visible, select:focus-visible { outline: 2px solid var(--ring); outline-offset: 1px; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .spin { animation: none; } }

/* the bot strip: one tile per bot, as Orca's Bots list draws them, with what waits on you */
.bots { display: flex; flex-wrap: wrap; gap: 4px; padding: 2px 2px 0; }
.bot { position: relative; flex: none; display: grid; place-items: center; width: 34px; height: 34px; padding: 0; border: 0; border-radius: 9px; background: transparent; cursor: pointer; }
.bot:hover { background: var(--hover); }
.bot[aria-pressed="true"] { background: var(--hover); box-shadow: inset 0 0 0 1.5px var(--fg); }
.bot.all { color: var(--muted-fg); font-size: 11px; font-weight: 600; width: auto; padding: 0 9px; }
.bot.all[aria-pressed="true"] { color: var(--fg); }
.bot .count { position: absolute; top: -2px; right: -3px; min-width: 15px; height: 15px; padding: 0 4px; border-radius: 999px; background: var(--needs); color: #1c1200; font-size: 9.5px; font-weight: 700; line-height: 15px; text-align: center; box-shadow: 0 0 0 2px var(--surface); }
.avatar { flex: none; display: block; border-radius: 7px; object-fit: cover; background: var(--muted); }
.avatar.fallback { display: grid; place-items: center; color: var(--muted-fg); font-size: 11px; font-weight: 600; }

.hint { margin-left: auto; font-size: 10.5px; color: var(--muted-fg); text-align: right; }

.notice { margin: 0 4px; padding: 8px 10px; border-radius: 6px; border: 1px solid var(--border); background: var(--muted); font-size: 11px; }
.notice.danger { border-color: color-mix(in srgb, var(--destructive) 45%, transparent); }
.notice strong { display: block; margin-bottom: 2px; }

/* a group: Linear's section header, with a status ring, a label and a count */
.group { display: flex; flex-direction: column; }
.group-head { display: flex; align-items: center; gap: 7px; width: 100%; padding: 6px 6px; border: 0; border-radius: 6px; background: transparent; text-align: left; cursor: pointer; }
.group-head:hover { background: var(--hover); }
.group-head .chevron { color: var(--muted-fg); transition: transform .12s; }
.group-head[aria-expanded="true"] .chevron { transform: rotate(90deg); }
.group-label { font-size: 12px; font-weight: 600; }
.group-count { color: var(--muted-fg); font-size: 11px; }
.rows { list-style: none; margin: 2px 0 0; padding: 0; display: flex; flex-direction: column; gap: 1px; }

/* a row: mascot tile, then number, title and ask, then age and deadline */
.item { display: grid; grid-template-columns: 28px minmax(0, 1fr) 62px; gap: 10px; width: 100%; padding: 8px 6px; border: 0; border-radius: 7px; background: transparent; text-align: left; cursor: pointer; }
.item:hover { background: var(--hover); }
.item.copied { background: color-mix(in srgb, var(--success) 14%, transparent); }
.item .text, .item .title:not(.clamp2), .item .ask:not(.clamp1) { display: block; }
.item .title { margin: 0; font-size: 12.5px; font-weight: 500; line-height: 1.35; }
.item .number { color: var(--muted-fg); font-weight: 400; margin-right: 5px; }
.item .ask { margin: 2px 0 0; font-size: 11.5px; color: var(--muted-fg); line-height: 1.4; }
.item .by { color: var(--fg); opacity: .8; }
.item .side { display: flex; flex-direction: column; align-items: flex-end; gap: 5px; padding-top: 1px; }
.item .age { display: inline-flex; align-items: center; gap: 3px; font-size: 11px; color: var(--muted-fg); white-space: nowrap; }
.chip { display: inline-flex; align-items: center; height: 17px; padding: 0 6px; border-radius: 999px; border: 1px solid var(--border); background: var(--muted); color: var(--fg); font-size: 11px; font-weight: 500; white-space: nowrap; }
.chip.overdue { border-color: transparent; background: color-mix(in srgb, var(--destructive) 22%, transparent); color: var(--destructive); }
.chip.danger { border-color: transparent; background: color-mix(in srgb, var(--destructive) 22%, transparent); color: var(--destructive); }
.chip.success { border-color: transparent; background: color-mix(in srgb, var(--success) 18%, transparent); color: var(--fg); }
.chip.muted { background: none; color: var(--muted-fg); }
.more { margin: 2px 0 0 44px; font-weight: 500; padding: 4px 6px; border: 0; border-radius: 6px; background: transparent; color: var(--muted-fg); font-size: 11px; text-align: left; cursor: pointer; align-self: flex-start; }
.more:hover { background: var(--hover); color: var(--fg); }

.empty { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 36px 16px; text-align: center; }
.empty strong { font-size: 13px; }
.skeleton { height: 46px; margin: 0 4px; border-radius: 7px; background: linear-gradient(90deg, var(--muted), color-mix(in srgb, var(--muted) 60%, transparent), var(--muted)); background-size: 200% 100%; animation: shimmer 1.4s linear infinite; }
@keyframes shimmer { to { background-position: -200% 0; } }
@media (prefers-reduced-motion: reduce) { .skeleton { animation: none; } }
/* an unfolded item: what is asked first, then why, then the folded description and history */
li.expanded { border-radius: 8px; background: color-mix(in srgb, var(--muted) 55%, transparent); }
li.expanded .item:hover { background: transparent; }
li.expanded .item .title { font-size: 13px; font-weight: 600; }
.detail { display: flex; flex-direction: column; gap: 10px; max-width: calc(62ch + 54px); padding: 0 10px 12px 44px; }
.decision { display: flex; flex-direction: column; gap: 10px; }
.who { margin: 0; display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--muted-fg); }
.who strong { color: var(--fg); font-weight: 600; }
.dot { width: 6px; height: 6px; border-radius: 50%; background: var(--waiting); flex: none; }
.dot.needs_you { background: var(--needs); }
.dot.in_progress { background: var(--progress); }
.ask-block { display: flex; flex-direction: column; gap: 8px; padding: 11px 12px 10px; border: 1px solid var(--border); border-radius: 8px; background: color-mix(in srgb, #000 32%, var(--surface)); }
.q { margin: 0; font-size: 14.5px; font-weight: 600; line-height: 1.35; letter-spacing: -.005em; overflow-wrap: anywhere; }
.q.waits { font-size: 13px; font-weight: 500; }
.q-n { color: var(--muted-fg); font-weight: 500; margin-right: 5px; }
.replies { display: flex; flex-direction: column; gap: 1px; margin: 0; padding: 0; list-style: none; }
.replies li { display: grid; grid-template-columns: 18px auto 1fr; align-items: baseline; column-gap: 8px; padding: 2px 0; font-size: 12.5px; }
.replies .k { color: var(--muted-fg); font-size: 11px; }
.replies li.recommended { font-weight: 600; }
.replies li:has(.reply) { display: block; padding: 0; }
.reply { display: grid; grid-template-columns: 18px auto 1fr; align-items: baseline; column-gap: 8px; width: calc(100% + 12px); margin: 0 -6px; padding: 4px 6px; border: 1px solid transparent; border-radius: 6px; background: none; text-align: left; font-size: 12.5px; font-weight: inherit; cursor: pointer; }
.reply:hover { background: var(--hover); }
.reply.chosen { border-color: var(--input); background: var(--hover); }
.reply:focus-visible, .own:focus-visible { outline: 2px solid var(--ring); outline-offset: 1px; }
.own { width: 100%; height: 28px; padding: 0 9px; border: 1px solid var(--input); border-radius: 6px; background: transparent; color: var(--fg); font: inherit; font-size: 12px; }
.own::placeholder { color: var(--muted-fg); }
.answer:disabled { opacity: .45; cursor: default; }
.sent { display: flex; align-items: center; gap: 6px; margin: 0; font-size: 12px; color: var(--success); }
.replies .tag { color: var(--needs); font-size: 11px; font-weight: 500; }

.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.free { margin: 0; font-size: 11px; }
.small { margin: 0; font-size: 11px; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 2px; }
.answer { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 12px; border: 0; border-radius: 6px; background: var(--orca-primary, #ededed); color: var(--orca-primary-foreground, #171717); font-size: 12px; font-weight: 600; cursor: pointer; }
.answer:hover { opacity: .9; }
.quiet { display: inline-flex; align-items: center; gap: 5px; height: 28px; padding: 0 8px; border: 0; border-radius: 6px; background: none; color: var(--muted-fg); font-size: 11.5px; cursor: pointer; }
.quiet:hover { background: var(--hover); color: var(--fg); }
.quiet.static { cursor: default; }
.quiet.static:hover { background: none; color: var(--muted-fg); }
.menu-anchor { position: relative; display: inline-flex; }
.menu { position: absolute; z-index: 5; top: 30px; left: 0; display: flex; flex-direction: column; min-width: 210px; padding: 4px; border: 1px solid var(--border); border-radius: 8px; background: var(--muted); box-shadow: 0 8px 24px rgba(0,0,0,.35); }
.menu button { display: flex; justify-content: space-between; gap: 12px; padding: 6px 8px; border: 0; border-radius: 5px; background: none; text-align: left; font-size: 12px; cursor: pointer; }
.menu button:hover, .menu button:focus-visible { background: var(--hover); outline: none; }
.answer:focus-visible, .quiet:focus-visible, .link:focus-visible, .fold-head:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
.explanation { display: flex; flex-direction: column; gap: 3px; }
.clamp3 { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; }
.clamp3 .md > * { display: inline; margin: 0; }
.clamp3 .md > * + *::before { content: " "; }
.link { align-self: flex-start; padding: 4px 0; border: 0; background: none; color: var(--muted-fg); font-size: 11px; font-weight: 500; text-decoration: underline; text-underline-offset: 2px; cursor: pointer; }
.link:hover { color: var(--fg); }

/* Markdown at a reading measure: short lines, real lists, code set apart */
.md { max-width: 62ch; font-size: 12px; line-height: 1.55; color: var(--fg); overflow-wrap: anywhere; }
.explanation .md { color: var(--muted-fg); }
.explanation.news .md { color: var(--fg); }
li.expanded .item:focus-visible { outline-offset: -2px; border-radius: 8px 8px 0 0; }
.md > * { margin: 0 0 7px; }
.md > *:last-child { margin-bottom: 0; }
.md-h { font-weight: 600; margin-top: 10px; }
.md-h1, .md-h2 { font-size: 12.5px; }
.md-h3 { font-size: 12px; color: var(--muted-fg); text-transform: none; }
.md ul, .md ol { padding-left: 18px; }
.md li { margin: 2px 0; }
.md li::marker { color: var(--muted-fg); }
.md code { padding: 0 4px; border-radius: 4px; background: var(--muted); font: 11px "SF Mono", SFMono-Regular, ui-monospace, Menlo, monospace; }
.md pre { margin: 0 0 7px; padding: 8px 10px; border-radius: 6px; background: var(--muted); white-space: pre-wrap; overflow-wrap: anywhere; }
.md pre code { padding: 0; background: none; }
.md hr { border: 0; border-top: 1px solid var(--border); margin: 10px 0; }
.md blockquote { margin-left: 0; padding-left: 10px; border-left: 2px solid var(--border); color: var(--muted-fg); }

.fold { border-top: 1px solid var(--border); padding-top: 6px; }
.fold-head { display: flex; align-items: center; gap: 6px; width: 100%; min-height: 28px; padding: 4px 6px; margin: 0 -6px; border-radius: 6px; border: 0; background: none; text-align: left; cursor: pointer; font-size: 11.5px; }
.fold-head:hover { background: var(--hover); }
.fold-head .chevron { color: var(--muted-fg); transition: transform .12s; }
.fold-head[aria-expanded="true"] .chevron { transform: rotate(90deg); }
.fold-label { font-weight: 600; }
.fold-body { display: flex; flex-direction: column; gap: 6px; padding: 6px 0 2px 17px; }
.events { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; font-size: 11.5px; }
.events li { display: grid; grid-template-columns: 46px minmax(0, 1fr); gap: 6px; }
.truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.note { margin: 0; font-size: 11px; }
.note.error { color: var(--destructive); }
.skeleton.small { height: 34px; margin: 0; }
.fresh { display: inline-block; width: 7px; height: 7px; margin-right: 6px; border-radius: 50%; background: var(--fresh); vertical-align: 1px; }
.fresh-count { color: var(--fresh); font-weight: 600; }
.rows > li { position: relative; }
li.triage { border-radius: 8px; }
/* hover actions sit over the end of the row, as in Gmail or Linear: the row never changes height */
/* hover actions take the trailing column's place, never the title's: the title always stops before it (Primer's trailing actions) */
.quickbar { position: absolute; top: 6px; right: 6px; width: 62px; display: flex; justify-content: flex-end; align-items: center; gap: 2px; background: var(--hover-solid); opacity: 0; pointer-events: none; }
li.triage:hover .quickbar, li.triage:focus-within .quickbar, li.triage.selected .quickbar, .quickbar.active { opacity: 1; pointer-events: auto; }
li.triage:hover .item, li.triage:focus-within .item, li.triage.selected .item { background: var(--hover-solid); }
li.selected { box-shadow: inset 2px 0 0 var(--fresh); }
.icon-button.small { width: 26px; height: 24px; }
.icon-button.send { position: relative; color: var(--fg); }
/* the reply the check sends, said before the press: shown at once, unlike the browser's own tooltip */
.icon-button.send::after { content: attr(data-tip); position: absolute; right: 0; bottom: calc(100% + 6px); z-index: 6; max-width: 260px; padding: 4px 8px; border: 1px solid var(--border); border-radius: 6px; background: var(--muted); color: var(--fg); font-size: 11.5px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; box-shadow: 0 4px 14px rgba(0,0,0,.3); opacity: 0; pointer-events: none; transition: opacity .08s; }
.icon-button.send:hover::after, .icon-button.send:focus-visible::after, li.selected .icon-button.send::after { opacity: 1; }
.icon-button.undo { width: auto; padding: 0 6px; font-size: 11px; color: var(--fg); }
.quickbar .quick-note { padding: 0 6px; }
.announce { margin: -6px 0 0; padding: 0 4px; min-height: 0; font-size: 11px; color: var(--success); }
.announce:empty { display: none; }
@media (prefers-reduced-motion: reduce) { .quickbar { transition-duration: 0s; } }
.go { display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 9px; border: 0; border-radius: 6px; background: var(--orca-primary, #ededed); color: var(--orca-primary-foreground, #171717); font-size: 11.5px; font-weight: 600; cursor: pointer; }
.go-tag { font-weight: 500; opacity: .65; font-size: 10.5px; }
.lnk { display: inline-flex; align-items: center; gap: 5px; height: 24px; padding: 0 8px; border: 0; border-radius: 6px; background: none; color: var(--muted-fg); font-size: 11.5px; cursor: pointer; }
.lnk:hover { background: var(--muted); color: var(--fg); }
.go:focus-visible, .lnk:focus-visible { outline: 2px solid var(--ring); outline-offset: 1px; }
kbd { font: 10px ui-monospace, SFMono-Regular, Menlo, monospace; padding: 0 4px; border: 1px solid var(--border); border-radius: 3px; color: inherit; opacity: .6; }
.quick-note { display: inline-flex; align-items: center; gap: 5px; padding: 0 4px; font-size: 11.5px; color: var(--muted-fg); }
.quick-note.sent { color: var(--success); }
.quick-note.error { color: var(--destructive); }
.keys { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; margin: -4px 4px 0; padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--muted); font-size: 11.5px; }
.keys dt { white-space: nowrap; }
.keys dd { margin: 0; color: var(--muted-fg); }
.prs { display: flex; flex-direction: column; gap: 2px; max-width: calc(62ch + 12px); margin: 0 -6px; font-size: 12px; }
.pr { display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto; align-items: center; gap: 8px; width: 100%; padding: 5px 6px; border: 0; border-radius: 6px; background: none; color: var(--fg); font: inherit; font-size: 12px; text-align: left; cursor: pointer; }
.pr:hover { background: var(--muted); }
.pr:focus-visible { outline: 2px solid var(--ring); outline-offset: 1px; }
.pr .muted { font-size: 11px; }
`
