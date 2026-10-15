import { ITEMS, MONSTERS, REGIONS, REGION_BY_ID, STORY } from './data.js'
import {
  addGuildPoints,
  availableQuests,
  canRecruit,
  inParty,
  npcState,
  partnerDef,
  partySlots,
  persist,
  questComplete,
  readyToTurnIn,
  recruit,
  save,
} from './world.js'
import { openMenu, openShop } from './menus.js'

/**
 * Talking to villagers. Whatever matters most comes first — a guild that has not met you,
 * a curse to lift, a quest to hand in, someone who wants to join you — and only then the
 * everyday menu of quests, shops and small talk.
 */

const CHATTER = {
  'Guild Receptionist': ['Slimes are worth more than they look. Their cores sell well!', 'Rank up and the guild will open the dungeon gates to you.'],
  'Village Elder': ['In my youth, heroes came through here every spring. You are the first in forty years.', 'The Demon Lord stirs. The goddess would not send you without reason.'],
  Blacksmith: ['A hammer is a fine weapon. Honest. Heavy. Hard to argue with.', 'Bring gold, and I’ll make you something worth swinging.'],
  Herbalist: ['Moonpetals glow at night. Easier to find then!', 'Potions taste awful. That is how you know they work.'],
  'Magic Shop': ['Mana is like a muscle. Spend it, and it grows back stronger.', 'A grimoire is only as wise as the hand that opens it.'],
}
const INN = [
  'Rooms are upstairs. Clean sheets, no slimes. Mostly.',
  'Adventurers come through here with the strangest stories. Yours might be the strangest yet.',
]
const GENERIC = [
  'Another world, you say? Ha! And I’m the queen of the fairies.',
  'Be careful out there. The slimes have been bolder lately.',
  'If you are tired, rest at your camp. That Item Box trick of yours is amazing.',
  'They say the guild has a dungeon gate open to strong adventurers.',
]

export function talk(game, npc) {
  const ui = game.ui
  const r = REGION_BY_ID[npc.region]
  const say = (text, choices) => ui.dialog({ name: npc.name, role: npc.role, text: text.replaceAll('{name}', save.name), choices })

  // The guild first: nobody gets work without a card.
  if (npc.guild && !save.guild.registered) return registration(game, npc, say)

  // A villager you were sent to rescue.
  const withRegion = (q) => q && { ...q, region: r.id }
  const rescue = withRegion(r.quests.find((q) => q.type === 'rescue' && q.target === npc.key && save.quests[q.id]?.state === 'active' && !questComplete(q)))
  if (rescue) {
    if (!npcState(npc.id).freed) {
      return say('...Ngh... (They are cursed and barely conscious. The monsters around them must be defeated first.)', [{ label: 'Hang on!', primary: true }])
    }
    return say('The curse... it’s gone? You saved me! Thank you, thank you! Please tell the others I’m safe!', [
      {
        label: 'You’re welcome',
        primary: true,
        fn: () => {
          save.quests[rescue.id].progress = 1
          npcState(npc.id).celebrateUntil = Date.now() + 15000
          game._checkQuest(rescue)
        },
      },
    ])
  }

  // A finished favour, to hand in.
  const ready = readyToTurnIn(npc)[0]
  if (ready) return turnIn(game, npc, ready, say)

  // A build you agreed to fund but have not paid for yet.
  const unpaid = withRegion(r.quests.find((q) => q.type === 'build' && q.giver === npc.key && save.quests[q.id]?.state === 'active' && !questComplete(q)))
  if (unpaid) return donate(game, npc, unpaid, say)

  // Someone you helped, who wants to come along.
  if (canRecruit(npc)) {
    const p = partnerDef(npc.id)
    return say(`${p.line} (${p.cls} wants to join your party.)`, [
      {
        label: 'Welcome aboard!',
        primary: true,
        fn: () => {
          recruit(npc.id)
          game.sfx.quest()
          ui.banner(`${npc.name} joined!`, `${p.cls} · ${inParty(npc.id) ? 'now in your party' : `party full (${partySlots()} slots) — waiting at your base`}`)
          game.refresh()
        },
      },
      { label: 'Not yet' },
    ])
  }

  // The everyday menu.
  const offer = availableQuests(npc)[0]
  const choices = []
  if (offer) choices.push({ label: `❗ ${offer.title}`, primary: true, fn: () => offerQuest(game, npc, offer, say) })
  if (npc.inn) choices.push({ label: '🛏 Rent a room (20 G)', fn: () => game.sleep() })
  if (npc.shop) choices.push({ label: npc.shop === 'smith' ? '\u{1F528} Forge' : npc.shop === 'magic' ? '\u{1F52E} Spells' : '\u{1F9EA} Potions', fn: () => openShop(game, npc.shop, npc) })
  if (npc.guild) {
    choices.push({ label: '\u{1F4C7} Guild Card', fn: () => openMenu(game, 'guild') })
    choices.push({ label: '\u{1F3F0} Dungeons', fn: () => openMenu(game, 'map') })
  }
  // Classmates remember who you were — until they see what you have become.
  const own = npc.lines ? npc.lines[save.evo >= 1 || save.hero.level >= 6 ? 1 : 0] : null
  choices.push({ label: 'Chat', fn: () => say(own || pick(CHATTER[npc.role] || (npc.inn ? INN : GENERIC)), [{ label: 'Bye' }]) })
  choices.push({ label: 'Bye' })
  const hello = offer ? 'Oh, adventurer! I could really use your help.' : npc.inn ? 'Welcome to the inn! A warm bed and a hot meal, twenty gold.' : npc.shop ? 'Welcome, welcome! Take a look.' : own || pick(GENERIC)
  say(hello, choices)
}

function registration(game, npc, say) {
  const { ui, fx, sfx } = game
  say('Welcome to the Adventurers’ Guild! Ah — a new face. Strange clothes, too. Would you like to register as an adventurer?', [
    {
      label: 'Yes, register me',
      primary: true,
      fn: () =>
        say('Wonderful! Please place your hand on this Measuring Crystal. It reads your mana and your skills.', [
          {
            label: '✋ Touch the crystal',
            primary: true,
            fn: () => {
              const p = game.hero.pos
              fx.aura(p, 0x7fd8ff)
              fx.spark(p.x, p.y + 1, p.z, { r: 0.6, g: 0.9, b: 1 }, 50, 4, 1.2, 0.12)
              sfx.thunder()
              game.rig.shake(0.7)
              setTimeout(
                () =>
                  say('W-what?! The crystal... it CRACKED?! Your mana is off the scale! And these skills — Appraisal? Item Box?! Those are legendary! Who ARE you?!', [
                    {
                      label: 'Just a guy who got hit by a truck',
                      primary: true,
                      fn: () =>
                        say('...A what? Ahem! Rules are rules: everyone starts at Rank F, no matter how ridiculous their mana is. Here is your Guild Card!', [
                          {
                            label: 'Take the Guild Card',
                            primary: true,
                            fn: () => {
                              save.guild.registered = true
                              persist()
                              sfx.quest()
                              ui.banner('Guild Card Issued', `${save.name} · Rank F Adventurer`)
                              game.refresh()
                              setTimeout(() => talk(game, npc), 2300)
                            },
                          },
                        ]),
                    },
                  ]),
                900
              )
            },
          },
        ]),
    },
    { label: 'Maybe later' },
  ])
}

function offerQuest(game, npc, q, say) {
  let detail = ''
  if (q.type === 'hunt') detail = `Defeat ${q.count} ${q.target ? MONSTERS[q.target].name + 's' : 'monsters'}.`
  if (q.type === 'gather') detail = `Collect ${q.count} glowing herbs (they show on your minimap).`
  if (q.type === 'rescue') detail = 'Defeat the monsters around them, then speak to them.'
  if (q.type === 'build') detail = `Donate ${q.cost} G.`
  if (q.type === 'boss') detail = `Defeat ${MONSTERS[q.target].name}.`
  const reward = [q.reward.xp && `${q.reward.xp} XP`, q.reward.gold && `${q.reward.gold} G`, q.reward.item && `${q.reward.qty}× ${ITEMS[q.reward.item].name}`]
    .filter(Boolean)
    .join(' · ')
  say(`${q.text}  [${detail} Reward: ${reward}]`, [
    {
      label: 'Accept',
      primary: true,
      fn: () => {
        save.quests[q.id] = { state: 'active', progress: 0 }
        persist()
        game.sfx.quest()
        game.ui.banner('Quest Accepted', q.title)
        game.refresh()
        if (q.type === 'build') setTimeout(() => talk(game, npc), 600)
      },
    },
    { label: 'Not now' },
  ])
}

function donate(game, npc, q, say) {
  const enough = save.hero.gold >= q.cost
  say(enough ? `Will you donate the ${q.cost} gold now?` : `We still need ${q.cost} gold. You have ${save.hero.gold}. Monsters drop gold — and the guild pays well!`, [
    {
      label: `Donate ${q.cost} G`,
      primary: true,
      disabled: !enough,
      fn: () => {
        save.hero.gold -= q.cost
        save.stats.donated += q.cost
        save.quests[q.id].progress = 1
        const st = npcState(npc.id)
        st.workUntil = Date.now() + 25000
        st.build = Math.min(3e6, st.build * 6 + 60000)
        game.sfx.coin()
        game.ui.banner('Construction begins!', 'Come back to see it finished')
        persist()
        game.refresh()
        setTimeout(() => game.refresh(), 26000)
      },
    },
    { label: 'Later' },
  ])
}

function turnIn(game, npc, q, say) {
  const thanks = q.type === 'boss' ? 'You actually did it! The whole land owes you its life!' : q.type === 'build' ? 'It’s finished! Look at it! Thank you, truly.' : 'You did it! Here, as promised.'
  say(thanks, [
    {
      label: 'Claim reward',
      primary: true,
      fn: () => {
        const r = REGION_BY_ID[q.region]
        save.quests[q.id].state = 'done'
        save.hero.gold += q.reward.gold || 0
        if (q.reward.item) save.hero.items[q.reward.item] = (save.hero.items[q.reward.item] || 0) + q.reward.qty
        const st = npcState(npc.id)
        st.celebrateUntil = Date.now() + 20000
        st.build = Math.min(3e6, st.build * 2.2)
        const up = addGuildPoints(10 * r.chapter + (q.type === 'boss' ? 30 * r.chapter : 0))
        game.sfx.coin()
        game.ui.banner('Quest Complete!', `+${q.reward.xp} XP · +${q.reward.gold || 0} G`)
        game.xp(q.reward.xp)
        if (up) setTimeout(() => game.ui.banner(`Guild Rank ${up}!`, 'New dungeons may be open to you'), 2800)
        persist()
        game.refresh()
        setTimeout(() => game.refresh(), 21000)
        if (r.quests.every((x) => save.quests[x.id]?.state === 'done')) clearRegion(game, r)
        else if (canRecruit(npc) || availableQuests(npc).length) setTimeout(() => talk(game, npc), 1200)
      },
    },
  ])
}

function clearRegion(game, r) {
  if (!save.cleared.includes(r.id)) save.cleared.push(r.id)
  const next = REGIONS.find((x) => x.chapter === r.chapter + 1)
  if (next && !save.unlocked.includes(next.id)) save.unlocked.push(next.id)
  persist()
  setTimeout(() => {
    game.ui.banner(`Chapter ${r.chapter} Clear!`, next ? `${next.name} unlocked — use the Travel Gate` : '')
    game.sfx.levelUp()
    const story = STORY[r.id]?.clear
    if (story) setTimeout(() => game.narrate(story), 2600)
  }, 3000)
}

const pick = (list) => list[Math.floor(Math.random() * list.length)]
