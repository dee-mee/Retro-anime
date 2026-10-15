import { FACILITIES, PARTNERS, PET_STAGES, RACES, REGIONS, REGION_BY_ID, SMITH_UPGRADES, STAVES, TITLES, rankOf, xpToNext } from './data.js'

/**
 * The save, and the one translation the whole build rests on: the world as it stands, turned
 * into the thread list the colony already knows how to draw.
 *
 * A villager is a thread. Its village is its project, so every village is a zone; how far its
 * house has gone up is `sizeBytes`; and what it is doing is the status the colony reads off a
 * thread — a quest to give is `unread` (the bot waves with a `?`), a curse is `hasError` (it
 * slumps, red-eyed), building is `running` (it hammers), a finished favour is a merged PR (it
 * cheers). Nothing in the renderer had to learn what a quest is.
 */

const SAVE_KEY = 'isekai.save.v1'
export const HERO_ID = 'hero'
export const PET_ID = 'pet'
export const CAMP = 'Otherworlder’s Camp'

function freshSave() {
  return {
    v: 1,
    started: false,
    name: 'Kazuto',
    region: REGIONS[0].id,
    unlocked: [REGIONS[0].id],
    cleared: [],
    hero: { level: 1, xp: 0, hp: 80, mp: 30, gold: 20, smith: 0, items: { potion: 2, ether: 0, elixir: 0 } },
    stats: { kills: 0, bosses: 0, donated: 0, deaths: 0, herbs: 0, dungeons: 0, evo: 0, tamed: 0, forest: 0 },
    fruits: {},
    bonus: { atk: 0, def: 0, hp: 0, mp: 0, agi: 0 },
    evo: 0,
    pet: null,
    prologue: { step: 'fruit' },
    seenEvoFruit: {},
    guild: { registered: false, points: 0 },
    // The extra one gets no blessing: the first Evolution Fruit is what teaches Fireball.
    skills: [],
    grimoire: 0,
    /** Highest staff bought (0 = none), and what is in your hand. */
    staff: 0,
    weapon: 'sword',
    base: { home: 0, training: 0, shrine: 0, barracks: 0, garden: 0 },
    partners: [],
    party: [],
    story: {},
    dungeons: {},
    quests: {},
    npc: {},
    settings: { sound: true },
  }
}

function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return freshSave()
    const s = JSON.parse(raw)
    // A save from before the Forbidden Forest existed has already left it.
    if (s.started && !s.prologue) {
      s.prologue = { step: 'done' }
      s.unlocked = [...new Set(['forest', ...(s.unlocked || [])])]
    }
    const base = freshSave()
    return {
      ...base,
      ...s,
      hero: { ...base.hero, ...s.hero, items: { ...base.hero.items, ...s.hero?.items } },
      stats: { ...base.stats, ...s.stats },
      guild: { ...base.guild, ...s.guild },
      base: { ...base.base, ...s.base },
      bonus: { ...base.bonus, ...s.bonus },
      fruits: { ...s.fruits },
    }
  } catch {
    return freshSave()
  }
}

export const save = load()

let saveTimer = 0
/** Set when the save on disk has just been replaced (a restore, a new game): stop writing over it. */
let frozen = false
export function freezeSaves() {
  frozen = true
  clearTimeout(saveTimer)
}
export function persist(now = false) {
  if (frozen) return
  clearTimeout(saveTimer)
  const write = () => {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(save))
    } catch {
      /* private mode or full storage: the run goes on, it just will not be there next time */
    }
  }
  if (now) write()
  else saveTimer = setTimeout(write, 400)
}

export function resetSave() {
  freezeSaves()
  try {
    localStorage.removeItem(SAVE_KEY)
    localStorage.removeItem('isekai.colony.v1')
  } catch {
    /* nothing to clear */
  }
}

// ── the hero's numbers ──────────────────────────────────────────────────────────────

export function heroStats() {
  const h = save.hero
  const l = h.level - 1
  const b = save.base
  const x = save.bonus
  const race = raceOf()
  let atk = 8 + l * 2.5 + b.training * 4 + x.atk
  let def = 2 + l + x.def
  for (let i = 0; i < h.smith; i++) {
    atk += SMITH_UPGRADES[i]?.atk || 0
    def += SMITH_UPGRADES[i]?.def || 0
  }
  return {
    maxHp: Math.round((80 + l * 14 + b.home * 25 + x.hp) * race.mult),
    maxMp: Math.round((30 + l * 6 + b.shrine * 15 + save.grimoire * 10 + x.mp) * race.mult),
    spell: 1 + save.grimoire * 0.15 + (save.weapon === 'staff' && save.staff ? STAVES[save.staff - 1].spell : 0),
    // A staff trades some swing for range.
    staffAtk: save.weapon === 'staff' && save.staff > 0,
    mpRegen: 1.2 + b.shrine * 0.8 + l * 0.05,
    atk: Math.round(atk * race.mult),
    def: Math.round(def * race.mult),
    int: Math.round((10 + l * 3 + save.evo * 4) * race.mult),
    agi: Math.round((10 + l * 2 + x.agi) * race.mult),
    race: race.name,
    next: xpToNext(h.level),
  }
}

/** What Evolution Fruits have made of you. */
export function raceOf(evo = save.evo) {
  return [...RACES].reverse().find((r) => evo >= r.at)
}

export function weaponName() {
  if (save.weapon === 'staff' && save.staff) return STAVES[save.staff - 1].name
  let name = 'Rusty Sword'
  for (let i = 0; i < save.hero.smith; i++) if (SMITH_UPGRADES[i].atk) name = SMITH_UPGRADES[i].name
  return name
}

export function armorName() {
  let name = 'Travel Clothes'
  for (let i = 0; i < save.hero.smith; i++) if (SMITH_UPGRADES[i].def) name = SMITH_UPGRADES[i].name
  return name
}

export function titles() {
  return TITLES.filter((t) => t.test(save.stats)).map((t) => t.name)
}

/** Add experience; returns how many levels were gained. */
export function gainXp(n) {
  const h = save.hero
  h.xp += n
  let ups = 0
  while (h.xp >= xpToNext(h.level)) {
    h.xp -= xpToNext(h.level)
    h.level++
    ups++
  }
  if (ups) {
    const s = heroStats()
    h.hp = s.maxHp
    h.mp = s.maxMp
  }
  persist()
  return ups
}

// ── regions, villagers, quests ──────────────────────────────────────────────────────

export const region = () => REGION_BY_ID[save.region] || REGIONS[0]

export const npcId = (regionId, key) => `npc:${regionId}:${key}`

export function npcsOf(r = region()) {
  const out = []
  for (const village of r.villages) {
    for (const npc of village.npcs) out.push({ ...npc, id: npcId(r.id, npc.key), village: village.name, region: r.id })
  }
  return out
}

export function npcByKey(key, r = region()) {
  return npcsOf(r).find((n) => n.key === key)
}

export function npcById(id) {
  for (const r of REGIONS) {
    const found = npcsOf(r).find((n) => n.id === id)
    if (found) return found
  }
  return null
}

export function npcState(id) {
  return (save.npc[id] ||= { build: 2000 + (hashOf(id) % 40) * 900, workUntil: 0, celebrateUntil: 0, freed: false })
}

export const questState = (id) => save.quests[id]

export function questDef(id) {
  for (const r of REGIONS) {
    const q = r.quests.find((x) => x.id === id)
    if (q) return { ...q, region: r.id }
  }
  return null
}

/** Quests this villager can hand out right now: prerequisites met, never taken. */
export function availableQuests(npc) {
  // Nobody hands work to an unregistered adventurer. The guild comes first.
  if (!save.guild.registered) return []
  const r = REGION_BY_ID[npc.region]
  return r.quests
    .filter((q) => q.giver === npc.key && !save.quests[q.id] && (q.requires || []).every((id) => save.quests[id]?.state === 'done'))
    .map((q) => ({ ...q, region: r.id }))
}

/** Active quests this villager gave, whose objective is met — ready to hand in. */
export function readyToTurnIn(npc) {
  const r = REGION_BY_ID[npc.region]
  return r.quests
    .filter((q) => q.giver === npc.key && save.quests[q.id]?.state === 'active' && questComplete(q))
    .map((q) => ({ ...q, region: r.id }))
}

export function questComplete(q) {
  const s = save.quests[q.id]
  if (!s) return false
  if (q.type === 'hunt' || q.type === 'gather') return s.progress >= q.count
  if (q.type === 'rescue') return s.progress >= 1
  if (q.type === 'boss') return s.progress >= 1
  if (q.type === 'build') return s.progress >= 1
  return false
}

export function activeQuests() {
  return Object.entries(save.quests)
    .filter(([, s]) => s.state === 'active')
    .map(([id]) => questDef(id))
    .filter(Boolean)
}

export function regionComplete(r = region()) {
  return r.quests.every((q) => save.quests[q.id]?.state === 'done')
}

// ── the colony's view of all this ───────────────────────────────────────────────────

// ── guild, partners, base ───────────────────────────────────────────────────────────

export const guildRank = () => rankOf(save.guild.points)

/** Add guild points; returns the new rank if it went up, else null. */
export function addGuildPoints(n) {
  const before = guildRank()
  save.guild.points += n
  const after = guildRank()
  persist()
  return after !== before ? after : null
}

export function partnerDef(id) {
  if (id === PET_ID && save.pet?.stage >= 2) {
    const st = PET_STAGES[2]
    return { key: 'pet', id, name: save.pet.name, cls: st.cls, color: st.color, power: st.atk, village: 'the Forbidden Forest', region: 'forest' }
  }
  for (const p of PARTNERS) if (npcId(p.region, p.key) === id) return { ...p, ...npcById(id), id }
  return null
}

export const isRecruited = (id) => save.partners.includes(id)
export const inParty = (id) => save.party.includes(id)
export const partySlots = () => 1 + save.base.barracks

/** A villager who would join you now: their favour is done and they are not yet with you. */
export function canRecruit(npc) {
  const p = partnerDef(npc.id)
  return Boolean(p && !isRecruited(npc.id) && save.quests[p.after]?.state === 'done')
}

export function recruit(id) {
  if (isRecruited(id)) return
  save.partners.push(id)
  if (save.party.length < partySlots()) save.party.push(id)
  persist()
}

export function toggleParty(id) {
  if (inParty(id)) save.party = save.party.filter((x) => x !== id)
  else if (save.party.length < partySlots()) save.party.push(id)
  else return false
  persist()
  return true
}

export function facilityLevel(id) {
  return save.base[id] || 0
}

export function facilityDef(id) {
  return FACILITIES.find((f) => f.id === id)
}

/** How built-up the camp is, as one number for the size of the hero's own house. */
function campSize() {
  const levels = Object.values(save.base).reduce((a, b) => a + b, 0)
  return Math.round(Math.pow(10, Math.min(6.5, 3.3 + save.hero.level * 0.1 + levels * 0.22)))
}

// ── the colony's view of all this ───────────────────────────────────────────────────

/** Whether the first roster has gone out. The hero walks out of the ship alone, first. */
let rosters = 0

/** What the game is doing that the save does not need to know: a dungeon run, for one. */
export const runtime = { dungeon: null }

export function worldThreads() {
  const now = Date.now()
  const r = region()
  const hero = {
    id: HERO_ID,
    title: `${save.name} — Lv ${save.hero.level} Hero`,
    preview: 'Summoned from another world.',
    project: CAMP,
    createdAt: now - 1000,
    lastActivityAt: now,
    sizeBytes: campSize(),
    harness: 'isekai',
    harnessName: 'Hero',
    canOpen: false,
  }
  // Nobody is on the map until the opening has played; then the hero comes out alone.
  if (!save.started) return []
  if (rosters++ === 0) return [hero]

  const list = [hero]
  // Partners live at your camp, whichever region you are in; in a dungeon, only the party.
  for (const id of save.partners) {
    if (runtime.dungeon && !inParty(id)) continue
    const p = partnerDef(id)
    if (!p) continue
    list.push({
      id,
      title: `${p.name} — ${p.cls}`,
      preview: p.cls,
      project: CAMP,
      createdAt: now - 86400000,
      lastActivityAt: now - 60000,
      sizeBytes: npcState(id).build,
      harness: 'isekai',
      harnessName: 'Partner',
      canOpen: false,
    })
  }
  // A beast that has evolved into human form is a member of the party for good.
  if (save.pet?.stage >= 2) {
    list.push({ id: PET_ID, title: `${save.pet.name} — ${PET_STAGES[2].cls}`, preview: 'Evolved companion', project: CAMP, createdAt: now - 1000, lastActivityAt: now, sizeBytes: 50000, harness: 'isekai', harnessName: 'Companion', canOpen: false })
  }
  if (runtime.dungeon) return list

  for (const npc of npcsOf(r)) {
    if (isRecruited(npc.id)) continue
    const st = npcState(npc.id)
    const rescue = r.quests.find((q) => q.type === 'rescue' && q.target === npc.key && save.quests[q.id]?.state === 'active')
    const cursed = rescue && !st.freed
    const hasQuest =
      availableQuests(npc).length > 0 || readyToTurnIn(npc).length > 0 || canRecruit(npc) || (npc.guild && !save.guild.registered)
    list.push({
      id: npc.id,
      title: `${npc.name} — ${npc.role}`,
      preview: npc.role,
      project: npc.village,
      createdAt: now - 86400000,
      lastActivityAt: now - 60000,
      sizeBytes: st.build,
      running: st.workUntil > now,
      prState: st.celebrateUntil > now ? 'MERGED' : '',
      unread: hasQuest || (rescue && st.freed),
      hasError: Boolean(cursed),
      harness: 'isekai',
      harnessName: 'Villager',
      canOpen: false,
    })
  }
  return list
}

export function resetRosters() {
  rosters = 0
}

function hashOf(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619)
  return h >>> 0
}
