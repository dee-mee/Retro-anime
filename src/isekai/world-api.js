import { npcsOf, worldThreads } from './world.js'
import { REGIONS } from './data.js'

/**
 * Stands in for `src/game/api.js` in the isekai build (see `vite.config.js`). Same exports,
 * no server: threads come from the world in `world.js`, and the colony file lives in this
 * device's own storage.
 */

const COLONY_KEY = 'isekai.colony.v1'

export const fetchThreads = async () => ({ threads: worldThreads() })

export const fetchState = async () => {
  let state = null
  try {
    state = JSON.parse(localStorage.getItem(COLONY_KEY) || 'null')
  } catch {
    state = null
  }
  state ||= { archived: [], archivedAt: {}, opened: [], plots: {}, seen: {}, hiddenProjects: [], viewedAt: {} }
  // Every villager counts as already met, so a roster after the first puts them straight on
  // their own ground instead of walking the whole village out of the ship.
  state.seen ||= {}
  for (const r of REGIONS) for (const npc of npcsOf(r)) state.seen[npc.id] ||= 1
  return state
}

export async function saveState(state) {
  try {
    localStorage.setItem(COLONY_KEY, JSON.stringify(state))
  } catch {
    /* storage full or blocked: the map just will not be remembered */
  }
  return state
}

const nothing = async () => ({ ok: false, error: 'Not in this world' })
export const openThread = nothing
export const newSession = nothing
export const revealFolder = nothing
