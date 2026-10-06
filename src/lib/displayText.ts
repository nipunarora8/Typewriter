/**
 * Show links as their title, the way Obsidian renders them in reading
 * view. Display-only: the note on disk is never changed.
 *
 *   [[Note]]              -> Note
 *   [[folder/Note.md]]    -> Note
 *   [[Note#Heading]]      -> Note
 *   [[Note|Shown text]]   -> Shown text
 *   ![[Note]]             -> Note
 *   [Shown text](url)     -> Shown text
 */
const WIKI_LINK = /!?\[\[([^\]\n]+?)\]\]/g
const MD_LINK = /!?\[([^\]\n]*)\]\(([^)\n]*)\)/g

function wikiTitle(inner: string): string {
  const pipe = inner.indexOf('|')
  if (pipe !== -1) {
    const alias = inner.slice(pipe + 1).trim()
    if (alias) return alias
    inner = inner.slice(0, pipe)
  }
  const target = inner.split('#')[0].split('^')[0].trim()
  const name = target.split('/').pop() ?? target
  return name.replace(/\.md$/i, '') || inner.trim()
}

export function displayText(text: string): string {
  return text
    .replace(WIKI_LINK, (_m, inner: string) => wikiTitle(inner))
    .replace(MD_LINK, (_m, label: string, url: string) => label.trim() || url)
}
