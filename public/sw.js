// Service worker Coach Arena — offline raisonné :
// - /assets/ et /icons/ (fichiers hashés par Vite, immuables) : cache-first
// - navigations et le reste : network-first avec repli cache (le dernier
//   index connu est servi hors-ligne — le jeu est 100 % client, il tourne)
const CACHE = 'coach-arena-v1'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== location.origin) return

  // .includes (pas .startsWith) : le site est servi sous un sous-chemin
  // GitHub Pages (/Coach-Arena/assets/…), pas à la racine du domaine.
  if (url.pathname.includes('/assets/') || url.pathname.includes('/icons/')) {
    e.respondWith(
      caches.open(CACHE).then(async c => {
        const hit = await c.match(e.request)
        if (hit) return hit
        const res = await fetch(e.request)
        if (res.ok) c.put(e.request, res.clone())
        return res
      }),
    )
    return
  }

  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) {
          const copy = res.clone()
          caches.open(CACHE).then(c => c.put(e.request, copy))
        }
        return res
      })
      .catch(
        async () =>
          // self.registration.scope (pas '/' en dur) : le repli hors-ligne
          // vise la racine du site tel qu'il est réellement servi
          // (/Coach-Arena/ sous GitHub Pages), pas la racine du domaine.
          (await caches.match(e.request)) ??
          (await caches.match(self.registration.scope)) ??
          Response.error(),
      ),
  )
})
