import * as THREE from 'three'
import { FRUITS, PET_STAGES, REGIONS, RACES, SKILLS, STORY } from './data.js'
import { HERO_ID, heroStats, persist, raceOf, region, runtime, save } from './world.js'
import { buildMesh } from './monsters.js'
import { realm } from './index.js'

/**
 * Fruits, evolution and the beast: the part of the game about what you are becoming.
 *
 * - Fruit grows wild, mostly under the trees. Ordinary fruit raises one stat for good; an
 *   Evolution Fruit raises everything, and eat enough of them and your race changes —
 *   announced the way a status screen would announce it.
 * - Somewhere in the woods there is a starving beast. Feed it and it follows you; feed it
 *   more and it grows; feed it Evolution Fruit and one day it stands up and speaks.
 * - New games open in the Forbidden Forest: eat, befriend, survive the Forest Lord, and the
 *   portal opens toward the human lands.
 */

const FRUIT_GEO = new THREE.SphereGeometry(0.22, 14, 10)
const LEAF_GEO = new THREE.ConeGeometry(0.08, 0.2, 5)
const leafMat = new THREE.MeshStandardMaterial({ color: 0x3a8a3a, roughness: 0.6 })
const ORDINARY = Object.keys(FRUITS).filter((k) => !FRUITS[k].rare)

export class Story {
  constructor(game) {
    this.game = game
    this.fruits = []
    this.pet = null
    this.candidate = null
    this.evoTimer = 60 + Math.random() * 90
    this.fruitTimer = 0
    this.lastKey = null
  }

  get ui() {
    return this.game.ui
  }

  // ── per frame ───────────────────────────────────────────────────────────────────────

  update(dt, elapsed) {
    const hero = this.game.hero
    if (!hero) return
    if (this.game.interior) {
      this.pet?.update(dt, elapsed, hero)
      return
    }
    const key = runtime.dungeon ? 'dungeon' : region().id
    if (key !== this.lastKey) this._newMap(key)

    if (!runtime.dungeon) this._spawnFruit(dt, hero)
    for (const f of this.fruits) {
      f.mesh.rotation.y = elapsed * 1.2 + f.phase
      f.mesh.position.y = f.y + 0.55 + Math.sin(elapsed * 2 + f.phase) * 0.1
      if (f.rare && Math.random() < dt * 6) this.game.fx.spark(f.x, f.y + 0.6, f.z, new THREE.Color(1, 0.85, 0.4), 1, 0.6, 0.8, 0.07)
    }
    this._pickup(hero)
    this._prologue(hero)
    this._updateCandidate(dt, elapsed, hero)
    this.pet?.update(dt, elapsed, hero)
  }

  /** On arriving somewhere: clear the old fruit, and make sure each region has its first Evolution Fruit. */
  _newMap(key) {
    this.lastKey = key
    for (const f of this.fruits) this.game.engine.scene.remove(f.mesh)
    this.fruits = []
    this._removeCandidate()
    if (key === 'dungeon') return
    const hero = this.game.hero.pos
    if (key === 'forest' && save.prologue.step === 'fruit') {
      // The one glowing on the crooked tree in the opening: right in front of you.
      this._placeFruit('evolution', hero.x + 5, hero.z + 2)
      return
    }
    if (!save.seenEvoFruit[key]) {
      const spot = this._forestSpot(hero, 20, 60)
      if (spot) this._placeFruit('evolution', spot.x, spot.z)
    }
    this._ensurePet()
  }

  _spawnFruit(dt, hero) {
    this.fruitTimer -= dt
    const ordinary = this.fruits.filter((f) => !f.rare).length
    if (this.fruitTimer <= 0 && ordinary < 4) {
      this.fruitTimer = 8
      const spot = this._forestSpot(hero, 10, 38) || this.game._freeSpot(hero, 12, 35)
      if (spot) this._placeFruit(ORDINARY[Math.floor(Math.random() * ORDINARY.length)], spot.x, spot.z)
    }
    // Every few minutes, somewhere under the trees, something starts to glow.
    this.evoTimer -= dt
    if (this.evoTimer <= 0 && !this.fruits.some((f) => f.rare)) {
      this.evoTimer = 200 + Math.random() * 160
      const spot = this._forestSpot(hero, 18, 45)
      if (spot) {
        this._placeFruit('evolution', spot.x, spot.z)
        this.ui.system('Something in the forest is glowing...')
      }
    }
  }

  _forestSpot(near, minD, maxD) {
    const woods = realm.layout?.forests || []
    for (let i = 0; i < 30; i++) {
      const f = woods[Math.floor(Math.random() * woods.length)]
      if (!f) break
      const a = Math.random() * Math.PI * 2
      const d = Math.sqrt(Math.random()) * f.r
      const x = f.x + Math.cos(a) * d
      const z = f.z + Math.sin(a) * d
      const dist = Math.hypot(x - near.x, z - near.z)
      if (dist < minD || dist > maxD) continue
      if (this.game._blocked(x, z)) continue
      return { x, z }
    }
    return null
  }

  _placeFruit(kind, x, z) {
    const def = FRUITS[kind]
    const mat = new THREE.MeshStandardMaterial({
      color: def.color,
      roughness: 0.35,
      emissive: def.color,
      emissiveIntensity: def.rare ? 1.2 : 0.25,
    })
    const mesh = new THREE.Group()
    const body = new THREE.Mesh(FRUIT_GEO, mat)
    const leaf = new THREE.Mesh(LEAF_GEO, leafMat)
    leaf.position.set(0.05, 0.22, 0)
    leaf.rotation.z = -0.6
    mesh.add(body, leaf)
    if (def.rare) mesh.scale.setScalar(1.5)
    const y = this.game.colony.groundAt(x, z)
    mesh.position.set(x, y + 0.55, z)
    this.game.engine.scene.add(mesh)
    this.fruits.push({ kind, x, z, y, mesh, rare: Boolean(def.rare), phase: Math.random() * 6 })
  }

  _pickup(hero) {
    for (let i = this.fruits.length - 1; i >= 0; i--) {
      const f = this.fruits[i]
      if (Math.hypot(f.x - hero.pos.x, f.z - hero.pos.z) > 1.3) continue
      this.game.engine.scene.remove(f.mesh)
      this.fruits.splice(i, 1)
      const def = FRUITS[f.kind]
      save.fruits[f.kind] = (save.fruits[f.kind] || 0) + 1
      if (f.rare) save.seenEvoFruit[region().id] = true
      persist()
      this.game.sfx.pickup()
      this.game.fx.spark(f.x, f.y + 0.6, f.z, new THREE.Color(def.color), f.rare ? 30 : 12, 2.2, 0.8)
      this.ui.system(`Obtained: ${def.name}`)
      // The very first one, in the forest, is eaten on the spot. You are *starving*.
      if (f.rare && save.prologue.step === 'fruit') {
        this.game.ui.dialog({
          name: save.name,
          text: 'It smells like honey and sunlight. Your stomach growls loud enough to scare the birds. ...One bite couldn’t hurt. Right?',
          choices: [{ label: '\u{1F31F} Eat it', primary: true, fn: () => this.eat('evolution') }],
        })
      }
    }
  }

  // ── eating, evolving ────────────────────────────────────────────────────────────────

  /** Eat a fruit from the bag. Returns false if there is none. */
  eat(kind) {
    if (!save.fruits[kind]) return false
    save.fruits[kind]--
    const def = FRUITS[kind]
    const hero = this.game.hero
    if (kind === 'evolution') {
      const before = raceOf()
      save.evo++
      save.stats.evo = save.evo
      for (const k of Object.keys(save.bonus)) save.bonus[k] += k === 'hp' ? 15 : k === 'mp' ? 8 : 3
      const after = raceOf()
      this.game.sfx.levelUp()
      this.game.fx.aura(hero.pos, 0xffd36a)
      this.ui.system('All stats have increased dramatically.')
      if (save.evo === 1) this.ui.system('Title acquired: 『Forbidden Fruit Glutton』')
      if (after !== before) this.evolve(before, after)
      if (save.prologue.step === 'fruit') {
        save.prologue.step = 'beast'
        setTimeout(() => this.game.narrate('Heat floods through you. Your heartbeat thunders, then settles — stronger, slower, <em>different</em>. Somewhere nearby, something whimpers. It sounds hungry too.'.replace(/<\/?em>/g, '')), 2600)
      }
    } else {
      save.bonus[def.stat] += def.amount
      this.game.sfx.heal()
      this.ui.system(`${def.name}: ${def.desc}`)
    }
    const s = heroStats()
    save.hero.hp = Math.min(s.maxHp, save.hero.hp + s.maxHp * 0.3)
    save.hero.mp = Math.min(s.maxMp, save.hero.mp + s.maxMp * 0.3)
    persist()
    return true
  }

  /** The race-change moment: a white flash, the system voice, a new spell. */
  async evolve(before, after) {
    const ui = this.ui
    await ui.fade(true, true)
    const s = heroStats()
    save.hero.hp = s.maxHp
    save.hero.mp = s.maxMp
    this.game.colony.astronauts.celebrate(HERO_ID)
    await ui.fade(false, true)
    ui.banner('EVOLUTION', `${before.name} → ${after.name}`)
    ui.system(`Race has changed: ${before.name} → ${after.name}`)
    if (after.skill && !save.skills.includes(after.skill)) {
      save.skills.push(after.skill)
      const sk = SKILLS.find((k) => k.id === after.skill)
      ui.system(`Skill acquired: ${sk.icon} ${sk.name}`)
    }
    if (RACES.indexOf(after) >= 2) ui.system('Title acquired: 『One Who Left Humanity Behind』')
    ui.system('Warning: your stats are no longer within normal human parameters.')
    // The hero glows a little more with every step away from human.
    const tint = [0x3b6fe0, 0x4a7af0, 0x7a6af0, 0x3ac8a0, 0xffc84a][RACES.indexOf(after)] || 0x3b6fe0
    this.game.heroSuit = tint
    this.game.hero.suit = tint
    this.game.hero.colorDirty = true
    persist()
    this.game.refresh()
  }

  // ── the beast ───────────────────────────────────────────────────────────────────────

  /** Bring back the companion after a reload or a journey, at whatever stage it is. */
  _ensurePet() {
    if (!save.pet || save.pet.stage >= 2) {
      this.pet?.dispose()
      this.pet = null
      return
    }
    if (!this.pet) this.pet = new Pet(this.game, save.pet)
    else this.pet.restage()
  }

  /** A starving beast waiting in the woods: in the prologue, or later if you never met one. */
  _updateCandidate(dt, elapsed, hero) {
    const want = !save.pet && !runtime.dungeon && (save.prologue.step === 'beast' || (save.prologue.step === 'done' && realm.forestAt(hero.pos.x, hero.pos.z)))
    if (want && !this.candidate) {
      const spot = save.prologue.step === 'beast' ? this.game._freeSpot(hero.pos, 6, 9, false) : this._forestSpot(hero.pos, 8, 16)
      if (spot) {
        const def = { ...PET_STAGES[0] }
        const mesh = buildMesh(def)
        mesh.group.position.set(spot.x, this.game.colony.groundAt(spot.x, spot.z), spot.z)
        mesh.group.scale.setScalar(def.size)
        mesh.body.rotation.x = 0.3
        this.game.engine.scene.add(mesh.group)
        this.candidate = { ...mesh, x: spot.x, z: spot.z, phase: 0 }
        if (save.prologue.step === 'beast') this.ui.system('A starving beast is watching you.')
      }
    }
    if (!want && this.candidate && save.pet) this._removeCandidate()
    const c = this.candidate
    if (!c) return
    c.phase += dt
    // Curled up, shivering, peeking at you.
    c.body.scale.set(1 + Math.sin(c.phase * 9) * 0.02, 0.85, 1)
    c.group.rotation.y = Math.atan2(hero.pos.x - c.x, hero.pos.z - c.z)
  }

  _removeCandidate() {
    if (!this.candidate) return
    this.game.engine.scene.remove(this.candidate.group)
    this.candidate.skin.dispose()
    this.candidate = null
  }

  /** What the interact button should offer here, if the story has something. */
  interactTarget(hero) {
    const c = this.candidate
    if (c && Math.hypot(c.x - hero.x, c.z - hero.z) < 3) return { kind: 'beast', label: '\u{1F34E} Feed the beast' }
    if (this.pet && Math.hypot(this.pet.pos.x - hero.x, this.pet.pos.z - hero.z) < 2.6) return { kind: 'pet', label: `\u{1F43E} ${save.pet.name}` }
    return null
  }

  interact(kind) {
    if (kind === 'beast') return this._befriend()
    if (kind === 'pet') return this._petMenu()
  }

  _anyFruit() {
    return Object.keys(FRUITS).find((k) => save.fruits[k] > 0 && !FRUITS[k].rare) || (save.fruits.evolution > 0 ? 'evolution' : null)
  }

  _befriend() {
    const fruit = this._anyFruit()
    const say = (text, choices) => this.ui.dialog({ name: 'Starving Beast', text, choices })
    if (!fruit) {
      // Make sure the prologue can never stall for want of an apple.
      if (save.prologue.step === 'beast' && !this.fruits.some((f) => !f.rare)) {
        const spot = this.game._freeSpot(this.game.hero.pos, 4, 7, false)
        if (spot) this._placeFruit('strength', spot.x, spot.z)
      }
      return say('It whimpers and stares at your empty hands. (Find some fruit — there is always some growing nearby.)', [{ label: 'I’ll be back' }])
    }
    say(`Thin, shivering, too weak to run. It sniffs at the ${FRUITS[fruit].name} you’re carrying.`, [
      {
        label: `Give it the ${FRUITS[fruit].name}`,
        primary: true,
        fn: () => {
          save.fruits[fruit]--
          this._removeCandidate()
          this._askName((name) => {
            save.pet = { name, stage: 0, fed: 1, evoFed: fruit === 'evolution' ? 1 : 0 }
            save.stats.tamed = 1
            persist()
            this._ensurePet()
            this.game.sfx.quest()
            this.ui.banner(`${name} joined you!`, 'Feed it fruit and it will grow')
            this.ui.system('Title acquired: 『Beast Whisperer』')
            if (save.prologue.step === 'beast') {
              save.prologue.step = 'boss'
              persist()
              setTimeout(() => this.game.narrate(`${name} presses against your leg and growls at the trees. The ground shakes. Something huge has noticed the light of the fruit — and you.`), 2600)
            }
          })
        },
      },
      { label: 'Not now' },
    ])
  }

  _askName(then) {
    this.ui.openWindow(
      'NAME YOUR COMPANION',
      `<div class="muted" style="padding-top:0">It’s looking at you like you hung the moon.</div>
       <input type="text" maxlength="14" value="Mochi" />
       <div style="display:flex;justify-content:center;margin-top:12px"><button type="button" class="act primary" data-ok>That’s your name</button></div>`,
      (root) => {
        const input = root.querySelector('input')
        const done = () => {
          const name = input.value.trim().slice(0, 14) || 'Mochi'
          this.game._afterWindow = null
          this.ui.closeWindow()
          then(name)
        }
        root.querySelector('[data-ok]').addEventListener('click', done)
        input.addEventListener('submit', done)
      }
    )
  }

  _petMenu() {
    const p = save.pet
    const st = PET_STAGES[p.stage]
    const next = p.stage === 0 ? `Feed it ${Math.max(0, 3 - p.fed)} more fruit to grow.` : `It needs ${Math.max(0, 2 - p.evoFed)} more Evolution Fruit${save.evo < 1 ? ', and for you to have evolved once yourself,' : ''} to take its final form.`
    const choices = Object.keys(FRUITS)
      .filter((k) => save.fruits[k] > 0)
      .slice(0, 4)
      .map((k) => ({ label: `${FRUITS[k].icon} Feed ${FRUITS[k].name}`, primary: k === 'evolution', fn: () => this.feed(k) }))
    choices.push({ label: 'Pat its head', fn: () => this.ui.toast(`${p.name} makes a happy rumbling noise.`) })
    choices.push({ label: 'Bye' })
    this.ui.dialog({ name: p.name, role: st.name, text: `${p.name} wags its whole body at you. ${next}`, choices })
  }

  feed(kind) {
    const p = save.pet
    if (!p || !save.fruits[kind]) return
    save.fruits[kind]--
    p.fed++
    if (kind === 'evolution') p.evoFed++
    this.game.sfx.pickup()
    this.game.fx.spark(this.pet.pos.x, this.pet.pos.y + 0.8, this.pet.pos.z, new THREE.Color(FRUITS[kind].color), 16, 2, 0.8)
    persist()
    if (p.stage === 0 && p.fed >= 3) this._petEvolve(1)
    else if (p.stage === 1 && p.evoFed >= 2 && save.evo >= 1) this._petEvolve(2)
    else this.ui.toast(`${p.name} munches happily.`)
  }

  async _petEvolve(stage) {
    const p = save.pet
    const ui = this.ui
    ui.banner(`${p.name} is evolving!`, PET_STAGES[stage].name)
    this.game.sfx.levelUp()
    this.game.rig.shake(0.5)
    await new Promise((r) => setTimeout(r, 1400))
    await ui.fade(true, true)
    p.stage = stage
    persist()
    this._ensurePet()
    if (stage >= 2) this.game.refresh()
    await ui.fade(false, true)
    ui.system(`${p.name} has evolved: ${PET_STAGES[stage - 1].name} → ${PET_STAGES[stage].name}`)
    if (stage === 2) {
      setTimeout(
        () =>
          ui.dialog({
            name: p.name,
            role: PET_STAGES[2].cls,
            text: `...M-master? I... I can talk?! I can TALK! I’ve wanted to say it since the forest — thank you for feeding me. I’ll fight beside you forever!`,
            choices: [{ label: `Welcome, ${p.name}`, primary: true }],
          }),
        900
      )
    }
  }

  // ── the prologue ────────────────────────────────────────────────────────────────────

  _prologue(hero) {
    if (region().id !== 'forest' || runtime.dungeon) return
    const step = save.prologue.step
    if (step === 'boss' && !this.game.ui.dialogOpen && !this.game.monsters.list.some((m) => m.boss && m.state !== 'dead')) {
      if (this._bossCalled) return
      this._bossCalled = true
      const spot = this.game._freeSpot(hero.pos, 14, 22, false)
      if (!spot) {
        this._bossCalled = false
        return
      }
      this.game.monsters.spawn('forest_lord', spot.x, spot.z)
      this.ui.banner('The Forest Lord appears!', 'Boss battle')
      this.game.rig.shake(0.9)
    }
  }

  /** Called by the game whenever a boss dies. */
  onBossKilled(kind) {
    if (kind !== 'forest_lord' || save.prologue.step !== 'boss') return
    save.prologue.step = 'done'
    save.stats.forest = 1
    if (!save.cleared.includes('forest')) save.cleared.push('forest')
    const next = REGIONS.find((r) => r.chapter === 1)
    if (!save.unlocked.includes(next.id)) save.unlocked.push(next.id)
    persist()
    setTimeout(() => {
      this.ui.banner('Prologue Clear!', 'The portal has awakened')
      this.ui.system('Title acquired: 『The Extra One』')
      this.game.sfx.levelUp()
      setTimeout(() => this.game.narrate(STORY.forest.clear), 2600)
    }, 2000)
  }

  /** Lines for the quest tracker while the prologue is running. */
  trackerLines() {
    if (region().id !== 'forest' || runtime.dungeon) return []
    const step = save.prologue.step
    if (step === 'fruit') return [['Eat the glowing fruit', 'It is shining just ahead of you']]
    if (step === 'beast') return [['Feed the starving beast', 'It is close by. Any fruit will do']]
    if (step === 'boss') return [['Survive the Forest Lord', 'Defeat it with your new strength']]
    if (step === 'done') return [['Leave the forest', 'Step into the portal — the human lands await']]
    return []
  }
}

/**
 * The beast at stages 0 and 1: one of the monster bodies, on your side. It bounds after
 * you, and goes for whatever is attacking you. At stage 2 it becomes a party member instead.
 */
class Pet {
  constructor(game, data) {
    this.game = game
    this.data = data
    this.pos = new THREE.Vector3()
    const h = game.hero.pos
    this.pos.set(h.x - 1.5, h.y, h.z - 1)
    this.hop = 0
    this.cd = 0
    this.lunge = 0
    this.restage()
  }

  restage() {
    if (this.mesh) {
      this.game.engine.scene.remove(this.mesh.group)
      this.mesh.skin.dispose()
    }
    this.def = { ...PET_STAGES[this.data.stage] }
    this.mesh = buildMesh(this.def)
    this.game.engine.scene.add(this.mesh.group)
  }

  update(dt, elapsed, hero) {
    const g = this.game
    const size = this.def.size
    this.cd = Math.max(0, this.cd - dt)
    const target = g.monsters.nearest(this.pos.x, this.pos.z, 7)
    let goal
    if (target && Math.hypot(target.pos.x - hero.pos.x, target.pos.z - hero.pos.z) < 10) {
      goal = target.pos
      const d = Math.hypot(target.pos.x - this.pos.x, target.pos.z - this.pos.z) - target.radius
      if (d < 0.9 && this.cd <= 0) {
        this.cd = 1.1
        this.lunge = 0.3
        const atk = Math.round(heroStats().atk * this.def.atk)
        g.damage(target, Math.max(1, atk), false, this.pos)
      }
    } else {
      const yaw = hero.yaw
      goal = { x: hero.pos.x - Math.sin(yaw) * 1.8 + Math.cos(yaw) * 1.2, z: hero.pos.z - Math.cos(yaw) * 1.8 - Math.sin(yaw) * 1.2 }
    }
    const dx = goal.x - this.pos.x
    const dz = goal.z - this.pos.z
    const dist = Math.hypot(dx, dz)
    // Fell too far behind (a teleport, a portal): catch up at once.
    if (Math.hypot(hero.pos.x - this.pos.x, hero.pos.z - this.pos.z) > 25) this.pos.set(hero.pos.x - 1.5, hero.pos.y, hero.pos.z - 1)
    else if (dist > 0.6) {
      const speed = Math.min(dist, dt * (dist > 4 ? 6 : 3.8))
      const nx = this.pos.x + (dx / dist) * speed
      const nz = this.pos.z + (dz / dist) * speed
      if (!g._blocked(nx, nz)) this.pos.set(nx, this.pos.y, nz)
      else if (!g._blocked(nx, this.pos.z)) this.pos.x = nx
      else if (!g._blocked(this.pos.x, nz)) this.pos.z = nz
      this.hop += dt * 3
    }
    const moving = dist > 0.6
    const air = moving ? Math.abs(Math.sin(this.hop * Math.PI)) : 0
    const ground = g.colony.groundAt(this.pos.x, this.pos.z)
    this.pos.y = ground
    const m = this.mesh
    m.group.position.set(this.pos.x, ground + air * 0.3 * size, this.pos.z)
    if (dist > 0.05) m.group.rotation.y = Math.atan2(dx, dz)
    m.group.scale.setScalar(size)
    this.lunge = Math.max(0, this.lunge - dt)
    m.body.rotation.x = this.lunge > 0 ? Math.sin((this.lunge / 0.3) * Math.PI) * 0.5 : 0
    const squash = moving ? -air * 0.08 : Math.sin(elapsed * 2.5) * 0.03
    m.body.scale.set(1 + squash, 1 - squash, 1 + squash)
  }

  dispose() {
    this.game.engine.scene.remove(this.mesh.group)
    this.mesh.skin.dispose()
  }
}
