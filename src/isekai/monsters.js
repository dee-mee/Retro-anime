import * as THREE from 'three'
import { MONSTERS } from './data.js'

/**
 * The things in the grass. Every species is the same rounded blob — the classic isekai
 * slime — dressed up with horns, spikes, a crown or an inner glow, so they sit in the
 * colony's soft, toy-like look rather than fighting it.
 */

const geo = {
  body: new THREE.SphereGeometry(1, 24, 16),
  eye: new THREE.SphereGeometry(0.16, 12, 8),
  pupil: new THREE.SphereGeometry(0.085, 10, 6),
  horn: new THREE.ConeGeometry(0.13, 0.5, 10),
  spike: new THREE.ConeGeometry(0.09, 0.32, 8),
  crownBand: new THREE.CylinderGeometry(0.42, 0.46, 0.16, 18, 1, true),
  crownTip: new THREE.ConeGeometry(0.075, 0.2, 6),
  shadow: new THREE.CircleGeometry(1, 20),
  ring: new THREE.RingGeometry(0.92, 1, 48),
}
geo.shadow.rotateX(-Math.PI / 2)
geo.ring.rotateX(-Math.PI / 2)

const mats = {
  eye: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }),
  pupil: new THREE.MeshStandardMaterial({ color: 0x14121a, roughness: 0.2 }),
  bossPupil: new THREE.MeshStandardMaterial({ color: 0xff2a2a, emissive: 0xff1a1a, emissiveIntensity: 1.6 }),
  horn: new THREE.MeshStandardMaterial({ color: 0xf2e6cf, roughness: 0.55 }),
  gold: new THREE.MeshStandardMaterial({ color: 0xffc83a, metalness: 0.85, roughness: 0.25, side: THREE.DoubleSide }),
  shadow: new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false }),
  warn: new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }),
}

/**
 * An ogre: a hulking two-legged brute with tusks, a loincloth and a spiked club. Built to the
 * same interface as the blobs (group, body, skin, shadow) plus its limbs, which the update
 * loop swings as it walks and brings the club down when it attacks.
 */
function buildOgre(def) {
  const group = new THREE.Group()
  const body = new THREE.Group()
  group.add(body)
  const skin = new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.7, emissive: 0x000000 })
  const cloth = new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.9 })
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a3a1e, roughness: 0.85 })
  const bone = mats.horn
  const part = (geo, mat, x, y, z, parent = body) => {
    const m = new THREE.Mesh(geo, mat)
    m.position.set(x, y, z)
    m.castShadow = true
    parent.add(m)
    return m
  }
  const torso = part(new THREE.CapsuleGeometry(0.42, 0.5, 4, 10), skin, 0, 1.25, 0)
  torso.scale.set(1.15, 1, 0.85)
  part(new THREE.SphereGeometry(0.36, 12, 10), skin, 0, 1.0, 0.16).scale.set(1, 0.85, 0.8)
  part(new THREE.BoxGeometry(0.8, 0.32, 0.6), cloth, 0, 0.72, 0)
  const head = part(new THREE.SphereGeometry(0.3, 14, 10), skin, 0, 1.95, 0.08)
  head.scale.set(1, 0.92, 0.95)
  for (const s of [-1, 1]) {
    const eye = part(geo.eye, mats.eye, s * 0.12, 2.0, 0.33)
    eye.scale.setScalar(0.55)
    const pupil = new THREE.Mesh(geo.pupil, def.boss ? mats.bossPupil : mats.pupil)
    pupil.position.z = 0.1
    eye.add(pupil)
    const tusk = part(new THREE.ConeGeometry(0.045, 0.2, 6), bone, s * 0.11, 1.82, 0.32)
    tusk.rotation.x = -0.4
    const ear = part(new THREE.ConeGeometry(0.07, 0.22, 5), skin, s * 0.3, 2.02, 0.02)
    ear.rotation.z = -s * 1.2
  }
  if (def.crown) {
    const crown = new THREE.Mesh(geo.crownBand, mats.gold)
    crown.position.set(0, 2.2, 0.06)
    crown.scale.setScalar(0.6)
    body.add(crown)
  }
  const limb = (x, y, z, len, thick, mat) => {
    const pivot = new THREE.Group()
    pivot.position.set(x, y, z)
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(thick, len, 3, 8), mat)
    m.position.y = -len / 2 - thick * 0.5
    m.castShadow = true
    pivot.add(m)
    body.add(pivot)
    return pivot
  }
  const armL = limb(-0.6, 1.55, 0, 0.6, 0.14, skin)
  const armR = limb(0.6, 1.55, 0, 0.6, 0.14, skin)
  const legL = limb(-0.24, 0.62, 0, 0.35, 0.16, skin)
  const legR = limb(0.24, 0.62, 0, 0.35, 0.16, skin)
  // The club, in the right fist, pointing forward-down so a swing brings it over and down.
  const club = new THREE.Group()
  club.position.set(0, -0.95, 0.05)
  club.rotation.x = 1.2
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.15, 1.1, 8), wood)
  shaft.position.y = 0.45
  club.add(shaft)
  for (let i = 0; i < 5; i++) {
    const spike = new THREE.Mesh(geo.spike, bone)
    const a = (i / 5) * Math.PI * 2
    spike.position.set(Math.cos(a) * 0.14, 0.85, Math.sin(a) * 0.14)
    spike.rotation.set(Math.sin(a) * 1.4, 0, -Math.cos(a) * 1.4)
    spike.scale.setScalar(0.6)
    club.add(spike)
  }
  armR.add(club)
  const shadow = new THREE.Mesh(geo.shadow, mats.shadow)
  shadow.position.y = 0.03
  shadow.scale.setScalar(0.75)
  group.add(shadow)
  group.scale.setScalar(def.size)
  return { group, body, skin, baseColor: new THREE.Color(def.color), shadow, limbs: { armL, armR, legL, legR } }
}

export function buildMesh(def) {
  if (def.shape === "ogre") return buildOgre(def)
  const group = new THREE.Group()
  const body = new THREE.Group()
  group.add(body)

  const skin = new THREE.MeshStandardMaterial({
    color: def.color,
    roughness: 0.28,
    metalness: 0.02,
    transparent: !def.boss,
    opacity: def.boss ? 1 : 0.9,
    emissive: def.glow ? def.color : 0x000000,
    emissiveIntensity: def.glow ? 0.55 : 0,
  })
  const blob = new THREE.Mesh(geo.body, skin)
  blob.scale.set(1, 0.78, 1)
  blob.position.y = 0.78
  blob.castShadow = true
  body.add(blob)

  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(geo.eye, mats.eye)
    eye.position.set(side * 0.33, 0.95, 0.78)
    const pupil = new THREE.Mesh(geo.pupil, def.boss ? mats.bossPupil : mats.pupil)
    pupil.position.set(0, 0, 0.1)
    eye.add(pupil)
    body.add(eye)
    if (def.ears) {
      const ear = new THREE.Mesh(geo.horn, skin)
      ear.position.set(side * 0.42, 1.42, 0.05)
      ear.rotation.z = -side * 0.6
      ear.scale.set(1.5, 0.8, 0.8)
      body.add(ear)
    }
    if (def.horns) {
      const horn = new THREE.Mesh(geo.horn, mats.horn)
      horn.position.set(side * 0.45, 1.5, 0.1)
      horn.rotation.z = -side * 0.45
      body.add(horn)
    }
  }
  if (def.spikes) {
    const spikeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(def.color).multiplyScalar(0.6), roughness: 0.5 })
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2
      const s = new THREE.Mesh(geo.spike, spikeMat)
      s.position.set(Math.cos(a) * 0.62, 1.2, Math.sin(a) * 0.62)
      s.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6)
      body.add(s)
    }
  }
  if (def.crown) {
    const crown = new THREE.Group()
    crown.add(new THREE.Mesh(geo.crownBand, mats.gold))
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      const tip = new THREE.Mesh(geo.crownTip, mats.gold)
      tip.position.set(Math.cos(a) * 0.44, 0.17, Math.sin(a) * 0.44)
      crown.add(tip)
    }
    crown.position.y = 1.5
    crown.rotation.z = 0.12
    body.add(crown)
  }

  const shadow = new THREE.Mesh(geo.shadow, mats.shadow)
  shadow.position.y = 0.03
  shadow.scale.setScalar(0.9)
  group.add(shadow)

  group.scale.setScalar(def.size)
  return { group, body, skin, baseColor: new THREE.Color(def.color), shadow }
}

let serial = 0

export class Monsters {
  constructor(scene, env) {
    this.scene = scene
    /** `{ groundAt, blocked(x, z), nav }` — what the world is made of. */
    this.env = env
    this.list = []
    this.warnings = []
  }

  spawn(kind, x, z, { tier = 1, guard = null, wild = false } = {}) {
    const def = MONSTERS[kind]
    if (!def) return null
    const mesh = buildMesh(def)
    const hp = Math.round(def.hp * tier)
    const m = {
      id: `mon${++serial}`,
      kind,
      def,
      ...mesh,
      pos: new THREE.Vector3(x, this.env.groundAt(x, z), z),
      home: new THREE.Vector3(x, 0, z),
      wander: new THREE.Vector3(x, 0, z),
      wanderAt: 0,
      yaw: Math.random() * Math.PI * 2,
      hp,
      maxHp: hp,
      atk: Math.round(def.atk * tier),
      xp: Math.round(def.xp * tier),
      gold: Math.round(def.gold * tier),
      radius: def.size * 0.85,
      state: 'idle',
      hop: Math.random() * 10,
      attackCd: 1 + Math.random(),
      lunge: 0,
      flash: 0,
      knock: new THREE.Vector3(),
      spawnT: 0,
      deathT: 0,
      slamCd: 5,
      guard,
      // A wild monster keeps to the wilds: it never sets foot in a village and drops the chase
      // the moment its prey is inside one.
      wild,
      boss: Boolean(def.boss),
      aggro: def.boss ? 30 : guard ? 6 : 8,
    }
    m.group.position.copy(m.pos)
    m.group.scale.setScalar(0.001)
    this.scene.add(m.group)
    this.list.push(m)
    return m
  }

  get alive() {
    return this.list.filter((m) => m.state !== 'dead')
  }

  /** Apply a hit. Returns true if it was the killing blow. */
  damage(m, amount, from) {
    if (m.state === 'dead') return false
    m.hp -= amount
    m.flash = 0.18
    if (from && !m.boss) {
      const dx = m.pos.x - from.x
      const dz = m.pos.z - from.z
      const len = Math.hypot(dx, dz) || 1
      m.knock.set((dx / len) * 6, 0, (dz / len) * 6)
    }
    m.state = 'chase'
    if (m.hp <= 0) {
      m.hp = 0
      m.state = 'dead'
      m.deathT = 0
      return true
    }
    return false
  }

  clear() {
    for (const m of this.list) this._dispose(m)
    this.list.length = 0
    for (const w of this.warnings) this.scene.remove(w.mesh)
    this.warnings.length = 0
  }

  _dispose(m) {
    this.scene.remove(m.group)
    m.skin.dispose()
  }

  /**
   * Advance every monster. `targets` are `{ pos, alive, bias }` — the hero and the party; each
   * monster goes for the nearest (a bias above 1 draws aggro, the way a knight's shield does).
   * `onHit(m, dmg, target)` is called when one lands a blow, `onSlam(x, z, r, dmg)` when a
   * boss's ground slam goes off.
   */
  update(dt, targets, onHit, onSlam) {
    const env = this.env
    for (let i = this.list.length - 1; i >= 0; i--) {
      const m = this.list[i]
      const def = m.def
      const size = def.size

      if (m.state === 'dead') {
        m.deathT += dt
        const k = Math.max(0, 1 - m.deathT / 0.45)
        m.group.scale.set(size * (1 + (1 - k) * 0.6), size * k, size * (1 + (1 - k) * 0.6))
        if (m.deathT > 0.45) {
          this._dispose(m)
          this.list.splice(i, 1)
        }
        continue
      }

      m.spawnT = Math.min(1, m.spawnT + dt * 2.5)
      let hero = targets[0]
      let best = Infinity
      for (const t of targets) {
        if (!t.alive) continue
        const d = Math.hypot(t.pos.x - m.pos.x, t.pos.z - m.pos.z) / (t.bias || 1)
        if (d < best) {
          best = d
          hero = t
        }
      }
      const dx = hero.pos.x - m.pos.x
      const dz = hero.pos.z - m.pos.z
      const dist = Math.hypot(dx, dz)
      const reach = m.radius + 0.55

      const sheltered = m.wild && env.safe?.(hero.pos.x, hero.pos.z)
      if (hero.alive && dist < m.aggro && !sheltered) m.state = 'chase'
      else if (m.state === 'chase' && (dist > m.aggro * 1.8 || !hero.alive || sheltered)) m.state = 'idle'

      let wantX = 0
      let wantZ = 0
      if (m.state === 'chase') {
        if (dist > reach * 0.9) {
          wantX = dx / dist
          wantZ = dz / dist
        }
        m.yaw = Math.atan2(dx, dz)
        m.attackCd -= dt
        if (dist < reach + 0.25 && m.attackCd <= 0) {
          m.attackCd = m.boss ? 1.6 : 1.3 + Math.random() * 0.5
          m.lunge = 0.35
          m.pendingHit = 0.18
        }
        if (m.boss) {
          m.slamCd -= dt
          if (m.slamCd <= 0) {
            m.slamCd = 6 + Math.random() * 2
            this._warn(hero.pos.x, hero.pos.z, 3.2, 1.1, m.atk * 1.4, onSlam)
          }
        }
      } else {
        m.wanderAt -= dt
        if (m.wanderAt <= 0) {
          m.wanderAt = 2 + Math.random() * 4
          const a = Math.random() * Math.PI * 2
          const r = Math.random() * 4
          m.wander.set(m.home.x + Math.cos(a) * r, 0, m.home.z + Math.sin(a) * r)
        }
        const wx = m.wander.x - m.pos.x
        const wz = m.wander.z - m.pos.z
        const wd = Math.hypot(wx, wz)
        if (wd > 0.4) {
          wantX = (wx / wd) * 0.45
          wantZ = (wz / wd) * 0.45
          m.yaw = Math.atan2(wx, wz)
        }
      }

      if (m.pendingHit != null) {
        m.pendingHit -= dt
        if (m.pendingHit <= 0) {
          m.pendingHit = null
          if (hero.alive && Math.hypot(hero.pos.x - m.pos.x, hero.pos.z - m.pos.z) < reach + 0.5) onHit(m, m.atk, hero)
        }
      }

      // Slimes travel in hops: they only cover ground while airborne.
      m.hop += dt * (m.state === 'chase' ? 2.6 : 1.6) * (def.speed / 1.6)
      const phase = m.hop % 1
      // Walkers (ogres) stride; everything else hops, and only covers ground in the air.
      const walker = Boolean(m.limbs)
      const air = walker ? 0 : phase < 0.55 ? Math.sin((phase / 0.55) * Math.PI) : 0
      const move = def.speed * (m.state === 'chase' ? 1 : 0.6) * (walker ? 1 : air > 0 ? 1.7 : 0.15)
      let stepX = wantX * move * dt + m.knock.x * dt
      let stepZ = wantZ * move * dt + m.knock.z * dt
      m.knock.multiplyScalar(Math.max(0, 1 - dt * 8))

      // Keep a little apart from each other.
      for (const o of this.list) {
        if (o === m || o.state === 'dead') continue
        const ox = m.pos.x - o.pos.x
        const oz = m.pos.z - o.pos.z
        const od = Math.hypot(ox, oz)
        const min = m.radius + o.radius
        if (od > 0.001 && od < min) {
          stepX += (ox / od) * (min - od) * 0.5
          stepZ += (oz / od) * (min - od) * 0.5
        }
      }
      const nx = m.pos.x + stepX
      const nz = m.pos.z + stepZ
      const no = (x, z) => env.blocked(x, z) || (m.wild && env.safe?.(x, z))
      if (!no(nx, nz)) {
        m.pos.x = nx
        m.pos.z = nz
      } else if (!no(nx, m.pos.z)) m.pos.x = nx
      else if (!no(m.pos.x, nz)) m.pos.z = nz
      // Bodies are solid: a monster never ends up standing inside the hero or a partner.
      for (const t of targets) {
        const ox = m.pos.x - t.pos.x
        const oz = m.pos.z - t.pos.z
        const od = Math.hypot(ox, oz)
        const min = m.radius + 0.32
        if (od > 0.001 && od < min && !no(t.pos.x + (ox / od) * min, t.pos.z + (oz / od) * min)) {
          m.pos.x = t.pos.x + (ox / od) * min
          m.pos.z = t.pos.z + (oz / od) * min
        }
      }

      const ground = env.groundAt(m.pos.x, m.pos.z)
      m.pos.y = ground
      const lift = air * 0.45 * size
      m.group.position.set(m.pos.x, ground + lift, m.pos.z)
      m.group.rotation.y = m.yaw
      m.shadow.position.y = 0.03 - lift / size
      m.shadow.scale.setScalar(0.9 * (1 - air * 0.35))

      // Squash on landing, stretch in the air, a lean forward on a lunge.
      const squash = phase >= 0.55 ? Math.sin(((phase - 0.55) / 0.45) * Math.PI) * 0.18 : -air * 0.1
      m.lunge = Math.max(0, m.lunge - dt)
      const s = size * m.spawnT
      if (m.limbs) {
        // Stride with the legs, swing the free arm, and bring the club down on an attack.
        const moving = Math.hypot(wantX, wantZ) > 0.05
        const sw = moving ? Math.sin(m.hop * Math.PI * 2) * 0.55 : 0
        const L = m.limbs
        L.legL.rotation.x = sw
        L.legR.rotation.x = -sw
        L.armL.rotation.x = -sw * 0.6
        const k = m.lunge > 0 ? Math.sin((1 - m.lunge / 0.35) * Math.PI) : 0
        L.armR.rotation.x = m.lunge > 0 ? -2.6 + k * 3.0 : sw * 0.4
        m.body.position.y = moving ? Math.abs(Math.sin(m.hop * Math.PI * 2)) * 0.05 : 0
        m.body.rotation.x = m.lunge > 0 ? k * 0.25 : 0
      } else {
        m.body.scale.set(1 + squash, 1 - squash, 1 + squash)
        m.body.rotation.x = m.lunge > 0 ? Math.sin((m.lunge / 0.35) * Math.PI) * 0.5 : 0
      }
      m.group.scale.setScalar(s)

      m.flash = Math.max(0, m.flash - dt)
      if (m.flash > 0) m.skin.color.setRGB(1, 1, 1)
      else m.skin.color.copy(m.baseColor)
      // A walker's stride is slower than a slime's bounce.
      if (m.limbs) m.hop -= dt * (m.state === 'chase' ? 2.6 : 1.6) * (def.speed / 1.6) * 0.45
    }

    for (let i = this.warnings.length - 1; i >= 0; i--) {
      const w = this.warnings[i]
      w.t += dt
      const k = Math.min(1, w.t / w.delay)
      w.mesh.scale.setScalar(w.r * k)
      w.mesh.material.opacity = 0.25 + k * 0.45
      if (w.t >= w.delay) {
        w.onSlam(w.x, w.z, w.r, w.dmg)
        this.scene.remove(w.mesh)
        w.mesh.material.dispose()
        this.warnings.splice(i, 1)
      }
    }
  }

  /** A boss telegraph: a red disc that fills, then hurts whoever is still standing in it. */
  _warn(x, z, r, delay, dmg, onSlam) {
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), mats.warn.clone())
    mesh.position.set(x, this.env.groundAt(x, z) + 0.06, z)
    mesh.renderOrder = 2
    this.scene.add(mesh)
    this.warnings.push({ mesh, x, z, r, delay, dmg, t: 0, onSlam })
  }

  /** The nearest living monster within `range`, optionally only those in front of `yaw`. */
  nearest(x, z, range, yaw = null, arc = Math.PI) {
    let best = null
    let bestD = range
    for (const m of this.list) {
      if (m.state === 'dead') continue
      const dx = m.pos.x - x
      const dz = m.pos.z - z
      const d = Math.hypot(dx, dz) - m.radius
      if (d > bestD) continue
      if (yaw != null) {
        let a = Math.atan2(dx, dz) - yaw
        a = Math.atan2(Math.sin(a), Math.cos(a))
        if (Math.abs(a) > arc) continue
      }
      best = m
      bestD = d
    }
    return best
  }
}
