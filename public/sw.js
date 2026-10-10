// Cache application assets only. Private API data and recordings never enter this cache.
const CACHE='noema-shell-v1';
const ASSETS=['/','/static/styles.css','/static/app.js','/static/icon.svg','/static/cat.png','/static/manifest.webmanifest'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));self.skipWaiting()});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim()});
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin||new URL(event.request.url).pathname.startsWith('/api/'))return;
 event.respondWith(fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(c=>c.put(event.request,copy))}return response}).catch(()=>caches.match(event.request).then(r=>r||((event.request.mode==='navigate')?caches.match('/'):Response.error()))));
});
