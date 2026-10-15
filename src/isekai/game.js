import * as THREE from 'three'
import { bendPoint } from '../core/curve.js'
import { DUNGEONS, GAME_TITLE, INTRO, ITEMS, MONSTERS, REGION_BY_ID, REGIONS, SKILLS, STORY } from './data.js'
import {
  HERO_ID,
  activeQuests,
  addGuildPoints,
  gainXp,
  heroStats,
  npcById,
  npcState,
  partnerDef,
  persist,
  questComplete,
  region,
  runtime,
  save,
} from './world.js'
import { Monsters } from './monsters.js'
import { Fx } from './fx.js'
import { Sfx } from './sfx.js'
import { UI, esc } from './ui.js'
import { talk } from './talk.js'
import { openMenu } from './menus.js'
import { realm } from './index.js'
import { AnimePost } from './anime.js'
import { Story } from './story.js'
import { RACES } from './data.js'
import { raceOf, PET_ID } from './world.js'
import { WORLD_RADIUS } from './realm.js'

/**
 * The game on top of the colony. The colony keeps drawing what it always drew — terrain,
 * sky, villages, bots — and this layer adds a hero you steer, partners who follow, monsters,
 * spells, quests, dungeons and a camera that sits behind your shoulder.
 */

/** Over the shoulder: close, low, and swinging round behind you as you run. */
const CAM = { distance: 7.5, polar: THREE.MathUtils.degToRad(70), min: 3.5, max: 18, lift: 1.25 }
const ATTACK_CD = 0.42
const DASH_CD = 1.1
const INVULN = 0.45

const _v = new THREE.Vector3()
const _dir = new THREE.Vector3()

export class Game {
  constructor(ctx) {
    this.ctx = ctx
    this.engine = ctx.engine
    this.rig = ctx.rig
    this.colony = ctx.colony
    this.settings = ctx.settings
    this.poll = ctx.poll

    this.sfx = new Sfx(ctx.ambience)
    this.ui = new UI(this)
    const groundAt = (x, z) => this.colony.groundAt(x, z)
    this.monsters = new Monsters(this.colony.scene || this.engine.scene, {
      groundAt,
      blocked: (x, z) => this._blocked(x, z),
      safe: (x, z) => !runtime.dungeon && realm.safeAt(x, z),
    })
    this.fx = new Fx(this.engine.scene, this.colony.particles, groundAt)
    this.fx.solidAt = (x, z) => this.colony.nav?.isBlocked(x, z) && !this.monsters.nearest(x, z, 0.8)

    this.realm = realm
    this.lookT = 0
    this.az = this.rig.azimuth
    this.polar = CAM.polar
    this.dist = CAM.distance

    this.hero = null
    this.control = { x: 0, z: 0, speed: undefined, clip: null, face: null, allowed: (x, z) => this._allowed(x, z) }
    this.cd = { attack: 0, dash: 0, s0: 0, s1: 0, s2: 0, s3: 0 }
    this.held = new Set()
    this.dashT = 0
    this.clipT = 0
    this.invuln = 0
    this.buffT = 0
    this.calm = 0
    this.alive = true
    this.partners = new Map()
    this.guarded = new Set()
    this.spawnTimer = 0
    this.gardenT = 0
    this.paused = false
    this.waveTimer = 0
    /** The room the hero is standing in, if any. */
    this.interior = null
    this.story = new Story(this)
    this.heroSuit = [0x3b6fe0, 0x4a7af0, 0x7a6af0, 0x3ac8a0, 0xffc84a][RACES.indexOf(raceOf())] || 0x3b6fe0
  }

  // ── boot ────────────────────────────────────────────────────────────────────────────

  async start() {
    this.rig.enabled = false
    this.rig.setOrbit(false)
    // The colony's HUD is hidden, so it measures nothing; the view is simply the screen.
    const fit = () => {
      this.rig.setViewportInsets(window.innerWidth, window.innerHeight)
      this.engine.tiltShift?.setCamera(this.engine.camera)
    }
    this.ctx.hud.actions.viewportChanged = fit
    this.applyLook()
    window.addEventListener('resize', fit)
    fit()
    this.engine.add({ update: (dt, elapsed) => this.update(dt, elapsed) })
    this.ctx.hud.removeBoot?.()

    if (!save.started) {
      this.paused = true
      const name = await this.ui.intro(INTRO, GAME_TITLE, save.name)
      save.name = name
      save.started = true
      persist(true)
      this.paused = false
    }
    this._syncPlanet()
    await this.poll()
    // The hero walks down the ramp alone; once out, the rest of the world fills in.
    this._afterHero(() => {
      this.refresh()
      this._arrive()
    })
    setInterval(() => persist(), 10000)
  }

  _afterHero(fn) {
    const wait = () => {
      const a = this.colony.agentFor(HERO_ID)
      if (a && a.state !== 'queued' && a.state !== 'spawning') return fn()
      setTimeout(wait, 200)
    }
    wait()
  }

  _syncPlanet() {
    const planet = runtime.dungeon ? runtime.dungeon.def.planet : region().planet
    if (this.settings.get('planet') !== planet) this.settings.set('planet', planet)
  }

  /** Ask the colony for a fresh roster, so statuses and houses catch up with the save. */
  refresh() {
    clearTimeout(this._refreshT)
    this._refreshT = setTimeout(() => this.poll(), 60)
  }

  _arrive() {
    const r = region()
    this.ui.setRegion(r.chapter ? `Ch.${r.chapter} · ${r.name}` : `Prologue · ${r.name}`)
    // An episode card, the way an old anime opens each week.
    this.ui.episode(r.chapter ? `Episode ${r.chapter + 1}` : `Episode 1`, r.name)
    const seen = (save.story[r.id] ||= {})
    if (!seen.arrive && STORY[r.id]) {
      seen.arrive = true
      persist()
      setTimeout(() => this.narrate(STORY[r.id].arrive), 3400)
    }
  }

  narrate(text, then) {
    this.ui.dialog({
      name: 'Narration',
      text: text.replaceAll('{name}', save.name),
      choices: [{ label: 'Continue', primary: true, fn: then }],
    })
  }

  /** Ink lines and the film grade: a pass of their own, replacing the colony's post chain. */
  applyLook() {
    const look = this.settings.get('animeLook')
    if (look === 'ink') {
      this.engine.customPost ||= new AnimePost()
      this.engine.customPost.enabled = true
    } else if (this.engine.customPost) {
      this.engine.customPost.enabled = false
    }
    this.engine.applySettings()
  }

  // ── input ───────────────────────────────────────────────────────────────────────────

  look(dx, dy) {
    this.lookT = performance.now()
    this.az -= dx * 0.0085
    this.polar = THREE.MathUtils.clamp(this.polar - dy * 0.004, THREE.MathUtils.degToRad(35), THREE.MathUtils.degToRad(84))
  }

  zoom(f) {
    this.dist = THREE.MathUtils.clamp(this.dist * f, CAM.min, CAM.max)
  }

  press(name, down) {
    if (!down) {
      this.held.delete(name)
      return
    }
    this.held.add(name)
    if (this.paused || !this.hero) return
    if (name === 'escape') return this.ui.closeDialog()
    if (this.ui.dialogOpen && name !== 'interact') return
    if (!this.alive) return
    switch (name) {
      case 'attack':
        return this.attack()
      case 'dash':
        return this.dash()
      case 'potion':
        return this.useItem('potion')
      case 'interact':
        return this.interact()
      default:
        if (name[0] === 's') return this.cast(Number(name[1]))
    }
  }

  openMenu(id) {
    if (this.paused) return
    this.sfx.ui()
    openMenu(this, id)
  }

  // ── per frame ───────────────────────────────────────────────────────────────────────

  update(dt, elapsed) {
    dt = Math.min(dt, 0.05)
    this._bindHero()
    const hero = this.hero
    if (hero) {
      this._steer(dt)
      this._camera()
      this._regen(dt)
      this._partners(dt)
      this._world(dt)
    }
    this.monsters.update(dt, this._targets(), (m, dmg, t) => this._monsterHit(m, dmg, t), (x, z, r, dmg) => this._slam(x, z, r, dmg))
    this.fx.update(dt, elapsed)
    if (!this.paused) this.story.update(dt, elapsed)
    realm.update(dt, elapsed, this.colony.sky?.nightFactor ?? 0)
    for (const k of Object.keys(this.cd)) this.cd[k] = Math.max(0, this.cd[k] - dt)
    if (this.held.has('attack') && !this.ui.blocked && !this.ui.dialogOpen) this.attack()
    this._hud()
  }

  _bindHero() {
    const a = this.colony.agentFor(HERO_ID)
    if (a !== this.hero) {
      this.hero = a || null
      if (a) {
        a.control = this.control
        a.suit = this.heroSuit
        a.colorDirty = true
      }
    }
  }

  _steer(dt) {
    const a = this.hero
    // Whatever is equipped is what is in your hand.
    a.tool = save.weapon === 'staff' && save.staff ? 'staff' : 'sword'
    const c = this.control
    let mx = this.ui.move.x
    let my = this.ui.move.y
    if (this.paused || this.ui.blocked || this.ui.dialogOpen || !this.alive) mx = my = 0
    // Camera-relative: up on the stick is away from the camera.
    const fx = -Math.sin(this.az)
    const fz = -Math.cos(this.az)
    const rx = Math.cos(this.az)
    const rz = -Math.sin(this.az)
    c.x = rx * mx + fx * my
    c.z = rz * mx + fz * my
    // Running forward swings the camera round behind you, the way action games do; a recent
    // drag on the right side of the screen means you are looking yourself, so it waits.
    // Steering sideways turns the view too, so the stick alone is enough to look around;
    // only backing up leaves the camera where it is.
    const push = Math.hypot(mx, my)
    if (push > 0.3 && my > -0.35 && !this.interior && performance.now() - this.lookT > 1200) {
      let d = a.yaw + Math.PI - this.az
      d = Math.atan2(Math.sin(d), Math.cos(d))
      const rate = 1.1 * Math.abs(mx) + 1.4 * Math.max(0, my)
      this.az += d * Math.min(1, dt * rate)
    }
    const s = heroStats()
    c.speed = 3.6 * (1 + s.agi * 0.004)
    if (this.dashT > 0) {
      this.dashT -= dt
      const yaw = a.yaw
      if (Math.hypot(c.x, c.z) < 0.1) {
        c.x = Math.sin(yaw)
        c.z = Math.cos(yaw)
      }
      const m = Math.hypot(c.x, c.z)
      c.x /= m
      c.z /= m
      c.speed *= 3.1
      if (Math.random() < 0.6) this.fx.spark(a.pos.x, a.pos.y + 0.3, a.pos.z, new THREE.Color(0.6, 0.85, 1), 2, 0.6, 0.3, 0.07)
    }
    this.clipT -= dt
    if (this.clipT <= 0 && c.clip && this.alive) {
      c.clip = null
      c.face = null
    }
    this.invuln = Math.max(0, this.invuln - dt)
    this.buffT = Math.max(0, this.buffT - dt)
  }

  _camera() {
    const rig = this.rig
    const p = this.hero.pos
    rig.desiredTarget.set(p.x, p.y + CAM.lift, p.z)
    rig.desiredAzimuth = this.az
    rig.desiredPolar = this.polar
    // Keep the camera out of walls: walk out from the hero toward where it wants to be, and
    // stop short of the first building. A run of blocked samples means a wall; a single one
    // is a tree trunk or a post, which is fine to look past.
    // Indoors: the cutaway view, from above and a little back, with nothing to collide with.
    if (this.interior) {
      rig.desiredPolar = THREE.MathUtils.degToRad(50)
      rig.desiredDistance = 10
      return
    }
    let dist = this.dist
    const nav = this.colony.nav
    if (nav) {
      const sinP = Math.sin(this.polar)
      const cosP = Math.cos(this.polar)
      const dx = Math.sin(this.az) * sinP
      const dz = Math.cos(this.az) * sinP
      let run = 0
      for (let d = 1; d < dist; d += 0.35) {
        const height = CAM.lift + cosP * d
        if (height < 5.5 && nav.isBlocked(p.x + dx * d, p.z + dz * d)) {
          if (++run >= 4) {
            dist = Math.max(2.2, d - 1.6)
            break
          }
        } else run = 0
      }
    }
    rig.desiredDistance = dist
    rig.idleFor = 0
  }

  _regen(dt) {
    if (!this.alive) return
    const s = heroStats()
    const h = save.hero
    h.mp = Math.min(s.maxMp, h.mp + s.mpRegen * dt)
    const near = this.monsters.nearest(this.hero.pos.x, this.hero.pos.z, 10)
    this.calm = near ? 0 : this.calm + dt
    if (this.calm > 4) h.hp = Math.min(s.maxHp, h.hp + s.maxHp * 0.03 * dt)
    if (save.base.garden > 0) {
      this.gardenT += dt
      const every = 240 / save.base.garden
      if (this.gardenT > every) {
        this.gardenT = 0
        if (save.hero.items.potion < 9) {
          save.hero.items.potion++
          this.ui.toast('\u{1F33F} Your herb garden grew a Healing Potion')
        }
      }
    }
  }

  _targets() {
    const list = this._tgt || (this._tgt = [])
    list.length = 0
    if (this.hero) list.push({ pos: this.hero.pos, alive: this.alive && this.invuln <= 0.3, bias: 1, hero: true })
    for (const p of this.partners.values()) if (p.agent) list.push({ pos: p.agent.pos, alive: p.hp > 0, bias: p.def.tank ? 1.8 : 0.85, partner: p })
    return list
  }

  // ── the world around the hero: spawns, herbs, guards, interaction ─────────────────

  _allowed(x, z) {
    if (realm.roomAt(x, z)) return true
    const planet = this.colony.planet
    if (planet.water && this.colony.groundAt(x, z) < planet.water.level + 0.12) return false
    if (!this.colony.onIsland(x, z)) return false
    return Math.hypot(x, z) < WORLD_RADIUS
  }

  _blocked(x, z) {
    return this.colony.nav?.isBlocked(x, z) || !this._allowed(x, z)
  }

  _freeSpot(near, minD, maxD, avoidSafe = true) {
    const door = realm.portal
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2
      const r = minD + Math.random() * (maxD - minD)
      const x = near.x + Math.cos(a) * r
      const z = near.z + Math.sin(a) * r
      if (this._blocked(x, z)) continue
      if (avoidSafe && realm.safeAt(x, z)) continue
      if (Math.hypot(x - door.x, z - door.z) < 7) continue
      return { x, z }
    }
    return null
  }

  _world(dt) {
    const hero = this.hero.pos
    if (this.interior) return this._interactTarget()
    if (runtime.dungeon) return this._dungeon(dt)
    const r = region()

    // Keep the wilds stocked round wherever the hero is, never on a village green. The
    // forests are thicker with them, and so is the night; anything left far behind fades.
    this.spawnTimer -= dt
    for (const m of this.monsters.list) {
      if (m.state === 'dead' || m.guard || m.boss) continue
      if (Math.hypot(m.pos.x - hero.x, m.pos.z - hero.z) > 60) this.monsters.damage(m, 1e9)
    }
    const wild = this.monsters.list.filter((m) => !m.guard && !m.boss && m.state !== 'dead').length
    const inWoods = realm.forestAt(hero.x, hero.z)
    // Fewer out in the open, more under the trees and after dark; none at all on a village green.
    const want = (inWoods ? 7 : 3) + Math.min(3, r.chapter) + (this.colony.sky?.nightFactor > 0.5 ? 2 : 0)
    if (this.spawnTimer <= 0 && wild < want) {
      this.spawnTimer = 2.4
      // Most of them come out of the forests.
      const woods = realm.layout?.forests || []
      const f = woods.length && Math.random() < 0.7 ? woods.reduce((a, b) => (Math.hypot(a.x - hero.x, a.z - hero.z) < Math.hypot(b.x - hero.x, b.z - hero.z) ? a : b)) : null
      const spot = f ? this._freeSpot(f, 0, f.r) : this._freeSpot(hero, 18, 40)
      // Never pop out right next to you.
      if (spot && Math.hypot(spot.x - hero.x, spot.z - hero.z) > 13) {
        // Forest monsters come from the deeper end of the region's list.
        const list = r.monsters
        const deep = realm.forestAt(spot.x, spot.z) ? Math.floor(list.length / 2) : 0
        this.monsters.spawn(list[deep + Math.floor(Math.random() * (list.length - deep))], spot.x, spot.z, { tier: realm.forestAt(spot.x, spot.z) ? 1.25 : 1, wild: true })
      }
    }

    for (const q of activeQuests()) {
      if (q.region !== r.id || questComplete(q)) continue
      // A boss quest calls its boss out.
      if (q.type === 'boss' && !this.monsters.list.some((m) => m.boss && m.state !== 'dead')) {
        const spot = this._freeSpot(hero, 14, 22) || this._freeSpot(hero, 8, 30, false)
        if (spot) {
          this.monsters.spawn(q.target, spot.x, spot.z)
          this.ui.banner(`${MONSTERS[q.target].name} appears!`, 'Boss battle')
          this.rig.shake(0.8)
        }
      }
      // A rescue quest rings its villager with guards, once.
      if (q.type === 'rescue') {
        const id = `npc:${r.id}:${q.target}`
        const st = npcState(id)
        const agent = this.colony.agentFor(id)
        if (!st.freed && agent && !this.guarded.has(id)) {
          this.guarded.add(id)
          const n = 3 + r.chapter
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2
            const x = agent.pos.x + Math.cos(a) * 2.6
            const z = agent.pos.z + Math.sin(a) * 2.6
            const kind = r.monsters[(i + 1) % r.monsters.length]
            if (!this._blocked(x, z)) this.monsters.spawn(kind, x, z, { guard: id, tier: 1.2 })
            else {
              const s = this._freeSpot(agent.pos, 1.5, 4, false)
              if (s) this.monsters.spawn(kind, s.x, s.z, { guard: id, tier: 1.2 })
            }
          }
        }
      }
      // A gather quest scatters herbs.
      if (q.type === 'gather') {
        const left = q.count - save.quests[q.id].progress
        while (this.fx.herbs.length < Math.min(6, left + 1)) {
          const spot = this._freeSpot(hero, 10, 38)
          if (!spot) break
          this.fx.addHerb(spot.x, spot.z, [0x8affc8, 0xffe07a, 0xc8a8ff, 0xa8e0ff, 0xff9a6a][r.chapter - 1] || 0x8affc8)
        }
      }
    }

    const got = this.fx.takeHerbsNear(hero.x, hero.z, 1.1)
    for (const h of got) this._herb(h)

    this._interactTarget()
  }

  _herb() {
    const q = activeQuests().find((x) => x.type === 'gather' && x.region === region().id && !questComplete(x))
    this.sfx.pickup()
    if (!q) return
    save.stats.herbs++
    const s = save.quests[q.id]
    s.progress = Math.min(q.count, s.progress + 1)
    this.ui.toast(`Herb gathered (${s.progress}/${q.count})`)
    this._checkQuest(q)
  }

  _checkQuest(q) {
    persist()
    if (questComplete(q)) {
      this.sfx.quest()
      const giver = npcById(`npc:${q.region}:${q.giver}`)
      this.ui.banner('Objective complete', `Report to ${giver?.name || 'the quest giver'}`)
      if (q.type === 'gather') this.fx.clearHerbs()
      this.refresh()
    }
  }

  _interactTarget() {
    const hero = this.hero.pos
    const set = (target, label) => {
      this.target = target
      this.ui.setInteract(label)
    }
    // The story first: a starving beast, or your companion wanting a word.
    const story = this.interior ? null : this.story.interactTarget(hero)
    if (story?.kind === 'beast') return set({ kind: story.kind }, story.label)

    // Indoors: the way out, the bed, the quest board.
    const room = this.interior
    if (room) {
      if (Math.hypot(room.door.x - hero.x, room.door.z - hero.z) < 1.6) return set({ kind: 'leave' }, '\u{1F6AA} Go outside')
      if (room.bed && Math.hypot(room.bed.x - hero.x, room.bed.z - hero.z) < 1.9 && hero.y > room.y + 1) {
        return set({ kind: 'bed' }, room.kind === 'inn' ? '\u{1F6CF} Rent the room (20 G)' : '\u{1F6CF} Sleep')
      }
      if (room.board && Math.hypot(room.board.x - hero.x, room.board.z - hero.z) < 2.2) return set({ kind: 'board' }, '\u{1F4CB} Quest board')
    }

    let best = null
    let bestD = 2.6
    for (const a of this.colony.astronauts.agents) {
      if (a === this.hero || a.state === 'leaving' || a.state === 'gone' || a.state === 'queued') continue
      if (this.partners.has(a.id) || !npcById(a.id)) continue
      // Someone who needs you wins a close call against someone who is just standing there.
      const d = Math.hypot(a.pos.x - hero.x, a.pos.z - hero.z) - (a.status === 'waiting' || a.status === 'blocked' ? 0.7 : 0)
      if (d < bestD) {
        bestD = d
        best = a
      }
    }
    if (best) {
      const npc = npcById(best.id)
      return set({ kind: 'npc', agent: best, npc }, `\u{1F4AC} ${npc.name}`)
    }
    if (room) return set(null, null)

    const door = realm.doorNear(hero.x, hero.z)
    if (door) return set({ kind: 'door', door }, `\u{1F6AA} Enter ${door.title}`)
    const gate = realm.portal
    if (Math.hypot(gate.x - hero.x, gate.z - hero.z) < 5) return set({ kind: 'gate' }, '✨ Portal')
    // Your companion is always at your heels, so it only gets the button when nothing else wants it.
    if (story?.kind === 'pet') return set({ kind: 'pet' }, story.label)
    if (realm.layout?.hasCamp && realm.inCamp(hero.x, hero.z)) return set({ kind: 'camp' }, '\u{1F3E0} Your Base')
    set(null, null)
  }

  interact() {
    if (this.ui.dialogOpen) return
    const t = this.target
    if (!t) return
    this.sfx.ui()
    if (t.kind === 'npc' && t.npc) {
      // Face each other.
      const a = t.agent
      const h = this.hero
      a.targetYaw = Math.atan2(h.pos.x - a.pos.x, h.pos.z - a.pos.z)
      this.control.face = Math.atan2(a.pos.x - h.pos.x, a.pos.z - h.pos.z)
      this.clipT = 0.6
      talk(this, t.npc)
    } else if (t.kind === 'gate') {
      if (region().id === 'forest' && save.prologue.step !== 'done') this.ui.toast('The stone circle is cold and dark. Something in this forest is keeping it asleep.')
      else openMenu(this, 'map')
    } else if (t.kind === 'camp') openMenu(this, 'base')
    else if (t.kind === 'exit') this.leaveDungeon()
    else if (t.kind === 'door') this.enterRoom(t.door)
    else if (t.kind === 'leave') this.leaveRoom()
    else if (t.kind === 'bed') this.sleep()
    else if (t.kind === 'board') openMenu(this, 'quests')
    else if (t.kind === 'beast' || t.kind === 'pet') this.story.interact(t.kind)
  }

  /** Step through a door: fade, and come out just inside the room. */
  async enterRoom(door) {
    const room = realm.layout.rooms.find((r) => r.kind === door.kind)
    if (!room) return
    this.paused = true
    await this.ui.fade(true)
    this.interior = { ...room, outside: { x: door.x, z: door.z }, y: room.floorY ?? 32 }
    this._teleport(room.spawn.x, room.spawn.z, Math.PI)
    this.az = 0
    this.ui.setRegion(room.title)
    this.paused = false
    await this.ui.fade(false)
    if (room.kind === 'guild' && !save.guild.registered) this.ui.system('The Adventurers’ Guild. The receptionist is waving at you.')
  }

  async leaveRoom() {
    const room = this.interior
    if (!room) return
    this.paused = true
    await this.ui.fade(true)
    this.interior = null
    // Out on the step, facing away from the door.
    // Out on the step, facing the village green (or the campfire).
    const o = room.outside
    const v = realm.villageAt(o.x, o.z) || realm.layout.camp
    this._teleport(o.x, o.z, Math.atan2(v.x - o.x, v.z - o.z))
    const r = region()
    this.ui.setRegion(r.chapter ? `Ch.${r.chapter} · ${r.name}` : `Prologue · ${r.name}`)
    this.paused = false
    await this.ui.fade(false)
  }

  /** Move the hero (and everyone following) somewhere at once, and the camera with them. */
  _teleport(x, z, yaw = null) {
    const h = this.hero
    h.pos.set(x, this.colony.groundAt(x, z), z)
    h.groundAt = null
    h.groundY = null
    if (yaw != null) {
      h.yaw = yaw
      h.targetYaw = yaw
    }
    let i = 0
    for (const p of this.partners.values()) {
      if (!p.agent) continue
      const px = x + Math.cos(i) * 1.2
      const pz = z + Math.sin(i) * 1.2
      p.agent.pos.set(px, this.colony.groundAt(px, pz), pz)
      p.agent.groundAt = null
      p.agent.groundY = null
      i += 2.1
    }
    this.rig.target.set(x, h.pos.y + 1.2, z)
    this.rig.desiredTarget.copy(this.rig.target)
  }

  /** A night's sleep: free at home, twenty gold at the inn. */
  async sleep() {
    const room = this.interior
    if (room.kind === 'inn') {
      if (save.hero.gold < 20) return this.ui.toast('The innkeeper wants 20 G for a room.')
      save.hero.gold -= 20
    }
    this.paused = true
    await this.ui.fade(true)
    const s = heroStats()
    save.hero.hp = s.maxHp
    save.hero.mp = s.maxMp
    for (const p of this.partners.values()) p.hp = p.maxHp
    // Morning comes.
    this.settings.set('timeOfDay', 0.3)
    persist(true)
    await new Promise((r) => setTimeout(r, 900))
    this.paused = false
    await this.ui.fade(false)
    this.ui.banner('Good morning!', 'HP and MP fully restored · game saved')
    this.sfx.heal()
  }

  // ── fighting ────────────────────────────────────────────────────────────────────────

  _play(clip, t) {
    this.control.clip = clip
    this.hero.clipKey = null
    this.clipT = t
  }

  _aim(range) {
    const h = this.hero
    const m = this.monsters.nearest(h.pos.x, h.pos.z, range)
    if (m) this.control.face = Math.atan2(m.pos.x - h.pos.x, m.pos.z - h.pos.z)
    return m
  }

  _facing() {
    const yaw = this.control.face ?? this.hero.yaw
    return _dir.set(Math.sin(yaw), 0, Math.cos(yaw))
  }

  attack() {
    if (this.cd.attack > 0 || !this.hero || !this.alive || this.ui.blocked) return
    const s = heroStats()
    if (s.staffAtk) return this._staffBolt(s)
    this.cd.attack = ATTACK_CD / (1 + s.agi * 0.004)
    this._aim(4)
    this._play('work', 0.4)
    this.sfx.swing()
    const h = this.hero
    const yaw = this.control.face ?? h.yaw
    setTimeout(() => {
      if (!this.alive) return
      this.fx.slash(h.pos, yaw, this.buffT > 0 ? 0xffe27a : 0xdff4ff)
      let hit = false
      for (const m of [...this.monsters.list]) {
        if (m.state === 'dead') continue
        const dx = m.pos.x - h.pos.x
        const dz = m.pos.z - h.pos.z
        if (Math.hypot(dx, dz) > 1.6 + m.radius) continue
        let a = Math.atan2(dx, dz) - yaw
        a = Math.atan2(Math.sin(a), Math.cos(a))
        if (Math.abs(a) > 1.35) continue
        const crit = Math.random() < 0.12
        const dmg = Math.round(s.atk * (0.9 + Math.random() * 0.2) * (crit ? 1.8 : 1) * (this.buffT > 0 ? 2 : 1))
        this.damage(m, dmg, crit, h.pos)
        hit = true
      }
      if (hit) {
        this.sfx.hit()
        this.rig.shake(0.08)
      }
    }, 170)
  }

  /** With a staff in hand, the basic attack is a bolt of magic, aimed at the nearest foe. */
  _staffBolt(s) {
    this.cd.attack = 0.62
    this._aim(13)
    this._play('interact', 0.35)
    this.sfx.fireball()
    const hero = this.hero
    const dir = this._facing().clone()
    const from = new THREE.Vector3(hero.pos.x + dir.x * 0.6, hero.pos.y + 1.0, hero.pos.z + dir.z * 0.6)
    const power = (s.atk * 0.6 + s.int * 0.9) * s.spell * (this.buffT > 0 ? 1.5 : 1)
    this.fx.fireball(
      from,
      dir,
      (p) => this.monsters.list.some((m) => m.state !== 'dead' && Math.hypot(m.pos.x - p.x, m.pos.z - p.z) < m.radius + 0.3),
      (p) => {
        const hit = this.monsters.nearest(p.x, p.z, 1.2)
        if (hit) this.damage(hit, Math.round(power * (0.9 + Math.random() * 0.2)), Math.random() < 0.1, p)
      },
      0x9fe0ff
    )
  }

  damage(m, dmg, crit = false, from = null) {
    const killed = this.monsters.damage(m, dmg, from)
    const p = this.screen(m.pos.x, m.pos.y + m.def.size * 1.6, m.pos.z)
    if (p) this.ui.float(p.x, p.y, crit ? `${dmg}!` : `${dmg}`, crit ? 'crit' : '')
    this.fx.spark(m.pos.x, m.pos.y + m.def.size * 0.7, m.pos.z, m.baseColor, 6, 2, 0.5)
    if (killed) this._killed(m)
    return killed
  }

  _killed(m) {
    this.sfx.squish()
    this.fx.spark(m.pos.x, m.pos.y + 0.5, m.pos.z, m.baseColor, m.boss ? 60 : 16, m.boss ? 5 : 3, 0.9, 0.11)
    save.stats.kills++
    save.hero.gold += m.gold
    const p = this.screen(m.pos.x, m.pos.y + 1, m.pos.z)
    if (p) {
      setTimeout(() => this.ui.float(p.x, p.y - 10, `+${m.xp} XP`, 'xp'), 120)
      setTimeout(() => this.ui.float(p.x + 30, p.y + 6, `+${m.gold} G`, 'gold'), 240)
    }
    this.xp(m.xp)
    if (m.boss) this.story.onBossKilled(m.kind)

    const r = region()
    if (!runtime.dungeon) {
      for (const q of activeQuests()) {
        if (q.region !== r.id || questComplete(q)) continue
        const s = save.quests[q.id]
        if (q.type === 'hunt' && (!q.target || q.target === m.kind)) {
          s.progress = Math.min(q.count, s.progress + 1)
          this.ui.toast(`${q.title}: ${s.progress}/${q.count}`)
          this._checkQuest(q)
        }
        if (q.type === 'boss' && m.boss && q.target === m.kind) {
          s.progress = 1
          save.stats.bosses++
          this.story.onBossKilled(m.kind)
          this.ui.setBoss(null)
          this._checkQuest(q)
        }
      }
      if (m.guard && !this.monsters.list.some((o) => o.guard === m.guard && o.state !== 'dead')) {
        npcState(m.guard).freed = true
        const npc = npcById(m.guard)
        this.ui.banner('Curse broken!', `Talk to ${npc?.name}`)
        this.sfx.quest()
        persist()
        this.refresh()
      }
    }
    persist()
  }

  xp(n) {
    const before = save.hero.level
    const ups = gainXp(n)
    if (ups) {
      this.sfx.levelUp()
      this.ui.banner('LEVEL UP!', `Level ${save.hero.level} — HP and MP restored`)
      this.fx.aura(this.hero.pos, 0xffe27a)
      this.colony.astronauts.celebrate(HERO_ID)
      const unlocked = SKILLS.filter((s) => s.level > before && s.level <= save.hero.level && !save.skills.includes(s.id))
      for (const s of unlocked) this.ui.toast(`✨ ${s.name} can now be learned at a Magic Shop`)
      this.refresh()
    }
  }

  cast(slot) {
    const skill = SKILLS[slot]
    if (!skill || !this.hero) return
    const h = save.hero
    if (!save.skills.includes(skill.id)) {
      this.ui.toast(h.level < skill.level ? `${skill.name}: reach Lv ${skill.level}, then buy it at a Magic Shop` : `${skill.name}: buy it at a Magic Shop`)
      return
    }
    const key = `s${slot}`
    if (this.cd[key] > 0) return
    if (h.mp < skill.mp) {
      this.ui.toast('Not enough MP')
      return
    }
    h.mp -= skill.mp
    this.cd[key] = skill.cd
    const s = heroStats()
    const hero = this.hero
    const power = s.int * s.spell * (this.buffT > 0 ? 1.5 : 1)

    if (skill.id === 'fireball') {
      this._aim(14)
      this._play('interact', 0.35)
      this.sfx.fireball()
      const dir = this._facing().clone()
      const from = new THREE.Vector3(hero.pos.x + dir.x * 0.6, hero.pos.y + 0.9, hero.pos.z + dir.z * 0.6)
      this.fx.fireball(
        from,
        dir,
        (p) => this.monsters.list.some((m) => m.state !== 'dead' && Math.hypot(m.pos.x - p.x, m.pos.z - p.z) < m.radius + 0.3),
        (p) => {
          this.sfx.boom()
          for (const m of [...this.monsters.list]) {
            if (m.state === 'dead' || Math.hypot(m.pos.x - p.x, m.pos.z - p.z) > 2.2 + m.radius) continue
            this.damage(m, Math.round(power * 2.4 * (0.9 + Math.random() * 0.2)), false, p)
          }
        }
      )
    } else if (skill.id === 'heal') {
      this._play('cheer', 0.5)
      this.sfx.heal()
      this.healHero(0.35)
      for (const p of this.partners.values()) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.5)
    } else if (skill.id === 'thunder') {
      this._play('cheer', 0.6)
      const targets = this.monsters.list.filter((m) => m.state !== 'dead' && Math.hypot(m.pos.x - hero.pos.x, m.pos.z - hero.pos.z) < 9)
      if (!targets.length) this.fx.bolt(hero.pos.x + 2, hero.pos.z)
      targets.forEach((m, i) =>
        setTimeout(() => {
          if (m.state === 'dead') return
          this.fx.bolt(m.pos.x, m.pos.z)
          this.sfx.thunder()
          this.damage(m, Math.round(power * 3.2 * (0.9 + Math.random() * 0.2)), false, null)
        }, i * 90)
      )
      this.rig.shake(0.35)
    } else if (skill.id === 'blessing') {
      this._play('cheer', 0.9)
      this.sfx.levelUp()
      this.healHero(1)
      for (const p of this.partners.values()) p.hp = p.maxHp
      this.buffT = 12
      this.fx.aura(hero.pos, 0xffe27a)
      this.ui.banner('Goddess Blessing', 'Attack doubled for 12 seconds')
    }
  }

  healHero(frac) {
    const s = heroStats()
    const h = save.hero
    const before = h.hp
    h.hp = Math.min(s.maxHp, h.hp + s.maxHp * frac)
    this.fx.aura(this.hero.pos, 0x7cf0a8)
    const p = this.screen(this.hero.pos.x, this.hero.pos.y + 1.6, this.hero.pos.z)
    if (p) this.ui.float(p.x, p.y, `+${Math.round(h.hp - before)}`, 'heal')
  }

  dash() {
    if (this.cd.dash > 0 || !this.hero) return
    this.cd.dash = DASH_CD
    this.dashT = 0.22
    this.invuln = Math.max(this.invuln, 0.3)
    this.sfx.dash()
  }

  useItem(id) {
    const item = ITEMS[id]
    const h = save.hero
    if (!item || !h.items[id]) {
      this.ui.toast(`No ${item?.name || 'items'} left`)
      return false
    }
    const s = heroStats()
    if (item.heal && h.hp >= s.maxHp && !item.mana) {
      this.ui.toast('HP is already full')
      return false
    }
    h.items[id]--
    if (item.heal) this.healHero(item.heal)
    if (item.mana) h.mp = Math.min(s.maxMp, h.mp + s.maxMp * item.mana)
    this.sfx.heal()
    persist()
    return true
  }

  _monsterHit(m, dmg, target) {
    if (target?.partner) {
      const p = target.partner
      p.hp -= Math.max(1, Math.round(dmg * (p.def.tank ? 0.45 : 0.8)))
      if (p.hp <= 0) this._partnerDown(p)
      return
    }
    this.hurt(dmg)
  }

  _slam(x, z, r, dmg) {
    this.fx.spark(x, this.colony.groundAt(x, z) + 0.2, z, new THREE.Color(1, 0.4, 0.3), 30, 4, 0.7)
    this.sfx.boom()
    this.rig.shake(0.6)
    const h = this.hero
    if (h && Math.hypot(h.pos.x - x, h.pos.z - z) < r) this.hurt(dmg)
    for (const p of this.partners.values()) {
      if (p.agent && p.hp > 0 && Math.hypot(p.agent.pos.x - x, p.agent.pos.z - z) < r) {
        p.hp -= dmg
        if (p.hp <= 0) this._partnerDown(p)
      }
    }
  }

  hurt(dmg) {
    if (!this.alive || this.invuln > 0) return
    const s = heroStats()
    const taken = Math.max(1, Math.round(dmg - s.def * 0.6))
    save.hero.hp -= taken
    this.invuln = INVULN
    this.calm = 0
    this.sfx.hurt()
    this.ui.hurt()
    this.rig.shake(0.22)
    const p = this.screen(this.hero.pos.x, this.hero.pos.y + 1.6, this.hero.pos.z)
    if (p) this.ui.float(p.x, p.y, `-${taken}`, 'hurt')
    if (this.control.clip !== 'work') this._play('hit', 0.3)
    if (save.hero.hp <= 0) this.die()
  }

  async die() {
    save.hero.hp = 0
    this.alive = false
    this.control.clip = 'sitDown'
    this.hero.clipKey = null
    this.clipT = 99
    save.stats.deaths++
    const lost = Math.floor(save.hero.gold * 0.1)
    save.hero.gold -= lost
    persist()
    this.ui.banner('You have fallen...', lost ? `Lost ${lost} G` : '')
    await new Promise((r) => setTimeout(r, 2600))
    await this.ui.fade(true, true)
    if (runtime.dungeon) {
      runtime.dungeon = null
      await this._goto(region().id, { quiet: true })
    } else this._toCamp()
    const s = heroStats()
    save.hero.hp = s.maxHp
    save.hero.mp = s.maxMp
    this.alive = true
    this.control.clip = null
    this.clipT = 0
    this.invuln = 2
    await this.ui.fade(false)
    this.narrate('A warm light. Celestia’s voice: “Not yet, {name}. Get up — they need you.”')
  }

  _toCamp() {
    const door = realm.portal
    const h = this.hero
    const spot = this._freeSpot({ x: door.x + 4, z: door.z }, 0.5, 3, false) || { x: door.x + 4, z: door.z }
    h.pos.set(spot.x, h.pos.y, spot.z)
    h.groundAt = null
    h.groundY = null
    let i = 0
    for (const p of this.partners.values()) {
      if (!p.agent) continue
      p.agent.pos.set(spot.x + Math.cos(i) * 1.5, h.pos.y, spot.z + Math.sin(i) * 1.5)
      p.agent.groundAt = null
      i += 2
    }
    // Snap the camera rather than gliding across the whole map.
    this.rig.target.set(spot.x, this.rig.target.y, spot.z)
  }

  // ── partners ────────────────────────────────────────────────────────────────────────

  _partners(dt) {
    // An evolved companion is always in the party, on top of the barracks' slots.
    const party = save.pet?.stage >= 2 ? [...save.party, PET_ID] : save.party
    const want = new Set(party)
    for (const [id, p] of this.partners) {
      if (!want.has(id) || !this.colony.agentFor(id)) {
        if (p.agent) p.agent.control = null
        this.partners.delete(id)
      }
    }
    const hs = heroStats()
    let index = 0
    for (const id of party) {
      const agent = this.colony.agentFor(id)
      if (!agent || agent.state === 'queued' || agent.state === 'leaving') continue
      let p = this.partners.get(id)
      if (!p) {
        const def = partnerDef(id)
        if (!def) continue
        p = { id, def, agent, hp: 1, maxHp: 1, cd: 0, healCd: 0, downT: 0, clipT: 0, control: { x: 0, z: 0, clip: null, face: null, allowed: (x, z) => this._allowed(x, z) } }
        p.maxHp = Math.round(hs.maxHp * (p.def.tank ? 1.3 : 0.8))
        p.hp = p.maxHp
        this.partners.set(id, p)
      }
      if (p.agent !== agent) p.agent = agent
      agent.control = p.control
      // Fighters carry swords, casters staves.
      agent.tool = p.def.ranged || p.def.healer ? (p.def.cls === 'Archer' ? null : 'staff') : 'sword'
      if (agent.suit !== p.def.color) {
        agent.suit = p.def.color
        agent.colorDirty = true
      }
      p.maxHp = Math.round(hs.maxHp * (p.def.tank ? 1.3 : 0.8))
      this._partnerStep(p, dt, index++, hs)
    }
  }

  _partnerStep(p, dt, index, hs) {
    const a = p.agent
    const c = p.control
    const hero = this.hero.pos
    p.cd = Math.max(0, p.cd - dt)
    p.healCd = Math.max(0, p.healCd - dt)
    p.clipT -= dt
    if (p.clipT <= 0 && p.hp > 0) {
      c.clip = null
      c.face = null
    }
    if (p.hp <= 0) {
      c.x = c.z = 0
      p.downT -= dt
      if (p.downT <= 0) {
        p.hp = Math.round(p.maxHp * 0.5)
        c.clip = null
        a.clipKey = null
        this.ui.toast(`${p.def.name} is back on their feet!`)
      }
      return
    }
    p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.01 * dt)

    const toHero = Math.hypot(hero.x - a.pos.x, hero.z - a.pos.z)
    if (toHero > 18) {
      a.pos.set(hero.x - Math.sin(this.hero.yaw) * 1.5, a.pos.y, hero.z - Math.cos(this.hero.yaw) * 1.5)
      a.groundAt = null
    }
    c.speed = 4.4

    // Healers look after the hero first.
    if (p.def.healer && p.healCd <= 0 && save.hero.hp < hs.maxHp * 0.6 && this.alive) {
      p.healCd = 7
      this._partnerClip(p, 'cheer', 0.6)
      this.healHero(0.25)
      this.ui.toast(`${p.def.name}: “Hold still — healing!”`)
    }

    const atk = Math.round((hs.atk * p.def.power + save.base.training * 4) * (this.buffT > 0 ? 1.5 : 1))
    const target = this.monsters.nearest(a.pos.x, a.pos.z, p.def.ranged ? 11 : 8)
    if (target && Math.hypot(target.pos.x - hero.x, target.pos.z - hero.z) < 13) {
      const dx = target.pos.x - a.pos.x
      const dz = target.pos.z - a.pos.z
      const d = Math.hypot(dx, dz)
      const reach = p.def.ranged ? 6.5 : 1.3 + target.radius
      if (d > reach) {
        c.x = dx / d
        c.z = dz / d
      } else {
        c.x = c.z = 0
        c.face = Math.atan2(dx, dz)
        if (p.cd <= 0) {
          p.cd = p.def.ranged ? 1.4 : 0.9
          if (p.def.ranged) {
            this._partnerClip(p, 'interact', 0.35)
            const color = p.def.healer ? 0xfff6c8 : p.def.cls === 'Ice Mage' ? 0x9fe4ff : 0xffe27a
            const dir = new THREE.Vector3(dx, 0, dz).normalize()
            const from = new THREE.Vector3(a.pos.x + dir.x * 0.5, a.pos.y + 0.9, a.pos.z + dir.z * 0.5)
            this.fx.fireball(
              from,
              dir,
              (pt) => this.monsters.list.some((m) => m.state !== 'dead' && Math.hypot(m.pos.x - pt.x, m.pos.z - pt.z) < m.radius + 0.3),
              (pt) => {
                const hit = this.monsters.nearest(pt.x, pt.z, 1.2)
                if (hit) this.damage(hit, Math.round(atk * (0.9 + Math.random() * 0.2)), false, pt)
              },
              color
            )
          } else {
            this._partnerClip(p, 'work', 0.4)
            setTimeout(() => {
              if (target.state !== 'dead' && Math.hypot(target.pos.x - a.pos.x, target.pos.z - a.pos.z) < reach + 0.6) {
                this.damage(target, Math.round(atk * (0.9 + Math.random() * 0.2)), Math.random() < 0.08, a.pos)
              }
            }, 170)
          }
        }
      }
      return
    }

    // Otherwise, fall in behind the hero.
    const yaw = this.hero.yaw
    const side = index % 2 === 0 ? 1 : -1
    const back = 1.6 + Math.floor(index / 2) * 1.2
    const tx = hero.x - Math.sin(yaw) * back + Math.cos(yaw) * side * 1.1
    const tz = hero.z - Math.cos(yaw) * back - Math.sin(yaw) * side * 1.1
    const fx = tx - a.pos.x
    const fz = tz - a.pos.z
    const fd = Math.hypot(fx, fz)
    if (fd > 0.6) {
      const k = Math.min(1, fd / 2)
      c.x = (fx / fd) * k
      c.z = (fz / fd) * k
      c.speed = fd > 4 ? 5.5 : 4
    } else {
      c.x = c.z = 0
    }
  }

  _partnerClip(p, clip, t) {
    p.control.clip = clip
    p.agent.clipKey = null
    p.clipT = t
  }

  _partnerDown(p) {
    p.hp = 0
    p.downT = 10
    p.control.clip = 'sitDown'
    p.agent.clipKey = null
    p.clipT = 99
    this.ui.toast(`${p.def.name} is down! (back in 10s)`)
  }

  // ── travel and dungeons ─────────────────────────────────────────────────────────────

  /** Clear the stage: monsters, herbs, and every bot that is not you or your party. */
  _clearStage() {
    this.monsters.clear()
    this.fx.clearHerbs()
    this.guarded.clear()
    this.ui.setBoss(null)
    for (const a of this.colony.astronauts.agents) {
      if (a.id === HERO_ID || save.party.includes(a.id)) continue
      this.colony.astronauts._drop(a)
    }
  }

  async travel(regionId) {
    if (!save.unlocked.includes(regionId)) return
    this.ui.closeWindow()
    runtime.dungeon = null
    await this._goto(regionId)
  }

  async _goto(regionId, { quiet = false } = {}) {
    this.paused = true
    if (!quiet) await this.ui.fade(true, true)
    this._clearStage()
    save.region = regionId
    persist(true)
    this._syncPlanet()
    await this.poll()
    this._toCamp()
    this.paused = false
    if (!quiet) await this.ui.fade(false)
    if (!runtime.dungeon) this._arrive()
  }

  async enterDungeon(id) {
    const def = DUNGEONS.find((d) => d.id === id)
    if (!def) return
    this.ui.closeWindow()
    this.paused = true
    await this.ui.fade(true)
    this._clearStage()
    runtime.dungeon = { def, wave: -1, between: 1.5, bossOut: false, done: false }
    this._syncPlanet()
    await this.poll()
    this._toCamp()
    this.paused = false
    this.ui.setRegion(`Dungeon · ${def.name}`)
    await this.ui.fade(false)
    this.ui.banner(def.name, `${def.waves.length} waves and a guardian. Good luck.`)
  }

  _dungeon(dt) {
    const run = runtime.dungeon
    const def = run.def
    const alive = this.monsters.alive.length
    if (run.done) {
      this._interactTarget()
      if (this.target?.kind === 'gate') {
        this.target = { kind: 'exit' }
        this.ui.setInteract('✨ Leave Dungeon')
      }
      return
    }
    if (alive > 0) {
      this._interactTarget()
      if (this.target?.kind === 'gate') {
        this.target = { kind: 'exit' }
        this.ui.setInteract('\u{1F6AA} Retreat')
      }
      return
    }
    run.between -= dt
    if (run.between > 0) return
    run.between = 2.5
    const hero = this.hero.pos
    if (run.wave + 1 < def.waves.length) {
      run.wave++
      const [kind, n] = def.waves[run.wave]
      this.ui.banner(`Wave ${run.wave + 1} / ${def.waves.length}`, MONSTERS[kind].name)
      for (let i = 0; i < n; i++) {
        const s = this._freeSpot(hero, 6, 13, false)
        if (s) this.monsters.spawn(kind, s.x, s.z, { tier: def.tier })
      }
    } else if (!run.bossOut) {
      run.bossOut = true
      const s = this._freeSpot(hero, 9, 14, false) || this._freeSpot({ x: 0, z: 0 }, 5, 20, false)
      if (s) this.monsters.spawn(def.boss, s.x, s.z, { tier: def.bossTier })
      this.ui.banner('Dungeon Guardian', MONSTERS[def.boss].name)
      this.rig.shake(0.8)
    } else {
      run.done = true
      const first = !save.dungeons[def.id]
      save.dungeons[def.id] = (save.dungeons[def.id] || 0) + 1
      save.stats.dungeons++
      const k = first ? 1 : 0.5
      const gold = Math.round(def.reward.gold * k)
      save.hero.gold += gold
      if (def.reward.item) save.hero.items[def.reward.item] += first ? def.reward.qty : 1
      this.xp(Math.round(def.reward.xp * k))
      const r = REGION_BY_ID[def.region]
      const up = addGuildPoints(Math.round(15 * r.chapter * k))
      persist()
      this.sfx.quest()
      this.ui.banner('DUNGEON CLEARED!', `+${gold} G${first ? ' · first clear bonus' : ''}`)
      if (up) setTimeout(() => this.ui.banner(`Guild Rank ${up}!`, 'Your guild card glows'), 2800)
      this.ui.toast('Walk back to the gate to leave')
    }
  }

  async leaveDungeon() {
    runtime.dungeon = null
    this.ui.closeDialog()
    this.paused = true
    await this.ui.fade(true)
    await this._goto(save.region, { quiet: true })
    await this.ui.fade(false)
  }

  // ── projection and the HUD ──────────────────────────────────────────────────────────

  screen(x, y, z) {
    bendPoint(_v.set(x, y, z)).project(this.engine.camera)
    if (_v.z > 1 || _v.z < -1) return null
    const { w, h } = this.engine.viewport
    return { x: (_v.x * 0.5 + 0.5) * w, y: (-_v.y * 0.5 + 0.5) * h }
  }

  _hud() {
    const ui = this.ui
    const s = heroStats()
    const h = save.hero
    ui.setHero({ name: save.name, level: h.level, hp: h.hp, maxHp: s.maxHp, mp: h.mp, maxMp: s.maxMp, xp: h.xp, next: s.next, gold: h.gold, rank: this.rank() })
    ui.setSkills(
      SKILLS.map((sk, i) => {
        const owned = save.skills.includes(sk.id)
        return {
          icon: sk.icon,
          name: sk.name.split(' ')[0],
          locked: !owned,
          lockText: h.level < sk.level ? `Lv ${sk.level}` : 'SHOP',
          noMp: h.mp < sk.mp,
          cd: owned ? this.cd[`s${i}`] / sk.cd : 0,
        }
      })
    )
    ui.setDash(this.cd.dash / DASH_CD)
    ui.setPotions(h.items.potion)
    ui.setWeapon(save.weapon === "staff" && save.staff > 0)

    // Quest tracker: what you are doing, in one glance.
    const lines = []
    for (const [title, sub] of this.story.trackerLines()) lines.push(`<div class="q"><b>▶ ${esc(title)}</b><small>${esc(sub)}</small></div>`)
    if (!save.guild.registered && save.prologue.step === 'done') lines.push(`<div class="q"><b>▶ Register at the Adventurers’ Guild</b><small>Find ${esc(this._guildName())}</small></div>`)
    if (runtime.dungeon) {
      const run = runtime.dungeon
      lines.push(
        `<div class="q"><b>${esc(run.def.name)}</b><small>${run.done ? 'Cleared! Return to the gate' : run.bossOut ? 'Defeat the guardian' : `Wave ${Math.max(1, run.wave + 1)} / ${run.def.waves.length}`}</small></div>`
      )
    } else {
      for (const q of activeQuests().filter((x) => x.region === region().id).slice(0, 3)) {
        const st = save.quests[q.id]
        const done = questComplete(q)
        const giver = npcById(`npc:${q.region}:${q.giver}`)
        let prog = ''
        if (done) prog = `Report to ${giver?.name}`
        else if (q.type === 'hunt' || q.type === 'gather') prog = `${st.progress} / ${q.count}`
        else if (q.type === 'rescue') prog = npcState(`npc:${q.region}:${q.target}`).freed ? `Talk to ${npcById(`npc:${q.region}:${q.target}`)?.name}` : 'Defeat the monsters around them'
        else if (q.type === 'build') prog = `Donate ${q.cost} G to ${giver?.name}`
        else if (q.type === 'boss') prog = `Defeat ${MONSTERS[q.target].name}`
        lines.push(`<div class="q${done ? ' done' : ''}"><b>${done ? '✔' : '▶'} ${esc(q.title)}</b><small>${esc(prog)}</small></div>`)
      }
    }
    ui.setTracker(lines.join(''))

    // Bars over monsters, tags over villagers who want you.
    const bars = []
    let boss = null
    for (const m of this.monsters.list) {
      if (m.state === 'dead') continue
      if (m.boss) {
        boss = m
        continue
      }
      if (m.hp >= m.maxHp && m.state !== 'chase') continue
      const p = this.screen(m.pos.x, m.pos.y + m.def.size * 1.75, m.pos.z)
      if (p) bars.push({ x: p.x, y: p.y, pct: m.hp / m.maxHp })
    }
    ui.bars(bars)
    ui.setBoss(boss ? { name: `☠ ${boss.def.name}`, pct: boss.hp / boss.maxHp } : null)

    const tags = []
    if (this.hero) {
      for (const a of this.colony.astronauts.agents) {
        if (a === this.hero || a.state === 'gone' || a.state === 'queued') continue
        const d = Math.hypot(a.pos.x - this.hero.pos.x, a.pos.z - this.hero.pos.z)
        const partner = this.partners.get(a.id)
        const quest = a.status === 'waiting'
        if (!partner && !quest && d > 7) continue
        if (d > 22) continue
        const npc = npcById(a.id)
        if (!npc) continue
        const p = this.screen(a.pos.x, a.pos.y + 1.55, a.pos.z)
        if (!p) continue
        const text = partner ? `${npc.name} ${Math.max(0, Math.round((partner.hp / partner.maxHp) * 100))}%` : quest ? `! ${npc.name}` : npc.name
        tags.push({ x: p.x, y: p.y, text, quest })
      }
    }
    ui.tags(tags)
    this._minimap()
  }

  rank() {
    return save.guild.registered ? this._rank() : '—'
  }

  _rank() {
    const pts = save.guild.points
    return ['F', 'E', 'D', 'C', 'B', 'A', 'S'][[0, 20, 70, 160, 300, 520, 900].filter((p) => pts >= p).length - 1]
  }

  _guildName() {
    for (const v of region().villages) for (const n of v.npcs) if (n.guild) return `${n.name} in ${v.name}`
    return 'the guild'
  }

  _minimap() {
    if (!this.hero || (this._mmT = (this._mmT || 0) + 1) % 6) return
    const g = this.ui.minimap
    const W = g.canvas.width
    const R = W / 2
    const scale = R / 40
    const hp = this.hero.pos
    const cos = Math.cos(this.az)
    const sin = Math.sin(this.az)
    const map = (x, z) => {
      const dx = x - hp.x
      const dz = z - hp.z
      // Rotate so "up" on the minimap is where the camera faces.
      return [R + (dx * cos - dz * sin) * scale, R + (dx * sin + dz * cos) * scale]
    }
    g.clearRect(0, 0, W, W)
    g.save()
    g.beginPath()
    g.arc(R, R, R - 2, 0, Math.PI * 2)
    g.clip()
    g.fillStyle = 'rgba(8,18,38,0.55)'
    g.fillRect(0, 0, W, W)
    const L = realm.layout
    const blob = (x, z, r, color) => {
      const [px, py] = map(x, z)
      g.fillStyle = color
      g.beginPath()
      g.arc(px, py, r * scale, 0, Math.PI * 2)
      g.fill()
    }
    if (L) {
      for (const f of L.forests) blob(f.x, f.z, f.r, 'rgba(60,140,70,0.35)')
      g.strokeStyle = 'rgba(214,180,120,0.55)'
      g.lineWidth = 5
      for (const road of L.roads) {
        g.beginPath()
        road.forEach((p, i) => {
          const [x, y] = map(p.x, p.z)
          if (i) g.lineTo(x, y)
          else g.moveTo(x, y)
        })
        g.stroke()
      }
      for (const v of L.villages) blob(v.x, v.z, 13, 'rgba(255,236,190,0.22)')
      for (const f of L.fields) blob(f.x, f.z, 6, 'rgba(200,170,90,0.3)')
      blob(L.camp.x, L.camp.z, 7, 'rgba(127,216,255,0.28)')
    }
    const dot = (x, z, color, r) => {
      const [px, py] = map(x, z)
      g.fillStyle = color
      g.beginPath()
      g.arc(px, py, r, 0, Math.PI * 2)
      g.fill()
    }
    const door = realm.portal
    dot(door.x, door.z, '#b48aff', 7)
    for (const h of this.fx.herbs) dot(h.x, h.z, '#8affc8', 4)
    for (const m of this.monsters.list) if (m.state !== 'dead') dot(m.pos.x, m.pos.z, m.boss ? '#ff2a4a' : '#ff6a6a', m.boss ? 9 : 4)
    for (const a of this.colony.astronauts.agents) {
      if (a === this.hero || a.state === 'gone') continue
      dot(a.pos.x, a.pos.z, this.partners.has(a.id) ? '#7cf0a8' : a.status === 'waiting' ? '#ffd75a' : a.status === 'blocked' ? '#ff8a5a' : '#cfd8e6', a.status === 'waiting' ? 6 : 4)
    }
    g.restore()
    // The hero, always in the middle, pointing where they face.
    const yaw = this.hero.yaw
    const fx = Math.sin(yaw)
    const fz = Math.cos(yaw)
    const ax = fx * cos - fz * sin
    const ay = fx * sin + fz * cos
    g.fillStyle = '#ffffff'
    g.beginPath()
    g.moveTo(R + ax * 12, R + ay * 12)
    g.lineTo(R - ay * 7 - ax * 6, R + ax * 7 - ay * 6)
    g.lineTo(R + ay * 7 - ax * 6, R - ax * 7 - ay * 6)
    g.closePath()
    g.fill()
  }
}

export { REGIONS }
