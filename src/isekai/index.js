import { region, save } from './world.js'
import { setNavigationHalf } from '../agents/navigation.js'
import { PLANETS } from '../world/planet.js'
import { hexToWorld } from '../world/plots.js'
import { BADGE } from '../agents/indicators.js'
import { Realm, WORLD_RADIUS } from './realm.js'
import { installCelShading } from './anime.js'

/** The world layer, once the colony exists. */
export let realm = null

/**
 * Turn the colony into the other world. Called right after the colony is built and before
 * anything is drawn: the realm takes over the roster, the ship gives way to a portal, and the
 * sci-fi touches (drones, welding sparks, phone checks) are switched off.
 */
export function isekaiPrepare(colony) {
  realm = new Realm(colony)
  colony.ship.group.visible = false
  colony.quietWork = true
  colony.astronauts.noChecks = true
  // Villagers at their everyday work carry no badge; only someone who wants you does.
  const badge = colony._badgeFor.bind(colony)
  colony._badgeFor = (agent) => (agent.status === 'working' && !agent.thread?.running ? BADGE.none : badge(agent))
  colony.setThreads = (list) => realm.setThreads(list)
  // Indoors, the floor (and the stairs) are where the rooms say, not where the terrain is.
  const groundAt = colony.groundAt.bind(colony)
  // Outdoors, everyone stands on the ground as drawn, not on the formula it was drawn from.
  colony.groundAt = (x, z) => realm.floorAt(x, z) ?? realm.meshHeight(x, z) ?? groundAt(x, z)
  const build = colony._buildTerrain.bind(colony)
  colony._buildTerrain = () => {
    realm.plan()
    build()
    realm.scatterKey = realm.layout.key
    realm.build()
  }
  // The sky island is the whole sanctuary, not a ring of hex plots.
  const onIsland = colony.onIsland.bind(colony)
  colony.onIsland = (x, z) => (colony.planet.shape === 'sky' ? Math.hypot(x, z) < 58 : onIsland(x, z))
  colony._footprintCells = () => {
    const cells = []
    for (let q = -6; q <= 6; q++) {
      for (let r = -6; r <= 6; r++) {
        const p = hexToWorld(q, r)
        if (Math.hypot(p.x, p.z) < 52) cells.push({ x: p.x, z: p.z })
      }
    }
    return cells.slice(0, 96)
  }
  realm.plan()
  return realm
}


/**
 * The isekai build is the colony with a game on top. `vite --mode isekai` turns it on; every
 * other build carries this file and never calls into it.
 */
export const ISEKAI = import.meta.env.MODE === 'isekai'

const INIT_KEY = 'isekai.settings-init.v3'

/** A phone or tablet: anything driven by fingers, whatever way round it is held. */
export const isTouchDevice = () => window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0

/**
 * The phone profile. The engine renders at `renderScale × devicePixelRatio`, and a phone's
 * ratio is 2.5–3.5, so even the colony's "low" preset draws close to native 1440p with a
 * post-processing chain on top. This aims at ~1.25 buffer pixels per CSS pixel and drops
 * everything that costs a full-screen pass or a shadow map.
 */
export function applyPhonePreset(settings) {
  const dpr = window.devicePixelRatio || 1
  settings.applyPreset('potato')
  const values = {
    renderScale: Math.min(0.75, Math.max(0.4, 1.25 / dpr)),
    shadows: 'off',
    bloom: false,
    antialias: false,
    particles: 'low',
    textureQuality: 'low',
    scatterDensity: 0.08,
    groundDetail: 'low',
    maxAgents: 40,
    stars: false,
    ibl: false,
    tiltShift: false,
    colorGrade: false,
    ambientOcclusion: 0,
    clouds: false,
    fauna: 'low',
    autoQuality: true,
  }
  for (const [k, v] of Object.entries(values)) settings.set(k, v)
  settings.set('preset', 'phone')
}

/** Settings the game needs before the first frame: the right world, and a view that suits it. */
export function isekaiFirstRun(settings, phoneLike) {
  // A world big enough to roam, and no cargo drones in a world of swords and horses.
  setNavigationHalf(WORLD_RADIUS + 8)
  for (const p of Object.values(PLANETS)) if (p.fauna?.drones) p.fauna.drones = { ...p.fauna.drones, count: 0 }
  let first = false
  try {
    first = !localStorage.getItem(INIT_KEY)
    if (first) localStorage.setItem(INIT_KEY, '1')
  } catch {
    first = true
  }
  if (first) {
    if (phoneLike || isTouchDevice()) applyPhonePreset(settings)
    else settings.applyPreset('balanced')
    settings.set('tiltShift', false)
    settings.set('worldCurve', 0.28)
    settings.set('autoTime', true)
    settings.set('dayLength', 720)
    settings.set('fov', 50)
  }
  // Never fold a quiet village off the map, never chase a selection, never show repo labels.
  settings.set('hideDormant', false)
  // The old-era anime look: cel bands go into the shaders before anything compiles.
  if (settings.get('animeLook') === undefined) settings.set('animeLook', 'ink')
  if (settings.get('animeLook') !== 'off') installCelShading()
  // A real horizon at shoulder height: no little-round-world bend.
  settings.set('worldCurve', 0)
  settings.set('followSelected', false)
  settings.set('autoFrame', false)
  if (settings.get('planet') !== region().planet) settings.set('planet', region().planet)
  document.title = save.started ? `${save.name} — Otherworld Colony` : 'Otherworld Colony'
}

export async function startIsekai(ctx) {
  const { Game } = await import('./game.js')
  const game = new Game(ctx)
  window.isekai = game
  // For poking at a run from the console: the very module instance the game is using.
  window.isekaiWorld = await import('./world.js')
  await game.start()
}
