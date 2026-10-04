# Typewriter

A tiny desktop todo widget shaped like a typewriter. Click the keys and a paper
sheet slides up with your tasks. Your tasks are plain Markdown files, so they
work with Obsidian. No account and no cloud.

<p>
  <img src="docs/screenshots/collapsed.png" width="260" alt="Typewriter collapsed">
  <img src="docs/screenshots/sheet.png" width="260" alt="Todo sheet open">
</p>

## Install

Download the latest file from [Releases](../../releases).

**Mac (Apple Silicon):** open the `.dmg`, drag Typewriter to Applications. The
first time, right-click the app and choose **Open**.

**Linux (x86_64):** download the `.AppImage`, then
`chmod +x Typewriter*.AppImage && ./Typewriter*.AppImage`. No root needed.

## Use

1. Click the keyboard to open the sheet.
2. Type a list name such as `Personal` and pick a folder. Typewriter creates
   `<folder>/Personal/` with today's note.
3. Add more lists with the gear (⚙). Switch lists with the `<` `>` arrows on
   the typewriter.
4. Press the red `+` to start a note for today.

<img src="docs/screenshots/leftovers.png" width="260" alt="Bring unfinished tasks over">

Press `+` on a new day and Typewriter offers to bring over yesterday's
unfinished tasks. Nothing is created or copied unless you ask.

## Updates

Typewriter checks GitHub for a new version when it starts and updates itself.
That is the only network request it makes. You can also use **Check for
updates** in the gear menu.

## Your data

Each list is a folder of `YYYY-MM-DD.md` notes. The app only stores where the
folders are. Remove a list in the gear menu and your notes stay.

## Idea Credits

[Tina Huang](https://www.youtube.com/@TinaHuang1)
