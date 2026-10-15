import * as THREE from 'three'

/**
 * Spells and pickups: fireballs that fly and burst, lightning that strikes, slash arcs, and
 * the glowing herbs gather quests send you after. Sparks go through the colony's own
 * particle pools, so they look like every other spark in the world.
 */

const fireGeo = new THREE.SphereGeometry(0.22, 16, 12)
const fireMat = new THREE.MeshBasicMaterial({ color: 0xffa040 })
const boltGeo = new THREE.CylinderGeometry(0.08, 0.16, 14, 6, 1, true)
const boltMat = new THREE.MeshBasicMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.95, depthWrite: false })
const shotMats = new Map()
const boltColor = (c) => shotMats.get(c) || shotMats.set(c, new THREE.MeshBasicMaterial({ color: c })).get(c)
const herbGeo = new THREE.OctahedronGeometry(0.2, 0)
const slashGeo = new THREE.RingGeometry(0.9, 1.5, 32, 1, -Math.PI * 0.45, Math.PI * 0.9)
slashGeo.rotateX(-Math.PI / 2)

export class Fx {
  constructor(scene, particles, groundAt) {
    this.scene = scene
    this.particles = particles
    this.groundAt = groundAt
    this.shots = []
    this.bolts = []
    this.herbs = []
    this.slashes = []
    this.auras = []
  }

  spark(x, y, z, color, n = 10, speed = 2.5, life = 0.6, size = 0.09) {
    const glow = this.particles?.glow
    if (!glow || !this.particles.enabled) return
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const s = speed * (0.4 + Math.random() * 0.8)
      glow.spawn(x, y, z, Math.cos(a) * s, 1 + Math.random() * speed, Math.sin(a) * s, color.r * 2, color.g * 2, color.b * 2, size * (0.6 + Math.random() * 0.8), life * (0.6 + Math.random() * 0.8), 1.4, 0.6, this.groundAt(x, z))
    }
  }

  /** A fireball from `from` heading along `dir`; `onHit(pos)` decides what it struck. */
  fireball(from, dir, hitTest, onBurst, color = null) {
    const mesh = new THREE.Mesh(fireGeo, color ? boltColor(color) : fireMat)
    mesh.position.copy(from)
    this.scene.add(mesh)
    this.shots.push({ mesh, dir: dir.clone().normalize(), t: 0, hitTest, onBurst, color: new THREE.Color(color ?? 0xff8c33) })
  }

  bolt(x, z) {
    const mesh = new THREE.Mesh(boltGeo, boltMat.clone())
    const g = this.groundAt(x, z)
    mesh.position.set(x, g + 7, z)
    this.scene.add(mesh)
    this.bolts.push({ mesh, t: 0 })
    this.spark(x, g + 0.4, z, new THREE.Color(0.7, 0.85, 1), 16, 3.5, 0.5)
  }

  slash(pos, yaw, color = 0xffffff) {
    const mesh = new THREE.Mesh(
      slashGeo,
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })
    )
    mesh.position.set(pos.x, pos.y + 0.55, pos.z)
    mesh.rotation.y = yaw
    this.scene.add(mesh)
    this.slashes.push({ mesh, t: 0 })
  }

  /** A ring of light round the hero for a heal or a blessing. */
  aura(target, color) {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.75, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
    )
    this.scene.add(mesh)
    this.auras.push({ mesh, target, t: 0 })
    const c = new THREE.Color(color)
    this.spark(target.x, target.y + 0.3, target.z, c, 24, 1.6, 1.1, 0.08)
  }

  addHerb(x, z, color = 0x8affc8) {
    const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.4, roughness: 0.3 })
    const mesh = new THREE.Mesh(herbGeo, mat)
    const y = this.groundAt(x, z)
    mesh.position.set(x, y + 0.5, z)
    this.scene.add(mesh)
    const herb = { mesh, x, z, y, phase: Math.random() * 6, color: new THREE.Color(color) }
    this.herbs.push(herb)
    return herb
  }

  clearHerbs() {
    for (const h of this.herbs) {
      this.scene.remove(h.mesh)
      h.mesh.material.dispose()
    }
    this.herbs.length = 0
  }

  /** Remove and return any herb within `r` of the point. */
  takeHerbsNear(x, z, r) {
    const got = []
    for (let i = this.herbs.length - 1; i >= 0; i--) {
      const h = this.herbs[i]
      if (Math.hypot(h.x - x, h.z - z) < r) {
        this.scene.remove(h.mesh)
        h.mesh.material.dispose()
        this.herbs.splice(i, 1)
        this.spark(h.x, h.y + 0.5, h.z, h.color, 14, 2, 0.7)
        got.push(h)
      }
    }
    return got
  }

  update(dt, elapsed) {
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i]
      s.t += dt
      s.mesh.position.addScaledVector(s.dir, 16 * dt)
      const p = s.mesh.position
      const g = this.groundAt(p.x, p.z)
      p.y = Math.max(p.y, g + 0.4)
      const c = s.color
      this.particles?.glow?.spawn(p.x, p.y, p.z, (Math.random() - 0.5) * 0.6, 0.4, (Math.random() - 0.5) * 0.6, c.r * 2.4, c.g * 2.4, c.b * 2.4, 0.16, 0.35, 2, 0, g)
      // A wall stops a spell as surely as a slime does.
      if (s.hitTest(p) || s.t > 0.8 || this.solidAt?.(p.x, p.z)) {
        s.onBurst(p.clone())
        this.spark(p.x, p.y, p.z, s.color, s.mesh.material === fireMat ? 26 : 10, 3.2, 0.7, 0.12)
        this.scene.remove(s.mesh)
        this.shots.splice(i, 1)
      }
    }
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i]
      b.t += dt
      b.mesh.material.opacity = Math.max(0, 1 - b.t / 0.3) * (Math.random() > 0.3 ? 1 : 0.3)
      b.mesh.rotation.y += dt * 30
      if (b.t > 0.3) {
        this.scene.remove(b.mesh)
        b.mesh.material.dispose()
        this.bolts.splice(i, 1)
      }
    }
    for (let i = this.slashes.length - 1; i >= 0; i--) {
      const s = this.slashes[i]
      s.t += dt
      const k = s.t / 0.22
      s.mesh.material.opacity = Math.max(0, 0.85 * (1 - k))
      s.mesh.scale.setScalar(0.8 + k * 0.5)
      if (k >= 1) {
        this.scene.remove(s.mesh)
        s.mesh.material.dispose()
        this.slashes.splice(i, 1)
      }
    }
    for (let i = this.auras.length - 1; i >= 0; i--) {
      const a = this.auras[i]
      a.t += dt
      const k = a.t / 0.8
      a.mesh.position.set(a.target.x, a.target.y + 0.08 + k * 1.4, a.target.z)
      a.mesh.scale.setScalar(1 + k * 0.8)
      a.mesh.material.opacity = Math.max(0, 0.9 * (1 - k))
      if (k >= 1) {
        this.scene.remove(a.mesh)
        a.mesh.material.dispose()
        this.auras.splice(i, 1)
      }
    }
    for (const h of this.herbs) {
      h.mesh.rotation.y = elapsed * 1.8 + h.phase
      h.mesh.position.y = h.y + 0.45 + Math.sin(elapsed * 2.4 + h.phase) * 0.12
      if (Math.random() < dt * 3) this.particles?.glow?.spawn(h.x, h.y + 0.4, h.z, 0, 0.6, 0, h.color.r * 1.5, h.color.g * 1.5, h.color.b * 1.5, 0.07, 0.8, 1, 0, h.y)
    }
  }
}
