import * as THREE from 'three'

/**
 * Rooms you can walk into: your house, the inn and the Adventurers' Guild.
 *
 * Each is a cutaway set — no ceiling, the camera looking in from above, the way anime RPGs
 * stage their interiors — built far off in a corner of the map, high in the air and wrapped
 * in a dark shell so nothing of the outdoors shows past the walls. They sit inside the
 * navigation grid, so walking, bumping into furniture and climbing the stairs all use the
 * same movement as the rest of the world; `floorAt` tells the bots how high the floor is,
 * which is what makes the stairs stairs.
 */

export const FLOOR_Y = 32

/** Where each room is built: corners of the map, beyond where anyone can walk outdoors. */
export const INTERIOR_AT = {
  home: { x: -98, z: -100 },
  inn: { x: 98, z: -100 },
  guild: { x: -98, z: 100 },
}

/** The rooms themselves: size, colours, where the stairs climb and where the loft is. */
const ROOMS = {
  home: { w: 12, d: 10, wall: 0xe8dcc0, floor: 0x9a6a42, trim: 0x5b3a24, title: 'Your Home' },
  inn: { w: 16, d: 12, wall: 0xe0cfa8, floor: 0x8a5a36, trim: 0x4a2e1c, title: 'The Sleepy Slime Inn' },
  guild: { w: 18, d: 14, wall: 0xd8c8a0, floor: 0x7a5232, trim: 0x3e2614, title: 'Adventurers’ Guild' },
}

/** One room's layout in world space, for walking, talking and building. */
export function roomFor(kind) {
  const at = INTERIOR_AT[kind]
  const r = ROOMS[kind]
  const hw = r.w / 2
  const hd = r.d / 2
  const loftH = 2.5
  // Stairs climb along the back wall from left to right, up to a loft in the back-right corner.
  const stairs = { x0: at.x - hw * 0.15 - 3.4, x1: at.x - hw * 0.15, z0: at.z - hd + 0.3, z1: at.z - hd + 1.7, h: loftH }
  const loft = { x0: stairs.x1, x1: at.x + hw - 0.3, z0: at.z - hd + 0.3, z1: at.z - hd + 3.6, h: loftH }
  return {
    kind,
    ...r,
    x: at.x,
    z: at.z,
    hw,
    hd,
    stairs,
    loft,
    door: { x: at.x, z: at.z + hd - 0.9 },
    spawn: { x: at.x, z: at.z + hd - 2.2 },
    bed: kind !== 'guild' ? { x: loft.x1 - 1.4, z: loft.z0 + 1.3 } : null,
    board: kind === 'guild' ? { x: at.x + hw - 1.2, z: at.z } : null,
    counter: kind === 'guild' ? { x: at.x - 1, z: at.z - hd + 5.2 } : kind === 'inn' ? { x: at.x - hw + 4.5, z: at.z + 0.5 } : null,
  }
}

/** Is a point inside one of the rooms? Returns that room, or null. */
export function roomAt(rooms, x, z) {
  for (const r of rooms) if (Math.abs(x - r.x) < r.hw + 0.2 && Math.abs(z - r.z) < r.hd + 0.2) return r
  return null
}

/** The floor height at a point in a room: the ground floor, the stairs or the loft. */
export function floorAt(rooms, x, z) {
  const r = roomAt(rooms, x, z)
  if (!r) return null
  const s = r.stairs
  if (x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1) return FLOOR_Y + ((x - s.x0) / (s.x1 - s.x0)) * s.h
  const l = r.loft
  if (x >= l.x0 && x <= l.x1 && z >= l.z0 && z <= l.z1) return FLOOR_Y + l.h
  return FLOOR_Y
}

/**
 * Build a room into the batch. `box(color, x, y, z, sx, sy, sz, into)` adds an axis-aligned
 * box; the obstacles that come back are what the navigation grid needs.
 */
export function buildRoom(room, box, cyl, shell) {
  const r = room
  const Y = FLOOR_Y
  const obstacles = []
  const wallLine = (x0, z0, x1, z1, rad = 0.32) => {
    const len = Math.hypot(x1 - x0, z1 - z0)
    const n = Math.max(1, Math.ceil(len / 0.35))
    for (let i = 0; i <= n; i++) obstacles.push({ x: x0 + ((x1 - x0) * i) / n, z: z0 + ((z1 - z0) * i) / n, r: rad, keep: rad + 0.15 })
  }
  const solid = (x, z, rad) => obstacles.push({ x, z, r: rad, keep: rad + 0.2 })
  const H = 3.4

  // The dark set the room stands in, so nothing outdoors shows past the walls.
  shell(r.x, Y + 5, r.z, r.w + 16, 18, r.d + 16)

  // Floor, planks, and a rug.
  box(r.floor, r.x, Y - 0.15, r.z, r.w, 0.3, r.d)
  for (let i = 0; i < Math.floor(r.d / 0.8); i++) box(r.trim, r.x, Y + 0.002, r.z - r.hd + 0.8 * (i + 0.5), r.w, 0.01, 0.04)
  box(0x8a2a2a, r.x, Y + 0.02, r.z + 1, Math.min(5, r.w * 0.35), 0.03, 3.2)
  box(0xc8a050, r.x, Y + 0.025, r.z + 1, Math.min(5, r.w * 0.35) - 0.5, 0.03, 2.7)

  // Walls with a wood wainscot and a beam along the top; a doorway in the front wall.
  const wall = (x, z, sx, sz) => {
    box(r.wall, x, Y + H / 2, z, sx, H, sz)
    box(r.trim, x, Y + 0.5, z, sx + 0.04, 1.0, sz + 0.04)
    box(r.trim, x, Y + H - 0.1, z, sx + 0.06, 0.2, sz + 0.06)
  }
  wall(r.x, r.z - r.hd, r.w, 0.3)
  wall(r.x - r.hw, r.z, 0.3, r.d)
  wall(r.x + r.hw, r.z, 0.3, r.d)
  const gap = 1.8
  const side = (r.w - gap) / 2
  wall(r.x - gap / 2 - side / 2, r.z + r.hd, side, 0.3)
  wall(r.x + gap / 2 + side / 2, r.z + r.hd, side, 0.3)
  box(0x6a4a2a, r.x, Y + 2.6, r.z + r.hd, gap + 0.3, 0.3, 0.32)
  box(0x3a2a1a, r.x, Y + 0.02, r.z + r.hd - 0.6, 1.6, 0.03, 1.0)
  wallLine(r.x - r.hw, r.z - r.hd, r.x + r.hw, r.z - r.hd)
  wallLine(r.x - r.hw, r.z - r.hd, r.x - r.hw, r.z + r.hd)
  wallLine(r.x + r.hw, r.z - r.hd, r.x + r.hw, r.z + r.hd)
  wallLine(r.x - r.hw, r.z + r.hd, r.x - gap / 2 - 0.1, r.z + r.hd)
  wallLine(r.x + gap / 2 + 0.1, r.z + r.hd, r.x + r.hw, r.z + r.hd)
  // The doorway itself is blocked a step outside, so you leave by the button, not by walking off.
  wallLine(r.x - gap / 2, r.z + r.hd + 0.4, r.x + gap / 2, r.z + r.hd + 0.4)

  // Windows that glow, on the side walls.
  for (const s of [-1, 1]) {
    for (const dz of [-r.d * 0.2, r.d * 0.2]) box(0xffd68a, r.x + s * (r.hw - 0.17), Y + 1.9, r.z + dz, 0.05, 1.0, 1.2, 'glow')
  }

  // Stairs: steps rising to the loft, with a rail on the open side.
  const s = r.stairs
  const steps = 9
  for (let i = 0; i < steps; i++) {
    const t0 = i / steps
    const t1 = (i + 1) / steps
    const h = s.h * t1
    box(r.trim, s.x0 + (s.x1 - s.x0) * ((t0 + t1) / 2), Y + h / 2, (s.z0 + s.z1) / 2, (s.x1 - s.x0) / steps + 0.02, h, s.z1 - s.z0)
  }
  for (let i = 0; i <= steps; i += 3) {
    const x = s.x0 + ((s.x1 - s.x0) * i) / steps
    box(r.trim, x, Y + (s.h * i) / steps + 0.5, s.z1 + 0.05, 0.08, 1.0, 0.08)
  }
  box(r.trim, (s.x0 + s.x1) / 2, Y + s.h / 2 + 1.0, s.z1 + 0.05, Math.hypot(s.x1 - s.x0, s.h), 0.08, 0.08)
  wallLine(s.x0 + 0.4, s.z1 + 0.15, s.x1, s.z1 + 0.15, 0.2)

  // The loft: a raised floor on a solid base, railed except where the stairs arrive.
  const l = r.loft
  box(r.trim, (l.x0 + l.x1) / 2, Y + l.h / 2, (l.z0 + l.z1) / 2, l.x1 - l.x0, l.h, l.z1 - l.z0)
  box(r.floor, (l.x0 + l.x1) / 2, Y + l.h + 0.02, (l.z0 + l.z1) / 2, l.x1 - l.x0, 0.06, l.z1 - l.z0)
  for (let x = l.x0 + 0.1; x <= l.x1; x += 0.7) box(r.trim, x, Y + l.h + 0.5, l.z1, 0.08, 1.0, 0.08)
  box(r.trim, (l.x0 + l.x1) / 2, Y + l.h + 1.0, l.z1, l.x1 - l.x0, 0.08, 0.1)
  box(r.trim, l.x0, Y + l.h + 1.0, (s.z1 + l.z1) / 2, 0.1, 0.08, l.z1 - s.z1)
  wallLine(l.x0, l.z1 + 0.05, l.x1, l.z1 + 0.05, 0.22)
  wallLine(l.x0 - 0.05, s.z1 + 0.25, l.x0 - 0.05, l.z1, 0.22)

  const table = (x, z, round = false) => {
    if (round) cyl(0x8a5a32, x, Y + 0.8, z, 1.4, 0.1, 1.4)
    else box(0x8a5a32, x, Y + 0.8, z, 1.8, 0.1, 1.1)
    box(r.trim, x, Y + 0.4, z, 0.16, 0.8, 0.16)
    for (const [dx, dz] of round ? [[1.1, 0], [-1.1, 0], [0, 1.1]] : [[0, 0.9], [0, -0.9]]) {
      cyl(0x6a4024, x + dx, Y + 0.45, z + dz, 0.5, 0.08, 0.5)
      box(r.trim, x + dx, Y + 0.22, z + dz, 0.08, 0.45, 0.08)
    }
    box(0xf0e0c0, x + 0.2, Y + 0.9, z, 0.2, 0.12, 0.2)
    solid(x, z, round ? 0.95 : 1.0)
  }
  const fireplace = (x, z) => {
    box(0x8d8f96, x, Y + 1.2, z, 0.8, 2.4, 2.0)
    box(0x2a1a14, x + 0.42, Y + 0.6, z, 0.05, 0.9, 1.1)
    box(0xff8a2a, x + 0.44, Y + 0.45, z, 0.05, 0.5, 0.8, 'glow')
    box(0x8d8f96, x, Y + 3.0, z, 0.6, 1.4, 1.0)
    solid(x, z, 1.1)
  }
  const shelf = (x, z, rot) => {
    const w = rot ? [0.4, 2.0] : [2.0, 0.4]
    box(r.trim, x, Y + 1.1, z, w[0], 2.2, w[1])
    for (let i = 0; i < 3; i++) for (let k = 0; k < 5; k++) {
      const c = [0xc83a3a, 0x3a6ab8, 0x3a8a4a, 0xe0b040, 0x8a4a9a][(i + k) % 5]
      if (rot) box(c, x + 0.05, Y + 0.5 + i * 0.6, z - 0.75 + k * 0.35, 0.25, 0.4, 0.2)
      else box(c, x - 0.75 + k * 0.35, Y + 0.5 + i * 0.6, z + 0.05, 0.2, 0.4, 0.25)
    }
    solid(x, z, 0.9)
  }

  if (r.kind === 'home') {
    fireplace(r.x - r.hw + 0.55, r.z + 0.5)
    table(r.x - 1.5, r.z + 1.2)
    shelf(r.x + r.hw - 0.4, r.z + 2, true)
    box(0x6a4a2a, r.x + 2.5, Y + 0.45, r.z + 3.2, 1.2, 0.9, 0.7)
    solid(r.x + 2.5, r.z + 3.2, 0.7)
  }
  if (r.kind === 'inn') {
    fireplace(r.x - r.hw + 0.55, r.z - 1.5)
    // The bar, with the innkeeper behind it, and barrels on the wall.
    const c = r.counter
    box(0x6a4024, c.x + 1.6, Y + 0.55, c.z, 0.7, 1.1, 4.2)
    box(0x8a5a32, c.x + 1.6, Y + 1.12, c.z, 0.9, 0.08, 4.4)
    wallLine(c.x + 1.6, c.z - 2.1, c.x + 1.6, c.z + 2.1, 0.4)
    for (let i = 0; i < 3; i++) {
      cyl(0x7a5232, r.x - r.hw + 1.0, Y + 0.5, c.z - 1.5 + i * 1.3, 0.9, 1.0, 0.9)
      solid(r.x - r.hw + 1.0, c.z - 1.5 + i * 1.3, 0.5)
    }
    table(r.x + 2, r.z + 1.5, true)
    table(r.x + 5, r.z + 3.4, true)
    table(r.x + 1.5, r.z + 4.2, true)
    // Guest rooms along the loft: doors in the back wall.
    for (let i = 0; i < 3; i++) box(0x4a2e1c, r.loft.x0 + 1.4 + i * 2.2, Y + r.loft.h + 1.0, r.z - r.hd + 0.17, 0.9, 1.9, 0.06)
    box(0xffe8b0, r.x, Y + 3.2, r.z, 0.4, 0.4, 0.4, 'glow')
  }
  if (r.kind === 'guild') {
    // Reception counter across the back, the quest board on the right wall.
    const c = r.counter
    box(0x6a4024, c.x, Y + 0.6, c.z, 6.5, 1.2, 0.8)
    box(0x8a5a32, c.x, Y + 1.24, c.z, 6.8, 0.1, 1.0)
    box(0xe8d8b0, c.x - 2, Y + 1.32, c.z, 0.6, 0.06, 0.4)
    cyl(0x9fe8ff, c.x + 2.2, Y + 1.5, c.z, 0.45, 0.45, 0.45, 'glow')
    wallLine(c.x - 3.3, c.z, c.x + 3.3, c.z, 0.45)
    const b = r.board
    box(0x6a4024, b.x + 0.95, Y + 2.0, b.z, 0.12, 2.0, 3.6)
    for (let i = 0; i < 10; i++) {
      const col = [0xf4ecd8, 0xf0e0a8, 0xe8d0c0][i % 3]
      box(col, b.x + 0.88, Y + 1.4 + (i % 3) * 0.55, b.z - 1.4 + Math.floor(i / 3) * 0.95 + (i % 2) * 0.2, 0.03, 0.42, 0.34)
    }
    box(0xc83a3a, b.x + 0.86, Y + 3.15, b.z, 0.04, 0.3, 2.4)
    // Banners and long tables for the adventurers.
    for (const dz of [-r.d * 0.25, r.d * 0.25]) box(0x2a4a8a, r.x - r.hw + 0.2, Y + 2.3, r.z + dz, 0.04, 1.8, 0.9)
    table(r.x - 4, r.z + 2.5)
    table(r.x + 1.5, r.z + 3.2)
    table(r.x - 4, r.z + 5.2)
    // Lanterns on the walls (a chandelier would hide the room from the camera above).
    for (const [lx, lz] of [[-r.hw + 0.25, -2], [-r.hw + 0.25, 3], [r.hw - 0.25, 3.5], [-3, r.hd - 0.25], [3, r.hd - 0.25]]) {
      box(0x3a2a1a, r.x + lx, Y + 2.5, r.z + lz, 0.2, 0.1, 0.2)
      box(0xffe0a0, r.x + lx, Y + 2.3, r.z + lz, 0.22, 0.3, 0.22, 'glow')
    }
  }

  // A bed on the loft: yours at home, a rented one at the inn.
  if (r.bed) {
    box(0x6a4024, r.bed.x, Y + r.loft.h + 0.3, r.bed.z, 1.4, 0.5, 2.2)
    box(0xf4ecd8, r.bed.x, Y + r.loft.h + 0.6, r.bed.z + 0.1, 1.3, 0.15, 2.0)
    box(0x3a6ab8, r.bed.x, Y + r.loft.h + 0.66, r.bed.z + 0.4, 1.32, 0.12, 1.3)
    box(0xffffff, r.bed.x, Y + r.loft.h + 0.72, r.bed.z - 0.7, 0.9, 0.18, 0.45)
    solid(r.bed.x, r.bed.z, 0.75)
  }
  return obstacles
}

/** A dark backdrop box, seen from the inside. */
export function shellMesh(x, y, z, sx, sy, sz) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(sx, sy, sz),
    new THREE.MeshBasicMaterial({ color: 0x140c08, side: THREE.BackSide })
  )
  mesh.position.set(x, y, z)
  return mesh
}
