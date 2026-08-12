// api/check-law-updates.js
// Se ejecuta automáticamente cada día (ver vercel.json -> "crons") y
// también se puede llamar a mano para probar. Por cada ley que el admin
// haya marcado como "vigilada" desde el panel, comprueba en el BOE si su
// fecha de última actualización ha cambiado desde la última comprobación.
//
// Si ha cambiado alguna:
//  1) Guarda un aviso en Firestore (campo lawUpdateNotices) para que la app
//     lo muestre como banner a cualquier usuario que la abra.
//  2) Manda una notificación push (Web Push nativo, reutilizando la misma
//     infraestructura que usa la app para avisar del Duelo) a todos los
//     perfiles que tengan activadas las notificaciones.

const webpush = require("web-push");
const { fetchState, patchStateFields } = require("./_lib");

// Mismas claves VAPID que ya usa api/send-notification.js para el Duelo.
const VAPID_PUBLIC_KEY = "BOlozAKUr25UXMhCdW3RekIiSRZPSGnwZaMyJuLmO5N8Z9UOrjYXZ5H8KPX6CrH4RnRhY5Bxzaau-oM8DPTa1J4";
const VAPID_PRIVATE_KEY = "TEuP0nzTdlmNl15z-ObqZcBwV4JusQiYZ0KZK1Q7XGc";
const VAPID_CONTACT_EMAIL = "mailto:opostracker@example.com";
webpush.setVapidDetails(VAPID_CONTACT_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const MAX_NOTICES_STORED = 30;

module.exports = async (req, res) => {
  // Protección opcional: si se ha configurado la variable de entorno
  // CRON_SECRET en Vercel, solo se acepta la llamada si trae ese secreto en
  // la cabecera Authorization (Vercel Cron lo añade automáticamente cuando
  // esa variable existe). Sin CRON_SECRET configurado, el endpoint queda
  // abierto (solo revisa fechas públicas del BOE y manda avisos, no hay
  // datos sensibles en juego, pero se recomienda configurarlo).
  if (process.env.CRON_SECRET) {
    const auth = req.headers["authorization"] || "";
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      res.status(401).json({ ok: false, error: "No autorizado" });
      return;
    }
  }

  try {
    const state = await fetchState(["watchedLaws", "profiles", "lawUpdateNotices"]);
    const watchedLaws = Array.isArray(state.watchedLaws) ? state.watchedLaws : [];
    const profiles = state.profiles || {};
    const existingNotices = Array.isArray(state.lawUpdateNotices) ? state.lawUpdateNotices : [];

    if (watchedLaws.length === 0) {
      res.status(200).json({ ok: true, checked: 0, changed: 0, message: "No hay leyes vigiladas todavía." });
      return;
    }

    const changedLaws = [];
    const nextWatchedLaws = [];

    for (const law of watchedLaws) {
      if (!law || !law.id) continue;
      try {
        const url = `https://www.boe.es/datosabiertos/api/legislacion-consolidada/id/${encodeURIComponent(law.id)}/metadatos`;
        const r = await fetch(url, { headers: { Accept: "application/json" } });
        if (!r.ok) {
          // No se ha podido comprobar esta ley esta vez; la dejamos igual y
          // lo reintentamos en la siguiente ejecución.
          nextWatchedLaws.push(law);
          continue;
        }
        const payload = await r.json();
        const meta = payload && payload.data;
        const newUpdate = meta && meta.fecha_actualizacion;
        if (newUpdate && law.lastUpdate && newUpdate !== law.lastUpdate) {
          changedLaws.push({ ...law, lastUpdate: newUpdate, previousUpdate: law.lastUpdate });
          nextWatchedLaws.push({ ...law, lastUpdate: newUpdate });
        } else if (newUpdate && !law.lastUpdate) {
          // Primera comprobación de esta ley: solo guardamos la fecha de
          // referencia, sin avisar (para no avisar de "cambios" que en
          // realidad ya existían desde antes de empezar a vigilarla).
          nextWatchedLaws.push({ ...law, lastUpdate: newUpdate });
        } else {
          nextWatchedLaws.push(law);
        }
      } catch (e) {
        console.error(`Error comprobando la ley ${law.id}:`, e && e.message);
        nextWatchedLaws.push(law);
      }
    }

    if (changedLaws.length === 0) {
      // Aunque no haya cambios, guardamos por si acaso las fechas de
      // referencia que se hayan rellenado por primera vez.
      await patchStateFields({ watchedLaws: nextWatchedLaws });
      res.status(200).json({ ok: true, checked: watchedLaws.length, changed: 0 });
      return;
    }

    const newNotices = changedLaws.map((law) => ({
      id: `${law.id}-${law.lastUpdate}`,
      lawId: law.id,
      titulo: law.titulo,
      url: law.url || null,
      fecha: law.lastUpdate,
      seenBy: []
    }));
    // Evitamos duplicar avisos si por lo que sea se ejecuta dos veces con el mismo cambio.
    const existingIds = new Set(existingNotices.map((n) => n.id));
    const dedupedNew = newNotices.filter((n) => !existingIds.has(n.id));
    const nextNotices = [...dedupedNew, ...existingNotices].slice(0, MAX_NOTICES_STORED);

    await patchStateFields({ watchedLaws: nextWatchedLaws, lawUpdateNotices: nextNotices });

    // Enviamos push a todos los perfiles que tengan una suscripción guardada.
    const subs = Object.values(profiles)
      .map((p) => p && p.pushSubscription)
      .filter((s) => s && s.endpoint);

    if (dedupedNew.length > 0 && subs.length > 0) {
      const title = dedupedNew.length === 1 ? "\u{1F4DC} Ley actualizada" : `\u{1F4DC} ${dedupedNew.length} leyes actualizadas`;
      const body = changedLaws.map((l) => l.titulo).slice(0, 3).join(" \xB7 ");
      await Promise.all(
        subs.map((sub) =>
          webpush
            .sendNotification(sub, JSON.stringify({ title, body, tag: "ley-actualizada" }))
            .catch((err) => {
              console.error("Error enviando push de ley actualizada:", err && err.message);
            })
        )
      );
    }

    res.status(200).json({ ok: true, checked: watchedLaws.length, changed: changedLaws.length });
  } catch (err) {
    console.error("Error comprobando actualizaciones del BOE:", err);
    res.status(500).json({ ok: false, error: (err && err.message) || "Error desconocido" });
  }
};
