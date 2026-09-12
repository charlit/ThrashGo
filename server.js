// Serveur TrashGO auto-hébergé : sert le jeu ET remplace les fonctions
// Netlify (scores.js + visits.js), avec un stockage en fichiers JSON locaux
// à la place de Netlify Blobs. Pensé pour tourner sur un Mac mini via Docker.

const express = require('express');
const fs = require('fs');
const path = require('path');

let geoip = null;
try { geoip = require('geoip-lite'); } catch (e) { /* module optionnel */ }

const app = express();
const PORT = process.env.PORT || 8080;
const DATA_DIR = path.join(__dirname, 'data');
const SCORES_FILE = path.join(DATA_DIR, 'scores.json');
const VISITS_FILE = path.join(DATA_DIR, 'visits.json');
const VIEW_SECRET = process.env.VISITS_KEY || 'change-moi-avant-de-publier';
const MAX_SCORES = 10;
const MAX_VISITS = 300;
const MAX_SCORE_VALUE = 5000000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---- petits utilitaires de stockage (fichiers JSON, comme Netlify Blobs) ----
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}
function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (e) {
    return fallback;
  }
}
function writeJson(file, data) {
  ensureDataDir();
  fs.writeFileSync(file, JSON.stringify(data), 'utf-8');
}

// ---- /api/scores : identique à scores.js sur Netlify ----
app.get('/api/scores', (req, res) => {
  const list = readJson(SCORES_FILE, []);
  res.json(list);
});

app.post('/api/scores', (req, res) => {
  let name = String((req.body && req.body.name) || 'Anonyme').trim().slice(0, 14);
  if (!name) name = 'Anonyme';
  const score = Math.floor(Number(req.body && req.body.score));
  if (!Number.isFinite(score) || score < 0 || score > MAX_SCORE_VALUE) {
    return res.status(400).json({ error: 'invalid score' });
  }
  let list = readJson(SCORES_FILE, []);
  list.push({ name, score, date: Date.now() });
  list.sort((a, b) => b.score - a.score);
  list = list.slice(0, MAX_SCORES);
  writeJson(SCORES_FILE, list);
  res.json(list);
});

// ---- analyse simple du User-Agent (identique à visits.js) ----
function parseUserAgent(ua) {
  ua = ua || '';
  let os = 'Inconnu';
  if (/iPhone/i.test(ua)) os = 'iOS (iPhone)';
  else if (/iPad/i.test(ua)) os = 'iOS (iPad)';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Macintosh|Mac OS X/i.test(ua)) os = 'macOS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  let browser = 'Inconnu';
  if (/EdgA|EdgiOS|Edge/i.test(ua)) browser = 'Edge';
  else if (/Instagram/i.test(ua)) browser = 'Instagram (navigateur intégré)';
  else if (/FBAN|FBAV/i.test(ua)) browser = 'Facebook (navigateur intégré)';
  else if (/musical_ly|TikTok|BytedanceWebview/i.test(ua)) browser = 'TikTok (navigateur intégré)';
  else if (/SamsungBrowser/i.test(ua)) browser = 'Samsung Internet';
  else if (/OPR\/|Opera/i.test(ua)) browser = 'Opera';
  else if (/CriOS/i.test(ua)) browser = 'Chrome (iOS)';
  else if (/Chrome/i.test(ua)) browser = 'Chrome';
  else if (/FxiOS/i.test(ua)) browser = 'Firefox (iOS)';
  else if (/Firefox/i.test(ua)) browser = 'Firefox';
  else if (/Safari/i.test(ua)) browser = 'Safari';

  const deviceType = /Mobi|Android(?!.*Tablet)|iPhone/i.test(ua)
    ? 'Mobile'
    : /iPad|Tablet/i.test(ua)
    ? 'Tablette'
    : 'Ordinateur';

  return { os, browser, deviceType };
}

function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return fwd.split(',')[0].trim();
  return req.socket.remoteAddress || 'inconnue';
}

// ---- /api/visits : identique à visits.js sur Netlify ----
app.get('/api/visits', (req, res) => {
  if (req.query.key !== VIEW_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const list = readJson(VISITS_FILE, []);
  res.json(list);
});

app.post('/api/visits', (req, res) => {
  const ua = req.headers['user-agent'] || '';
  const { os, browser, deviceType } = parseUserAgent(ua);
  const ip = getClientIp(req);

  let ville = 'Inconnue', pays = 'Inconnu';
  if (geoip) {
    const cleanIp = ip.replace('::ffff:', '');
    const geo = geoip.lookup(cleanIp);
    if (geo) {
      ville = geo.city || ville;
      pays = geo.country || pays;
    }
  }

  const now = new Date();
  const heureFrancaise = now.toLocaleString('fr-FR', {
    timeZone: 'Europe/Paris',
    dateStyle: 'short',
    timeStyle: 'medium'
  });

  const entry = {
    heureFrancaise,
    timestamp: now.toISOString(),
    os,
    browser,
    deviceType,
    ville,
    pays,
    ip,
    ecran: (req.body && req.body.screen) || 'inconnu',
    langue: (req.body && req.body.lang) || 'inconnue'
  };

  let list = readJson(VISITS_FILE, []);
  list.unshift(entry);
  list = list.slice(0, MAX_VISITS);
  writeJson(VISITS_FILE, list);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log('TrashGO auto-hébergé, écoute sur le port ' + PORT);
});
