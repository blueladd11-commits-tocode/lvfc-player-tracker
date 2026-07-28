// Recovery worker: remove every legacy cache and retire service-worker control.
// The app is network-loaded so deployments cannot be trapped behind stale shells.
self.addEventListener('install', event => {
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(key => caches.delete(key)));
    await self.clients.claim();
    await self.registration.unregister();
  })());
});
self.addEventListener('fetch', () => {
  // Intentionally no interception.
});
