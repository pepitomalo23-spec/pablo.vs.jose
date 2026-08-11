const webpush = require("web-push");

const VAPID_PUBLIC_KEY = "BOlozAKUr25UXMhCdW3RekIiSRZPSGnwZaMyJuLmO5N8Z9UOrjYXZ5H8KPX6CrH4RnRhY5Bxzaau-oM8DPTa1J4";
const VAPID_PRIVATE_KEY = "TEuP0nzTdlmNl15z-ObqZcBwV4JusQiYZ0KZK1Q7XGc";
const VAPID_CONTACT_EMAIL = "mailto:opostracker@example.com";

webpush.setVapidDetails(VAPID_CONTACT_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  let payload;
  try {
    payload = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  } catch (e) {
    res.status(400).send("JSON inválido");
    return;
  }

  const { subscription, title, body, image, tag } = payload;
  if (!subscription || !subscription.endpoint) {
    res.status(400).send("Falta la suscripción push");
    return;
  }

  try {
    await webpush.sendNotification(
      subscription,
      JSON.stringify({
        title: title || "Pablo vs José",
        body: body || "",
        image: image || undefined,
        tag: tag || undefined
      })
    );
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Error enviando notificación push:", err);
    res.status(200).json({ ok: false, error: err && err.message });
  }
};
