import type { TodoItem } from '../types'

/**
 * Fictional fixture data for the Phase 0A design prototype and
 * browser/visual tests. Never real vault content.
 */
export const fictionalTasks: TodoItem[] = [
  {
    lineId: 'f:0:0',
    lineIndex: 0,
    text: 'Sketch the carriage return animation',
    completed: false,
    indent: '',
  },
  {
    lineId: 'f:1:1',
    lineIndex: 1,
    text: 'Review oxblood accent against ivory paper',
    completed: true,
    indent: '',
  },
  {
    lineId: 'f:2:2',
    lineIndex: 2,
    text: 'Write a genuinely long task line to check text wrapping does not clip or overflow the paper sheet at the default width',
    completed: false,
    indent: '',
  },
  {
    lineId: 'f:3:3',
    lineIndex: 3,
    text: 'Confirm focus ring contrast in every theme',
    completed: false,
    indent: '',
  },
]

export const fictionalEmptyTasks: TodoItem[] = []
