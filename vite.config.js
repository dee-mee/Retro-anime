import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import { apiMiddleware } from './server/api.mjs'

const root = path.dirname(fileURLToPath(import.meta.url))

/** Serves /api from inside the Vite dev server, so `npm run dev` is the whole game. */
const api = () => ({
  name: 'bot-crossing-api',
  configureServer(server) {
    server.middlewares.use(apiMiddleware)
  },
})

/**
 * The isekai build: `src/game/api.js` (which talks to the thread scanner) is swapped for an
 * offline world that lives on the device.
 */
const isekaiWorld = () => ({
  name: 'isekai-world',
  enforce: 'pre',
  async resolveId(source, importer, options) {
    if (!importer || !source.endsWith('game/api.js')) return null
    const resolved = await this.resolve(source, importer, { ...options, skipSelf: true })
    if (resolved && path.normalize(resolved.id) === path.join(root, 'src', 'game', 'api.js')) {
      return path.join(root, 'src', 'isekai', 'world-api.js')
    }
    return null
  },
})

/**
 * Fold the whole build into one `index.html`: scripts and styles inline, and the model files
 * as data URIs behind a small `fetch` shim. A WebView opening a page from the app's own
 * files cannot `fetch()` its neighbours, so nothing is left for it to fetch.
 */
const singleFile = (outDir) => ({
  name: 'isekai-single-file',
  apply: 'build',
  enforce: 'post',
  closeBundle() {
    const dir = path.join(root, outDir)
    const htmlPath = path.join(dir, 'index.html')
    let html = fs.readFileSync(htmlPath, 'utf8')

    const assets = {}
    const assetDir = path.join(dir, 'assets')
    for (const f of fs.readdirSync(assetDir)) {
      if (!/\.(glb|hdr|json)$/.test(f)) continue
      const mime = f.endsWith('.json') ? 'application/json' : 'application/octet-stream'
      assets[`assets/${f}`] = `data:${mime};base64,${fs.readFileSync(path.join(assetDir, f)).toString('base64')}`
    }
    const shim = `<script>(function(){var A=${JSON.stringify(assets)};var f=window.fetch.bind(window);window.fetch=function(u,o){var s=typeof u==='string'?u:(u&&u.url)||'';for(var k in A){if(s.slice(-k.length)===k)return f(A[k],o)}if(/audio\\/manifest\\.json$/.test(s))return Promise.resolve(new Response('{}',{status:404}));return f(u,o)}})();</script>`

    // Inline every emitted script and stylesheet the page references.
    html = html.replace(/<script type="module" crossorigin src="\.\/([^"]+)"><\/script>/g, (_, file) => {
      const code = fs.readFileSync(path.join(dir, file), 'utf8').replace(/<\/script>/g, '<\\/script>')
      return `<script type="module">${code}</script>`
    })
    html = html.replace(/<link rel="stylesheet" crossorigin href="\.\/([^"]+)">/g, (_, file) => `<style>${fs.readFileSync(path.join(dir, file), 'utf8')}</style>`)
    html = html.replace(/<link rel="modulepreload"[^>]*>/g, '')
    html = html.replace('<head>', `<head>${shim}`)
    fs.writeFileSync(htmlPath, html)
    const mb = (Buffer.byteLength(html) / 1048576).toFixed(1)
    console.log(`isekai: single-file build written to ${outDir}/index.html (${mb} MB)`)

    // Hand it to the Android app, if the app is checked out next to us.
    const app = path.join(root, 'mobile', 'assets', 'game')
    if (fs.existsSync(path.join(root, 'mobile'))) {
      fs.mkdirSync(app, { recursive: true })
      fs.copyFileSync(htmlPath, path.join(app, 'game.html'))
      console.log('isekai: copied to mobile/assets/game/game.html')
    }
  },
})

export default defineConfig(({ mode }) => {
  if (mode === 'isekai') {
    const outDir = 'dist-isekai'
    return {
      base: './',
      plugins: [isekaiWorld(), singleFile(outDir)],
      server: { port: Number(process.env.PORT) || 5275, strictPort: false },
      build: {
        target: 'es2022',
        outDir,
        assetsInlineLimit: 0,
        modulePreload: false,
        rollupOptions: { output: { inlineDynamicImports: true } },
      },
    }
  }
  return {
    plugins: [api()],
    // PORT lets a second copy run alongside the first without a flag on the command line.
    server: { port: Number(process.env.PORT) || 5274, strictPort: false },
    build: { target: 'esnext' },
  }
})
