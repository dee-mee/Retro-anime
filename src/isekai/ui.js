import './isekai.css'
import { emblemSVG } from './logo.js'

/**
 * The isekai HUD and every way a hand gets into the game: a floating joystick on the left
 * half of the screen, look-and-pinch on the right half, a cluster of action buttons in the
 * shooter-style bottom-right corner, and a keyboard for testing on a desktop.
 *
 * The UI knows nothing about the rules. It shows what it is told and calls `game.press(name)`
 * when something is pressed.
 */

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

const MENU = [
  { id: 'status', icon: '\u{1F4CA}', title: 'Status' },
  { id: 'quests', icon: '\u{1F4DC}', title: 'Quests' },
  { id: 'party', icon: '\u{1F465}', title: 'Party' },
  { id: 'base', icon: '\u{1F3E0}', title: 'Base' },
  { id: 'map', icon: '\u{1F5FA}', title: 'World map' },
  { id: 'settings', icon: '⚙', title: 'Settings' },
]

const KEYS = {
  KeyJ: 'attack',
  Space: 'attack',
  KeyK: 's0',
  Digit1: 's0',
  KeyL: 's1',
  Digit2: 's1',
  KeyU: 's2',
  Digit3: 's2',
  KeyI: 's3',
  Digit4: 's3',
  ShiftLeft: 'dash',
  ShiftRight: 'dash',
  KeyQ: 'potion',
  KeyE: 'interact',
  KeyF: 'interact',
  Tab: 'menu:status',
  KeyC: 'menu:status',
  KeyM: 'menu:map',
  KeyP: 'menu:party',
  KeyB: 'menu:base',
  KeyO: 'menu:quests',
}

export class UI {
  constructor(game) {
    this.game = game
    this.move = { x: 0, y: 0 }
    this._keys = new Set()
    this._pointers = new Map()
    this._stick = null
    this._pinch = 0
    this._pool = { bar: [], tag: [] }

    const el = (this.el = document.createElement('div'))
    el.className = 'ik'
    el.innerHTML = `
      <div class="ik-touch"></div>
      <div class="ik-stick"><i></i></div>
      <div class="ik-float"></div>
      <div class="ik-hurt"></div>
      <div class="ik-hero ik-panel">
        <div class="who"><span class="lv">Lv 1</span><span class="name"></span><span class="lv rank" style="margin-left:auto">F</span></div>
        <div class="ik-bar hp"><i></i><span></span></div>
        <div class="ik-bar mp"><i></i><span></span></div>
        <div class="ik-bar xp"><i></i></div>
      </div>
      <div class="ik-track ik-panel"></div>
      <div class="ik-region ik-panel"></div>
      <div class="ik-boss ik-panel"><div class="nm"></div><div class="ik-bar hp"><i></i></div></div>
      <div class="ik-topright">
        <div class="ik-gold ik-panel">0 G</div>
        <div class="ik-menu">${MENU.map((m) => `<button type="button" data-menu="${m.id}" title="${m.title}">${m.icon}</button>`).join('')}</div>
        <canvas class="ik-minimap" width="232" height="232"></canvas>
      </div>
      <div class="ik-actions">
        <button type="button" class="ik-btn attack" data-act="attack"><span class="ico">\u2694\uFE0F</span></button>
        <button type="button" class="ik-btn s0" data-act="s0"><span class="cd"></span><span class="ico"></span><span class="lbl"></span></button>
        <button type="button" class="ik-btn s1" data-act="s1"><span class="cd"></span><span class="ico"></span><span class="lbl"></span></button>
        <button type="button" class="ik-btn s2" data-act="s2"><span class="cd"></span><span class="ico"></span><span class="lbl"></span></button>
        <button type="button" class="ik-btn s3" data-act="s3"><span class="cd"></span><span class="ico"></span><span class="lbl"></span></button>
        <button type="button" class="ik-btn dash" data-act="dash"><span class="cd"></span><span class="ico">\u{1F4A8}</span><span class="lbl">DASH</span></button>
        <button type="button" class="ik-btn potion" data-act="potion"><span class="ico">\u{1F9EA}</span><span class="count">0</span></button>
      </div>
      <button type="button" class="ik-interact" data-act="interact"></button>
      <div class="ik-banner"><h2></h2><p></p></div>
      <div class="ik-toasts"></div>
      <div class="ik-system"></div>
      <div class="ik-episode"><div class="band"></div><div class="no"></div><div class="ttl"></div></div>
      <div class="ik-dialog ik-panel"><div class="nm"></div><div class="tx"></div><div class="ch"></div></div>
      <div class="ik-modal"><div class="ik-w"><button type="button" class="x">✕</button><h3></h3><div class="body"></div></div></div>
      <div class="ik-intro"></div>
      <div class="ik-fade"></div>
      <div class="ik-rotate"><div>\u{1F4F1}↻<br/><br/>Turn your phone sideways to play.</div></div>
    `
    document.body.appendChild(el)
    document.body.classList.add('isekai')
    this.$ = (s) => el.querySelector(s)

    this.minimap = this.$('.ik-minimap').getContext('2d')
    this._bindTouch()
    this._bindButtons()
    this._bindKeys()
  }

  // ── input ───────────────────────────────────────────────────────────────────────────

  get blocked() {
    return this.$('.ik-modal').classList.contains('on') || this.$('.ik-intro').classList.contains('on')
  }

  _bindTouch() {
    const layer = this.$('.ik-touch')
    const stick = this.$('.ik-stick')
    const knob = stick.querySelector('i')
    const R = 52

    const setKnob = (dx, dy) => {
      knob.style.transform = `translate(${dx}px, ${dy}px)`
    }
    const idleStick = () => {
      // A resting ghost of the stick, bottom-left, so a first-time player knows where it is.
      const h = window.innerHeight
      stick.style.left = `${Math.max(96, window.innerWidth * 0.12)}px`
      stick.style.top = `${h - Math.min(110, h * 0.26)}px`
      stick.classList.remove('on')
      stick.classList.add('idle')
      setKnob(0, 0)
    }
    idleStick()
    window.addEventListener('resize', () => !this._stick && idleStick())

    layer.addEventListener('pointerdown', (e) => {
      layer.setPointerCapture?.(e.pointerId)
      const left = e.clientX < window.innerWidth * 0.45
      if (left && !this._stick) {
        this._stick = { id: e.pointerId, x: e.clientX, y: e.clientY }
        stick.style.left = `${e.clientX}px`
        stick.style.top = `${e.clientY}px`
        stick.classList.add('on')
        stick.classList.remove('idle')
        setKnob(0, 0)
        return
      }
      this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (this._pointers.size === 2) this._pinch = this._pinchDist()
    })
    layer.addEventListener('pointermove', (e) => {
      if (this._stick && e.pointerId === this._stick.id) {
        let dx = e.clientX - this._stick.x
        let dy = e.clientY - this._stick.y
        const d = Math.hypot(dx, dy)
        if (d > R) {
          dx = (dx / d) * R
          dy = (dy / d) * R
        }
        setKnob(dx, dy)
        // A small dead zone, then full speed sooner than full deflection: thumbs are short.
        const m = Math.min(1, Math.max(0, (Math.min(d, R) / R - 0.12) / 0.7))
        const a = Math.atan2(dy, dx)
        this.move.x = Math.cos(a) * m
        this.move.y = -Math.sin(a) * m
        return
      }
      const p = this._pointers.get(e.pointerId)
      if (!p) return
      if (this._pointers.size >= 2) {
        p.x = e.clientX
        p.y = e.clientY
        const d = this._pinchDist()
        if (this._pinch > 0) this.game.zoom(this._pinch / d)
        this._pinch = d
        return
      }
      this.game.look(e.clientX - p.x, e.clientY - p.y)
      p.x = e.clientX
      p.y = e.clientY
    })
    const up = (e) => {
      if (this._stick && e.pointerId === this._stick.id) {
        this._stick = null
        this.move.x = 0
        this.move.y = 0
        idleStick()
      }
      this._pointers.delete(e.pointerId)
      this._pinch = this._pointers.size === 2 ? this._pinchDist() : 0
    }
    layer.addEventListener('pointerup', up)
    layer.addEventListener('pointercancel', up)
    layer.addEventListener('wheel', (e) => this.game.zoom(1 + Math.sign(e.deltaY) * 0.1), { passive: true })
    layer.addEventListener('contextmenu', (e) => e.preventDefault())
  }

  _pinchDist() {
    const [a, b] = [...this._pointers.values()]
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0
  }

  _bindButtons() {
    for (const b of this.el.querySelectorAll('[data-act]')) {
      const act = b.dataset.act
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault()
        e.stopPropagation()
        b.classList.add('down')
        this.game.press(act, true)
      })
      const release = () => {
        b.classList.remove('down')
        this.game.press(act, false)
      }
      b.addEventListener('pointerup', release)
      b.addEventListener('pointerleave', release)
      b.addEventListener('pointercancel', release)
    }
    for (const b of this.el.querySelectorAll('[data-menu]')) {
      b.addEventListener('click', () => this.game.openMenu(b.dataset.menu))
    }
    this.$('.ik-w .x').addEventListener('click', () => this.closeWindow())
    this.$('.ik-modal').addEventListener('pointerdown', (e) => {
      if (e.target === this.$('.ik-modal')) this.closeWindow()
    })
  }

  _bindKeys() {
    const axis = () => {
      const k = this._keys
      if (this._stick) return
      let x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0)
      let y = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0)
      const m = Math.hypot(x, y) || 1
      this.move.x = x / m
      this.move.y = y / m
    }
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) {
        if (e.code === 'Enter') e.target.dispatchEvent(new Event('submit'))
        return
      }
      if (e.code === 'Escape') {
        if (this.$('.ik-modal').classList.contains('on')) this.closeWindow()
        else this.game.press('escape', true)
        return
      }
      if (e.code === 'Tab') e.preventDefault()
      if (e.repeat) return
      this._keys.add(e.code)
      axis()
      const act = KEYS[e.code]
      if (!act) return
      e.preventDefault()
      if (act.startsWith('menu:')) this.game.openMenu(act.slice(5))
      else this.game.press(act, true)
    })
    window.addEventListener('keyup', (e) => {
      this._keys.delete(e.code)
      axis()
      const act = KEYS[e.code]
      if (act && !act.startsWith('menu:')) this.game.press(act, false)
    })
    window.addEventListener('blur', () => {
      this._keys.clear()
      axis()
    })
  }

  // ── the HUD ─────────────────────────────────────────────────────────────────────────

  setHero(h) {
    const key = `${h.name}|${h.level}|${Math.round(h.hp)}|${h.maxHp}|${Math.round(h.mp)}|${h.maxMp}|${h.xp}|${h.next}|${h.gold}|${h.rank}`
    if (key === this._heroKey) return
    this._heroKey = key
    this.$('.ik-hero .lv').textContent = `Lv ${h.level}`
    this.$('.ik-hero .name').textContent = h.name
    this.$('.ik-hero .rank').textContent = `Rank ${h.rank}`
    const bar = (sel, v, max, text = true) => {
      this.$(`${sel} > i`).style.width = `${Math.max(0, Math.min(1, v / max)) * 100}%`
      if (text) this.$(`${sel} > span`).textContent = `${Math.max(0, Math.ceil(v))} / ${max}`
    }
    bar('.ik-hero .hp', h.hp, h.maxHp)
    bar('.ik-hero .mp', h.mp, h.maxMp)
    bar('.ik-hero .xp', h.xp, h.next, false)
    this.$('.ik-gold').textContent = `${h.gold.toLocaleString()} G`
  }

  setTracker(html) {
    if (html === this._track) return
    this._track = html
    this.$('.ik-track').innerHTML = html
  }

  setRegion(text) {
    this.$('.ik-region').textContent = text
  }

  setSkills(list) {
    // Called every frame; only touch the DOM when something visible actually changed.
    const key = list.map((s) => `${s.icon}${s.locked ? s.lockText : s.name}${s.noMp}${Math.round(s.cd * 20)}`).join('|')
    if (key === this._skillsKey) return
    this._skillsKey = key
    list.forEach((s, i) => {
      const b = this.$(`.ik-btn.s${i}`)
      if (!b) return
      b.querySelector('.ico').textContent = s.icon
      b.querySelector('.lbl').textContent = s.locked ? s.lockText : s.name
      b.classList.toggle('locked', s.locked)
      b.classList.toggle('nomp', !s.locked && s.noMp)
      b.querySelector('.cd').style.setProperty('--p', `${Math.round(s.cd * 100)}%`)
    })
  }

  setDash(cd) {
    const p = Math.round(cd * 20)
    if (p === this._dash) return
    this._dash = p
    this.$('.ik-btn.dash .cd').style.setProperty('--p', `${Math.round(cd * 100)}%`)
  }

  setWeapon(staff) {
    if (staff === this._staff) return
    this._staff = staff
    this.$(".ik-btn.attack .ico").textContent = staff ? "\u{1FA84}" : "\u2694\uFE0F"
  }

  setPotions(n) {
    if (n === this._potions) return
    this._potions = n
    this.$('.ik-btn.potion .count').textContent = n
  }

  setInteract(label) {
    if (label === this._interact) return
    this._interact = label
    const b = this.$('.ik-interact')
    b.classList.toggle('on', Boolean(label))
    if (label) b.textContent = label
  }

  setBoss(boss) {
    const el = this.$('.ik-boss')
    el.classList.toggle('on', Boolean(boss))
    if (!boss) return
    el.querySelector('.nm').textContent = boss.name
    el.querySelector('i').style.width = `${Math.max(0, boss.pct) * 100}%`
  }

  /** Health bars over monsters: `[{ x, y, pct }]` in CSS pixels. Elements are pooled. */
  bars(list) {
    this._place('bar', list, (e, b) => {
      e.firstChild.style.width = `${b.pct * 100}%`
    })
  }

  /** Name tags over villagers worth talking to: `[{ x, y, text, quest }]`. */
  tags(list) {
    this._place('tag', list, (e, t) => {
      if (e.textContent !== t.text) e.textContent = t.text
      e.classList.toggle('quest', Boolean(t.quest))
    })
  }

  _place(kind, list, fill) {
    const pool = this._pool[kind]
    const layer = this.$('.ik-float')
    while (pool.length < list.length) {
      const e = document.createElement('div')
      e.className = kind === 'bar' ? 'ik-mbar' : 'ik-tag'
      if (kind === 'bar') e.appendChild(document.createElement('i'))
      layer.appendChild(e)
      pool.push(e)
    }
    pool.forEach((e, i) => {
      const item = list[i]
      if (!item) {
        if (e.style.display !== 'none') e.style.display = 'none'
        return
      }
      if (e.style.display) e.style.display = ''
      e.style.transform = `translate3d(${Math.round(item.x)}px, ${Math.round(item.y)}px, 0)`
      fill(e, item)
    })
  }

  float(x, y, text, cls = '') {
    const e = document.createElement('div')
    e.className = `ik-dmg ${cls}`
    e.textContent = text
    e.style.left = `${x + (Math.random() - 0.5) * 24}px`
    e.style.top = `${y}px`
    this.$('.ik-float').appendChild(e)
    setTimeout(() => e.remove(), 950)
  }

  hurt() {
    const e = this.$('.ik-hurt')
    e.classList.add('on')
    requestAnimationFrame(() => requestAnimationFrame(() => e.classList.remove('on')))
  }

  banner(title, sub = '') {
    const b = this.$('.ik-banner')
    b.querySelector('h2').textContent = title
    b.querySelector('p').textContent = sub
    b.classList.remove('on')
    void b.offsetWidth
    b.classList.add('on')
  }

  /** A 【System】 announcement, queued so a burst of them reads one after another. */
  system(text) {
    const box = this.$('.ik-system')
    const el = document.createElement('div')
    el.className = 'msg'
    el.innerHTML = `<b>【System】</b> ${esc(text)}`
    const delay = Math.max(0, (this._sysUntil || 0) - performance.now())
    this._sysUntil = performance.now() + delay + 1500
    setTimeout(() => {
      box.appendChild(el)
      setTimeout(() => el.remove(), 4200)
    }, delay)
  }

  /** An old-school anime episode title card. */
  episode(no, title) {
    const e = this.$('.ik-episode')
    e.querySelector('.no').textContent = no
    e.querySelector('.ttl').textContent = title
    e.classList.remove('on')
    void e.offsetWidth
    e.classList.add('on')
    return new Promise((r) => setTimeout(r, 3200))
  }

  toast(text) {
    const t = document.createElement('div')
    t.className = 'ik-toast ik-panel'
    t.textContent = text
    const wrap = this.$('.ik-toasts')
    wrap.appendChild(t)
    while (wrap.children.length > 3) wrap.firstChild.remove()
    setTimeout(() => t.remove(), 3000)
  }

  // ── dialogue ────────────────────────────────────────────────────────────────────────

  /** Show a line of dialogue. `choices` are `{ label, primary?, disabled?, fn }`. */
  dialog({ name, role = '', text, choices = [{ label: 'Bye', fn: () => {} }] }) {
    const d = this.$('.ik-dialog')
    d.querySelector('.nm').innerHTML = `${esc(name)}${role ? `<small>${esc(role)}</small>` : ''}`
    const tx = d.querySelector('.tx')
    clearInterval(this._typer)
    // Typewriter, the way every JRPG has ever done it. A tap on the text finishes it.
    let i = 0
    tx.textContent = ''
    this._typer = setInterval(() => {
      i += 2
      tx.textContent = text.slice(0, i)
      if (i >= text.length) clearInterval(this._typer)
    }, 16)
    tx.onclick = () => {
      clearInterval(this._typer)
      tx.textContent = text
    }
    const ch = d.querySelector('.ch')
    ch.innerHTML = ''
    for (const c of choices) {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = `ik-choice${c.primary ? ' primary' : ''}`
      b.textContent = c.label
      b.disabled = Boolean(c.disabled)
      b.addEventListener('click', () => {
        this.game.sfx.ui()
        this.closeDialog()
        c.fn?.()
      })
      ch.appendChild(b)
    }
    d.classList.add('on')
    this.dialogOpen = true
  }

  closeDialog() {
    clearInterval(this._typer)
    this.$('.ik-dialog').classList.remove('on')
    this.dialogOpen = false
  }

  // ── windows ─────────────────────────────────────────────────────────────────────────

  /** Open a window. `body` is an HTML string; `bind(root)` wires up anything clickable. */
  openWindow(title, body, bind) {
    this.closeDialog()
    this.$('.ik-w h3').textContent = title
    const root = this.$('.ik-w .body')
    root.innerHTML = body
    bind?.(root)
    this.$('.ik-modal').classList.add('on')
    this.windowOpen = title
  }

  closeWindow() {
    this.$('.ik-modal').classList.remove('on')
    this.windowOpen = null
    this.game.onWindowClosed?.()
  }

  // ── fades, the opening ──────────────────────────────────────────────────────────────

  fade(on, white = false) {
    const f = this.$('.ik-fade')
    f.classList.toggle('white', white)
    f.classList.toggle('on', on)
    return new Promise((r) => setTimeout(r, 650))
  }

  /** The opening: a title card, a name, and the lines of how you died. */
  intro(lines, title, defaultName) {
    const box = this.$('.ik-intro')
    box.classList.add('on')
    return new Promise((resolve) => {
      const titleCard = () => {
        box.innerHTML = `
          <div>
            <div class="emblem">${emblemSVG({ size: 150, scale: 0.95 })}</div>
            <div class="title">${esc(title)}</div>
            <div class="sub">REINCARNATED IN ANOTHER WORLD</div>
            <div class="ik-w" style="width:min(380px,80vw);margin:0 auto">
              <div class="sec" style="margin-top:0">WHAT IS YOUR NAME?</div>
              <input type="text" maxlength="16" value="${esc(defaultName)}" />
              <div style="margin-top:12px;display:flex;justify-content:center">
                <button type="button" class="act primary">Begin</button>
              </div>
            </div>
          </div>`
        const input = box.querySelector('input')
        const go = () => {
          const name = input.value.trim().slice(0, 16) || defaultName
          this.game.sfx.ui()
          story(name)
        }
        input.addEventListener('submit', go)
        box.querySelector('button').addEventListener('click', go)
      }
      const story = (name) => {
        let i = 0
        box.innerHTML = `<div><div class="line"></div><div class="hint">tap to continue</div></div><button type="button" class="skip">Skip ▸▸</button>`
        const line = box.querySelector('.line')
        const show = () => {
          line.style.opacity = 0
          setTimeout(() => {
            line.innerHTML = lines[i].replaceAll('{name}', esc(name))
            line.style.transition = 'opacity .5s'
            line.style.opacity = 1
          }, 120)
        }
        const next = (e) => {
          if (e?.target?.classList?.contains('skip')) return finish()
          i++
          if (i >= lines.length) return finish()
          show()
        }
        const finish = () => {
          box.removeEventListener('pointerdown', next)
          box.classList.remove('on')
          box.innerHTML = ''
          resolve(name)
        }
        box.querySelector('.skip').addEventListener('pointerdown', (e) => {
          e.stopPropagation()
          finish()
        })
        box.addEventListener('pointerdown', next)
        show()
      }
      titleCard()
    })
  }
}
