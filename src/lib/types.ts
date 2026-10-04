export interface TodoItem {
  lineId: string
  lineIndex: number
  text: string
  completed: boolean
  indent: string
}

export interface TodoDocument {
  path: string
  sourceSession: string
  revision: string
  sequence: number
  tasks: TodoItem[]
}

export type WidgetMode = 'collapsed' | 'expanding' | 'expanded' | 'collapsing'

export interface Profile {
  id: string
  displayName: string
  path: string
  /** Set for a daily list: the folder holding `YYYY-MM-DD.md` notes. */
  folder?: string | null
}

export interface DayInfo {
  isDaily: boolean
  /** `YYYY-MM-DD` of the note shown, if it is a dated note. */
  date: string | null
  hasOlder: boolean
  hasNewer: boolean
}

export const NOT_DAILY: DayInfo = { isDaily: false, date: null, hasOlder: false, hasNewer: false }
