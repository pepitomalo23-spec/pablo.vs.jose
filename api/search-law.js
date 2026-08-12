// api/search-law.js
// Proxy hacia la API de datos abiertos del BOE (legislación consolidada)
// para buscar normas por título, usado desde el panel de administración
// ("Vigilancia de leyes"). Se hace desde el servidor -y no directamente
// desde el navegador- para evitar problemas de CORS y para no exponer
// los detalles de la consulta al BOE en el cliente.
//
// Documentación de referencia:
// https://www.boe.es/datosabiertos/documentos/APIconsolidada.pdf

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "Method Not Allowed" });
    return;
  }

  const raw = (req.query && req.query.q) || "";
  const q = String(raw).trim();
  if (!q) {
    res.status(400).json({ ok: false, error: "Falta el texto a buscar (parámetro q)" });
    return;
  }

  try {
    // La API del BOE espera el parámetro "query" como un JSON con esta
    // forma. Buscamos por título, con el texto entre comillas para que
    // busque la frase (no solo palabras sueltas).
    const safeTerm = q.replace(/["\\]/g, " ").trim();
    const searchQuery = JSON.stringify({
      query: { query_string: { query: `titulo:"${safeTerm}"` } }
    });
    const url =
      "https://www.boe.es/datosabiertos/api/legislacion-consolidada" +
      `?limit=12&query=${encodeURIComponent(searchQuery)}`;

    const boeRes = await fetch(url, { headers: { Accept: "application/json" } });
    if (!boeRes.ok) {
      res.status(502).json({ ok: false, error: `El BOE respondió con estado ${boeRes.status}` });
      return;
    }
    const payload = await boeRes.json();
    // Cuando no hay resultados, "data" llega como objeto vacío {} en vez de [].
    const rawData = payload && payload.data;
    const items = Array.isArray(rawData) ? rawData : [];

    const results = items
      .filter((it) => it && it.identificador)
      .map((it) => ({
        id: it.identificador,
        titulo: it.titulo,
        rango: (it.rango && it.rango.texto) || null,
        ambito: (it.ambito && it.ambito.texto) || null,
        fechaPublicacion: it.fecha_publicacion || null,
        fechaActualizacion: it.fecha_actualizacion || null,
        url: it.url_html_consolidada || null
      }));

    res.status(200).json({ ok: true, results });
  } catch (err) {
    console.error("Error buscando en el BOE:", err);
    res.status(500).json({ ok: false, error: (err && err.message) || "Error desconocido" });
  }
};
