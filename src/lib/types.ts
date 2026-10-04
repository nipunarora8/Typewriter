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
