#!/usr/bin/env node
// It's Already Made : mise à jour quotidienne. Sans dépendance (Node 22+). Un seul appel à l'API par jour.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ESTIMATION, pas une mesure. Anthropic ne publie pas la consommation de ses modèles.
// Ordre de grandeur repris d'Epoch AI (2025, « How much energy does ChatGPT use? ») :
// environ 0,3 Wh pour une requête typique d'un grand modèle, ramené ici à 1000 tokens.
// Volontairement pessimiste pour un modèle léger.
const WH_PAR_1000_TOKENS = 0.3;
const MODELE = process.env.CLAUDE_MODEL || 'claude-haiku-5-5';
const MAX_TOKENS = 16000; // ~20 Ko de HTML + manifeste + mémoire, avec un peu de marge
const MAX_INDEX = 20000, MAX_MEMOIRE = 1024, MAX_LIGNES = 10;
const INTERDITS = [/<img/i, /url\(/i, /src\s*=\s*["']?\s*(https?:)?\/\//i, /<script[^>]*\ssrc/i, /<link/i, /@import/i];
const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['index_html', 'manifeste', 'memoire', 'commit'],
  properties: { index_html: { type: 'string' }, manifeste: { type: 'string' }, memoire: { type: 'string' }, commit: { type: 'string' } },
};

const lire = (f) => readFileSync(f, 'utf8');
const octets = (s) => Buffer.byteLength(s, 'utf8');
const echapper = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Remplace le texte de l'élément portant cet id (qui ne doit contenir aucune balise).
const injecter = (html, id, texte) =>
  html.replace(new RegExp(`(<[^>]*\\sid="${id}"[^>]*>)[^<]*`), (_, balise) => balise + echapper(texte));

// --- Garde-fous : chaque fonction renvoie null si tout va bien, sinon la raison du rejet. ---
export function verifierIndex(html) {
  if (typeof html !== 'string' || !html.trim()) return 'index.html absent';
  if (octets(html) > MAX_INDEX) return `index.html pèse ${octets(html)} octets (max ${MAX_INDEX})`;
  const interdit = INTERDITS.find((r) => r.test(html));
  if (interdit) return `index.html contient une ressource interdite (${interdit.source})`;
  const form = html.match(/<form[^>]*>/gi)?.find((f) => /name="feedback"/.test(f));
  if (!form || !/data-netlify="true"/.test(form) || !/netlify-honeypot=/.test(form) || !/<textarea[^>]*name="message"/i.test(html))
    return 'index.html a perdu le formulaire de feedback';
  if (!/\sid="energie"/.test(html) || !/\sid="manifeste"/.test(html)) return 'index.html a perdu #energie ou #manifeste';
  return null;
}
export function verifierManifeste(ancien, nouveau) {
  if (typeof nouveau !== 'string') return 'manifeste absent';
  const a = [...ancien], b = [...nouveau];
  if (a.length !== b.length) return `manifeste : longueur modifiée (${a.length} → ${b.length})`;
  const diff = a.map((c, i) => i).filter((i) => a[i] !== b[i]);
  if (diff.length !== 1) return `manifeste : ${diff.length} caractères changés au lieu d'un seul`;
  const i = diff[0];
  if (!/\p{L}/u.test(a[i]) || !/\p{L}/u.test(b[i])) return 'manifeste : le caractère changé doit être une lettre';
  return null;
}
export function verifierMemoire(m) {
  if (typeof m !== 'string' || !m.trim()) return 'mémoire absente';
  if (m.split('\n').length > MAX_LIGNES) return `mémoire : plus de ${MAX_LIGNES} lignes`;
  if (octets(m) + 1 > MAX_MEMOIRE) return `mémoire : plus de ${MAX_MEMOIRE} octets`;
  return null;
}

// --- Collecte : retours des dernières 24 h (30 max, 280 caractères chacun). ---
async function collecterRetours() {
  const { NETLIFY_TOKEN: jeton, NETLIFY_SITE_ID: site } = process.env;
  if (!jeton || !site) return [];
  const r = await fetch(`https://api.netlify.com/api/v1/sites/${site}/submissions?per_page=100`, {
    headers: { Authorization: `Bearer ${jeton}` },
  });
  if (!r.ok) { console.error(`Netlify a répondu ${r.status} : aucun retour aujourd'hui.`); return []; }
  const hier = Date.now() - 24 * 3600 * 1000;
  return (await r.json())
    .filter((s) => (s.form_name ?? 'feedback') === 'feedback' && new Date(s.created_at) > hier && s.data?.message)
    .slice(0, 30)
    .map((s) => String(s.data.message).slice(0, 280));
}

// --- L'unique appel du jour. ---
async function demander(system, contenu) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODELE, max_tokens: MAX_TOKENS, system,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content: contenu }],
    }),
  });
  if (!r.ok) throw new Error(`API Claude ${r.status} : ${await r.text()}`);
  return r.json();
}

export async function main() {
  const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Zurich' }).format(new Date());
  const energie = JSON.parse(lire('energie.json'));
  if (energie.jours.some((j) => j.date === date)) return console.log(`Déjà fait le ${date} : un seul appel par jour.`);
  const jour = energie.jours.length + 1;
  const index = lire('index.html'), manifeste = lire('manifeste.txt').trimEnd(), memoire = lire('memoire.txt').trimEnd();
  const retours = await collecterRetours();
  const bloc = (nom, texte) => `<${nom}>\n${texte}\n</${nom}>`;
  const contenu = [
    `Date : ${date}. Jour ${jour}.`,
    bloc('index.html', index), bloc('manifeste.txt', manifeste), bloc('memoire.txt', memoire),
    bloc('retours_du_public', retours.length ? JSON.stringify(retours, null, 1) : '(aucun retour ces dernières 24 heures)'),
  ].join('\n\n');

  const reponse = await demander(lire('scripts/prompt.md'), contenu);
  const rejets = [];
  let sortie = null;
  if (reponse.stop_reason !== 'end_turn') rejets.push(`réponse inutilisable (${reponse.stop_reason})`);
  else try { sortie = JSON.parse(reponse.content.find((b) => b.type === 'text').text); } catch { rejets.push('réponse JSON illisible'); }
  const lisible = sortie !== null;
  sortie ??= {};
  // Note le rejet (sauf si la réponse entière était déjà inutilisable) et dit si la nouvelle version est acceptée.
  const garder = (erreur) => { if (erreur && lisible) rejets.push(erreur); return !erreur; };

  // Manifeste et mémoire : acceptés ou gardés tels quels.
  const nouveauManifeste = sortie.manifeste?.trimEnd(), nouvelleMemoire = sortie.memoire?.trimEnd();
  const manifesteFinal = garder(verifierManifeste(manifeste, nouveauManifeste)) ? nouveauManifeste : manifeste;
  const memoireFinale = garder(verifierMemoire(nouvelleMemoire)) ? nouvelleMemoire : memoire;

  // Énergie : comptée même si tout est rejeté, le geste a eu lieu.
  const entree = reponse.usage?.input_tokens ?? 0, sortieTokens = reponse.usage?.output_tokens ?? 0;
  const wh = +(((entree + sortieTokens) / 1000) * WH_PAR_1000_TOKENS).toFixed(3);
  energie.jours.push({ date, jour, modele: MODELE, tokens_entree: entree, tokens_sortie: sortieTokens, wh });
  energie.total_wh = +energie.jours.reduce((t, j) => t + j.wh, 0).toFixed(3);
  const texteEnergie = `jour ${wh.toFixed(3)} Wh · cumul ${energie.total_wh.toFixed(3)} Wh (estimation)`;

  // Index : le script y écrit le manifeste vivant et l'énergie, puis vérifie le résultat.
  const finir = (html) => injecter(injecter(html, 'manifeste', manifesteFinal), 'energie', texteEnergie);
  const candidat = typeof sortie.index_html === 'string' ? finir(sortie.index_html) : null;
  const indexFinal = garder(verifierIndex(candidat)) ? candidat : finir(index);

  writeFileSync('index.html', indexFinal);
  writeFileSync('manifeste.txt', manifesteFinal + '\n');
  writeFileSync('memoire.txt', memoireFinale + '\n');
  writeFileSync('energie.json', JSON.stringify(energie, null, 2) + '\n');
  const geste = String(sortie.commit || 'le geste du jour a été perdu').split('\n')[0].slice(0, 200);
  const message = [`jour ${jour} : ${geste}`, '', ...rejets.map((r) => `rejeté, version de la veille gardée : ${r}`), `${retours.length} retour(s) lus, ${wh} Wh estimés.`];
  writeFileSync('.commit-msg', message.join('\n') + '\n');
  console.log(message.join('\n'));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(1); });
