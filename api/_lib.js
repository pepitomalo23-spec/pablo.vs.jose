// api/_lib.js
// Funciones compartidas por las funciones serverless relacionadas con la
// vigilancia de leyes del BOE.
//
// IMPORTANTE: el nombre empieza por "_" a propósito. Vercel NO convierte en
// endpoint público los archivos de /api que empiezan por guion bajo, así que
// este archivo solo se puede usar mediante require() desde otras funciones,
// nunca se puede llamar directamente por URL.
//
// Usamos la API REST de Firestore (en vez del SDK de administración) porque
// esta app no tiene ninguna clave de servicio de Firebase: el propio cliente
// (el navegador) ya escribe directamente en este documento con solo la
// apiKey pública, lo que significa que las reglas de seguridad de Firestore
// ya permiten ese acceso sin autenticación. Reutilizamos exactamente el mismo
// mecanismo aquí, apuntando siempre al mismo documento único de la app.

const FIREBASE_API_KEY = "AIzaSyBwOPqisU2ZpIy8Njin71puhaiKRPfU8Po";
const FIREBASE_PROJECT_ID = "quantum-facility-01ttq";
const FIRESTORE_DATABASE_ID = "ai-studio-056bb8fd-73f2-48ab-94eb-180cee37f668";
const DOC_COLLECTION = "opostracker";
const DOC_ID = "state";

const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/${FIRESTORE_DATABASE_ID}/documents/${DOC_COLLECTION}/${DOC_ID}`;

// ---- Conversión entre el formato tipado de Firestore y JS plano ----

function fromFirestoreValue(value) {
  if (value == null) return null;
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return parseInt(value.integerValue, 10);
  if ("doubleValue" in value) return value.doubleValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("nullValue" in value) return null;
  if ("timestampValue" in value) return value.timestampValue;
  if ("arrayValue" in value) {
    const vals = (value.arrayValue && value.arrayValue.values) || [];
    return vals.map(fromFirestoreValue);
  }
  if ("mapValue" in value) {
    const fields = (value.mapValue && value.mapValue.fields) || {};
    const out = {};
    for (const k of Object.keys(fields)) out[k] = fromFirestoreValue(fields[k]);
    return out;
  }
  return null;
}

function toFirestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(toFirestoreValue) } };
  }
  if (typeof value === "object") {
    const fields = {};
    for (const k of Object.keys(value)) fields[k] = toFirestoreValue(value[k]);
    return { mapValue: { fields } };
  }
  return { nullValue: null };
}

function docToPlain(doc) {
  const fields = doc.fields || {};
  const out = {};
  for (const k of Object.keys(fields)) out[k] = fromFirestoreValue(fields[k]);
  return out;
}

// ---- Lectura / escritura del documento único de la app ----

// Lee solo los campos indicados (o el documento entero si no se pasa nada).
async function fetchState(fieldPaths) {
  const url = new URL(FIRESTORE_BASE);
  url.searchParams.set("key", FIREBASE_API_KEY);
  (fieldPaths || []).forEach((p) => url.searchParams.append("mask.fieldPaths", p));
  const res = await fetch(url.toString());
  if (res.status === 404) {
    // El documento aún no existe (app recién creada): lo tratamos como vacío.
    return {};
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Firestore GET ${res.status}: ${text}`);
  }
  const doc = await res.json();
  return docToPlain(doc);
}

// Sobrescribe SOLO los campos indicados (equivalente a setDoc(ref, fields,
// { merge: true }) que ya usa el cliente), sin tocar el resto del documento.
async function patchStateFields(fields) {
  const fieldNames = Object.keys(fields);
  if (fieldNames.length === 0) return null;
  const url = new URL(FIRESTORE_BASE);
  url.searchParams.set("key", FIREBASE_API_KEY);
  fieldNames.forEach((f) => url.searchParams.append("updateMask.fieldPaths", f));
  const body = {
    fields: Object.fromEntries(fieldNames.map((f) => [f, toFirestoreValue(fields[f])]))
  };
  const res = await fetch(url.toString(), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Firestore PATCH ${res.status}: ${text}`);
  }
  return res.json();
}

module.exports = { fetchState, patchStateFields };
