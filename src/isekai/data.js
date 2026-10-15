/**
 * Everything the isekai build is *about*: the regions of the other world, who lives there,
 * what they ask of you, and what is out in the grass trying to eat you.
 *
 * Each region is one of the colony's planets — the same terrain, sky and fauna, read as a
 * chapter of the story. Villages are zones, villagers are bots, and a villager's house grows
 * the way a thread's building does, from the same `sizeBytes` number.
 */

export const GAME_TITLE = 'Otherworld Colony'

/** Monster species. Stats are the chapter-one numbers; `tier` scales them per region. */
export const MONSTERS = {
  slime: { name: 'Slime', color: 0x7ee06e, size: 0.5, hp: 18, atk: 4, xp: 6, gold: 3, speed: 1.5 },
  aqua: { name: 'Aqua Slime', color: 0x5ab8f0, size: 0.55, hp: 26, atk: 6, xp: 9, gold: 5, speed: 1.8 },
  horned: { name: 'Horned Slime', color: 0xe0a64a, size: 0.62, hp: 34, atk: 8, xp: 12, gold: 7, speed: 1.7, horns: true },
  venom: { name: 'Venom Slime', color: 0xa45ee0, size: 0.58, hp: 44, atk: 10, xp: 16, gold: 9, speed: 1.9 },
  spore: { name: 'Sporeling', color: 0xe05e7a, size: 0.66, hp: 56, atk: 12, xp: 20, gold: 11, speed: 1.6, spikes: true },
  sand: { name: 'Dune Slime', color: 0xe8c66e, size: 0.62, hp: 70, atk: 15, xp: 26, gold: 14, speed: 2.0 },
  cactus: { name: 'Needle Slime', color: 0x5fae58, size: 0.72, hp: 88, atk: 18, xp: 32, gold: 17, speed: 1.6, spikes: true },
  frost: { name: 'Frost Slime', color: 0xbfe8ff, size: 0.66, hp: 110, atk: 22, xp: 40, gold: 21, speed: 1.9 },
  yeti: { name: 'Snow Brute', color: 0xf2f4f8, size: 0.85, hp: 140, atk: 27, xp: 50, gold: 26, speed: 1.7, horns: true },
  magma: { name: 'Magma Slime', color: 0xff6a2a, size: 0.7, hp: 170, atk: 32, xp: 62, gold: 32, speed: 2.0, glow: true },
  imp: { name: 'Lesser Demon', color: 0x5a2a6a, size: 0.75, hp: 210, atk: 38, xp: 78, gold: 40, speed: 2.3, horns: true, glow: true },

  // Ogres: walking brutes with a spiked club, deep in the forests.
  ogre: { name: 'Ogre', color: 0x7a9a5a, size: 1.1, hp: 260, atk: 19, xp: 75, gold: 45, speed: 1.5, shape: 'ogre' },
  ogre_chief: { name: 'Ogre Chieftain', color: 0x5a7a4a, size: 1.7, hp: 900, atk: 30, xp: 380, gold: 260, speed: 1.6, shape: 'ogre', crown: true, boss: true },

  // Bosses: one per region, summoned by the region's last quest.
  king_slime: { name: 'King Slime', color: 0x5fd45a, size: 1.9, hp: 320, atk: 12, xp: 150, gold: 120, speed: 1.3, crown: true, boss: true },
  hydra: { name: 'Venom Hydra', color: 0x8a3ec8, size: 2.0, hp: 700, atk: 22, xp: 320, gold: 240, speed: 1.5, horns: true, spikes: true, boss: true },
  wyrm: { name: 'Sandscale Wyrm', color: 0xd8a040, size: 2.2, hp: 1300, atk: 34, xp: 600, gold: 420, speed: 1.6, horns: true, boss: true },
  titan: { name: 'Frost Titan', color: 0x9fd8ff, size: 2.4, hp: 2200, atk: 46, xp: 1000, gold: 700, speed: 1.4, crown: true, spikes: true, boss: true },
  forest_lord: { name: 'The Forest Lord', color: 0x3a6a2a, size: 2.1, hp: 240, atk: 11, xp: 120, gold: 80, speed: 1.3, horns: true, spikes: true, boss: true },
  demon_lord: { name: 'Demon Lord Zarvok', color: 0x2a1030, size: 2.6, hp: 4000, atk: 62, xp: 2500, gold: 2000, speed: 1.8, horns: true, crown: true, glow: true, boss: true },
}

/**
 * The quest kinds:
 *  - hunt:   defeat `count` monsters of the region (any kind, or `target` species)
 *  - gather: pick up `count` glowing herbs scattered over the region
 *  - rescue: a villager is cursed; clear the monsters round them, then speak to them
 *  - build:  donate `cost` gold to a villager's house, and watch it go up
 *  - boss:   defeat the region's boss, which appears when the quest is taken
 */
export const REGIONS = [
  {
    id: 'forest',
    planet: 'jungle',
    chapter: 0,
    name: 'Forbidden Forest',
    blurb: 'Where the extra one was thrown away. Dense, dark, and full of glowing fruit.',
    monsters: ['slime', 'aqua', 'horned', 'venom'],
    boss: 'forest_lord',
    prologue: true,
    villages: [],
    quests: [],
  },
  {
    id: 'meadows',
    planet: 'terra',
    chapter: 1,
    name: 'Verdant Meadows',
    blurb: 'Where you woke up. Gentle hills, gentle slimes — mostly.',
    monsters: ['slime', 'slime', 'aqua', 'horned', 'ogre'],
    boss: 'king_slime',
    villages: [
      {
        name: 'Haru Village',
        npcs: [
          { key: 'mika', name: 'Mika', role: 'Guild Receptionist', guild: true },
          { key: 'genzo', name: 'Elder Genzo', role: 'Village Elder' },
          { key: 'tetsu', name: 'Tetsu', role: 'Blacksmith', shop: 'smith' },
          { key: 'hana', name: 'Hana', role: 'Herbalist', shop: 'potions' },
          { key: 'merla', name: 'Witch Merla', role: 'Magic Shop', shop: 'magic' },
        ],
      },
      {
        name: 'Mizuki Farm',
        npcs: [
          { key: 'daichi', name: 'Farmer Daichi', role: 'Farmer' },
          { key: 'yui', name: 'Yui', role: "Farmer's Daughter" },
          { key: 'kenta', name: 'Kenta', role: 'Shepherd' },
        ],
      },
      {
        name: 'Old Watchtower',
        npcs: [
          { key: 'ren', name: 'Ren', role: 'Tower Guard' },
          { key: 'sora', name: 'Sora', role: 'Wandering Bard' },
          { key: 'hikaru', name: 'Hikaru', role: 'Chosen Hero (Classmate)', lines: ['{name}?! You’re ALIVE? The goddess said the extra one was... never mind. Stay out of the way of the real heroes.', 'Your stats are... that can’t be right. The crystal must be broken.'] },
          { key: 'ayane', name: 'Ayane', role: 'Sage (Classmate)', lines: ['{name}! I knew it. I told everyone you couldn’t just vanish!', 'The others don’t understand you like I do. Be careful out there, okay?'] },
          { key: 'daigo', name: 'Daigo', role: 'Berserker (Classmate)', lines: ['Heh. The class ghost survived the forest? Bet you hid in a tree the whole time.', 'Wait — you took down WHAT? ...Whatever. Doesn’t mean anything.'] },
        ],
      },
    ],
    quests: [
      { id: 'm1', giver: 'mika', type: 'hunt', count: 5, title: 'Adventurer Registration', text: 'Welcome to the Adventurers’ Guild! To register, prove yourself: defeat 5 slimes in the meadows.', reward: { xp: 40, gold: 30 } },
      { id: 'm2', giver: 'hana', type: 'gather', count: 4, title: 'Moonpetal Herbs', text: 'My potion stock is empty. Could you bring me 4 glowing moonpetal herbs? They shine in the grass.', reward: { xp: 45, gold: 35, item: 'potion', qty: 2 } },
      { id: 'm3', giver: 'daichi', type: 'rescue', title: 'Yui Is Cursed!', text: 'Please! Monsters swarmed my daughter Yui and cursed her. Drive them off and wake her up!', target: 'yui', reward: { xp: 70, gold: 50 } },
      { id: 'm4', giver: 'genzo', type: 'build', cost: 60, target: 'genzo', title: 'Rebuild the Village Hall', text: 'The slime attacks wrecked our hall. If you could spare 60 gold, the village will rebuild it.', reward: { xp: 60, gold: 0 } },
      { id: 'm5', giver: 'ren', type: 'hunt', count: 8, target: 'horned', title: 'Horns at the Tower', text: 'Horned slimes keep ramming my tower. Take down 8 of them and I’ll owe you a drink.', reward: { xp: 90, gold: 60 } },
      { id: 'm7', giver: 'hikaru', type: 'hunt', count: 12, title: 'Not Dead Weight', text: 'You want to stand with the Heroes? Prove it. Twelve monsters, by sundown. Then we’ll talk.', requires: ['m1'], reward: { xp: 120, gold: 90 } },
      { id: 'm6', giver: 'mika', type: 'boss', target: 'king_slime', title: 'The King of Slimes', text: 'Emergency quest! A King Slime has appeared — it’s what’s been sending all these slimes. Defeat it, hero!', requires: ['m1', 'm2', 'm3', 'm4', 'm5'], reward: { xp: 200, gold: 150 } },
    ],
  },
  {
    id: 'jungle',
    planet: 'jungle',
    chapter: 2,
    name: 'Whispering Jungle',
    blurb: 'Thick canopy, strange spores, and something with too many heads.',
    monsters: ['venom', 'venom', 'spore', 'aqua', 'ogre'],
    boss: 'hydra',
    villages: [
      {
        name: 'Canopy Outpost',
        npcs: [
          { key: 'lyra', name: 'Lyra', role: 'Elf Ranger', guild: true },
          { key: 'bram', name: 'Bram', role: 'Dwarf Smith', shop: 'smith' },
          { key: 'pip', name: 'Pip', role: 'Potion Seller', shop: 'potions' },
          { key: 'oz', name: 'Sage Oz', role: 'Magic Shop', shop: 'magic' },
        ],
      },
      {
        name: 'Riverbend Hamlet',
        npcs: [
          { key: 'nami', name: 'Nami', role: 'Fisher' },
          { key: 'oro', name: 'Oro', role: 'Ferryman' },
          { key: 'chika', name: 'Chika', role: 'Shrine Maiden' },
        ],
      },
    ],
    quests: [
      { id: 'j1', giver: 'lyra', type: 'hunt', count: 8, title: 'Thin the Venom', text: 'Venom slimes are poisoning the river. Hunt 8 of them before the hamlet falls sick.', target: 'venom', reward: { xp: 160, gold: 90 } },
      { id: 'j2', giver: 'chika', type: 'gather', count: 6, title: 'Shrine Offerings', text: 'The shrine’s barrier is fading. Gather 6 spirit herbs so I can restore it.', reward: { xp: 170, gold: 100, item: 'ether', qty: 2 } },
      { id: 'j3', giver: 'nami', type: 'rescue', target: 'oro', title: 'The Ferryman’s Curse', text: 'Oro went to check the nets and never came back — he’s cursed and surrounded! Save him!', reward: { xp: 220, gold: 130 } },
      { id: 'j4', giver: 'nami', type: 'build', cost: 180, target: 'nami', title: 'New Fishing Docks', text: 'Help us build new docks? 180 gold would do it, and we’d name a boat after you.', reward: { xp: 180, gold: 0 } },
      { id: 'j5', giver: 'lyra', type: 'boss', target: 'hydra', title: 'Heads of the Hydra', text: 'The Venom Hydra has woken. Cut it down before the jungle dies.', requires: ['j1', 'j2', 'j3', 'j4'], reward: { xp: 500, gold: 300 } },
    ],
  },
  {
    id: 'desert',
    planet: 'desert',
    chapter: 3,
    name: 'Sunscar Dunes',
    blurb: 'Endless sand, a lost caravan, and a wyrm beneath it all.',
    monsters: ['sand', 'sand', 'cactus', 'horned', 'ogre'],
    boss: 'wyrm',
    villages: [
      {
        name: 'Oasis Bazaar',
        npcs: [
          { key: 'zahra', name: 'Zahra', role: 'Guild Master', guild: true },
          { key: 'kamal', name: 'Kamal', role: 'Weaponsmith', shop: 'smith' },
          { key: 'sefa', name: 'Sefa', role: 'Apothecary', shop: 'potions' },
          { key: 'azir', name: 'Jinn Azir', role: 'Magic Shop', shop: 'magic' },
        ],
      },
      {
        name: 'Caravan Rest',
        npcs: [
          { key: 'idris', name: 'Idris', role: 'Caravan Leader' },
          { key: 'mina', name: 'Mina', role: 'Camel Herder' },
          { key: 'tarek', name: 'Tarek', role: 'Treasure Hunter' },
        ],
      },
    ],
    quests: [
      { id: 'd1', giver: 'zahra', type: 'hunt', count: 10, title: 'Clear the Trade Road', text: 'No caravan has made it through in weeks. Clear 10 monsters off the road.', reward: { xp: 380, gold: 200 } },
      { id: 'd2', giver: 'idris', type: 'rescue', target: 'mina', title: 'Lost in the Dunes', text: 'Mina strayed from the caravan and the dune slimes got her. Bring her back to her senses!', reward: { xp: 450, gold: 240 } },
      { id: 'd3', giver: 'tarek', type: 'gather', count: 6, title: 'Sunstone Shards', text: 'Sunstones glow in the sand at dusk. Bring me 6 and I’ll split the profit.', reward: { xp: 420, gold: 260 } },
      { id: 'd4', giver: 'idris', type: 'build', cost: 400, target: 'idris', title: 'A Proper Caravanserai', text: 'With 400 gold we could build a real caravanserai. Travellers would bless your name.', reward: { xp: 400, gold: 0 } },
      { id: 'd5', giver: 'zahra', type: 'boss', target: 'wyrm', title: 'What Lies Beneath', text: 'The ground shakes. The Sandscale Wyrm is rising — end it.', requires: ['d1', 'd2', 'd3', 'd4'], reward: { xp: 900, gold: 600 } },
    ],
  },
  {
    id: 'tundra',
    planet: 'tundra',
    chapter: 4,
    name: 'Frostveil Peaks',
    blurb: 'A frozen kingdom under siege by the Demon Lord’s vanguard.',
    monsters: ['frost', 'frost', 'yeti', 'sand'],
    boss: 'titan',
    villages: [
      {
        name: 'Snowhold Keep',
        npcs: [
          { key: 'freya', name: 'Princess Freya', role: 'Knight Commander', guild: true },
          { key: 'olaf', name: 'Olaf', role: 'Royal Smith', shop: 'smith' },
          { key: 'ingrid', name: 'Ingrid', role: 'Court Alchemist', shop: 'potions' },
          { key: 'runa', name: 'Runa', role: 'Rune Scholar', shop: 'magic' },
        ],
      },
      {
        name: 'Pinewatch',
        npcs: [
          { key: 'sven', name: 'Sven', role: 'Hunter' },
          { key: 'elsa', name: 'Elsa', role: 'Ice Mage' },
          { key: 'bjorn', name: 'Bjorn', role: 'Woodcutter' },
        ],
      },
    ],
    quests: [
      { id: 't1', giver: 'freya', type: 'hunt', count: 12, title: 'Break the Vanguard', text: 'The Demon Lord’s beasts surround the keep. Defeat 12 and break their line!', reward: { xp: 800, gold: 420 } },
      { id: 't2', giver: 'sven', type: 'rescue', target: 'elsa', title: 'The Frozen Mage', text: 'Elsa tried to hold them back alone. She’s cursed — free her!', reward: { xp: 900, gold: 480 } },
      { id: 't3', giver: 'ingrid', type: 'gather', count: 8, title: 'Frostbloom', text: 'Frostbloom only grows out there among the monsters. I need 8 for the soldiers’ remedies.', reward: { xp: 850, gold: 450, item: 'elixir', qty: 1 } },
      { id: 't4', giver: 'bjorn', type: 'build', cost: 800, target: 'bjorn', title: 'Rebuild Pinewatch', text: 'They burned half the village. 800 gold and we can rebuild before the next storm.', reward: { xp: 800, gold: 0 } },
      { id: 't5', giver: 'freya', type: 'boss', target: 'titan', title: 'The Frost Titan', text: 'Their general, the Frost Titan, marches on the keep. Stand with us, hero!', requires: ['t1', 't2', 't3', 't4'], reward: { xp: 1800, gold: 1200 } },
    ],
  },
  {
    id: 'volcanic',
    planet: 'volcanic',
    chapter: 5,
    name: 'Demon Lord’s Domain',
    blurb: 'Ash, fire, and the throne of the one who brought you here.',
    monsters: ['magma', 'magma', 'imp', 'yeti'],
    boss: 'demon_lord',
    villages: [
      {
        name: 'Last Bastion',
        npcs: [
          { key: 'aria', name: 'Saint Aria', role: 'Hero’s Party Healer', guild: true },
          { key: 'gaius', name: 'Gaius', role: 'Legendary Smith', shop: 'smith' },
          { key: 'luna', name: 'Luna', role: 'Witch', shop: 'magic' },
          { key: 'mira', name: 'Mira', role: 'Field Medic', shop: 'potions' },
          { key: 'kaito', name: 'Kaito', role: 'Fellow Otherworlder' },
        ],
      },
    ],
    quests: [
      { id: 'v1', giver: 'aria', type: 'hunt', count: 15, title: 'Through the Ash', text: 'The path to the throne is crawling with demons. Clear 15 of them.', reward: { xp: 2000, gold: 900 } },
      { id: 'v2', giver: 'kaito', type: 'rescue', target: 'luna', title: 'The Witch’s Bargain', text: 'Luna sold her magic to the Demon Lord to save us. The curse is killing her — break it!', reward: { xp: 2200, gold: 1000 } },
      { id: 'v3', giver: 'aria', type: 'boss', target: 'demon_lord', title: 'The Demon Lord', text: 'This is it. The Demon Lord Zarvok awaits. The goddess believes in you — and so do I.', requires: ['v1', 'v2'], reward: { xp: 6000, gold: 5000 } },
    ],
  },
  {
    id: 'sanctuary',
    planet: 'sky',
    chapter: 6,
    name: 'Goddess Sanctuary',
    blurb: 'A floating island above the clouds. Peace, at last — a slow life.',
    monsters: ['aqua', 'slime'],
    boss: null,
    villages: [
      {
        name: 'Sky Garden',
        npcs: [
          { key: 'goddess', name: 'Goddess Celestia', role: 'Goddess of Reincarnation' },
          { key: 'mika2', name: 'Mika', role: 'Retired Receptionist', shop: 'potions' },
          { key: 'tetsu2', name: 'Tetsu', role: 'Sky Smith', shop: 'smith' },
        ],
      },
    ],
    quests: [
      { id: 's1', giver: 'goddess', type: 'build', cost: 3000, target: 'goddess', title: 'A Home in the Sky', text: 'You have saved this world. Will you stay? Build a home here — the sky garden is yours.', reward: { xp: 3000, gold: 0 } },
    ],
  },
]

export const REGION_BY_ID = Object.fromEntries(REGIONS.map((r) => [r.id, r]))

/** What the shops sell. Smith upgrades are bought in order; each one costs more. */
export const SMITH_UPGRADES = [
  { name: 'Iron Sword', atk: 4, cost: 40 },
  { name: 'Steel Longsword', atk: 8, cost: 120 },
  { name: 'Knight’s Plate', def: 6, cost: 200 },
  { name: 'Mithril Blade', atk: 14, cost: 450 },
  { name: 'Dragonscale Mail', def: 12, cost: 800 },
  { name: 'Runed Starblade', atk: 24, cost: 1500 },
  { name: 'Aegis of Dawn', def: 20, cost: 2600 },
  { name: 'Sword of the Morning Star', atk: 40, cost: 4500 },
]

/**
 * Staves, from the magic shops. Holding one makes your basic attack a bolt of magic that hits
 * from range, and boosts every spell; a sword hits harder up close. Swap in the status window.
 */
export const STAVES = [
  { name: 'Oak Staff', spell: 0.15, level: 1, cost: 60 },
  { name: 'Crystal Staff', spell: 0.3, level: 5, cost: 280 },
  { name: 'Sage’s Staff', spell: 0.5, level: 10, cost: 900 },
  { name: 'Staff of the First Star', spell: 0.8, level: 16, cost: 2600 },
]

export const ITEMS = {
  potion: { name: 'Healing Potion', cost: 15, heal: 0.4, icon: '❤' },
  ether: { name: 'Mana Ether', cost: 20, mana: 0.5, icon: '✦' },
  elixir: { name: 'Elixir', cost: 150, heal: 1, mana: 1, icon: '★' },
}

/**
 * Spells. Fireball is the goddess's gift; the rest are bought from a magic shop once you are
 * strong enough to hold them. MP costs; cooldowns in seconds; `cost` in gold.
 */
export const SKILLS = [
  { id: 'fireball', name: 'Fireball', icon: '\u{1F525}', level: 1, cost: 0, mp: 8, cd: 1.2, desc: 'Hurl a ball of fire that bursts on impact.' },
  { id: 'heal', name: 'Heal', icon: '✨', level: 3, cost: 80, mp: 14, cd: 6, desc: 'Restore 35% of your HP and mend your partners.' },
  { id: 'thunder', name: 'Thunder Storm', icon: '⚡', level: 6, cost: 400, mp: 24, cd: 8, desc: 'Call lightning down on every foe nearby.' },
  { id: 'blessing', name: 'Goddess Blessing', icon: '\u{1F31F}', level: 10, cost: 1500, mp: 40, cd: 30, desc: 'Fully heal the party and double your attack for 12 seconds.' },
]

/** Grimoire ranks sold alongside the spells: each one is +15% spell damage and +10 MP. */
export const GRIMOIRES = [
  { name: 'Apprentice Grimoire', cost: 100, level: 2 },
  { name: 'Adept Grimoire', cost: 320, level: 5 },
  { name: 'Magister Grimoire', cost: 800, level: 9 },
  { name: 'Archmage Grimoire', cost: 1800, level: 13 },
  { name: 'Grimoire of the Stars', cost: 3600, level: 18 },
]

/**
 * Your base: the Otherworlder's Camp, which travels with you (it lives in your Item Box —
 * the most broken cheat skill of them all). Each facility has levels; level 0 is unbuilt.
 */
export const FACILITIES = [
  { id: 'home', name: 'Home', icon: '\u{1F3E0}', levels: ['Tent', 'Log Cabin', 'Manor', 'Castle'], costs: [120, 600, 2400], desc: '+25 max HP per level. Rest here to fully recover.' },
  { id: 'training', name: 'Training Ground', icon: '⚔', levels: ['—', 'Dummies', 'Dojo', 'Colosseum'], costs: [150, 700, 2800], desc: '+4 attack per level, for you and your partners.' },
  { id: 'shrine', name: 'Mana Shrine', icon: '\u{1F52E}', levels: ['—', 'Altar', 'Shrine', 'Ley Spire'], costs: [140, 650, 2600], desc: '+15 max MP and faster mana regeneration per level.' },
  { id: 'barracks', name: 'Party Barracks', icon: '\u{1F6E1}', levels: ['1 slot', '2 slots', '3 slots'], costs: [300, 1400], desc: 'How many partners can adventure with you at once.' },
  { id: 'garden', name: 'Herb Garden', icon: '\u{1F33F}', levels: ['—', 'Planters', 'Greenhouse'], costs: [200, 900], desc: 'Grows a free Healing Potion every few minutes.' },
]

/**
 * The people you can bring along. Each is a villager first; once you have helped them (the
 * quest in `after`), they offer to join. Recruited partners live at your base and follow you
 * into every region and dungeon. `power` scales with your level.
 */
export const PARTNERS = [
  { key: 'ayane', region: 'meadows', after: 'm7', cls: 'Sage', healer: true, ranged: true, color: 0x9ad0ff, power: 0.6, line: 'Hikaru will be furious. I don’t care. I’m coming with you, {name}.' },
  { key: 'yui', region: 'meadows', after: 'm3', cls: 'Archer', ranged: true, color: 0xf0a8c8, power: 0.7, line: 'You saved me... Let me come with you! I can shoot a sparrow off a fence post.' },
  { key: 'ren', region: 'meadows', after: 'm5', cls: 'Shield Knight', tank: true, color: 0x8aa0c0, power: 0.65, line: 'The tower can guard itself. You, on the other hand, clearly need a shield.' },
  { key: 'chika', region: 'jungle', after: 'j2', cls: 'Shrine Maiden', healer: true, ranged: true, color: 0xffffff, power: 0.45, line: 'The spirits tell me your road is long. I will keep you alive on it.' },
  { key: 'tarek', region: 'desert', after: 'd3', cls: 'Rogue', color: 0x6a5a48, power: 0.9, line: 'Treasure, danger, a hero who pays well? Count me in, partner.' },
  { key: 'elsa', region: 'tundra', after: 't2', cls: 'Ice Mage', ranged: true, color: 0xa8e0ff, power: 1.0, line: 'I owe you my life. My ice is yours, hero.' },
  { key: 'kaito', region: 'volcanic', after: 'v2', cls: 'Otherworld Swordsman', color: 0x303848, power: 1.15, line: 'Another guy from Japan, huh? Let’s beat this game together.' },
]

/**
 * Dungeons: a gate per region, waves of monsters and a guardian at the bottom. Each one is
 * fought on another of the colony's worlds. Rank and level gate the door.
 */
export const DUNGEONS = [
  { id: 'dg1', region: 'meadows', planet: 'moon', name: 'Moonlit Ruins', rank: 'E', level: 3, tier: 1.1, waves: [['slime', 5], ['aqua', 5], ['horned', 5]], boss: 'king_slime', bossTier: 0.6, reward: { xp: 160, gold: 140, item: 'ether', qty: 2 } },
  { id: 'dg2', region: 'jungle', planet: 'ocean', name: 'Drowned Shrine', rank: 'D', level: 7, tier: 1.15, waves: [['venom', 6], ['spore', 5], ['aqua', 8]], boss: 'hydra', bossTier: 0.7, reward: { xp: 520, gold: 380, item: 'potion', qty: 4 } },
  { id: 'dg3', region: 'desert', planet: 'mars', name: 'Crimson Hollow', rank: 'C', level: 11, tier: 1.15, waves: [['sand', 7], ['cactus', 6], ['horned', 8]], boss: 'wyrm', bossTier: 0.7, reward: { xp: 1000, gold: 750, item: 'elixir', qty: 1 } },
  { id: 'dg4', region: 'tundra', planet: 'moon', name: 'Frozen Abyss', rank: 'B', level: 15, tier: 1.2, waves: [['frost', 8], ['yeti', 6], ['frost', 10]], boss: 'titan', bossTier: 0.7, reward: { xp: 1900, gold: 1300, item: 'elixir', qty: 2 } },
  { id: 'dg5', region: 'volcanic', planet: 'mars', name: 'Abyssal Throne Depths', rank: 'A', level: 19, tier: 1.2, waves: [['magma', 9], ['imp', 7], ['magma', 10], ['imp', 9]], boss: 'demon_lord', bossTier: 0.55, reward: { xp: 4000, gold: 3000, item: 'elixir', qty: 3 } },
]

/** Adventurer ranks, by guild points. Quests and dungeons award points. */
export const RANKS = [
  { rank: 'F', points: 0 },
  { rank: 'E', points: 20 },
  { rank: 'D', points: 70 },
  { rank: 'C', points: 160 },
  { rank: 'B', points: 300 },
  { rank: 'A', points: 520 },
  { rank: 'S', points: 900 },
]
export const rankOf = (points) => [...RANKS].reverse().find((r) => points >= r.points).rank
export const rankIndex = (rank) => RANKS.findIndex((r) => r.rank === rank)

/** The opening: how you got here. `{name}` is replaced with the hero's name. */
export const INTRO = [
  'Seiran High School. Class 2-B. Sixth period, and the rain will not stop.',
  'You sit in the back row, the one nobody remembers to include. {name}, the quiet one.',
  'Then the floor begins to <em>glow</em>. A golden magic circle spreads under all thirty-one desks.',
  'Screams. White light. The feeling of falling through the sky.',
  '“Heroes of another world... welcome to <em>Altheria</em>.” A goddess, radiant, smiling. “Thirty heroes, just as the prophecy fore—”',
  '“...Thirty-<em>one</em>?”',
  '“Oh dear. One extra. There is no place for you in the prophecy, I am afraid. And no blessings left to give.”',
  'Your classmates are carried away in golden light to the Royal Capital, to be crowned as heroes.',
  'You are carried... somewhere else.',
  'You wake alone in the <em>Forbidden Forest</em>, where the monsters are said to be a hundred times stronger than anywhere else in the world.',
  'Level 1. No skills. No weapon but a rusty sword someone dropped. And very, very hungry.',
  'Above you, hanging from a crooked tree, a strange fruit is glowing like a little sun.',
]

/**
 * Fruits. Ordinary ones raise one stat for good; an Evolution Fruit raises everything and,
 * eaten enough times, changes what you *are*.
 */
export const FRUITS = {
  evolution: { name: 'Evolution Fruit', color: 0xffd36a, icon: '\u{1F31F}', rare: true, desc: 'Glows like a small sun. Eating it will change you.' },
  strength: { name: 'Strength Apple', color: 0xe8403a, icon: '\u{1F34E}', stat: 'atk', amount: 2, desc: '+2 attack, forever.' },
  iron: { name: 'Iron Peach', color: 0xf0a080, icon: '\u{1F351}', stat: 'def', amount: 2, desc: '+2 defense, forever.' },
  mana: { name: 'Mana Plum', color: 0x7a5ad8, icon: '\u{1F347}', stat: 'mp', amount: 8, desc: '+8 max MP, forever.' },
  swift: { name: 'Swift Berry', color: 0x5ac8f0, icon: '\u{1FAD0}', stat: 'agi', amount: 2, desc: '+2 agility, forever.' },
  life: { name: 'Life Melon', color: 0x6ad07a, icon: '\u{1F348}', stat: 'hp', amount: 12, desc: '+12 max HP, forever.' },
}

/** What you become, by Evolution Fruits eaten. Each step multiplies your stats and teaches a spell. */
export const RACES = [
  { name: 'Human', at: 0, mult: 1 },
  { name: 'Evolved Human', at: 1, mult: 1.15, skill: 'fireball' },
  { name: 'Transcendent', at: 3, mult: 1.35, skill: 'heal' },
  { name: 'Saint of the Forest', at: 6, mult: 1.6, skill: 'thunder' },
  { name: 'Demigod', at: 10, mult: 2, skill: 'blessing' },
]

/** The companion beast: what it looks like and is called at each stage. */
export const PET_STAGES = [
  { name: 'Starving Beast', color: 0x8a6a4a, size: 0.55, atk: 0.35, ears: true },
  { name: 'Forest Guardian', color: 0x6a8a4a, size: 0.85, atk: 0.8, horns: true, spikes: true },
  { name: 'Evolved Beast', cls: 'Beastkin Warrior', color: 0xc8a070, atk: 1.2 },
]

/** A line or two when each region is first reached, and when it is cleared. */
export const STORY = {
  forest: {
    arrive: 'Trees taller than buildings. Something enormous breathing in the dark between them. The glowing fruit hangs just ahead. You have not eaten since lunch break.',
    clear: 'The Forest Lord crashes down. The stone circle at the heart of the woods hums awake — a portal, pointing toward the human lands. Time to find out what happened to Class 2-B.',
  },
  meadows: {
    arrive: 'Fields, windmills, a village — and rumours at every well: the Kingdom’s thirty summoned Heroes are training at the Old Watchtower. Your classmates. Find the Adventurers’ Guild in Haru Village first.',
    clear: 'The King Slime falls. Across the meadows people cheer for the stranger in odd clothes. Mika stamps your guild card: the road south to the Whispering Jungle is open.',
  },
  jungle: {
    arrive: 'Thick heat and birdsong. Elves watch from the canopy — something is poisoning their river, and the Demon Lord’s mark is on it.',
    clear: 'The Hydra’s last head hits the water. Lyra bows: “The elves will remember.” Word spreads of a hero from another world.',
  },
  desert: {
    arrive: 'Endless dunes under two suns. A caravan city clings to an oasis, and the sand itself seems to be breathing.',
    clear: 'The Wyrm sinks for good. Zahra raises your rank in front of the whole bazaar. In the north, a kingdom is begging for aid.',
  },
  tundra: {
    arrive: 'Snow and banners. Snowhold Keep is besieged by the Demon Lord’s vanguard, and Princess Freya leads its last knights.',
    clear: 'The Titan shatters like a glacier. Freya kneels: “The Demon Lord’s domain lies beyond the ash. End this.”',
  },
  volcanic: {
    arrive: 'Ash falls like snow. This is the Demon Lord’s Domain. Saint Aria waits at the Last Bastion — with another otherworlder.',
    clear: 'Zarvok falls. The sky cracks open with light, and a familiar voice calls your name. Celestia is smiling.',
  },
  sanctuary: {
    arrive: '“You did it, {name}.” The Goddess Sanctuary floats above the clouds. Here, at last, you can take it slow.',
    clear: 'Your home in the sky is finished. Friends visit. Slimes nap in the garden. This time, you are living a life you enjoy.',
  },
}

export const xpToNext = (level) => Math.round(20 * Math.pow(level, 1.55))

/** Titles the status window shows, earned by milestones. */
export const TITLES = [
  { id: 'otherworlder', name: 'Otherworlder', test: () => true },
  { id: 'slayer', name: 'Slime Slayer', test: (s) => s.kills >= 25 },
  { id: 'glutton', name: 'Forbidden Fruit Glutton', test: (s) => s.evo >= 1 },
  { id: 'beyond', name: 'One Who Left Humanity Behind', test: (s) => s.evo >= 3 },
  { id: 'tamer', name: 'Beast Whisperer', test: (s) => s.tamed >= 1 },
  { id: 'extra', name: 'The Extra One', test: (s) => s.forest >= 1 },
  { id: 'benefactor', name: 'Village Benefactor', test: (s) => s.donated >= 500 },
  { id: 'king', name: 'Kingslayer', test: (s) => s.bosses >= 1 },
  { id: 'hero', name: 'Hero of Five Lands', test: (s) => s.bosses >= 4 },
  { id: 'saviour', name: 'Saviour of the World', test: (s) => s.bosses >= 5 },
]

/**
 * Every region's first village has an inn; its keeper lives behind the bar inside. Added here
 * rather than in each village list so the quest data above stays readable.
 */
const INNKEEPERS = {
  meadows: 'Okami Fuyu',
  jungle: 'Mama Tula',
  desert: 'Old Rashid',
  tundra: 'Hilda',
  volcanic: 'Brother Ash',
  sanctuary: 'Seraphine',
}
for (const r of REGIONS) {
  if (r.villages.length && INNKEEPERS[r.id]) r.villages[0].npcs.push({ key: 'inn', name: INNKEEPERS[r.id], role: 'Innkeeper', inn: true })
}
