/**
 * The Otherworld Colony emblem: the hero bot, summoned through a golden magic circle under
 * a night sky. One SVG drives both the title screen and the Android icons
 * (`tools/build-icons.mjs`), so the two can never drift apart.
 *
 * `background` paints the sky; `scale` shrinks the art about the centre (Android's adaptive
 * icons crop everything outside the middle 66%); `mono` draws it all in flat white for the
 * themed-icon layer.
 */
export function emblemSVG({ background = true, scale = 1, mono = false, size = 1024 } = {}) {
  const gold = mono ? '#fff' : '#ffd36a'
  const goldSoft = mono ? '#fff' : '#ffe9a8'
  const cyan = mono ? '#fff' : '#7fd8ff'

  // The hexagram's six points and the ring of rune ticks.
  const hex = (r, a0) =>
    [0, 1, 2]
      .map((i) => {
        const a = a0 + (i * Math.PI * 2) / 3
        return `${512 + Math.cos(a) * r},${512 + Math.sin(a) * r}`
      })
      .join(' ')
  const ticks = Array.from({ length: 36 }, (_, i) => {
    const a = (i / 36) * Math.PI * 2
    const long = i % 3 === 0
    const r0 = long ? 322 : 328
    const r1 = 346
    return `<line x1="${512 + Math.cos(a) * r0}" y1="${512 + Math.sin(a) * r0}" x2="${512 + Math.cos(a) * r1}" y2="${512 + Math.sin(a) * r1}" stroke="${gold}" stroke-width="${long ? 7 : 4}" stroke-linecap="round"/>`
  }).join('')
  const nodes = Array.from({ length: 6 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 3
    return `<circle cx="${512 + Math.cos(a) * 300}" cy="${512 + Math.sin(a) * 300}" r="13" fill="${mono ? '#fff' : '#fff3c4'}"/>`
  }).join('')

  // A fixed scatter of stars, so every render is identical.
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const stars = Array.from({ length: 46 }, () => {
    const x = rnd() * 1024
    const y = rnd() * 1024
    const r = 1.2 + rnd() * 2.8
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="#ffffff" opacity="${(0.35 + rnd() * 0.6).toFixed(2)}"/>`
  }).join('')

  const sky = background
    ? `<rect width="1024" height="1024" fill="url(#sky)"/>${stars}<circle cx="512" cy="512" r="420" fill="url(#halo)"/>`
    : ''

  const helmet = mono ? '#fff' : 'url(#helmet)'
  const visor = mono ? 'none' : '#0d1530'
  const art = `
    <g transform="translate(512 512) scale(${scale}) translate(-512 -512)">
      ${mono ? '' : '<circle cx="512" cy="512" r="372" fill="url(#portal)"/>'}
      <circle cx="512" cy="512" r="352" fill="none" stroke="${gold}" stroke-width="16"/>
      <circle cx="512" cy="512" r="316" fill="none" stroke="${gold}" stroke-width="5" opacity="0.9"/>
      ${ticks}
      <polygon points="${hex(300, -Math.PI / 2)}" fill="none" stroke="${goldSoft}" stroke-width="6" opacity="${mono ? 1 : 0.6}" stroke-linejoin="round"/>
      <polygon points="${hex(300, Math.PI / 2)}" fill="none" stroke="${goldSoft}" stroke-width="6" opacity="${mono ? 1 : 0.6}" stroke-linejoin="round"/>
      <circle cx="512" cy="512" r="232" fill="none" stroke="${gold}" stroke-width="4" opacity="0.75"/>
      ${nodes}

      <!-- the hero -->
      <path d="M352 800 C352 700 420 662 512 662 C604 662 672 700 672 800 Z" fill="${mono ? '#fff' : '#3b6fe0'}"/>
      <line x1="512" y1="358" x2="512" y2="300" stroke="${mono ? '#fff' : '#c9d3e6'}" stroke-width="14" stroke-linecap="round"/>
      <path d="M512 248 L524 280 L556 292 L524 304 L512 336 L500 304 L468 292 L500 280 Z" fill="${gold}" ${mono ? '' : 'filter="url(#glow)"'}/>
      <circle cx="340" cy="530" r="38" fill="${mono ? '#fff' : '#3b6fe0'}"/>
      <circle cx="684" cy="530" r="38" fill="${mono ? '#fff' : '#3b6fe0'}"/>
      <circle cx="512" cy="530" r="178" fill="${helmet}" ${mono ? 'mask="url(#visorCut)"' : ''}/>
      ${mono ? '' : '<path d="M400 440 C430 395 480 372 530 372" fill="none" stroke="#ffffff" stroke-width="14" stroke-linecap="round" opacity="0.9"/>'}
      ${mono ? '' : `<rect x="388" y="462" width="248" height="152" rx="72" fill="${visor}" stroke="${cyan}" stroke-width="6"/>`}
      <rect x="448" y="502" width="32" height="64" rx="16" fill="${mono ? '#fff' : '#a8ecff'}" ${mono ? '' : 'filter="url(#glow)"'}/>
      <rect x="544" y="502" width="32" height="64" rx="16" fill="${mono ? '#fff' : '#a8ecff'}" ${mono ? '' : 'filter="url(#glow)"'}/>
    </g>`

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
  <defs>
    <radialGradient id="sky" cx="50%" cy="42%" r="72%">
      <stop offset="0" stop-color="#2b4392"/>
      <stop offset="0.55" stop-color="#111c44"/>
      <stop offset="1" stop-color="#050816"/>
    </radialGradient>
    <radialGradient id="halo" cx="50%" cy="50%" r="50%">
      <stop offset="0.6" stop-color="#7fd8ff" stop-opacity="0"/>
      <stop offset="0.86" stop-color="#ffd36a" stop-opacity="0.18"/>
      <stop offset="1" stop-color="#ffd36a" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="portal" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#9fe8ff" stop-opacity="0.55"/>
      <stop offset="0.6" stop-color="#3a7bff" stop-opacity="0.22"/>
      <stop offset="1" stop-color="#1b2a66" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="helmet" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#c3cde2"/>
    </linearGradient>
    <mask id="visorCut"><rect width="1024" height="1024" fill="#fff"/><rect x="388" y="462" width="248" height="152" rx="72" fill="#000"/></mask>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="6" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  ${sky}
  ${art}
</svg>`
}
