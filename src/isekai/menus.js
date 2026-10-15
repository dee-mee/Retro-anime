import { STAVES, FRUITS, DUNGEONS, FACILITIES, GRIMOIRES, ITEMS, MONSTERS, RANKS, REGIONS, REGION_BY_ID, SKILLS, SMITH_UPGRADES, rankIndex } from './data.js'
import {
  CAMP,
  activeQuests,
  armorName,
  guildRank,
  heroStats,
  inParty,
  npcById,
  npcState,
  partnerDef,
  partySlots,
  persist,
  questComplete,
  region,
  resetSave,
  freezeSaves,
  runtime,
  save,
  titles,
  toggleParty,
  weaponName,
} from './world.js'
import { esc } from './ui.js'
import { applyPhonePreset } from './index.js'

/** The windows behind the menu buttons, and the shops behind the shopkeepers. */

export function openMenu(game, id) {
  const fn = MENUS[id]
  if (fn) fn(game)
}

const row = (label, value) => `<div class="row"><span>${esc(label)}</span><b>${value}</b></div>`

const MENUS = {
  status(game) {
    const s = heroStats()
    const h = save.hero
    const spells = SKILLS.filter((k) => save.skills.includes(k.id)).map((k) => `${k.icon} ${k.name}`)
    game.ui.openWindow(
      'STATUS',
      `
      <div class="grid">
        ${row('Name', esc(save.name))}
        ${row('Race', esc(s.race) + (save.evo ? ` (${save.evo} 🌟)` : ''))}
        ${row('Class', 'Hero')}
        ${row('Level', h.level)}
        ${row('HP', `${Math.ceil(h.hp)} / ${s.maxHp}`)}
        ${row('MP', `${Math.ceil(h.mp)} / ${s.maxMp}`)}
        ${row('Attack', s.atk)}
        ${row('Defense', s.def)}
        ${row('Intelligence', s.int)}
        ${row('Agility', s.agi)}
        ${row('Experience', `${h.xp} / ${s.next}`)}
        ${row('Guild rank', save.guild.registered ? guildRank() : 'Unregistered')}
      </div>
      <div class="sec">EQUIPMENT</div>
      <div class="grid">${row('Weapon', esc(weaponName()))}${row('Armor', esc(armorName()))}</div>
      ${save.staff ? `<div style="display:flex;justify-content:center;margin-top:6px"><button type="button" class="act" data-swap>${save.weapon === 'staff' ? '⚔️ Hold your sword' : '🪄 Hold your staff'}</button></div>` : ''}
      <div class="sec">UNIQUE SKILLS</div>
      <div class="grid">${row('Appraisal', 'Lv MAX')}${row('Item Box', '∞')}${row('Language Comprehension', '✔')}${row('Goddess’ Favor', '✔')}</div>
      <div class="sec">MAGIC</div>
      <div>${spells.map(esc).join(' · ') || '—'}${save.grimoire ? ` · ${esc(GRIMOIRES[save.grimoire - 1].name)} (+${save.grimoire * 15}% spell power)` : ''}</div>
      <div class="sec">TITLES</div>
      <div>${titles().map(esc).join(' · ')}</div>
      <div class="sec">BAG</div>
      <div class="grid">${Object.entries(ITEMS)
        .map(([id, it]) => `<div class="item"><span>${it.icon}</span><div class="grow">${esc(it.name)}<small>×${save.hero.items[id] || 0}</small></div><button type="button" class="act" data-use="${id}" ${save.hero.items[id] ? '' : 'disabled'}>Use</button></div>`)
        .join('')}</div>
      <div class="sec">FRUIT</div>
      <div class="grid">${
        Object.entries(FRUITS)
          .filter(([id]) => save.fruits[id] > 0)
          .map(([id, f]) => `<div class="item"><span>${f.icon}</span><div class="grow">${esc(f.name)} ×${save.fruits[id]}<small>${esc(f.desc)}</small></div><button type="button" class="act primary" data-eat="${id}">Eat</button>${game.story.pet ? `<button type="button" class="act" data-feed="${id}">Feed</button>` : ''}</div>`)
          .join('') || '<div class="muted">No fruit. It grows in the forests — look for the glow.</div>'
      }</div>`,
      (root) => {
        root.querySelector('[data-swap]')?.addEventListener('click', () => {
          save.weapon = save.weapon === 'staff' ? 'sword' : 'staff'
          persist()
          MENUS.status(game)
        })
        root.querySelectorAll('[data-eat]').forEach((b) =>
          b.addEventListener('click', () => {
            game.ui.closeWindow()
            game.story.eat(b.dataset.eat)
          })
        )
        root.querySelectorAll('[data-feed]').forEach((b) =>
          b.addEventListener('click', () => {
            game.ui.closeWindow()
            game.story.feed(b.dataset.feed)
          })
        )
        root.querySelectorAll('[data-use]').forEach((b) =>
          b.addEventListener('click', () => {
            if (game.useItem(b.dataset.use)) MENUS.status(game)
          })
        )
      }
    )
  },

  quests(game) {
    const active = activeQuests()
    const done = Object.values(save.quests).filter((q) => q.state === 'done').length
    const html = active.length
      ? active
          .map((q) => {
            const st = save.quests[q.id]
            const giver = npcById(`npc:${q.region}:${q.giver}`)
            const prog =
              q.type === 'hunt' || q.type === 'gather'
                ? `${st.progress} / ${q.count}`
                : q.type === 'boss'
                  ? MONSTERS[q.target].name
                  : q.type === 'build'
                    ? `${q.cost} G`
                    : npcState(`npc:${q.region}:${q.target}`).freed
                      ? 'Freed'
                      : 'Cursed'
            return `<div class="item ${questComplete(q) ? 'cleared' : ''}"><div class="grow"><b>${esc(q.title)}</b><small>${esc(REGION_BY_ID[q.region].name)} · from ${esc(giver?.name)} · ${esc(prog)}${questComplete(q) ? ' · ✔ report back' : ''}</small><small>${esc(q.text)}</small></div></div>`
          })
          .join('')
      : `<div class="muted">No active quests. Villagers with a <b style="color:var(--xp)">!</b> over their heads need help.</div>`
    game.ui.openWindow('QUEST LOG', `${html}<div class="muted">${done} quest${done === 1 ? '' : 's'} completed</div>`)
  },

  party(game) {
    const slots = partySlots()
    const list = save.partners
      .map((id) => {
        const p = partnerDef(id)
        if (!p) return ''
        const live = game.partners.get(id)
        const hp = live ? ` · HP ${Math.max(0, Math.round(live.hp))}/${live.maxHp}` : ''
        return `<div class="item ${inParty(id) ? 'here' : ''}"><div class="grow"><b>${esc(p.name)}</b><small>${esc(p.cls)} · from ${esc(p.village)}${hp}</small></div><button type="button" class="act ${inParty(id) ? '' : 'primary'}" data-p="${id}">${inParty(id) ? 'Send to base' : 'Join party'}</button></div>`
      })
      .join('')
    game.ui.openWindow(
      'PARTY',
      `<div class="muted" style="padding-top:0">${save.party.length} / ${slots} party slots · more slots: upgrade the Party Barracks at your base</div>
       ${list || '<div class="muted">No partners yet. Help the people you meet — some of them will want to join you.</div>'}`,
      (root) =>
        root.querySelectorAll('[data-p]').forEach((b) =>
          b.addEventListener('click', () => {
            if (!toggleParty(b.dataset.p)) game.ui.toast('Party is full — upgrade your barracks')
            game.refresh()
            MENUS.party(game)
          })
        )
    )
  },

  base(game) {
    const atCamp = game.hero && game.realm.inCamp(game.hero.pos.x, game.hero.pos.z)
    const list = FACILITIES.map((f) => {
      const lvl = save.base[f.id]
      const max = f.costs.length
      const cost = f.costs[lvl]
      const name = f.levels[lvl] || f.levels[f.levels.length - 1]
      return `<div class="item"><span style="font-size:20px">${f.icon}</span><div class="grow"><b>${esc(f.name)}</b> · ${esc(name)}<small>${esc(f.desc)}</small></div>${
        lvl >= max ? '<b style="color:var(--good)">MAX</b>' : `<button type="button" class="act primary" data-f="${f.id}" ${save.hero.gold >= cost ? '' : 'disabled'}>Build · ${cost} G</button>`
      }</div>`
    }).join('')
    game.ui.openWindow(
      'YOUR BASE',
      `<div class="muted" style="padding-top:0">${esc(CAMP)} — it travels with you in your Item Box. ${atCamp ? '' : 'Rest is only possible at the camp itself.'}</div>
       <div style="display:flex;justify-content:center;margin-bottom:8px"><button type="button" class="act primary" data-rest ${atCamp ? '' : 'disabled'}>\u{1F6CF} Rest (full HP &amp; MP)</button></div>
       ${list}`,
      (root) => {
        root.querySelector('[data-rest]').addEventListener('click', () => {
          const s = heroStats()
          save.hero.hp = s.maxHp
          save.hero.mp = s.maxMp
          for (const p of game.partners.values()) p.hp = p.maxHp
          game.sfx.heal()
          game.ui.closeWindow()
          game.ui.banner('Well rested', 'HP and MP fully restored')
          persist()
        })
        root.querySelectorAll('[data-f]').forEach((b) =>
          b.addEventListener('click', () => {
            const f = FACILITIES.find((x) => x.id === b.dataset.f)
            const cost = f.costs[save.base[f.id]]
            if (save.hero.gold < cost) return
            save.hero.gold -= cost
            save.base[f.id]++
            game.sfx.coin()
            game.ui.toast(`${f.name} upgraded to ${f.levels[save.base[f.id]]}`)
            persist()
            game.realm.build()
            game.refresh()
            MENUS.base(game)
          })
        )
      }
    )
  },

  map(game) {
    const inDungeon = Boolean(runtime.dungeon)
    const regions = REGIONS.map((r) => {
      const open = save.unlocked.includes(r.id)
      const here = !inDungeon && r.id === save.region
      const cleared = save.cleared.includes(r.id)
      return `<div class="item ${open ? '' : 'locked'} ${here ? 'here' : cleared ? 'cleared' : ''}"><div class="grow"><b>Ch.${r.chapter} · ${esc(r.name)}</b><small>${esc(open ? r.blurb : 'Clear the previous chapter to unlock')}</small></div>${
        here ? '<b style="color:var(--sys)">HERE</b>' : open && !inDungeon ? `<button type="button" class="act primary" data-go="${r.id}">Travel</button>` : ''
      }</div>`
    }).join('')
    const rank = save.guild.registered ? rankIndex(guildRank()) : -1
    const dungeons = DUNGEONS.filter((d) => save.unlocked.includes(d.region))
      .map((d) => {
        const ok = rank >= rankIndex(d.rank) && save.hero.level >= d.level
        const why = rank < 0 ? 'Register at the guild first' : rank < rankIndex(d.rank) ? `Needs guild rank ${d.rank}` : save.hero.level < d.level ? `Needs Lv ${d.level}` : `Rank ${d.rank} · Lv ${d.level}+ · ${d.waves.length} waves + guardian`
        const clears = save.dungeons[d.id] || 0
        return `<div class="item ${ok ? '' : 'locked'} ${clears ? 'cleared' : ''}"><div class="grow"><b>\u{1F3F0} ${esc(d.name)}</b><small>${esc(REGION_BY_ID[d.region].name)} · ${esc(why)}${clears ? ` · cleared ×${clears}` : ''}</small></div>${
          ok && !inDungeon ? `<button type="button" class="act primary" data-dg="${d.id}">Enter</button>` : ''
        }</div>`
      })
      .join('')
    game.ui.openWindow(
      'WORLD MAP',
      `${inDungeon ? `<div style="display:flex;justify-content:center;margin-bottom:8px"><button type="button" class="act primary" data-leave>Leave the dungeon</button></div>` : ''}
       <div class="sec" style="margin-top:0">REGIONS</div>${regions}
       <div class="sec">DUNGEON GATES</div>${dungeons || '<div class="muted">No gates found yet.</div>'}`,
      (root) => {
        root.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => game.travel(b.dataset.go)))
        root.querySelectorAll('[data-dg]').forEach((b) => b.addEventListener('click', () => game.enterDungeon(b.dataset.dg)))
        root.querySelector('[data-leave]')?.addEventListener('click', () => {
          game.ui.closeWindow()
          game.leaveDungeon()
        })
      }
    )
  },

  guild(game) {
    const rank = guildRank()
    const next = RANKS[rankIndex(rank) + 1]
    const done = Object.values(save.quests).filter((q) => q.state === 'done').length
    game.ui.openWindow(
      'GUILD CARD',
      `<div class="item here" style="padding:14px"><div class="grow">
         <div style="font-size:18px;font-weight:800">${esc(save.name)}</div>
         <small>Adventurers’ Guild of Altheria · Registered Otherworlder</small>
       </div><div style="font-size:40px;font-weight:900;color:var(--xp);text-shadow:0 0 14px rgba(255,215,90,.5)">${rank}</div></div>
       <div class="grid">
         ${row('Guild points', save.guild.points)}
         ${row('Next rank', next ? `${next.rank} at ${next.points}` : 'Highest rank')}
         ${row('Quests completed', done)}
         ${row('Dungeons cleared', save.stats.dungeons)}
         ${row('Monsters defeated', save.stats.kills)}
         ${row('Bosses defeated', save.stats.bosses)}
         ${row('Gold donated', save.stats.donated)}
         ${row('Times fallen', save.stats.deaths)}
       </div>
       <div class="sec">TITLES</div><div>${titles().map(esc).join(' · ')}</div>`
    )
  },

  settings(game) {
    const preset = game.settings.get('preset')
    const sound = game.settings.get('sound')
    game.ui.openWindow(
      'SETTINGS',
      `<div class="sec" style="margin-top:0">ART STYLE</div>
       <div class="seg">${[
         ['ink', 'Retro anime'],
         ['cel', 'Cel shading only'],
         ['off', 'Original'],
       ]
         .map(([v, l]) => `<button type="button" data-look="${v}" class="${game.settings.get('animeLook') === v ? 'on' : ''}">${l}</button>`)
         .join('')}</div>
       <div class="muted" style="text-align:left">Retro anime adds ink outlines and an old-film colour grade. Switching shading on or off restarts the game (your progress is kept).</div>
       <div class="sec">GRAPHICS</div>
       <div class="seg">${['phone', 'potato', 'low', 'balanced', 'high']
         .map((p) => `<button type="button" data-q="${p}" class="${preset === p ? 'on' : ''}">${p === 'phone' ? 'Phone (fastest)' : p[0].toUpperCase() + p.slice(1)}</button>`)
         .join('')}</div>
       <div class="muted" style="text-align:left">Lower settings save battery and keep the frame rate smooth on older phones.</div>
       <div class="sec">SOUND</div>
       <div class="seg"><button type="button" data-s="1" class="${sound ? 'on' : ''}">On</button><button type="button" data-s="0" class="${sound ? '' : 'on'}">Off</button></div>
       <div class="sec">CONTROLS</div>
       <div class="muted" style="text-align:left">Left side: move with the joystick. Right side: drag to turn the camera, pinch to zoom. Hold \u{1F528} to keep attacking.<br/>Keyboard: WASD move · J/Space attack · 1–4 spells · Shift dash · Q potion · E talk.</div>
       <div class="sec">SAVE</div>
       <div class="muted" style="text-align:left;padding-top:0">Your progress saves itself on this phone. Uninstalling the app erases it, so keep a backup code somewhere safe (a note, a message to yourself).</div>
       <div class="seg"><button type="button" data-backup>Copy backup code</button><button type="button" data-restore>Restore from code…</button><button type="button" data-reset>Start a new game…</button></div>
       <textarea class="ik-code" rows="3" style="display:none"></textarea>
       <div class="seg" data-restore-go style="display:none;margin-top:6px"><button type="button" class="on">Load this save</button></div>`,
      (root) => {
        root.querySelectorAll('[data-q]').forEach((b) =>
          b.addEventListener('click', () => {
            if (b.dataset.q === 'phone') applyPhonePreset(game.settings)
            else game.settings.applyPreset(b.dataset.q)
            MENUS.settings(game)
          })
        )
        root.querySelectorAll('[data-look]').forEach((b) =>
          b.addEventListener('click', () => {
            const before = game.settings.get('animeLook')
            const next = b.dataset.look
            if (before === next) return
            game.settings.set('animeLook', next)
            // Cel bands live in the compiled shaders: going to or from "off" needs a fresh start.
            if (before === 'off' || next === 'off') {
              persist(true)
              setTimeout(() => location.reload(), 500)
              return
            }
            game.applyLook()
            MENUS.settings(game)
          })
        )
        root.querySelectorAll('[data-s]').forEach((b) =>
          b.addEventListener('click', () => {
            game.settings.set('sound', b.dataset.s === '1')
            MENUS.settings(game)
          })
        )
        const code = root.querySelector('.ik-code')
        root.querySelector('[data-backup]').addEventListener('click', async () => {
          persist(true)
          const raw = localStorage.getItem('isekai.save.v1') || JSON.stringify(save)
          code.value = 'OWC1:' + btoa(unescape(encodeURIComponent(raw)))
          code.style.display = 'block'
          code.select()
          try {
            await navigator.clipboard.writeText(code.value)
            game.ui.toast('Backup code copied')
          } catch {
            game.ui.toast('Select the code and copy it')
          }
        })
        root.querySelector('[data-restore]').addEventListener('click', () => {
          code.value = ''
          code.placeholder = 'Paste your backup code here'
          code.style.display = 'block'
          root.querySelector('[data-restore-go]').style.display = 'flex'
          code.focus()
        })
        root.querySelector('[data-restore-go] button').addEventListener('click', () => {
          try {
            const text = code.value.trim().replace(/^OWC1:/, '')
            const json = decodeURIComponent(escape(atob(text)))
            const data = JSON.parse(json)
            if (!data || !data.hero || typeof data.hero.level !== 'number') throw new Error('not a save')
            freezeSaves()
            localStorage.setItem('isekai.save.v1', json)
            game.ui.toast('Save restored — restarting')
            setTimeout(() => location.reload(), 600)
          } catch {
            game.ui.toast('That code is not a valid save')
          }
        })
        const reset = root.querySelector('[data-reset]')
        reset.addEventListener('click', () => {
          if (reset.dataset.armed) {
            resetSave()
            location.reload()
            return
          }
          reset.dataset.armed = '1'
          reset.textContent = 'Tap again to erase your save'
          reset.classList.add('on')
        })
      }
    )
  },
}

// ── shops ─────────────────────────────────────────────────────────────────────────────

export function openShop(game, kind, npc) {
  const gold = `<div class="muted" style="padding-top:0">You have <b style="color:var(--gold)">${save.hero.gold.toLocaleString()} G</b></div>`
  const again = () => openShop(game, kind, npc)
  const buy = (cost, fn) => {
    if (save.hero.gold < cost) return game.ui.toast('Not enough gold')
    save.hero.gold -= cost
    fn()
    game.sfx.coin()
    persist()
    again()
  }

  if (kind === 'smith') {
    const i = save.hero.smith
    const list = SMITH_UPGRADES.map((u, k) => {
      const state = k < i ? 'owned' : k === i ? 'next' : 'later'
      return `<div class="item ${state === 'owned' ? 'cleared' : state === 'later' ? 'locked' : ''}"><div class="grow"><b>${esc(u.name)}</b><small>${u.atk ? `+${u.atk} attack` : `+${u.def} defense`}</small></div>${
        state === 'owned' ? '<b style="color:var(--good)">OWNED</b>' : state === 'next' ? `<button type="button" class="act primary" data-buy ${save.hero.gold >= u.cost ? '' : 'disabled'}>${u.cost} G</button>` : `<small>${u.cost} G</small>`
      }</div>`
    }).join('')
    return game.ui.openWindow(`${npc.name.toUpperCase()} · FORGE`, gold + list, (root) =>
      root.querySelector('[data-buy]')?.addEventListener('click', () =>
        buy(SMITH_UPGRADES[i].cost, () => {
          save.hero.smith++
          game.ui.toast(`Equipped ${SMITH_UPGRADES[i].name}!`)
        })
      )
    )
  }

  if (kind === 'potions') {
    const list = Object.entries(ITEMS)
      .map(([id, it]) => `<div class="item"><span>${it.icon}</span><div class="grow"><b>${esc(it.name)}</b><small>Carrying ×${save.hero.items[id] || 0}</small></div><button type="button" class="act primary" data-item="${id}" ${save.hero.gold >= it.cost ? '' : 'disabled'}>${it.cost} G</button></div>`)
      .join('')
    return game.ui.openWindow(`${npc.name.toUpperCase()} · POTIONS`, gold + list, (root) =>
      root.querySelectorAll('[data-item]').forEach((b) =>
        b.addEventListener('click', () => {
          const id = b.dataset.item
          buy(ITEMS[id].cost, () => (save.hero.items[id] = (save.hero.items[id] || 0) + 1))
        })
      )
    )
  }

  // The magic shop: spells, then grimoires.
  const lvl = save.hero.level
  const spells = SKILLS.map((s) => {
    const owned = save.skills.includes(s.id)
    const can = lvl >= s.level
    return `<div class="item ${owned ? 'cleared' : can ? '' : 'locked'}"><span style="font-size:20px">${s.icon}</span><div class="grow"><b>${esc(s.name)}</b><small>${esc(s.desc)} · ${s.mp} MP</small></div>${
      owned ? '<b style="color:var(--good)">LEARNED</b>' : can ? `<button type="button" class="act primary" data-spell="${s.id}" ${save.hero.gold >= s.cost ? '' : 'disabled'}>Learn · ${s.cost} G</button>` : `<small>Lv ${s.level}</small>`
    }</div>`
  }).join('')
  const g = save.grimoire
  const grim = GRIMOIRES.map((b, k) => {
    const state = k < g ? 'owned' : k === g ? 'next' : 'later'
    const can = state === 'next' && lvl >= b.level
    return `<div class="item ${state === 'owned' ? 'cleared' : can ? '' : 'locked'}"><span style="font-size:20px">\u{1F4D6}</span><div class="grow"><b>${esc(b.name)}</b><small>+15% spell power · +10 max MP · Lv ${b.level}</small></div>${
      state === 'owned' ? '<b style="color:var(--good)">OWNED</b>' : can ? `<button type="button" class="act primary" data-grim ${save.hero.gold >= b.cost ? '' : 'disabled'}>${b.cost} G</button>` : `<small>${b.cost} G</small>`
    }</div>`
  }).join('')
  const staves = STAVES.map((st, k) => {
    const owned = k < save.staff
    const next = k === save.staff
    const can = next && lvl >= st.level
    return `<div class="item ${owned ? "cleared" : can ? "" : "locked"}"><span style="font-size:20px">🪄</span><div class="grow"><b>${esc(st.name)}</b><small>Basic attack becomes a magic bolt · +${Math.round(st.spell * 100)}% spell power · Lv ${st.level}</small></div>${owned ? "<b style=\"color:var(--good)\">OWNED</b>" : can ? `<button type="button" class="act primary" data-staff ${save.hero.gold >= st.cost ? "" : "disabled"}>${st.cost} G</button>` : `<small>${st.cost} G</small>`}</div>`
  }).join("")
  game.ui.openWindow(`${npc.name.toUpperCase()} · MAGIC`, `${gold}<div class="sec" style="margin-top:0">SPELLS</div>${spells}<div class="sec">STAVES</div>${staves}<div class="sec">GRIMOIRES</div>${grim}`, (root) => {
    root.querySelector("[data-staff]")?.addEventListener("click", () =>
      buy(STAVES[save.staff].cost, () => {
        save.staff++
        save.weapon = "staff"
        game.ui.banner("Staff equipped!", STAVES[save.staff - 1].name)
      })
    )
    root.querySelectorAll('[data-spell]').forEach((b) =>
      b.addEventListener('click', () => {
        const s = SKILLS.find((x) => x.id === b.dataset.spell)
        buy(s.cost, () => {
          save.skills.push(s.id)
          game.ui.banner('Spell Learned!', `${s.icon} ${s.name}`)
        })
      })
    )
    root.querySelector('[data-grim]')?.addEventListener('click', () =>
      buy(GRIMOIRES[g].cost, () => {
        save.grimoire++
        game.ui.toast(`${GRIMOIRES[g].name} acquired`)
      })
    )
  })
}

export { region }
