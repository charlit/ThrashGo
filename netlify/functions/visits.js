// Fonction Netlify : journalise qui ouvre le jeu (navigateur, appareil,
// heure française, localisation approximative via l'IP). Même principe que
// scores.js : stockage via Netlify Blobs, aucune inscription à un service
// tiers, aucune clé à configurer.
//
// POST /api/visits            -> enregistre une visite (appelé automatiquement au chargement du jeu)
// GET  /api/visits?key=XXXX   -> renvoie les dernières visites (protégé par un mot de passe simple)
//
// Place ce fichier exactement à ce chemin dans ton projet :
//   netlify/functions/visits.js

import { getStore } from "@netlify/blobs";

const STORE_NAME = "trashgo-visits";
const KEY = "log";
const MAX_ENTRIES = 300;

// Change ce mot de passe pour consulter la liste des visites depuis le navigateur.
// Exemple d'utilisation : https://trashgo64.netlify.app/api/visits?key=TON_MOT_DE_PASSE
const VIEW_SECRET = "trashgo-charles-2026";

function corsHeaders() {
  return {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type"
  };
}

// Analyse très simple du User-Agent : suffisant pour distinguer
// navigateur / système / type d'appareil, sans dépendance externe.
function parseUserAgent(ua) {
  ua = ua || "";

  let os = "Inconnu";
  if (/iPhone/i.test(ua)) os = "iOS (iPhone)";
  else if (/iPad/i.test(ua)) os = "iOS (iPad)";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/Windows/i.test(ua)) os = "Windows";
  else if (/Macintosh|Mac OS X/i.test(ua)) os = "macOS";
  else if (/Linux/i.test(ua)) os = "Linux";

  let browser = "Inconnu";
  if (/EdgA|EdgiOS|Edge/i.test(ua)) browser = "Edge";
  else if (/Instagram/i.test(ua)) browser = "Instagram (navigateur intégré)";
  else if (/FBAN|FBAV/i.test(ua)) browser = "Facebook (navigateur intégré)";
  else if (/musical_ly|TikTok|BytedanceWebview/i.test(ua)) browser = "TikTok (navigateur intégré)";
  else if (/SamsungBrowser/i.test(ua)) browser = "Samsung Internet";
  else if (/OPR\/|Opera/i.test(ua)) browser = "Opera";
  else if (/CriOS/i.test(ua)) browser = "Chrome (iOS)";
  else if (/Chrome/i.test(ua)) browser = "Chrome";
  else if (/FxiOS/i.test(ua)) browser = "Firefox (iOS)";
  else if (/Firefox/i.test(ua)) browser = "Firefox";
  else if (/Safari/i.test(ua)) browser = "Safari";

  const deviceType = /Mobi|Android(?!.*Tablet)|iPhone/i.test(ua)
    ? "Mobile"
    : /iPad|Tablet/i.test(ua)
    ? "Tablette"
    : "Ordinateur";

  return { os, browser, deviceType };
}

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  const store = getStore(STORE_NAME);

  if (req.method === "GET") {
    const url = new URL(req.url);
    if (url.searchParams.get("key") !== VIEW_SECRET) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: corsHeaders()
      });
    }
    const list = (await store.get(KEY, { type: "json" })) || [];
    return new Response(JSON.stringify(list), { headers: corsHeaders() });
  }

  if (req.method === "POST") {
    let body = {};
    try {
      body = await req.json();
    } catch (e) {
      body = {};
    }

    const ua = req.headers.get("user-agent") || "";
    const { os, browser, deviceType } = parseUserAgent(ua);

    // Netlify fournit ces informations directement sur la requête, sans
    // que le navigateur du visiteur n'ait besoin de les envoyer lui-même.
    const ip = req.headers.get("x-nf-client-connection-ip") || "inconnue";
    const geoHeader = req.headers.get("x-nf-geo");
    let city = "Inconnue", country = "Inconnu";
    if (geoHeader) {
      try {
        const geo = JSON.parse(Buffer.from(geoHeader, "base64").toString("utf-8"));
        city = geo.city || city;
        country = (geo.country && geo.country.name) || country;
      } catch (e) { /* ignore si le format change */ }
    }

    const now = new Date();
    const heureFrancaise = now.toLocaleString("fr-FR", {
      timeZone: "Europe/Paris",
      dateStyle: "short",
      timeStyle: "medium"
    });

    const entry = {
      heureFrancaise,
      timestamp: now.toISOString(),
      os,
      browser,
      deviceType,
      ville: city,
      pays: country,
      ip,
      ecran: body.screen || "inconnu",
      langue: body.lang || "inconnue"
    };

    let list = (await store.get(KEY, { type: "json" })) || [];
    list.unshift(entry); // le plus récent en premier
    list = list.slice(0, MAX_ENTRIES);
    await store.setJSON(KEY, list);

    return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders() });
  }

  return new Response("Method not allowed", { status: 405, headers: corsHeaders() });
};

export const config = { path: "/api/visits" };
