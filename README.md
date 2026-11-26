# Bot Inbox for Orca

Every open item of every Orca bot on this computer in one sidebar panel, so what waits on you is in one place instead of in each bot's chat.

The panel speaks English or French, as the **Language** setting says (Settings, Plugins, Bot Inbox): **Auto**, the default, follows the system language, and **English** or **Français** picks one whatever the system says: its labels, dates, deadlines, notifications, status bar tooltip and the message sent to a bot all follow. The manifest's own names (the panel title **Bot Inbox**, the command **Bot Inbox: open**) stay in English, since Orca manifests cannot be localised.

## The panel

**Bot Inbox** reads like Linear's inbox, with the bots drawn as Orca's Bots list draws them. It opens on how many items need you, at how many bots, and how long the oldest has waited, with the count of items you have not opened yet. Under it, a strip of the bots' mascot tiles, each with an amber count of what needs you, filters the list by bot. Then come the items grouped by status, each group behind a status ring and its count: **Needs you** and **In progress** open, **Waiting** and **Planned** folded. A group shows six rows (ten for **Needs you**), then **Show N more**.

Within a group, an item with a deadline comes first, the nearest first, then the oldest. A deadline is a date still to come (`27/11`, `2026-12-01`, `1er décembre`, `Dec 1`, `December 1st`), a date that a word such as `before`, `by`, `due`, `no later than`, `until`, `avant`, `au plus tard`, `d'ici` or `pour` announces, or a relative word (`tomorrow`, `Friday`, `demain`, `vendredi`) on an item raised in the last two days. Bots write in either language, so both are read whatever the panel speaks; a numeric date is always day first (`12/01` is the 12th of January). A past date on its own is an event ("the outage of Nov 20") and is not one. The row shows what it found in a chip (`Dec 1`, `Friday`), coloured only when an announced deadline is past (`Overdue since Nov 20`).

Each row shows the bot's mascot, the item's number and title, the question the bot asked or what it waits on, and the bot's name, with the age (a date past a week) at the right and one chip under it, so a row stays two lines high: an overdue deadline first, then failing checks on a linked pull request, then a deadline, then the pull request's state. Its tooltip names both. A dot marks an item that needs you and that you have not opened, answered or snoozed since it asked.

The worker keeps reading the bots while Orca runs, every 45 seconds and once an agent's status settles, and the panel redraws when what it shows changed. A status bar item counts the items that need you, amber when there is one, and opens the panel; a desktop notification names each item that newly needs you, one per item or one summary for several, never on the first read.

A press on an item unfolds it in place, decision first: its state in one line, each question the bot asks (up to five) with the replies it offers and the recommended one marked, a field for your own answer, and **Send**, which mails the answer to the bot in the item's chat. The item then moves to **Waiting** until the bot reads it. The text that explains the question follows on three lines, then the description as Markdown at a reading measure, folded under **Details** when long or when the explanation already says it, and the history, folded, one event per line, without the comment already shown. **Open chat** shows that bot's workspace in Orca.

A row that needs you shows a bar on hover or keyboard focus: one press sends the recommended reply when the bot asks a single question, with four seconds to **Undo**, and the clock snoozes it until tomorrow. **Snooze** sets an item aside until tomorrow, the next Monday or a week out, each at 9 AM: it leaves its group and the count for a folded **Snoozed** group, and comes back on its day with a notification. **Bring back** returns it at once. An item set aside in Orca itself shows there too, until its date.

The keyboard walks the rows: `J` and `K` move between items, `Enter` sends the recommended reply of the selected item, the right and left arrows expand and collapse, `R` snoozes until tomorrow, `C` opens the bot's chat, and `?` shows the shortcuts.

The pull requests the bot linked to an item show on its row, the one that most needs a look first (`PR checks failing`, `checks running`, `checks passed`, `draft`, `merged`), with the state Orca last checked; unfolded, each opens on GitHub, where it is merged.

The plugin never changes or closes an item, and makes no network call: the only thing it sends is your answer, as a message in the item's chat. It stores its own snoozes and the answers it sent, by item number, dropping those that no longer apply, and which items you have seen.

## How it reads

No host API lists bot items, so the worker runs the local `orca` CLI: `orca bot list --json`, then `orca bot item list --bot <name> --json` for each bot, following its cursor. Closed and canceled items are left out. Only the fields an item already shows reach the panel (title, question, waits-on note, status, number, creation date, snooze date) and its pull request links with the state Orca cached for them; descriptions and other links stay out until an item is unfolded, when `orca bot item show` reads it. An answer goes through `orca orchestration send` to the bot that owns the item, after the item is read again so an answer never lands on a question already settled. Each bot's mascot is read from disk too: its id from the bot's `bot.json` under `~/.orca/bots`, the drawing from the Orca app's own assets, handed to the panel as a data URL. A bot whose mascot cannot be found gets its initials.

## Access

`trusted-worker` with `workspace:write`, used only for `workspace.open` to show a bot's workspace; `agent:read` to read the bots again when an agent's status settles; `storage:own` for the snoozes, the answers sent and what you have seen; `notifications:show` for what newly needs you. The worker is a Node process so it can run the `orca` CLI and read the mascots. The panel is an `html` panel because a components panel draws only the plugin's own files as images, never the bots' mascots.

## Limits

- A bot with more than 500 open items is cut at 500, and the panel says so.

## Develop

From the repository root:

```sh
npm install
scripts/orca-types.sh bot-inbox
npm run typecheck
orca plugin test ./bot-inbox
orca plugin dev watch ./bot-inbox
```
