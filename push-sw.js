// push-sw.js
// Este archivo tiene que estar en la RAÍZ de tu sitio (junto a index.html)
// para que sea accesible en https://tu-dominio.vercel.app/push-sw.js
//
// Es un service worker de Web Push "de toda la vida" (el estándar del
// navegador), sin ninguna dependencia de Firebase. Recibe el aviso que
// manda nuestra función de Vercel y lo muestra como notificación,
// aunque la web esté cerrada.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "Pablo vs José", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Pablo vs José";
  const body = data.body || "";
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icon-512.png",       // icono principal (a color)
      badge: "/icon-192.png",      // silueta pequeña (Android, barra de estado)
      image: data.image || undefined, // foto grande opcional dentro de la notificación
      vibrate: [100, 50, 100],     // patrón corto de vibración (Android)
      tag: data.tag || "duelo-bomberos", // agrupa notificaciones repetidas en una sola
      renotify: true,
      data: data.data || {},
      actions: [
        { action: "ver", title: "Ver marcador" }
      ]
    })
  );
});
// Si el usuario toca la notificación, abrimos (o enfocamos) la app.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // Si el usuario pulsa "Cerrar" (si algún día se añade) no hacemos nada más.
  if (event.action === "cerrar") return;
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow("/");
    })
  );
});
