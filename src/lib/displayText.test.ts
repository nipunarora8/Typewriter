import { describe, it, expect } from 'vitest'
import { displayText } from './displayText'

describe('displayText', () => {
  it('shows the note name for a wiki link', () => {
    expect(displayText('[[Fix login bug]]')).toBe('Fix login bug')
  })
  it('drops folders, .md, headings and block ids', () => {
    expect(displayText('[[Issues/Fix login.md]]')).toBe('Fix login')
    expect(displayText('[[Fix login#Steps]]')).toBe('Fix login')
    expect(displayText('[[Fix login^abc123]]')).toBe('Fix login')
  })
  it('prefers the alias', () => {
    expect(displayText('[[Issues/ENG-12|Login bug]]')).toBe('Login bug')
  })
  it('handles embeds and surrounding text', () => {
    expect(displayText('see ![[Spec]] and [[Plan]] today')).toBe('see Spec and Plan today')
  })
  it('shows the label of a markdown link', () => {
    expect(displayText('[Login bug](obsidian://open?vault=x&file=y)')).toBe('Login bug')
    expect(displayText('[](https://a.b)')).toBe('https://a.b')
  })
  it('leaves plain text and unclosed brackets alone', () => {
    expect(displayText('Buy milk')).toBe('Buy milk')
    expect(displayText('[[unclosed')).toBe('[[unclosed')
  })
})
