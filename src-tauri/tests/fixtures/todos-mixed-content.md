---
title: Mixed content note
tags: [example]
---

# Project Notes

Some prose before any heading content. This note mixes headings, code,
and tasks to exercise the parser's excluded contexts.

## Reading list

- [ ] Not a real target section
- [x] Should still parse as a task here

```md
- [ ] This looks like a task but is inside a fenced code block
```

    - [ ] This looks like a task but is inside an indented code block

<!-- - [ ] This looks like a task but is inside an HTML comment -->

## Todos

Some notes above the first task.

- [ ] Finish singing test
- [x] Review code
  - [ ] German lesson (nested, indentation preserved)
- [ ] Buy milk

### Subsection

- [ ] Still inside Todos (level-3 subsection)

## Another section

- [ ] Not part of Todos
