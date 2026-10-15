import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { SCATTER, terrainHeight } from '../world/planet.js'
import { atlasTexture, hasPart, kitReady, kitUsesVertexColors, part } from '../world/kit.js'
import { shipPosition } from '../world/plots.js'
import { statusFor } from '../game/colony.js'
import { DUNGEONS, REGION_BY_ID } from './data.js'
import { CAMP, HERO_ID, npcsOf, region, runtime, save } from './world.js'
import { INTERIOR_AT, buildRoom, floorAt, roomAt, roomFor, shellMesh } from './interiors.js'

/**
 * The other world itself: villages of timber-framed houses round a well, dirt roads between
 * them, farms with fences and farmers working the rows, horses in paddocks and pulling carts,
 * forests thick enough to get lost in, a stone portal where the star vessel used to land, and
 * your own camp beside it.
 *
 * The colony still owns the terrain, sky, water, grass, scatter and the bots; this module
 * lays a world over it and tells the bots where they live. Everything static is built from
 * a handful of primitives and merged into a few meshes per material, so a whole village is
 * a few draw calls.
 */

// ── layout ────────────────────────────────────────────────────────────────────────────

/** Where things go on every map. The portal is wherever the ship used to stand. */
const PORTAL = (() => {
  const p = shipPosition()
  return { x: p.x, z: p.z }
})()
const CAMP_AT = { x: PORTAL.x + 9, z: PORTAL.z - 12 }
const VILLAGE_AT = [
  { x: 16, z: -6 },
  { x: -6, z: 30 },
  { x: 32, z: 26 },
]
const FOREST_AT = [
  { x: -46, z: -42, r: 20 },
  { x: 70, z: -30, r: 26 },
  { x: 44, z: 70, r: 24 },
  { x: -60, z: 44, r: 26 },
  { x: -84, z: -6, r: 22 },
  { x: 8, z: -78, r: 28 },
  { x: 92, z: 36, r: 20 },
]
/** How far the hero may wander from the middle of the map. */
export const WORLD_RADIUS = 112

/** Village looks per world: walls, timber, roof colours and roof shape. */
const STYLES = {
  terra: { wall: [0xf0e4c8, 0xe8d8b8, 0xf4ecd8], timber: 0x5b3a24, roof: [0xa0522d, 0x8f4a2a, 0x6e5a8a, 0x4f6d8f], stone: 0x8d8f96, roofType: 'pitch', dirt: 0x9c7a50 },
  jungle: { wall: [0xc9a46a, 0xb8915a], timber: 0x4a3420, roof: [0xc9a45c, 0xb8934a], stone: 0x7a7a6a, roofType: 'thatch', dirt: 0x8a6a40 },
  desert: { wall: [0xe8c890, 0xdcb880, 0xf0d6a8], timber: 0x8a6a48, roof: [0xd8b078, 0xc89c64], stone: 0xc8a878, roofType: 'flat', dirt: 0xc8a068 },
  tundra: { wall: [0x8a6a4a, 0x7a5c40], timber: 0x3e2a1a, roof: [0xf2f6fa, 0xe8eef4], stone: 0x8890a0, roofType: 'pitch', dirt: 0x9a9088 },
  volcanic: { wall: [0x5a5658, 0x4a4648], timber: 0x2a2020, roof: [0x7a2a24, 0x5a2a2a], stone: 0x3a3638, roofType: 'pitch', dirt: 0x5a4a42 },
  sky: { wall: [0xf8f8ff, 0xf0f0fa], timber: 0xc8b070, roof: [0x5a8ad8, 0x6a9ae8], stone: 0xe0e4ec, roofType: 'pitch', dirt: 0xd8d0c0 },
  moon: { wall: [0x8a8a90], timber: 0x3a3a40, roof: [0x5a5a64], stone: 0x6a6a70, roofType: 'pitch', dirt: 0x7a7a80 },
  mars: { wall: [0x8a5040], timber: 0x3a2018, roof: [0x5a2a20], stone: 0x6a3a2a, roofType: 'pitch', dirt: 0x8a4a34 },
  ocean: { wall: [0xd8d0b8], timber: 0x6a5038, roof: [0x3a6a8a], stone: 0x9aa4a8, roofType: 'pitch', dirt: 0xc8b890 },
}

/** Clothing per kind of villager: the bots' suit colour. */
const CLOTHES = {
  farmer: 0x9a7a4a,
  smith: 0x5a5a62,
  guild: 0x3a6ab8,
  inn: 0xa86a3a,
  shop: 0x8a4a9a,
  magic: 0x5a2a8a,
  elder: 0xb8a8d0,
  guard: 0x8a96a8,
  other: 0xd8c8a8,
}

const FARM_ROLE = /farmer|shepherd|fisher|woodcutter|hunter|herder|ferryman/i
const GUARD_ROLE = /guard|knight|commander|princess/i

function kindOf(npc) {
  if (npc.guild) return 'guild'
  if (npc.inn) return 'inn'
  if (npc.shop === 'smith') return 'smith'
  if (npc.shop === 'magic') return 'magic'
  if (npc.shop) return 'shop'
  if (/elder/i.test(npc.role)) return 'elder'
  if (FARM_ROLE.test(npc.role)) return 'farmer'
  if (GUARD_ROLE.test(npc.role)) return 'guard'
  return 'other'
}

function rng(seed) {
  let s = seed >>> 0 || 1
  return () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9) >>> 0) / 4294967296
}

function hashOf(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619)
  return h >>> 0
}

/**
 * Lay out a whole map, without building anything: pure data, so the colony can be told what
 * ground to keep clear *before* it scatters its trees.
 */
export function layoutFor(key) {
  const dungeon = key.startsWith('dungeon:') ? DUNGEONS.find((d) => `dungeon:${d.id}` === key) : null
  const r = dungeon ? null : REGION_BY_ID[key]
  const rand = rng(hashOf(key))
  const L = { key, dungeon, region: r, villages: [], roads: [], fields: [], forests: [], paddocks: [], camp: { ...CAMP_AT }, portal: { ...PORTAL }, sites: new Map(), clears: [], rooms: [], doors: [], extras: [] }
  // Your own home and camp — except in the Forbidden Forest, where you have nothing yet.
  L.hasCamp = !r?.prologue
  if (L.hasCamp) {
    const home = roomFor('home')
    L.rooms.push(home)
    L.doors.push({ kind: 'home', x: CAMP_AT.x - 0.2, z: CAMP_AT.z - 3 + 2.6, title: home.title })
    L.clears.push({ x: CAMP_AT.x, z: CAMP_AT.z, r: 11 })
    L.roads.push([PORTAL, { x: (PORTAL.x + CAMP_AT.x) / 2 + 2, z: (PORTAL.z + CAMP_AT.z) / 2 }, CAMP_AT])
  }
  L.clears.push({ x: PORTAL.x, z: PORTAL.z, r: 9 })

  if (r) {
    r.villages.forEach((v, vi) => {
      const at = VILLAGE_AT[vi % VILLAGE_AT.length]
      const npcs = npcsOf(r).filter((n) => n.village === v.name)
      const village = { name: v.name, x: at.x, z: at.z, houses: [], stalls: [], forge: null, well: { x: at.x, z: at.z }, windmill: null }
      const houses = npcs.length + 2
      // Where the roads come in: from the portal, from the neighbouring villages, and from
      // the fields. The ring of houses leaves a gap at each, so a road never runs through a house.
      const out = Math.atan2(at.z, at.x) + (vi % 2 ? 0.7 : -0.7)
      const toward = (p) => Math.atan2(p.z - at.z, p.x - at.x)
      const entries = [toward(PORTAL), out]
      if (vi > 0) entries.push(toward(VILLAGE_AT[vi - 1]))
      if (vi + 1 < r.villages.length) entries.push(toward(VILLAGE_AT[vi + 1]))
      const clearOf = (a) => entries.every((e) => Math.abs(Math.atan2(Math.sin(a - e), Math.cos(a - e))) > 0.42)
      const slots = []
      for (let k = 0; k < 72 && slots.length < 200; k++) {
        const a = (k / 72) * Math.PI * 2 + vi
        if (clearOf(a)) slots.push(a)
      }
      // Houses in a ring round the green, each turned to face the well.
      for (let i = 0; i < houses; i++) {
        const a = slots[Math.floor((i / houses) * slots.length)] + (rand() - 0.5) * 0.08
        const dist = 9.5 + rand() * 2.5
        const x = at.x + Math.cos(a) * dist
        const z = at.z + Math.sin(a) * dist
        const npc = npcs[i]
        const kind = npc ? kindOf(npc) : 'other'
        const big = kind === 'guild' || kind === 'elder' || kind === 'inn'
        const house = {
          x,
          z,
          yaw: Math.atan2(at.x - x, at.z - z),
          w: big ? 6.4 : 3.6 + rand() * 1.4,
          d: big ? 4.6 : 3.2 + rand() * 0.8,
          h: big ? 3.6 : 2.2 + rand() * 0.5,
          kind: npc ? kind : 'home',
          npc,
          tone: Math.floor(rand() * 4),
        }
        village.houses.push(house)
        if (!npc) continue
        // Where the villager stands: by their door, at their stall or anvil, or in a field.
        const door = { x: x + Math.sin(house.yaw) * (house.d / 2 + 1.6), z: z + Math.cos(house.yaw) * (house.d / 2 + 1.6) }
        let site = door
        let anchor = null
        if (kind === 'smith') {
          const fx = x + Math.sin(house.yaw + 1.3) * 4.4
          const fz = z + Math.cos(house.yaw + 1.3) * 4.4
          village.forge = { x: fx, z: fz, yaw: house.yaw }
          anchor = { x: fx, z: fz }
          site = { x: fx + Math.sin(house.yaw) * 1.8, z: fz + Math.cos(house.yaw) * 1.8 }
        } else if (kind === 'shop' || kind === 'magic') {
          const sx = at.x + (door.x - at.x) * 0.55
          const sz = at.z + (door.z - at.z) * 0.55
          village.stalls.push({ x: sx, z: sz, yaw: house.yaw + Math.PI, magic: kind === 'magic' })
          site = { x: sx + (door.x - sx) * 0.35, z: sz + (door.z - sz) * 0.35 }
        }
        // The guild clerk and the innkeeper work indoors, behind their counters.
        if (kind === 'guild' || kind === 'inn') {
          const room = roomFor(kind)
          L.rooms.push(room)
          L.doors.push({ kind, x: door.x, z: door.z, title: room.title })
          site = kind === 'guild' ? { x: room.counter.x - 1, z: room.counter.z - 1.1 } : { x: room.counter.x - 0.8, z: room.counter.z }
        }
        L.sites.set(npc.id, { site, anchor, kind, village: v.name, door })
      }
      // Farms on the side away from the map's middle, a paddock beside them.
      const fieldAt = { x: at.x + Math.cos(out) * 22, z: at.z + Math.sin(out) * 22 }
      // Turned so its gate (the fence gap on its local +z side) faces the village.
      const field = { x: fieldAt.x, z: fieldAt.z, w: 12, d: 9, yaw: Math.atan2(-Math.cos(out), -Math.sin(out)), crop: ['wheat', 'cabbage', 'corn'][vi % 3] }
      L.fields.push(field)
      const pad = { x: at.x + Math.cos(out + 1.2) * 20, z: at.z + Math.sin(out + 1.2) * 20, r: 6 }
      L.paddocks.push(pad)
      const farmers = npcs.filter((n) => kindOf(n) === 'farmer')
      farmers.forEach((n, k) => {
        const s = L.sites.get(n.id)
        const a = (k / Math.max(1, farmers.length)) * Math.PI * 2
        s.anchor = { x: field.x, z: field.z }
        s.site = { x: field.x + Math.cos(a) * 3.2, z: field.z + Math.sin(a) * 2.4 }
      })
      if (vi === 1 || (r.villages.length === 1 && vi === 0)) {
        village.windmill = { x: at.x + Math.cos(out - 1.4) * 17, z: at.z + Math.sin(out - 1.4) * 17 }
      }
      L.villages.push(village)
      L.clears.push({ x: at.x, z: at.z, r: 17 })
      L.clears.push({ x: field.x, z: field.z, r: 10 })
      L.clears.push({ x: pad.x, z: pad.z, r: pad.r + 2 })
      if (village.windmill) L.clears.push({ x: village.windmill.x, z: village.windmill.z, r: 5 })
      // A road from the portal to every village, and on to the next one.
      // Roads stop at the edge of the green rather than running over the well.
      const edge = (from, to) => {
        const d = Math.hypot(to.x - from.x, to.z - from.z) || 1
        return { x: from.x + ((to.x - from.x) / d) * 5.5, z: from.z + ((to.z - from.z) / d) * 5.5 }
      }
      const main = curvedRoad(PORTAL, edge(at, PORTAL), rand)
      if (vi === 0) main.cart = true
      L.roads.push(main)
      if (vi > 0) L.roads.push(curvedRoad(edge(VILLAGE_AT[vi - 1], at), edge(at, VILLAGE_AT[vi - 1]), rand))
      const gate = { x: field.x - Math.cos(out) * (field.d / 2 + 1.2), z: field.z - Math.sin(out) * (field.d / 2 + 1.2) }
      L.roads.push(curvedRoad(edge(at, field), gate, rand))
    })
  }

  // Somebody has to be drinking in the guild hall.
  const guild = L.rooms.find((room) => room.kind === 'guild')
  if (guild) {
    ;[[-4, 3.6], [1.5, 2.1], [-4, 6.3]].forEach(([dx, dz], i) => L.extras.push({ id: 'guildhall:' + i, x: guild.x + dx, z: guild.z + dz }))
  }
  for (const room of L.rooms) L.clears.push({ x: room.x, z: room.z, r: Math.max(room.hw, room.hd) + 9, room: true })

  // Forests: always, and on a dungeon world they are the dark wood the waves come out of.
  for (const f of FOREST_AT) L.forests.push({ ...f })
  // A trail into the nearest wood.
  const near = FOREST_AT[0]
  L.roads.push(curvedRoad(L.hasCamp ? CAMP_AT : PORTAL, { x: near.x + 12, z: near.z + 12 }, rand))
  // The Forbidden Forest is mostly forest.
  if (r?.prologue) for (const f of [{ x: 10, z: 20, r: 22 }, { x: 30, z: -20, r: 20 }, { x: -20, z: 35, r: 18 }]) L.forests.push(f)
  return L
}

function curvedRoad(a, b, rand) {
  const mx = (a.x + b.x) / 2
  const mz = (a.z + b.z) / 2
  const dx = b.x - a.x
  const dz = b.z - a.z
  const len = Math.hypot(dx, dz) || 1
  const bend = (rand() - 0.5) * len * 0.25
  return [a, { x: mx - (dz / len) * bend, z: mz + (dx / len) * bend }, b]
}

// ── geometry ──────────────────────────────────────────────────────────────────────────

const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _e = new THREE.Euler()
const _p = new THREE.Vector3()
const _s = new THREE.Vector3()
const _c = new THREE.Color()

/** Collects coloured pieces and merges them into one mesh per material. */
class Batch {
  constructor() {
    this.parts = { solid: [], glow: [] }
  }

  add(geo, color, x, y, z, { yaw = 0, pitch = 0, roll = 0, sx = 1, sy = 1, sz = 1, into = 'solid', jitter = 0 } = {}) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone()
    g.deleteAttribute('uv')
    _e.set(pitch, yaw, roll, 'YXZ')
    _q.setFromEuler(_e)
    _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz))
    g.applyMatrix4(_m)
    const n = g.attributes.position.count
    const colors = new Float32Array(n * 3)
    _c.set(color)
    for (let i = 0; i < n; i++) {
      const k = jitter ? 1 + (Math.random() - 0.5) * jitter : 1
      colors[i * 3] = _c.r * k
      colors[i * 3 + 1] = _c.g * k
      colors[i * 3 + 2] = _c.b * k
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    this.parts[into].push(g)
    return g
  }

  /** A box placed in a parent frame: `(lx, ly, lz)` local to an origin turned by `yaw`. */
  local(geo, color, ox, oy, oz, yaw, lx, ly, lz, opts = {}) {
    const c = Math.cos(yaw)
    const s = Math.sin(yaw)
    return this.add(geo, color, ox + lx * c + lz * s, oy + ly, oz - lx * s + lz * c, { ...opts, yaw: yaw + (opts.yaw || 0) })
  }

  build(materials) {
    const out = []
    for (const [key, list] of Object.entries(this.parts)) {
      if (!list.length) continue
      const merged = mergeGeometries(list, false)
      merged.computeBoundingSphere()
      const mesh = new THREE.Mesh(merged, materials[key])
      mesh.castShadow = key === 'solid'
      mesh.receiveShadow = true
      out.push(mesh)
      for (const g of list) g.dispose()
    }
    return out
  }
}

const BOX = new THREE.BoxGeometry(1, 1, 1)
const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 10)
const CYL6 = new THREE.CylinderGeometry(0.5, 0.5, 1, 6)
const CONE = new THREE.ConeGeometry(0.5, 1, 8)
const CONE4 = new THREE.ConeGeometry(0.5, 1, 4)
const SPHERE = new THREE.SphereGeometry(0.5, 10, 8)

/** A gable roof: a triangular prism, ridge along x, base 1×1, height 1. */
const PRISM = (() => {
  const a = [-0.5, 0, -0.5]
  const b = [-0.5, 0, 0.5]
  const c = [-0.5, 1, 0]
  const d = [0.5, 0, -0.5]
  const e = [0.5, 0, 0.5]
  const f = [0.5, 1, 0]
  const tris = [a, c, b, d, e, f, a, d, f, a, f, c, b, c, f, b, f, e, a, b, e, a, e, d]
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(), 3))
  g.computeVertexNormals()
  return g
})()

// ── the realm ─────────────────────────────────────────────────────────────────────────

export class Realm {
  constructor(colony) {
    this.colony = colony
    this.group = new THREE.Group()
    this.group.name = 'realm'
    colony.scene.add(this.group)
    this.materials = {
      solid: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0 }),
      glow: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, emissive: 0xffc870, emissiveIntensity: 0.15 }),
    }
    this.portalMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; varying vec2 vUv;
        void main(){
          vec2 p = vUv * 2.0 - 1.0; float r = length(p); if (r > 1.0) discard;
          float a = atan(p.y, p.x);
          float swirl = sin(a * 5.0 + r * 9.0 - uTime * 2.4) * 0.5 + 0.5;
          vec3 col = mix(vec3(0.25, 0.55, 1.0), vec3(0.75, 0.4, 1.0), swirl);
          col += vec3(0.9, 0.95, 1.0) * smoothstep(0.35, 0.0, r);
          gl_FragColor = vec4(col, (1.0 - smoothstep(0.85, 1.0, r)) * (0.55 + swirl * 0.35));
        }`,
    })
    this.horses = []
    this.blades = null
    this.layout = null
    this.key = null
  }

  /** What the current save says the map should be. */
  currentKey() {
    return runtime.dungeon ? `dungeon:${runtime.dungeon.def.id}` : region().id
  }

  /** Lay out (and tell the colony what to keep clear) without building meshes yet. */
  plan() {
    const key = this.currentKey()
    if (this.layout && this.layout.key === key) return this.layout
    this.layout = layoutFor(key)
    const L = this.layout
    this.colony.extraClear = L.clears
    const roadClears = []
    for (const road of L.roads) for (const p of sampleRoad(road, 3)) roadClears.push({ x: p.x, z: p.z, r: 2.6 })
    this.roadClears = roadClears
    this.colony.extraClear = [...L.clears, ...roadClears]
    this.colony.grassBlocked = (x, z) => {
      for (const c of L.clears) {
        const dx = x - c.x
        const dz = z - c.z
        // Grass stays round the edge of a village and is cleared from its middle and its fields.
        if (dx * dx + dz * dz < (c.r * 0.72) ** 2) return true
      }
      for (const c of roadClears) {
        const dx = x - c.x
        const dz = z - c.z
        if (dx * dx + dz * dz < 1.6 * 1.6) return true
      }
      return false
    }
    return L
  }

  /** Build every mesh for the planned layout. Call after the terrain under it is final. */
  build() {
    const L = this.plan()
    this.clear()
    this.key = L.key
    const style = STYLES[this.colony.planet.id] || STYLES.terra
    const ground = (x, z) => this.meshHeight(x, z) ?? terrainHeight(x, z, this.colony.planet)
    const b = new Batch()
    const obstacles = []
    const rand = rng(hashOf(`${L.key}:build`))

    for (const road of L.roads) this._road(b, road, style, ground)
    this._portal(b, L.portal, ground, obstacles)
    if (L.hasCamp) this._camp(b, L.camp, style, ground, obstacles)
    for (const v of L.villages) {
      this._green(b, v, style, ground)
      for (const h of v.houses) this._house(b, h, style, ground, obstacles, rand)
      this._well(b, v.well, style, ground, obstacles)
      if (v.forge) this._forge(b, v.forge, style, ground, obstacles)
      for (const s of v.stalls) this._stall(b, s, ground, obstacles, rand)
      if (v.windmill) this._windmill(b, v.windmill, style, ground, obstacles)
      this._props(b, v, ground, obstacles, rand)
    }
    for (const f of L.fields) this._field(b, f, style, ground, obstacles)
    for (const p of L.paddocks) this._paddock(b, p, ground, obstacles)
    if (L.dungeon) this._ruins(b, style, ground, obstacles, rand)
    // The rooms you can walk into, far off in the corners of the map.
    this.rooms = L.rooms
    for (const room of L.rooms) {
      const box = (color, x, y, z, sx, sy, sz, into = 'solid') => b.add(BOX, color, x, y, z, { sx, sy, sz, into })
      const cyl = (color, x, y, z, sx, sy, sz, into = 'solid') => b.add(CYL, color, x, y, z, { sx, sy, sz, into })
      const shell = (x, y, z, sx, sy, sz) => this.group.add(shellMesh(x, y, z, sx, sy, sz))
      for (const o of buildRoom(room, box, cyl, shell)) obstacles.push(o)
    }

    for (const mesh of b.build(this.materials)) this.group.add(mesh)
    this._forests(L, ground, obstacles)
    this._spawnHorses(L, ground)

    this.colony.extraObstacles = obstacles
    this.colony._rebuildNavigation()
  }

  clear() {
    for (const child of [...this.group.children]) {
      this.group.remove(child)
      child.traverse?.((o) => {
        if (o.isMesh && o.geometry && !SHARED.has(o.geometry)) o.geometry.dispose()
      })
    }
    this.horses = []
    this.blades = null
  }

  // ── pieces ──────────────────────────────────────────────────────────────────────────

  _road(b, pts, style, ground) {
    const samples = sampleRoad(pts, 0.9)
    const w = 1.35
    for (let i = 0; i < samples.length - 1; i++) {
      const p = samples[i]
      const q = samples[i + 1]
      const dx = q.x - p.x
      const dz = q.z - p.z
      const len = Math.hypot(dx, dz)
      if (len < 0.01) continue
      const yaw = Math.atan2(dx, dz)
      const mx = (p.x + q.x) / 2
      const mz = (p.z + q.z) / 2
      b.add(BOX, style.dirt, mx, ground(mx, mz) + 0.02, mz, { yaw, sx: w * 2, sy: 0.08, sz: len + 0.35, jitter: 0.12 })
    }
  }

  _green(b, v, style, ground) {
    // A packed-earth square round the well.
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2
      b.add(CYL6, style.dirt, v.x + Math.cos(a) * 3.2, ground(v.x, v.z) + 0.01, v.z + Math.sin(a) * 3.2, { sx: 6.4, sy: 0.07, sz: 6.4, yaw: a, jitter: 0.1 })
    }
    b.add(CYL, style.dirt, v.x, ground(v.x, v.z) + 0.02, v.z, { sx: 9, sy: 0.08, sz: 9, jitter: 0.08 })
  }

  _house(b, h, style, ground, obstacles, rand) {
    // Stand on the lowest corner and run the stone plinth well down into the ground, so a
    // house on a slope sits on a foundation instead of floating off its high side.
    const cs = Math.cos(h.yaw)
    const sn = Math.sin(h.yaw)
    const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => {
      const lx = (sx * h.w) / 2
      const lz = (sz * h.d) / 2
      return ground(h.x + lx * cs + lz * sn, h.z - lx * sn + lz * cs)
    })
    const y = Math.min(ground(h.x, h.z), ...corners) - 0.05
    const wall = style.wall[h.tone % style.wall.length]
    const roof = style.roof[h.tone % style.roof.length]
    const { w, d, hgt = h.h } = { ...h, hgt: h.h }
    const L = (geo, color, lx, ly, lz, o) => b.local(geo, color, h.x, y, h.z, h.yaw, lx, ly, lz, o)

    // Stone plinth, then the walls.
    L(BOX, style.stone, 0, -0.5, 0, { sx: w + 0.3, sy: 2.0, sz: d + 0.3, jitter: 0.08 })
    L(BOX, wall, 0, 0.5 + hgt / 2, 0, { sx: w, sy: hgt, sz: d })
    // Half-timbering: corner posts, mid posts, a beam at the floor line, and braces.
    const top = 0.5 + hgt
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) L(BOX, style.timber, (sx * w) / 2, 0.5 + hgt / 2, (sz * d) / 2, { sx: 0.2, sy: hgt, sz: 0.2 })
    }
    for (const sz of [-1, 1]) {
      L(BOX, style.timber, 0, top - 0.08, (sz * d) / 2 + sz * 0.02, { sx: w + 0.1, sy: 0.16, sz: 0.12 })
      L(BOX, style.timber, 0, 0.5 + hgt * 0.5, (sz * d) / 2 + sz * 0.02, { sx: w, sy: 0.12, sz: 0.1 })
      L(BOX, style.timber, -w / 4, 0.5 + hgt / 2, (sz * d) / 2 + sz * 0.02, { sx: 0.14, sy: hgt, sz: 0.1 })
      L(BOX, style.timber, w / 4, 0.5 + hgt / 2, (sz * d) / 2 + sz * 0.02, { sx: 0.14, sy: hgt, sz: 0.1 })
    }
    for (const sx of [-1, 1]) L(BOX, style.timber, (sx * w) / 2 + sx * 0.02, top - 0.08, 0, { sx: 0.12, sy: 0.16, sz: d + 0.1 })

    // Roof.
    const over = 0.45
    if (style.roofType === 'flat') {
      L(BOX, roof, 0, top + 0.12, 0, { sx: w + 0.4, sy: 0.24, sz: d + 0.4 })
      L(BOX, wall, 0, top + 0.4, d / 2 + 0.15, { sx: w + 0.4, sy: 0.35, sz: 0.2 })
      L(BOX, wall, 0, top + 0.4, -d / 2 - 0.15, { sx: w + 0.4, sy: 0.35, sz: 0.2 })
    } else {
      const rise = style.roofType === 'thatch' ? d * 0.85 : d * 0.62
      // Gable infill in the wall colour, then the roof over it.
      L(PRISM, wall, 0, top, 0, { sx: w - 0.02, sy: rise * 0.96, sz: d })
      L(PRISM, roof, 0, top - 0.06, 0, { sx: w + over * 2, sy: rise + 0.14, sz: d + over * 2, jitter: 0.06 })
      L(BOX, style.timber, 0, top + rise + 0.05, 0, { sx: w + over * 2 + 0.05, sy: 0.14, sz: 0.18 })
      // Chimney.
      if (h.kind !== 'home' || rand() > 0.4) L(BOX, style.stone, w * 0.28, top + rise * 0.6, -d * 0.18, { sx: 0.5, sy: rise * 1.1, sz: 0.5, jitter: 0.1 })
    }

    // Door, windows (the windows glow at night), a step.
    L(BOX, 0x4a2e1c, 0, 0.5 + 0.8, d / 2 + 0.05, { sx: 0.95, sy: 1.6, sz: 0.1 })
    L(BOX, style.stone, 0, 0.12, d / 2 + 0.4, { sx: 1.3, sy: 0.24, sz: 0.6 })
    for (const sx of [-1, 1]) {
      L(BOX, 0xffd68a, (sx * w) / 3.2, 0.5 + hgt * 0.6, d / 2 + 0.06, { sx: 0.6, sy: 0.6, sz: 0.06, into: 'glow' })
      L(BOX, 0xffd68a, (sx * w) / 2 + sx * 0.06, 0.5 + hgt * 0.6, 0, { sx: 0.06, sy: 0.55, sz: 0.55, into: 'glow' })
      L(BOX, style.timber, (sx * w) / 3.2, 0.5 + hgt * 0.6 - 0.36, d / 2 + 0.1, { sx: 0.75, sy: 0.08, sz: 0.14 })
    }
    if (h.kind === 'guild') {
      // A hanging sign and a banner pole: the Adventurers' Guild.
      L(BOX, style.timber, w / 2 + 0.5, 0.5 + hgt * 0.8, d / 2 + 0.6, { sx: 0.12, sy: 0.12, sz: 1.2 })
      L(BOX, 0x2a4a8a, w / 2 + 0.5, 0.5 + hgt * 0.62, d / 2 + 1.0, { sx: 0.08, sy: 0.7, sz: 1.0 })
      L(BOX, 0xffd36a, w / 2 + 0.46, 0.5 + hgt * 0.62, d / 2 + 1.0, { sx: 0.06, sy: 0.32, sz: 0.32 })
      L(CYL, style.timber, -w / 2 - 0.6, 3.2, d / 2, { sx: 0.12, sy: 6.4, sz: 0.12 })
      L(BOX, 0xc83a3a, -w / 2 - 0.6, 5.6, d / 2 + 0.6, { sx: 0.05, sy: 0.9, sz: 1.2 })
    }
    rectObstacles(obstacles, h.x, h.z, h.yaw, w + 0.35, d + 0.35)
  }

  _well(b, p, style, ground, obstacles) {
    const y = ground(p.x, p.z)
    b.add(CYL, style.stone, p.x, y + 0.45, p.z, { sx: 1.7, sy: 0.9, sz: 1.7, jitter: 0.12 })
    b.add(CYL, 0x1a2a3a, p.x, y + 0.88, p.z, { sx: 1.3, sy: 0.04, sz: 1.3 })
    for (const s of [-1, 1]) b.add(BOX, style.timber, p.x + s * 0.75, y + 1.3, p.z, { sx: 0.14, sy: 1.8, sz: 0.14 })
    b.add(PRISM, style.roof[0], p.x, y + 2.1, p.z, { sx: 2.0, sy: 0.6, sz: 1.4, yaw: Math.PI / 2 })
    b.add(CYL, 0x6a4a2a, p.x, y + 1.25, p.z, { sx: 0.3, sy: 0.35, sz: 0.3 })
    obstacles.push({ x: p.x, z: p.z, r: 1.1, keep: 1.3 })
  }

  _forge(b, f, style, ground, obstacles) {
    const y = ground(f.x, f.z)
    const L = (geo, color, lx, ly, lz, o) => b.local(geo, color, f.x, y, f.z, f.yaw, lx, ly, lz, o)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) L(BOX, style.timber, sx * 1.6, 1.2, sz * 1.3, { sx: 0.18, sy: 2.4, sz: 0.18 })
    L(BOX, style.roof[0], 0, 2.5, 0, { sx: 3.8, sy: 0.18, sz: 3.2, roll: 0.12 })
    L(BOX, style.stone, -0.8, 0.6, -0.8, { sx: 1.4, sy: 1.2, sz: 1.2, jitter: 0.12 })
    L(BOX, 0xff7a2a, -0.8, 0.55, -0.18, { sx: 0.6, sy: 0.4, sz: 0.06, into: 'glow' })
    L(BOX, 0x3a3a40, 0.5, 0.45, 0.2, { sx: 0.4, sy: 0.6, sz: 0.4 })
    L(BOX, 0x4a4a52, 0.5, 0.8, 0.2, { sx: 0.9, sy: 0.18, sz: 0.36 })
    rectObstacles(obstacles, f.x, f.z, f.yaw, 3.6, 3.0)
  }

  _stall(b, s, ground, obstacles, rand) {
    const y = ground(s.x, s.z)
    const L = (geo, color, lx, ly, lz, o) => b.local(geo, color, s.x, y, s.z, s.yaw, lx, ly, lz, o)
    const cloth = s.magic ? [0x5a2a8a, 0xe8d8ff] : [[0xc83a3a, 0xf4ecd8], [0x3a7a4a, 0xf4ecd8], [0x3a5aa8, 0xf4ecd8]][Math.floor(rand() * 3)]
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) L(BOX, 0x6a4a2a, sx * 1.1, 1.1, sz * 0.7, { sx: 0.1, sy: 2.2, sz: 0.1 })
    L(BOX, 0x8a6a42, 0, 0.5, 0.5, { sx: 2.3, sy: 0.9, sz: 0.5 })
    for (let i = 0; i < 4; i++) L(BOX, cloth[i % 2], -0.9 + i * 0.6, 2.25, 0, { sx: 0.6, sy: 0.08, sz: 1.8, pitch: 0.18 })
    // Goods on the counter.
    for (let i = 0; i < 4; i++) {
      const c = s.magic ? [0x9fe8ff, 0xc8a8ff, 0xffd36a, 0x7cf0a8][i] : [0xe85a3a, 0xf0c040, 0x7ac040, 0xc8783a][i]
      L(s.magic ? CONE4 : SPHERE, c, -0.75 + i * 0.5, 1.05, 0.5, { sx: 0.25, sy: 0.3, sz: 0.25, into: s.magic ? 'glow' : 'solid' })
    }
    rectObstacles(obstacles, s.x, s.z, s.yaw, 2.4, 1.6)
  }

  _windmill(b, w, style, ground, obstacles) {
    const y = ground(w.x, w.z)
    b.add(CYL6, style.stone, w.x, y + 3, w.z, { sx: 3.2, sy: 6, sz: 3.2, jitter: 0.08 })
    b.add(CONE, style.roof[0], w.x, y + 6.9, w.z, { sx: 3.8, sy: 1.8, sz: 3.8 })
    b.add(BOX, 0x4a2e1c, w.x, y + 0.8, w.z + 1.45, { sx: 0.8, sy: 1.6, sz: 0.1 })
    // Blades turn: a separate little group.
    const blades = new THREE.Group()
    const mat = this.materials.solid
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Group()
      arm.rotation.z = (i / 4) * Math.PI * 2
      const spar = colored(new THREE.BoxGeometry(0.16, 3.6, 0.1), 0x5b3a24)
      spar.translate(0, 1.8, 0)
      const sail = colored(new THREE.BoxGeometry(0.9, 2.8, 0.04), 0xf0e8d8)
      sail.translate(0.5, 2.1, 0)
      arm.add(new THREE.Mesh(spar, mat), new THREE.Mesh(sail, mat))
      blades.add(arm)
    }
    blades.position.set(w.x, y + 5.6, w.z + 1.8)
    this.group.add(blades)
    this.blades = blades
    obstacles.push({ x: w.x, z: w.z, r: 1.9, keep: 2.1 })
  }

  _field(b, f, style, ground, obstacles) {
    const y = ground(f.x, f.z)
    const L = (geo, color, lx, ly, lz, o) => b.local(geo, color, f.x, y, f.z, f.yaw, lx, ly, lz, o)
    L(BOX, 0x6a4a2e, 0, -0.35, 0, { sx: f.w, sy: 0.85, sz: f.d, jitter: 0.1 })
    const rows = 6
    for (let r = 0; r < rows; r++) {
      const lz = -f.d / 2 + 0.9 + (r * (f.d - 1.8)) / (rows - 1)
      L(BOX, 0x5a3c24, 0, 0.1, lz, { sx: f.w - 0.8, sy: 0.12, sz: 0.5 })
      for (let i = 0; i < 12; i++) {
        const lx = -f.w / 2 + 0.8 + (i * (f.w - 1.6)) / 11
        if (f.crop === 'wheat') L(BOX, 0xe0c060, lx, 0.45, lz, { sx: 0.35, sy: 0.7, sz: 0.3, jitter: 0.15 })
        else if (f.crop === 'corn') L(BOX, 0x6a9a3a, lx, 0.7, lz, { sx: 0.2, sy: 1.2, sz: 0.2, jitter: 0.15 })
        else L(SPHERE, 0x7ab04a, lx, 0.3, lz, { sx: 0.5, sy: 0.38, sz: 0.5, jitter: 0.15 })
      }
    }
    // Fence round it.
    this._fenceRect(b, f.x, y, f.z, f.yaw, f.w + 1.2, f.d + 1.2, style, [0, 0.5], obstacles)
    // Scarecrow and hay bales.
    L(BOX, 0x6a4a2a, f.w / 2 - 1, 0.9, 0, { sx: 0.12, sy: 1.8, sz: 0.12 })
    L(BOX, 0x6a4a2a, f.w / 2 - 1, 1.4, 0, { sx: 0.1, sy: 0.1, sz: 1.2 })
    L(SPHERE, 0xe8d090, f.w / 2 - 1, 1.85, 0, { sx: 0.4, sy: 0.4, sz: 0.4 })
    L(CONE, 0xc8a050, f.w / 2 - 1, 2.15, 0, { sx: 0.7, sy: 0.3, sz: 0.7 })
    for (let i = 0; i < 3; i++) L(CYL, 0xe0c060, -f.w / 2 - 1.6, 0.45, -1.5 + i * 1.3, { sx: 1, sy: 0.9, sz: 1, roll: Math.PI / 2 })
    // The field itself is walkable — farmers work in it — only its fence is solid.
  }

  _fenceRect(b, cx, y, cz, yaw, w, d, style, gap = null, obstacles = null) {
    const posts = []
    const c = Math.cos(yaw)
    const s = Math.sin(yaw)
    const world = (lx, lz) => [cx + lx * c + lz * s, cz - lx * s + lz * c]
    const edge = (ax, az, bx, bz, skipMid) => {
      if (obstacles) {
        for (const [t0, t1] of skipMid ? [[0, 0.38], [0.62, 1]] : [[0, 1]]) {
          const [x0, z0] = world(ax + (bx - ax) * t0, az + (bz - az) * t0)
          const [x1, z1] = world(ax + (bx - ax) * t1, az + (bz - az) * t1)
          lineObstacles(obstacles, x0, z0, x1, z1)
        }
      }
      const len = Math.hypot(bx - ax, bz - az)
      const n = Math.max(1, Math.round(len / 2))
      for (let i = 0; i <= n; i++) {
        const t = i / n
        if (skipMid && t > 0.38 && t < 0.62) continue
        posts.push([ax + (bx - ax) * t, az + (bz - az) * t])
      }
      for (const h of [0.45, 0.85]) {
        const segs = skipMid ? [[0, 0.38], [0.62, 1]] : [[0, 1]]
        for (const [t0, t1] of segs) {
          const x0 = ax + (bx - ax) * t0
          const z0 = az + (bz - az) * t0
          const x1 = ax + (bx - ax) * t1
          const z1 = az + (bz - az) * t1
          b.local(BOX, 0x7a5a38, cx, y, cz, yaw, (x0 + x1) / 2, h, (z0 + z1) / 2, { sx: Math.max(0.08, Math.abs(x1 - x0)), sy: 0.08, sz: Math.max(0.08, Math.abs(z1 - z0)) })
        }
      }
    }
    edge(-w / 2, -d / 2, w / 2, -d / 2, false)
    edge(-w / 2, d / 2, w / 2, d / 2, Boolean(gap))
    edge(-w / 2, -d / 2, -w / 2, d / 2, false)
    edge(w / 2, -d / 2, w / 2, d / 2, false)
    for (const [lx, lz] of posts) b.local(BOX, 0x6a4a2a, cx, y, cz, yaw, lx, 0.55, lz, { sx: 0.14, sy: 1.1, sz: 0.14 })
  }

  _paddock(b, p, ground, obstacles) {
    const y = ground(p.x, p.z)
    const n = 18
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2
      const a1 = ((i + 1) / n) * Math.PI * 2
      if (i === 0) continue // the gate
      const x0 = p.x + Math.cos(a0) * p.r
      const z0 = p.z + Math.sin(a0) * p.r
      const x1 = p.x + Math.cos(a1) * p.r
      const z1 = p.z + Math.sin(a1) * p.r
      lineObstacles(obstacles, x0, z0, x1, z1)
      b.add(BOX, 0x6a4a2a, x0, y + 0.55, z0, { sx: 0.14, sy: 1.1, sz: 0.14 })
      const len = Math.hypot(x1 - x0, z1 - z0)
      for (const h of [0.45, 0.9]) b.add(BOX, 0x7a5a38, (x0 + x1) / 2, y + h, (z0 + z1) / 2, { yaw: Math.atan2(x1 - x0, z1 - z0), sx: 0.08, sy: 0.08, sz: len })
    }
    b.add(BOX, 0x6a5a3a, p.x + p.r * 0.5, y + 0.3, p.z, { sx: 1.2, sy: 0.4, sz: 0.5 })
    b.add(BOX, 0x4a8ab0, p.x + p.r * 0.5, y + 0.48, p.z, { sx: 1.0, sy: 0.05, sz: 0.36 })
  }

  _props(b, v, ground, obstacles, rand) {
    // Barrels, crates and a cart by the houses; lamp posts on the green.
    for (const h of v.houses) {
      if (rand() < 0.55) {
        const a = h.yaw + Math.PI / 2 + (rand() - 0.5)
        const x = h.x + Math.sin(a) * (h.w / 2 + 0.9)
        const z = h.z + Math.cos(a) * (h.w / 2 + 0.9)
        const y = ground(x, z)
        if (rand() < 0.5) b.add(CYL, 0x7a5232, x, y + 0.45, z, { sx: 0.7, sy: 0.9, sz: 0.7, jitter: 0.1 })
        else b.add(BOX, 0x9a7448, x, y + 0.35, z, { sx: 0.7, sy: 0.7, sz: 0.7, yaw: rand(), jitter: 0.1 })
      }
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4
      const x = v.x + Math.cos(a) * 5.4
      const z = v.z + Math.sin(a) * 5.4
      const y = ground(x, z)
      b.add(BOX, 0x3a3030, x, y + 1.2, z, { sx: 0.12, sy: 2.4, sz: 0.12 })
      b.add(BOX, 0xffd68a, x, y + 2.45, z, { sx: 0.3, sy: 0.32, sz: 0.3, into: 'glow' })
      b.add(CONE4, 0x3a3030, x, y + 2.75, z, { sx: 0.5, sy: 0.3, sz: 0.5 })
      obstacles.push({ x, z, r: 0.25, keep: 0.4 })
    }
  }

  _portal(b, p, ground, obstacles) {
    const y = ground(p.x, p.z)
    // Steps, a ring of standing stones, an arch of blocks, and the swirl inside it.
    // Low enough to walk onto without sinking into: the bots stand on the terrain.
    b.add(CYL6, 0x8d8f96, p.x, y + 0.04, p.z, { sx: 7, sy: 0.12, sz: 7, jitter: 0.08 })
    b.add(CYL6, 0x9a9ca4, p.x, y + 0.1, p.z, { sx: 5, sy: 0.1, sz: 5, jitter: 0.08 })
    const blocks = 13
    for (let i = 0; i < blocks; i++) {
      const a = (i / (blocks - 1)) * Math.PI
      const lx = Math.cos(a) * 2.3
      const ly = 0.55 + Math.sin(a) * 2.6
      b.local(BOX, i % 2 ? 0x8a8c94 : 0x9a9ca6, p.x, y, p.z, Math.PI / 2, lx, ly, 0, { sx: 0.7, sy: 0.6, sz: 0.8, roll: a - Math.PI / 2, jitter: 0.1 })
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      b.add(BOX, 0x7a7c84, p.x + Math.cos(a) * 3.9, y + 1.0, p.z + Math.sin(a) * 3.9, { sx: 0.6, sy: 2.0, sz: 0.6, yaw: a, jitter: 0.1 })
      b.add(BOX, 0x9fe8ff, p.x + Math.cos(a) * 3.9, y + 2.1, p.z + Math.sin(a) * 3.9, { sx: 0.25, sy: 0.25, sz: 0.25, yaw: a, into: 'glow' })
    }
    // The arch is a half-ring standing on the steps, so the swirl is a half-disc inside it.
    const swirl = new THREE.Mesh(new THREE.CircleGeometry(1.95, 40, 0, Math.PI), this.portalMat)
    swirl.position.set(p.x, y + 0.55, p.z)
    swirl.rotation.y = Math.PI / 2
    swirl.renderOrder = 3
    this.group.add(swirl)
    this.swirl = swirl
    obstacles.push({ x: p.x, z: p.z, r: 2.4, keep: 2.8 })
  }

  _camp(b, c, style, ground, obstacles) {
    const base = save.base
    const y = ground(c.x, c.z)
    // The home grows with the Home facility: a tent, a cabin, a manor, a keep.
    const home = { x: c.x, z: c.z - 3, yaw: 0.2 }
    if (base.home === 0) {
      b.add(CONE4, 0xc8a878, home.x, y + 1.1, home.z, { sx: 3.2, sy: 2.2, sz: 3.6, yaw: Math.PI / 4 + home.yaw })
      b.add(BOX, 0x4a3a2a, home.x, y + 0.6, home.z + 1.1, { sx: 0.8, sy: 1.2, sz: 0.06, yaw: home.yaw })
      obstacles.push({ x: home.x, z: home.z, r: 1.5, keep: 1.8 })
    } else {
      const size = [0, 1, 1.4, 1.8][base.home]
      this._house(b, { x: home.x, z: home.z, yaw: home.yaw, w: 3.8 * size, d: 3.4 * size, h: 2.3 + base.home * 0.6, kind: 'home', tone: 1 }, STYLES.terra, ground, obstacles, rng(base.home))
      if (base.home >= 3) {
        b.add(CYL6, 0x9a9ca4, home.x + 4.2, y + 3.5, home.z, { sx: 2.4, sy: 7, sz: 2.4, jitter: 0.08 })
        b.add(CONE, 0x3a5aa8, home.x + 4.2, y + 7.8, home.z, { sx: 3, sy: 2.4, sz: 3 })
        obstacles.push({ x: home.x + 4.2, z: home.z, r: 1.4, keep: 1.6 })
      }
    }
    // Campfire, always.
    b.add(CYL, 0x5a5a60, c.x + 1, y + 0.1, c.z + 2, { sx: 1.4, sy: 0.2, sz: 1.4 })
    b.add(CONE4, 0xff9a3a, c.x + 1, y + 0.5, c.z + 2, { sx: 0.6, sy: 0.7, sz: 0.6, into: 'glow' })
    obstacles.push({ x: c.x + 1, z: c.z + 2, r: 0.7, keep: 0.9 })
    // Training dummies.
    for (let i = 0; i < base.training; i++) {
      const x = c.x - 5 + i * 1.6
      const z = c.z + 4
      b.add(BOX, 0x6a4a2a, x, y + 0.9, z, { sx: 0.16, sy: 1.8, sz: 0.16 })
      b.add(CYL, 0xd8b878, x, y + 1.2, z, { sx: 0.6, sy: 0.9, sz: 0.6 })
      b.add(BOX, 0x6a4a2a, x, y + 1.35, z, { sx: 1.2, sy: 0.1, sz: 0.1 })
      obstacles.push({ x, z, r: 0.4, keep: 0.6 })
    }
    // Mana shrine.
    if (base.shrine > 0) {
      const x = c.x + 5
      const z = c.z + 3
      b.add(CYL6, 0x9a9ca4, x, y + 0.35, z, { sx: 1.6, sy: 0.7, sz: 1.6 })
      b.add(CONE4, 0x9fe8ff, x, y + 1.1 + base.shrine * 0.2, z, { sx: 0.7, sy: 1 + base.shrine * 0.4, sz: 0.7, into: 'glow' })
      b.add(CONE4, 0x9fe8ff, x, y + 0.85, z, { sx: 0.7, sy: 0.7, sz: 0.7, pitch: Math.PI, into: 'glow' })
      obstacles.push({ x, z, r: 0.9, keep: 1.1 })
    }
    // Barracks: a tent per extra party slot.
    for (let i = 0; i < base.barracks; i++) {
      const x = c.x - 5 - i * 3
      const z = c.z - 2
      b.add(CONE4, 0x5a6a8a, x, y + 0.9, z, { sx: 2.4, sy: 1.8, sz: 2.6, yaw: Math.PI / 4 })
      obstacles.push({ x, z, r: 1.2, keep: 1.4 })
    }
    // Herb garden.
    if (base.garden > 0) {
      for (let i = 0; i < 3 * base.garden; i++) {
        const x = c.x + 4 + (i % 3) * 0.9
        const z = c.z - 3 - Math.floor(i / 3) * 0.9
        b.add(BOX, 0x5a3c24, x, y + 0.08, z, { sx: 0.8, sy: 0.16, sz: 0.8 })
        b.add(SPHERE, 0x6ad07a, x, y + 0.3, z, { sx: 0.5, sy: 0.4, sz: 0.5, jitter: 0.2 })
      }
    }
    this._fenceRect(b, c.x, y, c.z, 0, 15, 13, style, [0, 0.5], obstacles)
  }

  _ruins(b, style, ground, obstacles, rand) {
    // Broken columns and fallen walls, for the dungeon worlds.
    for (let i = 0; i < 28; i++) {
      const a = rand() * Math.PI * 2
      const d = 8 + rand() * 30
      const x = Math.cos(a) * d
      const z = Math.sin(a) * d
      if (Math.hypot(x - PORTAL.x, z - PORTAL.z) < 8 || Math.hypot(x - CAMP_AT.x, z - CAMP_AT.z) < 10) continue
      const y = ground(x, z)
      const h = 1 + rand() * 3.5
      b.add(CYL6, style.stone, x, y + h / 2, z, { sx: 0.9, sy: h, sz: 0.9, jitter: 0.15, roll: (rand() - 0.5) * 0.2 })
      obstacles.push({ x, z, r: 0.6, keep: 0.8 })
    }
  }

  // ── forests ─────────────────────────────────────────────────────────────────────────

  _forests(L, ground, obstacles) {
    const planet = this.colony.planet
    const recipe = (SCATTER[planet.scatter] || SCATTER.flora).map((r) => ({ ...r, kit: r.kit || 'forest' }))
    const isTree = (r) => r.upright && /tree|pine|palm|cactus/i.test(r.part)
    let kinds = recipe.filter((r) => isTree(r) && kitReady(r.kit) && hasPart(r.part, r.kit))
    // A world without trees of its own (the moon, Mars) borrows the meadow's, dead-looking.
    if (!kinds.length) kinds = SCATTER.flora.map((r) => ({ ...r, kit: 'forest' })).filter((r) => isTree(r) && kitReady(r.kit) && hasPart(r.part, r.kit))
    if (!kinds.length) return
    const under = recipe.filter((r) => r.upright && !isTree(r) && (r.zone || 'land') === 'land' && kitReady(r.kit) && hasPart(r.part, r.kit))
    const density = THREE.MathUtils.clamp((this.colony.settings.get('scatterDensity') || 0.5) * 2.5, 0.22, 1)
    // On a light preset, keep to the lighter tree models: some are four times the triangles of others.
    const tris = (k) => {
      const g = part(k.part, k.kit)
      return (g.index ? g.index.count : g.attributes.position.count) / 3
    }
    if (density < 0.6 && kinds.length > 2) {
      const light = kinds.filter((k) => tris(k) < 1500)
      if (light.length) kinds = light
    }
    const rand = rng(hashOf(`${L.key}:forest`))
    const level = planet.water?.level
    const all = [...kinds.map((k) => ({ ...k, tree: true })), ...under.map((k) => ({ ...k, tree: false }))]
    // One batch per grove and kind, so a grove behind the camera is not drawn at all.
    const groves = []
    for (const f of L.forests) {
      const placements = all.map(() => [])
      groves.push(placements)
      const count = Math.round(((Math.PI * f.r * f.r) / 9) * density)
      for (let i = 0; i < count; i++) {
        const a = rand() * Math.PI * 2
        const d = Math.sqrt(rand()) * f.r
        const x = f.x + Math.cos(a) * d
        const z = f.z + Math.sin(a) * d
        if (Math.hypot(x, z) > WORLD_RADIUS + 20) continue
        const y = ground(x, z)
        if (level !== undefined && y < level + 0.3) continue
        if (L.clears.some((c) => Math.hypot(x - c.x, z - c.z) < c.r)) continue
        // Nothing grows on a road.
        if (this.roadClears?.some((c) => Math.hypot(x - c.x, z - c.z) < 2.4)) continue
        const tree = rand() < 0.72 || !under.length
        const pool = tree ? kinds.length : under.length
        const which = (tree ? 0 : kinds.length) + Math.floor(rand() * pool)
        const k = all[which]
        const s = k.size[0] + rand() * (k.size[1] - k.size[0])
        placements[which].push({ x, y: y - (k.sink || 0) * s, z, s: s * (tree ? 1.15 : 1), yaw: rand() * Math.PI * 2 })
        if (tree) obstacles.push({ x, z, r: 0.45, keep: 0.6 })
      }
    }
    const dummy = new THREE.Object3D()
    const materials = new Map()
    for (const placements of groves) all.forEach((k, i) => {
      const list = placements[i]
      if (!list.length) return
      let mat = materials.get(k.kit)
      if (!mat) {
        mat = new THREE.MeshStandardMaterial({ map: atlasTexture(k.kit), vertexColors: kitUsesVertexColors(k.kit), roughness: 0.82, metalness: 0 })
        materials.set(k.kit, mat)
      }
      const mesh = new THREE.InstancedMesh(part(k.part, k.kit), mat, list.length)
      SHARED.add(mesh.geometry)
      list.forEach((p, j) => {
        dummy.position.set(p.x, p.y, p.z)
        dummy.rotation.set(0, p.yaw, 0)
        dummy.scale.setScalar(p.s)
        dummy.updateMatrix()
        mesh.setMatrixAt(j, dummy.matrix)
      })
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.computeBoundingSphere()
      this.group.add(mesh)
    })
  }

  // ── horses ──────────────────────────────────────────────────────────────────────────

  _spawnHorses(L, ground) {
    const coats = [0x8b5a2b, 0xe8e2d4, 0x2a2522, 0xa06a3a, 0x5a3a24]
    let n = 0
    for (const p of L.paddocks) {
      for (let i = 0; i < 2; i++) {
        const h = makeHorse(coats[n++ % coats.length], this.materials.solid)
        const a = Math.random() * Math.PI * 2
        h.group.position.set(p.x + Math.cos(a) * 2, ground(p.x, p.z), p.z + Math.sin(a) * 2)
        this.group.add(h.group)
        this.horses.push({ ...h, mode: 'graze', pad: p, target: new THREE.Vector3(), wait: Math.random() * 4, phase: Math.random() * 10 })
      }
    }
    // A horse and cart plodding up and down the road from the portal to the first village.
    const road = L.roads.find((r) => r.cart)
    if (road) {
      const pts = sampleRoad(road, 1)
      const h = makeHorse(coats[n++ % coats.length], this.materials.solid, true)
      this.group.add(h.group)
      this.horses.push({ ...h, mode: 'cart', path: pts, t: Math.random() * pts.length, dir: 1, phase: 0 })
    }
    this._ground = ground
  }

  /** Per frame: horses graze and walk, the windmill turns, the portal swirls, windows glow. */
  update(dt, elapsed, night) {
    this.portalMat.uniforms.uTime.value = elapsed
    if (this.blades) this.blades.rotation.z += dt * 0.6
    this.materials.glow.emissiveIntensity = 0.15 + night * 1.6
    const ground = this._ground
    if (!ground) return
    for (const h of this.horses) {
      h.phase += dt
      let moving = false
      const g = h.group
      if (h.mode === 'cart') {
        const speed = 1.4
        h.t += dt * speed * h.dir
        if (h.t >= h.path.length - 1) {
          h.t = h.path.length - 1
          h.dir = -1
        } else if (h.t <= 0) {
          h.t = 0
          h.dir = 1
        }
        const i = Math.floor(h.t)
        const a = h.path[i]
        const b = h.path[Math.min(h.path.length - 1, i + 1)]
        const f = h.t - i
        const x = a.x + (b.x - a.x) * f
        const z = a.z + (b.z - a.z) * f
        g.position.set(x, ground(x, z), z)
        const yaw = Math.atan2(b.x - a.x, b.z - a.z) + (h.dir < 0 ? Math.PI : 0)
        g.rotation.y = angleTo(g.rotation.y, yaw, dt * 4)
        moving = true
      } else {
        h.wait -= dt
        const dx = h.target.x - g.position.x
        const dz = h.target.z - g.position.z
        const d = Math.hypot(dx, dz)
        if (h.wait <= 0 && d < 0.3) {
          const a = Math.random() * Math.PI * 2
          const r = Math.random() * (h.pad.r - 1.5)
          h.target.set(h.pad.x + Math.cos(a) * r, 0, h.pad.z + Math.sin(a) * r)
          h.wait = 4 + Math.random() * 6
        } else if (d >= 0.3) {
          const step = Math.min(d, dt * 0.9)
          g.position.x += (dx / d) * step
          g.position.z += (dz / d) * step
          g.position.y = ground(g.position.x, g.position.z)
          g.rotation.y = angleTo(g.rotation.y, Math.atan2(dx, dz), dt * 3)
          moving = true
        }
      }
      // Legs swing when walking; the head goes down to graze when standing.
      const swing = moving ? Math.sin(h.phase * (h.mode === 'cart' ? 7 : 5)) * 0.5 : 0
      h.legs.forEach((leg, i) => (leg.rotation.x = (i === 0 || i === 3 ? swing : -swing)))
      const graze = !moving && h.mode === 'graze' ? 0.9 + Math.sin(h.phase * 0.8) * 0.15 : 0.1 + Math.sin(h.phase * 2) * 0.03
      h.neck.rotation.x = THREE.MathUtils.damp(h.neck.rotation.x, graze, 3, dt)
      h.tail.rotation.z = Math.sin(h.phase * 3) * 0.25
      if (h.cart) h.cart.wheels.forEach((w) => (w.rotation.x += moving ? dt * 2.4 * h.dir : 0))
    }
  }

  // ── villagers ───────────────────────────────────────────────────────────────────────

  /**
   * Put the thread list on the map. Called by the colony in place of its own `setThreads`:
   * no plots, no buildings — everyone is told where their house, stall, anvil or field is.
   */
  setThreads(list) {
    const L = this.plan()
    if (this.key !== L.key) this.build()
    const now = Date.now()
    const entries = []
    const stats = { agents: 0, projects: L.villages.length, working: 0, waiting: 0, blocked: 0, done: 0 }
    const vec = (p) => new THREE.Vector3(p.x, 0, p.z)
    let partnerIndex = 0
    for (const thread of list) {
      let status = statusFor(thread, now)
      let site
      let anchor = null
      if (thread.id === HERO_ID) {
        site = vec({ x: L.portal.x + 3.2, z: L.portal.z })
      } else if (thread.project === CAMP) {
        const a = partnerIndex++ * 1.3
        site = vec({ x: L.camp.x + Math.cos(a) * 3, z: L.camp.z + 1 + Math.sin(a) * 2.5 })
      } else {
        const spot = L.sites.get(thread.id)
        if (!spot) continue
        site = vec(spot.site)
        if (spot.anchor) anchor = vec(spot.anchor)
        // Farmers farm and smiths smith whenever nothing more important is going on.
        if (status === 'idle' && anchor) status = 'working'
      }
      if (status === 'working') stats.working++
      if (status === 'waiting') stats.waiting++
      if (status === 'blocked') stats.blocked++
      entries.push({ id: thread.id, thread, status, site, anchor, known: thread.id !== HERO_ID })
    }
    // Adventurers at the guild tables: scenery that happens to blink.
    for (const e of L.extras) {
      entries.push({ id: e.id, thread: { id: e.id, title: 'Adventurer', lastActivityAt: now }, status: 'idle', site: vec(e), anchor: null, known: true })
    }
    stats.agents = entries.length
    this.colony.threads = new Map(list.map((t) => [t.id, t]))
    this.colony.astronauts.setRoster(entries, this.world())
    // Dress everyone for the job: farmers in brown, smiths in grey, the guild in blue.
    for (const agent of this.colony.astronauts.agents) {
      const spot = L.sites.get(agent.id)
      const tone = spot ? CLOTHES[spot.kind] : agent.id.startsWith('guildhall:') ? [0x8a3a3a, 0x3a6a3a, 0x6a5a8a][Number(agent.id.slice(-1))] : null
      // Guards wear their swords.
      if (spot?.kind === "guard") agent.tool = "sword"
      if (tone && agent.suit !== tone) {
        agent.suit = tone
        agent.colorDirty = true
      }
    }
    return stats
  }

  /** The colony's world, with the portal standing in for the ship's ramp. */
  world() {
    const base = this.colony._world()
    const ground = (x, z) => this.meshHeight(x, z) ?? terrainHeight(x, z, this.colony.planet)
    const p = this.layout?.portal || PORTAL
    return {
      ...base,
      shipAirlock: () => new THREE.Vector3(p.x, ground(p.x, p.z) + 0.5, p.z),
      shipDoor: () => new THREE.Vector3(p.x + 3, ground(p.x + 3, p.z), p.z),
    }
  }

  /** Floor height inside a room, or null outdoors. */
  floorAt(x, z) {
    return this.rooms?.length ? floorAt(this.rooms, x, z) : null
  }

  roomAt(x, z) {
    return this.rooms?.length ? roomAt(this.rooms, x, z) : null
  }

  /** The outdoor door within reach of a point, if any. */
  doorNear(x, z, reach = 2.2) {
    return this.layout?.doors.find((d) => Math.hypot(d.x - x, d.z - z) < reach) || null
  }

  /**
   * The height of the ground *as drawn*. On a light preset the terrain mesh is coarse, and its
   * triangles cut corners off the true height field, so a house placed by the formula floats
   * over a dip or sinks into a rise. Interpolating the mesh's own vertices puts things on the
   * surface you can actually see.
   */
  meshHeight(x, z) {
    const mesh = this.colony.terrain
    const geo = mesh?.geometry
    if (!geo) return null
    if (this._meshGeo !== geo) {
      const p = geo.attributes.position
      const seg = geo.parameters?.widthSegments
      if (!seg) return null
      const n = seg + 1
      this._meshGeo = geo
      this._mesh = { p, n, x0: p.getX(0), z0: p.getZ(0), dx: p.getX(1) - p.getX(0), dz: p.getZ(n) - p.getZ(0) }
    }
    const { p, n, x0, z0, dx, dz } = this._mesh
    const fx = (x - x0) / dx
    const fz = (z - z0) / dz
    const i = Math.floor(fx)
    const j = Math.floor(fz)
    if (i < 0 || j < 0 || i >= n - 1 || j >= n - 1) return null
    const tx = fx - i
    const tz = fz - j
    const h = (a, b) => p.getY(b * n + a)
    // Bilinear across the cell: within a few millimetres of either triangle split.
    const top = h(i, j) + (h(i + 1, j) - h(i, j)) * tx
    const bottom = h(i, j + 1) + (h(i + 1, j + 1) - h(i, j + 1)) * tx
    return top + (bottom - top) * tz
  }

  /** True on a village green, in a field, at the camp or the portal: no monsters spawn here. */
  safeAt(x, z) {
    const L = this.layout
    if (!L) return false
    return L.clears.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + 4)
  }

  /** Whether a point is under the trees. */
  forestAt(x, z) {
    return Boolean(this.layout?.forests.some((f) => Math.hypot(x - f.x, z - f.z) < f.r))
  }

  /** Which village a point is in, if any. */
  villageAt(x, z) {
    return this.layout?.villages.find((v) => Math.hypot(x - v.x, z - v.z) < 17) || null
  }

  inCamp(x, z) {
    const c = this.layout?.camp || CAMP_AT
    return Math.hypot(x - c.x, z - c.z) < 8
  }

  get portal() {
    return this.layout?.portal || PORTAL
  }
}

// ── helpers ───────────────────────────────────────────────────────────────────────────

const SHARED = new Set()

/** A wall of small circles along a line: what a fence is to the navigation grid. */
function lineObstacles(obstacles, x0, z0, x1, z1, r = 0.22) {
  const len = Math.hypot(x1 - x0, z1 - z0)
  const n = Math.max(1, Math.ceil(len / 0.3))
  for (let i = 0; i <= n; i++) obstacles.push({ x: x0 + ((x1 - x0) * i) / n, z: z0 + ((z1 - z0) * i) / n, r, keep: r + 0.2 })
}

/** A building's whole rectangular footprint, corners included, as a fill of circles. */
function rectObstacles(obstacles, cx, cz, yaw, w, d) {
  const c = Math.cos(yaw)
  const s = Math.sin(yaw)
  const step = 0.6
  const nx = Math.max(1, Math.round(w / step))
  const nz = Math.max(1, Math.round(d / step))
  for (let i = 0; i <= nx; i++) {
    for (let k = 0; k <= nz; k++) {
      const lx = -w / 2 + (w * i) / nx
      const lz = -d / 2 + (d * k) / nz
      // The inside only needs to be solid, not finely sampled: every other point will do.
      const edge = i === 0 || k === 0 || i === nx || k === nz
      if (!edge && (i + k) % 2) continue
      obstacles.push({ x: cx + lx * c + lz * s, z: cz - lx * s + lz * c, r: 0.38, keep: 0.55 })
    }
  }
}

function colored(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo
  g.deleteAttribute('uv')
  const n = g.attributes.position.count
  const c = new THREE.Color(color)
  const arr = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r
    arr[i * 3 + 1] = c.g
    arr[i * 3 + 2] = c.b
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3))
  return g
}

/** Points along a road every `step` metres, through its control points on a smooth curve. */
function sampleRoad(pts, step) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p.x, 0, p.z)))
  const len = curve.getLength()
  const n = Math.max(2, Math.ceil(len / step))
  return curve.getSpacedPoints(n).map((v) => ({ x: v.x, z: v.z }))
}

function angleTo(current, target, k) {
  let d = target - current
  d = Math.atan2(Math.sin(d), Math.cos(d))
  return current + d * Math.min(1, k)
}

/** A low-poly horse, built to be animated: legs pivot at the hip, the neck at the withers. */
function makeHorse(coat, material, withCart = false) {
  const mat = material
  const dark = new THREE.Color(coat).multiplyScalar(0.45).getHex()
  const group = new THREE.Group()
  const body = new THREE.Mesh(colored(new THREE.CapsuleGeometry(0.34, 1.0, 4, 10), coat), mat)
  body.rotation.x = Math.PI / 2
  body.position.y = 1.15
  group.add(body)
  const legs = []
  for (const [x, z] of [[-0.2, 0.5], [0.2, 0.5], [-0.2, -0.5], [0.2, -0.5]]) {
    const pivot = new THREE.Group()
    pivot.position.set(x, 1.05, z)
    const leg = new THREE.Mesh(colored(new THREE.BoxGeometry(0.14, 1.0, 0.14), coat), mat)
    leg.position.y = -0.5
    const hoof = new THREE.Mesh(colored(new THREE.BoxGeometry(0.16, 0.12, 0.18), 0x2a2018), mat)
    hoof.position.y = -1.0
    pivot.add(leg, hoof)
    group.add(pivot)
    legs.push(pivot)
  }
  const neck = new THREE.Group()
  neck.position.set(0, 1.35, 0.62)
  const neckMesh = new THREE.Mesh(colored(new THREE.BoxGeometry(0.26, 0.75, 0.3), coat), mat)
  neckMesh.position.set(0, 0.28, 0.12)
  neckMesh.rotation.x = 0.5
  const head = new THREE.Mesh(colored(new THREE.BoxGeometry(0.24, 0.26, 0.6), coat), mat)
  head.position.set(0, 0.62, 0.42)
  head.rotation.x = 0.35
  const mane = new THREE.Mesh(colored(new THREE.BoxGeometry(0.08, 0.6, 0.16), dark), mat)
  mane.position.set(0, 0.42, -0.02)
  mane.rotation.x = 0.5
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(colored(new THREE.ConeGeometry(0.05, 0.16, 4), coat), mat)
    ear.position.set(s * 0.08, 0.8, 0.28)
    neck.add(ear)
  }
  neck.add(neckMesh, head, mane)
  group.add(neck)
  const tail = new THREE.Group()
  tail.position.set(0, 1.25, -0.82)
  const tailMesh = new THREE.Mesh(colored(new THREE.BoxGeometry(0.1, 0.7, 0.1), dark), mat)
  tailMesh.position.set(0, -0.3, -0.12)
  tailMesh.rotation.x = -0.4
  tail.add(tailMesh)
  group.add(tail)
  let cart = null
  if (withCart) {
    const c = new THREE.Group()
    const bed = new THREE.Mesh(colored(new THREE.BoxGeometry(1.4, 0.5, 1.8), 0x8a6a42), mat)
    bed.position.set(0, 0.85, -2.2)
    const hay = new THREE.Mesh(colored(new THREE.BoxGeometry(1.2, 0.5, 1.5), 0xe0c060), mat)
    hay.position.set(0, 1.3, -2.2)
    const wheels = []
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(colored(new THREE.CylinderGeometry(0.5, 0.5, 0.12, 12), 0x5a3c24), mat)
      w.rotation.z = Math.PI / 2
      w.position.set(s * 0.78, 0.5, -2.2)
      const pivot = new THREE.Group()
      pivot.position.set(s * 0.78, 0.5, -2.2)
      w.position.set(0, 0, 0)
      pivot.add(w)
      wheels.push(pivot)
      c.add(pivot)
    }
    for (const s of [-1, 1]) {
      const shaft = new THREE.Mesh(colored(new THREE.BoxGeometry(0.08, 0.08, 1.8), 0x6a4a2a), mat)
      shaft.position.set(s * 0.45, 0.95, -0.9)
      c.add(shaft)
    }
    c.add(bed, hay)
    group.add(c)
    cart = { group: c, wheels }
  }
  group.traverse((o) => {
    if (o.isMesh) o.castShadow = true
  })
  return { group, legs, neck, tail, cart }
}
