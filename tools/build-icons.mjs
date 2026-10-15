import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'
import { emblemSVG } from '../src/isekai/logo.js'

/**
 * Render the Otherworld Colony emblem into every icon the Android app needs:
 * `node tools/build-icons.mjs`. The art itself lives in `src/isekai/logo.js`.
 */

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const out = path.join(root, 'mobile', 'assets')

function render(file, opts, size) {
  const png = new Resvg(emblemSVG({ ...opts, size }), { fitTo: { mode: 'width', value: size } }).render().asPng()
  fs.writeFileSync(path.join(out, file), png)
  console.log(`icons: ${file} (${size}px)`)
}

// The full square icon, for launchers that do not use adaptive icons.
render('icon.png', { background: true, scale: 0.92 }, 1024)
// Adaptive icon layers: Android crops to a circle of 66% of the width; the ring at 0.9 scale sits just inside it.
render('android-icon-foreground.png', { background: false, scale: 0.9 }, 1024)
fs.writeFileSync(
  path.join(out, 'android-icon-background.png'),
  new Resvg(emblemSVG({ background: true, scale: 0.0001, size: 1024 }).replace(/<g transform[\s\S]*<\/g>/, ''), { fitTo: { mode: 'width', value: 1024 } })
    .render()
    .asPng()
)
console.log('icons: android-icon-background.png (1024px)')
render('android-icon-monochrome.png', { background: false, scale: 0.9, mono: true }, 1024)
render('splash-icon.png', { background: false, scale: 0.9 }, 1024)
render('favicon.png', { background: true, scale: 0.92 }, 48)
