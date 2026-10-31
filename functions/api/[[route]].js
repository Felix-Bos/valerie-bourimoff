/**
 * API de l'administration (Cloudflare Pages Functions) : /api/*
 *
 * L'administration (admin/) lit les contenus du dépôt GitHub et y enregistre les
 * modifications ; chaque publication crée un commit sur la branche, que Cloudflare
 * Pages reconstruit et met en ligne.
 *
 * Variables à définir dans Cloudflare (Settings → Variables and Secrets) :
 *   ADMIN_PASSWORD  mot de passe de l'administration
 *   GITHUB_TOKEN    jeton GitHub limité au dépôt, avec l'accès « Contents : Read and write »
 *   GITHUB_REPO     (facultatif) propriétaire/dépôt, Felix-Bos/valerie-bourimoff par défaut
 *   GITHUB_BRANCH   (facultatif) main par défaut
 *
 * Routes :
 *   GET  /api/session      { connecte }
 *   POST /api/connexion    { motDePasse } → cookie de session (30 jours)
 *   POST /api/deconnexion
 *   GET  /api/contenu      { version, fichiers: { chemin: texte } } (content/**.json)
 *   POST /api/photo        corps : photo en base64 → { blob } (envoyée sans commit)
 *   POST /api/publier      { version, message, fichiers: [{ chemin, texte | blob | supprimer }] } → { version }
 */

const COOKIE = 'vb_admin';
const SESSION_DAYS = 30;
const MAX_PHOTO = 25 * 1024 * 1024; // en base64

// Seuls les contenus et les photos peuvent être modifiés depuis l'administration.
const JSON_PATH = /^content\/(?:(?:oeuvres|chapitres)\/)?[a-z0-9][a-z0-9-]*\.json$/;
const MEDIA_PATH = /^medias\/(?:oeuvres|site)\/[\w-][\w.-]*$/;

const CONTENT_QUERY = `query($owner: String!, $name: String!, $ref: String!) {
  repository(owner: $owner, name: $name) {
    ref(qualifiedName: $ref) {
      target {
        ... on Commit {
          oid
          file(path: "content") {
            object {
              ... on Tree {
                entries {
                  path
                  object {
                    ... on Blob { text }
                    ... on Tree { entries { path object { ... on Blob { text } } } }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}`;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function onRequest({ request, env, params }) {
  const route = (params.route || []).join('/');
  try {
    if (!env.ADMIN_PASSWORD) throw new HttpError(500, 'Configuration incomplète : ADMIN_PASSWORD manquant dans Cloudflare.');
    const method = request.method;

    if (route === 'connexion' && method === 'POST') return await login(request, env);
    if (route === 'deconnexion' && method === 'POST') return json({ ok: true }, 200, cookie('', 0));
    if (route === 'session' && method === 'GET') return json({ connecte: await isLoggedIn(request, env) });

    if (!(await isLoggedIn(request, env))) throw new HttpError(401, 'Session expirée : reconnectez-vous.');
    if (request.headers.get('X-Admin') !== '1') throw new HttpError(403, 'Requête refusée.');
    if (!env.GITHUB_TOKEN) throw new HttpError(500, 'Configuration incomplète : GITHUB_TOKEN manquant dans Cloudflare.');

    const gh = github(env);
    if (route === 'contenu' && method === 'GET') return json(await readContent(gh));
    if (route === 'photo' && method === 'POST') return json(await uploadPhoto(gh, request));
    if (route === 'publier' && method === 'POST') return json(await publish(gh, await request.json()));
    throw new HttpError(404, 'Adresse inconnue.');
  } catch (err) {
    const status = err.status || 500;
    if (status === 500) console.error(err);
    return json({ erreur: err.message || 'Erreur inattendue.' }, status);
  }
}

// ---------------------------------------------------------------- session

async function login(request, env) {
  const { motDePasse } = await request.json().catch(() => ({}));
  if (!(await sameText(String(motDePasse || ''), env.ADMIN_PASSWORD))) {
    await new Promise((resolve) => setTimeout(resolve, 1200)); // ralentit les essais en série
    throw new HttpError(401, 'Mot de passe incorrect.');
  }
  const expires = Date.now() + SESSION_DAYS * 86400e3;
  const value = `${expires}.${await sign(env, String(expires))}`;
  return json({ ok: true }, 200, cookie(value, SESSION_DAYS * 86400));
}

async function isLoggedIn(request, env) {
  const value = (request.headers.get('Cookie') || '')
    .split(/;\s*/).find((c) => c.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
  const [expires, signature] = (value || '').split('.');
  if (!expires || !signature || Number(expires) < Date.now()) return false;
  return sameText(signature, await sign(env, expires));
}

function cookie(value, maxAge) {
  return { 'Set-Cookie': `${COOKIE}=${value}; Path=/api; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict` };
}

// La signature dépend du mot de passe : le changer déconnecte toutes les sessions.
async function sign(env, text) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('session:' + env.ADMIN_PASSWORD),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text)));
}

// Comparaison en temps constant (sur les empreintes, de longueur fixe).
async function sameText(a, b) {
  const [x, y] = await Promise.all([a, b].map((s) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))));
  const u = new Uint8Array(x), v = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < u.length; i++) diff |= u[i] ^ v[i];
  return diff === 0;
}

function hex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------- GitHub

function github(env) {
  const [owner, name] = (env.GITHUB_REPO || 'Felix-Bos/valerie-bourimoff').split('/');
  const branch = env.GITHUB_BRANCH || 'main';
  const api = (env.GITHUB_API || 'https://api.github.com').replace(/\/$/, '');

  async function call(method, path, body) {
    const res = await fetch(api + path, {
      method,
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'valerie-bourimoff-admin',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: typeof body === 'string' ? body : body && JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) throw new HttpError(502, 'GitHub refuse la clé d\'accès (GITHUB_TOKEN expirée ou invalide).');
    if (!res.ok) {
      const error = new HttpError(502, `GitHub : ${data.message || res.statusText}`);
      error.github = res.status;
      throw error;
    }
    if (data.errors?.length) throw new HttpError(502, `GitHub : ${data.errors[0].message}`);
    return data;
  }

  return { owner, name, branch, call, repo: `/repos/${owner}/${name}` };
}

async function readContent(gh) {
  const { data } = await gh.call('POST', '/graphql', {
    query: CONTENT_QUERY,
    variables: { owner: gh.owner, name: gh.name, ref: `refs/heads/${gh.branch}` },
  });
  const commit = data?.repository?.ref?.target;
  if (!commit) throw new HttpError(502, `Branche ${gh.branch} introuvable dans ${gh.owner}/${gh.name}.`);

  const files = {};
  (function collect(entries) {
    for (const entry of entries || []) {
      if (entry.object?.entries) collect(entry.object.entries);
      else if (typeof entry.object?.text === 'string' && entry.path.endsWith('.json')) files[entry.path] = entry.object.text;
    }
  })(commit.file?.object?.entries);
  return { version: commit.oid, fichiers: files };
}

async function uploadPhoto(gh, request) {
  const base64 = (await request.text()).trim();
  if (!base64) throw new HttpError(400, 'Photo vide.');
  if (base64.length > MAX_PHOTO) throw new HttpError(413, 'Photo trop lourde (25 Mo au maximum).');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new HttpError(400, 'Photo illisible.');
  // Corps écrit à la main : la photo n'est pas relue ni recopiée par JSON.stringify.
  const { sha } = await gh.call('POST', `${gh.repo}/git/blobs`, `{"encoding":"base64","content":"${base64}"}`);
  return { blob: sha };
}

async function publish(gh, { version, message, fichiers } = {}) {
  if (!/^[0-9a-f]{40}$/.test(version || '')) throw new HttpError(400, 'Version des contenus manquante.');
  if (!Array.isArray(fichiers) || !fichiers.length) throw new HttpError(400, 'Aucune modification à publier.');

  const tree = fichiers.map((f) => {
    const path = String(f.chemin || '');
    if (path.includes('..') || !(JSON_PATH.test(path) || MEDIA_PATH.test(path))) {
      throw new HttpError(400, `Fichier non modifiable : ${path}`);
    }
    const entry = { path, mode: '100644', type: 'blob' };
    if (f.supprimer) return { ...entry, sha: null };
    if (typeof f.texte === 'string' && JSON_PATH.test(path)) {
      try { JSON.parse(f.texte); } catch { throw new HttpError(400, `Contenu invalide : ${path}`); }
      return { ...entry, content: f.texte };
    }
    if (/^[0-9a-f]{40}$/.test(f.blob || '') && MEDIA_PATH.test(path)) return { ...entry, sha: f.blob };
    throw new HttpError(400, `Modification incomplète : ${path}`);
  });

  const base = await gh.call('GET', `${gh.repo}/git/commits/${version}`);
  const newTree = await gh.call('POST', `${gh.repo}/git/trees`, { base_tree: base.tree.sha, tree });
  const commit = await gh.call('POST', `${gh.repo}/git/commits`, {
    message: `Administration : ${String(message || 'modification du site').slice(0, 200)}`,
    tree: newTree.sha,
    parents: [version],
  });
  try {
    await gh.call('PATCH', `${gh.repo}/git/refs/heads/${gh.branch}`, { sha: commit.sha, force: false });
  } catch (err) {
    if (err.github === 422) {
      throw new HttpError(409, 'Le site a été modifié entre-temps (depuis un autre onglet ou appareil). Rechargez la page pour repartir de la dernière version.');
    }
    throw err;
  }
  return { version: commit.sha };
}

// ---------------------------------------------------------------- réponses

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}
