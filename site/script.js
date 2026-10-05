;(function () {
  'use strict'
  var doc = document,
    root = doc.documentElement
  var $ = function (s, r) {
    return (r || doc).querySelector(s)
  }
  var $$ = function (s, r) {
    return Array.prototype.slice.call((r || doc).querySelectorAll(s))
  }
  var mq = window.matchMedia('(prefers-reduced-motion: reduce)')
  var reduced = function () {
    return mq.matches
  }
  var sleep = function (ms) {
    return new Promise(function (r) {
      setTimeout(r, ms)
    })
  }
  var esc = function (s) {
    return s.replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
    })
  }

  /* ---------- theme ---------- */
  var toggle = $('.theme-toggle')
  function setTheme(t) {
    root.setAttribute('data-theme', t)
    var dark = t === 'midnight'
    toggle.setAttribute('aria-pressed', String(dark))
    toggle.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme')
    var m = $('meta[name="theme-color"]')
    if (m) m.content = dark ? '#14141a' : '#a23b35'
    try {
      localStorage.setItem('tw-theme', t)
    } catch (e) {}
  }
  toggle.addEventListener('click', function () {
    setTheme(root.getAttribute('data-theme') === 'midnight' ? 'ivory' : 'midnight')
  })
  $$('[data-set-theme]').forEach(function (b) {
    b.addEventListener('click', function () {
      setTheme(b.dataset.setTheme)
    })
  })
  setTheme(root.getAttribute('data-theme') || 'ivory')

  /* ---------- copy buttons ---------- */
  function wireCopy(btnSel, srcSel) {
    var btn = $(btnSel)
    if (!btn) return
    btn.addEventListener('click', function () {
      var text = $(srcSel).textContent
      function done(ok) {
        btn.textContent = ok ? 'Copied' : 'Press Cmd/Ctrl+C'
        setTimeout(function () {
          btn.textContent = 'Copy'
        }, 2000)
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
          function () {
            done(true)
          },
          function () {
            done(false)
          },
        )
      } else {
        done(false)
      }
    })
  }
  wireCopy('#copy-install', '#install-cmd')
  $$('.copy-icon').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var text = $(btn.getAttribute('data-copy')).textContent
      function done(ok) {
        if (!ok) return
        btn.classList.add('ok')
        setTimeout(function () {
          btn.classList.remove('ok')
        }, 1800)
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
          function () {
            done(true)
          },
          function () {
            done(false)
          },
        )
      }
    })
  })

  /* ---------- direct AppImage link (file name carries the version) ---------- */
  var dlLinux = $('#dl-linux')
  if (dlLinux && window.fetch) {
    fetch('https://api.github.com/repos/nipunarora8/Typewriter/releases/latest')
      .then(function (r) {
        return r.ok ? r.json() : null
      })
      .then(function (rel) {
        var a =
          rel &&
          rel.assets.filter(function (x) {
            return /\.AppImage$/.test(x.name)
          })[0]
        if (a) dlLinux.href = a.browser_download_url
      })
      .catch(function () {})
  }

  /* ---------- scroll reveal ---------- */
  var reveals = $$('.reveal')
  function showAll() {
    reveals.forEach(function (el) {
      el.classList.add('in')
      fire(el)
    })
  }
  function fire(el) {
    if (el.id === 'card-md')
      (setTimeout(function () {
        $('#md-box1').textContent = '[x]'
        $('#md-box1').classList.add('on')
      }, 500),
        setTimeout(function () {
          $('#md-box2').textContent = '[x]'
          $('#md-box2').classList.add('on')
        }, 1100))
    if (el.id === 'card-notes')
      setTimeout(function () {
        $('#newfile').classList.add('in')
      }, 600)
    if (el.id === 'card-left')
      setTimeout(function () {
        var p = $('#pill')
        p.classList.add('press')
        setTimeout(function () {
          p.classList.remove('press')
        }, 220)
      }, 900)
  }
  if ('IntersectionObserver' in window && !reduced()) {
    var io = new IntersectionObserver(
      function (es) {
        es.forEach(function (e) {
          if (e.isIntersecting) {
            e.target.classList.add('in')
            fire(e.target)
            io.unobserve(e.target)
          }
        })
      },
      { threshold: 0.15, rootMargin: '0px 0px -5% 0px' },
    )
    reveals.forEach(function (el) {
      io.observe(el)
    })
  } else {
    showAll()
    $('#newfile').classList.add('in')
    $('#md-box1').textContent = '[x]'
  }

  /* ---------- demo data ---------- */
  function ymd(off) {
    var d = new Date()
    d.setDate(d.getDate() + off)
    return (
      d.getFullYear() +
      '-' +
      String(d.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(d.getDate()).padStart(2, '0')
    )
  }
  var TODAY = ymd(0)
  var T = function (t, d) {
    return { t: t, d: !!d }
  }
  var lists = [
    {
      name: 'PERSONAL',
      idx: 1,
      notes: [
        { date: ymd(-1), tasks: [T('Buy oat milk', true), T('Email landlord')] },
        { date: TODAY, tasks: [T('Water the plants'), T('Call mum'), T('Book dentist')] },
      ],
    },
    {
      name: 'WORK',
      idx: 0,
      notes: [
        {
          date: ymd(-1),
          tasks: [T('Review the PR', true), T('Write release notes'), T('Reply to Sam')],
        },
      ],
    },
    {
      name: 'READING',
      idx: 0,
      notes: [{ date: TODAY, tasks: [T('Finish chapter 4'), T('Return library book')] }],
    },
  ]
  var cur = 0

  /* ---------- sheet ---------- */
  var sheetEl = $('#todo-sheet'),
    listEl = $('#s-list'),
    bannerEl = $('#s-banner'),
    input = $('#s-input')
  var STRIKE =
    '<svg class="strike" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="M1 6 C 14 2, 26 9, 44 5 S 76 3, 99 5"/></svg>'
  var note = function () {
    var l = lists[cur]
    return l.notes[l.idx]
  }

  function taskHTML(t, i) {
    return (
      '<li><label class="task"><input type="checkbox" data-i="' +
      i +
      '"' +
      (t.d ? ' checked' : '') +
      '><span class="t">' +
      esc(t.t) +
      STRIKE +
      '</span></label></li>'
    )
  }
  function render(swap) {
    var l = lists[cur],
      n = note()
    $('#s-title').textContent = l.name
    $('#d-name').textContent = l.name
    $('#s-date').textContent = n.date
    $('[data-act="prev"]', sheetEl).disabled = l.idx === 0
    $('[data-act="next"]', sheetEl).disabled = l.idx === l.notes.length - 1
    $('[data-act="new"]', sheetEl).disabled = l.notes[l.notes.length - 1].date === TODAY
    if (n.pending) {
      bannerEl.hidden = false
      bannerEl.innerHTML =
        '<span>' +
        n.pending.items.length +
        ' unfinished from ' +
        n.pending.from +
        '</span><button type="button" class="go" data-act="bring">Bring them over</button><button type="button" data-act="skip">Not now</button>'
    } else {
      bannerEl.hidden = true
      bannerEl.innerHTML = ''
    }
    listEl.innerHTML = n.tasks.length
      ? n.tasks.map(taskHTML).join('')
      : '<li class="s-empty">No tasks yet. Add one below.</li>'
    if (swap && !reduced()) {
      listEl.classList.remove('swap')
      void listEl.offsetWidth
      listEl.classList.add('swap')
    }
  }
  function switchList(d) {
    cur = (cur + d + lists.length) % lists.length
    render(true)
  }
  function newNote() {
    var l = lists[cur],
      last = l.notes[l.notes.length - 1]
    if (last.date === TODAY) return
    var left = last.tasks.filter(function (t) {
      return !t.d
    })
    l.notes.push({
      date: TODAY,
      tasks: [],
      pending: left.length ? { from: last.date, items: left } : null,
    })
    l.idx = l.notes.length - 1
    render(true)
  }
  function bring() {
    var n = note()
    if (!n.pending) return
    n.tasks = n.pending.items.map(function (t) {
      return T(t.t)
    })
    n.pending = null
    render(true)
  }
  function addTask(text) {
    text = text.trim()
    if (!text) return
    var n = note()
    if (n.date !== TODAY && lists[cur].idx === lists[cur].notes.length - 1 && false) return
    n.tasks.push(T(text))
    if (n.tasks.length === 1) {
      render()
    } else {
      listEl.insertAdjacentHTML(
        'beforeend',
        taskHTML(n.tasks[n.tasks.length - 1], n.tasks.length - 1),
      )
    }
    var li = listEl.lastElementChild
    if (li && !reduced()) {
      li.firstChild.classList.add('pop')
    }
    listEl.scrollTop = listEl.scrollHeight
  }
  sheetEl.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]')
    if (!b || b.disabled) return
    var a = b.dataset.act,
      l = lists[cur]
    if (a === 'prev' && l.idx > 0) {
      l.idx--
      render(true)
    } else if (a === 'next' && l.idx < l.notes.length - 1) {
      l.idx++
      render(true)
    } else if (a === 'new') newNote()
    else if (a === 'bring') bring()
    else if (a === 'skip') {
      note().pending = null
      render()
    }
  })
  listEl.addEventListener('change', function (e) {
    var c = e.target
    if (c.type !== 'checkbox') return
    note().tasks[+c.dataset.i].d = c.checked
  })
  $('#s-add').addEventListener('submit', function (e) {
    e.preventDefault()
    addTask(input.value)
    input.value = ''
  })
  $('[data-act="list-prev"]').addEventListener('click', function () {
    switchList(-1)
  })
  $('[data-act="list-next"]').addEventListener('click', function () {
    switchList(1)
  })

  /* paper toggle */
  var slot = $('#paper-slot'),
    ptoggle = $('#paper-toggle')
  function setPaper(open) {
    slot.classList.toggle('closed', !open)
    sheetEl.setAttribute('aria-hidden', String(!open))
    sheetEl.inert = !open
    ptoggle.setAttribute('aria-expanded', String(open))
    ptoggle.textContent = open ? 'Hide the paper' : 'Show the paper'
  }
  ptoggle.addEventListener('click', function () {
    cancelDemo()
    setPaper(slot.classList.contains('closed'))
  })

  /* ---------- keyboard ---------- */
  var rows = ['1234567890', 'QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM!?'],
    keysEl = $('#keys'),
    keyMap = {},
    keyList = []
  rows.forEach(function (r, ri) {
    var row = doc.createElement('div')
    row.className = 'row'
    r.split('').forEach(function (ch, ci) {
      var b = doc.createElement('button')
      b.type = 'button'
      b.className = 'key'
      b.textContent = ch
      b.dataset.r = ri
      b.dataset.c = ci
      b.tabIndex = -1
      b.setAttribute('aria-label', 'Type ' + ch)
      keyMap[ch] = b
      keyList.push(b)
      row.appendChild(b)
    })
    keysEl.appendChild(row)
  })
  var sp = doc.createElement('button')
  sp.type = 'button'
  sp.className = 'space'
  sp.tabIndex = -1
  sp.setAttribute('aria-label', 'Space')
  sp.dataset.r = 4
  sp.dataset.c = 0
  keyMap[' '] = sp
  keyList.push(sp)
  keysEl.appendChild(sp)
  keyList[0].tabIndex = 0

  function press(ch) {
    var k = keyMap[ch === ' ' ? ' ' : ch.toUpperCase()]
    if (!k) return
    k.classList.add('down')
    setTimeout(function () {
      k.classList.remove('down')
    }, 110)
  }
  function typeChar(ch) {
    press(ch)
    if (!slot.classList.contains('closed') && input.value.length < 40)
      input.value += ch === ' ' ? ' ' : ch.toLowerCase()
  }
  keysEl.addEventListener('click', function (e) {
    var k = e.target.closest('.key, .space')
    if (!k) return
    typeChar(k === sp ? ' ' : k.textContent)
  })
  keysEl.addEventListener('keydown', function (e) {
    var k = e.target.closest('.key, .space')
    if (!k) return
    var i = keyList.indexOf(k),
      r = +k.dataset.r,
      c = +k.dataset.c,
      n = null
    function at(rr, cc) {
      if (rr === 4) return sp
      if (rr < 0 || rr > 3) return null
      return keyList[rr * 10 + Math.min(cc, rows[rr].length - 1)] || null
    }
    if (e.key === 'ArrowRight') n = keyList[Math.min(i + 1, keyList.length - 1)]
    else if (e.key === 'ArrowLeft') n = keyList[Math.max(i - 1, 0)]
    else if (e.key === 'ArrowDown') n = at(r + 1, c)
    else if (e.key === 'ArrowUp') n = r === 4 ? at(3, 4) : at(r - 1, c)
    else if (
      e.key.length === 1 &&
      /[a-z0-9!? ]/i.test(e.key) &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey
    ) {
      e.preventDefault()
      typeChar(e.key)
      return
    } else return
    if (!n) return
    e.preventDefault()
    keyList.forEach(function (x) {
      x.tabIndex = -1
    })
    n.tabIndex = 0
    n.focus()
  })

  /* ---------- demo choreography ---------- */
  var token = 0,
    skipHeadline = false
  function cancelDemo() {
    token++
    skipHeadline = true
  }
  var wrap = $('.tw-wrap')
  ;['pointerdown', 'keydown', 'focusin'].forEach(function (ev) {
    wrap.addEventListener(ev, cancelDemo)
  })
  var Abort = {}
  async function demo() {
    var my = ++token
    var w = async function (ms) {
      await sleep(ms)
      if (my !== token) throw Abort
    }
    var tickAt = function (i) {
      var c = $('.task input[data-i="' + i + '"]', listEl)
      if (c) {
        c.checked = true
        c.dispatchEvent(new Event('change', { bubbles: true }))
      }
    }
    try {
      await w(300)
      setPaper(true)
      await w(1100)
      tickAt(0)
      await w(900)
      tickAt(1)
      await w(1000)
      for (var ch of 'buy stamps') {
        typeChar(ch)
        await w(95)
      }
      await w(350)
      press('?')
      addTask(input.value)
      input.value = ''
      await w(1300)
      var ln = $('#ln')
      ln.classList.add('down')
      setTimeout(function () {
        ln.classList.remove('down')
      }, 150)
      switchList(1)
      await w(1500)
      newNote()
      await w(1700)
      bring()
      await w(900)
      tickAt(0)
    } catch (e) {
      if (e !== Abort) throw e
    }
  }

  var h1 = $('#headline')
  function typeHeadline() {
    var text = h1.textContent,
      chars = []
    h1.textContent = ''
    text.split(' ').forEach(function (word, wi, arr) {
      var w = doc.createElement('span')
      w.className = 'w'
      word.split('').forEach(function (c) {
        var s = doc.createElement('span')
        s.className = 'ch pending'
        s.textContent = c
        w.appendChild(s)
        chars.push(s)
      })
      h1.appendChild(w)
      if (wi < arr.length - 1) h1.appendChild(doc.createTextNode(' '))
    })
    return (async function () {
      var prev = null
      await sleep(350)
      for (var i = 0; i < chars.length; i++) {
        if (skipHeadline) {
          chars.forEach(function (c) {
            c.classList.remove('pending', 'cur')
          })
          return
        }
        if (prev) prev.classList.remove('cur')
        chars[i].classList.remove('pending')
        chars[i].classList.add('cur')
        prev = chars[i]
        press(chars[i].textContent)
        var ch = chars[i].textContent
        await sleep(ch === ' ' ? 50 : 55 + Math.random() * 45)
      }
      if (prev) prev.classList.remove('cur')
    })()
  }

  render(false)
  if (reduced()) {
    setPaper(true)
  } else {
    setPaper(false)
    typeHeadline().then(function () {
      if (skipHeadline) setPaper(true)
      else demo()
    })
  }

  /* ---------- feature mini: list switcher ---------- */
  var names = ['PERSONAL', 'WORK', 'READING'],
    mi = 0
  function mstep(d) {
    mi = (mi + d + 3) % 3
    $('#m-name').textContent = names[mi]
  }
  $('#m-prev').addEventListener('click', function () {
    mstep(-1)
  })
  $('#m-next').addEventListener('click', function () {
    mstep(1)
  })
})()
