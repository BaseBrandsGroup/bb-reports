#!/usr/bin/env node
// Locks a client report behind a password and writes it to <client>/index.html.
//
// Usage:
//   node tools/lock-report.mjs <client-slug> <path-to-report.html>
//
// Passwords and salts live OUTSIDE this repo, in ../bb-reports-private/clients.json:
//   { "trade-coach": { "name": "Tradecoach", "password": "...", "salt": "<hex>" } }
// A client with no entry gets a new password and salt generated and saved there.
//
// The report is encrypted with AES-256-GCM using a key derived from the password
// (PBKDF2-SHA256, 600k rounds). What gets published is unreadable without the password.
// The salt stays fixed per client so "remember me on this device" keeps working week to week.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { randomBytes, pbkdf2Sync, createCipheriv } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ITERATIONS = 600000;
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const privateFile = resolve(repoRoot, '..', 'bb-reports-private', 'clients.json');

const [slug, reportPath] = process.argv.slice(2);
if (!slug || !reportPath || !/^[a-z0-9-]+$/.test(slug)) {
  console.error('Usage: node tools/lock-report.mjs <client-slug> <report.html>  (slug: lowercase, digits, dashes)');
  process.exit(1);
}

const clients = existsSync(privateFile) ? JSON.parse(readFileSync(privateFile, 'utf8')) : {};
let client = clients[slug];
if (!client) {
  const words = ['amber', 'birch', 'cobalt', 'delta', 'ember', 'falcon', 'granite', 'harbour', 'indigo', 'juniper',
    'kestrel', 'lantern', 'meadow', 'nimbus', 'orchid', 'pebble', 'quarry', 'raven', 'summit', 'timber',
    'upland', 'velvet', 'willow', 'zephyr', 'copper', 'thistle', 'marble', 'saffron', 'beacon', 'canyon'];
  const pick = () => words[randomBytes(1)[0] % words.length];
  client = { name: slug, password: `${pick()}-${pick()}-${100 + (randomBytes(2).readUInt16BE() % 900)}`, salt: randomBytes(16).toString('hex') };
  clients[slug] = client;
  mkdirSync(dirname(privateFile), { recursive: true });
  writeFileSync(privateFile, JSON.stringify(clients, null, 2) + '\n');
  console.log(`New password created for ${slug} and saved to ${privateFile}`);
}

const plain = readFileSync(reportPath);
const salt = Buffer.from(client.salt, 'hex');
const key = pbkdf2Sync(client.password, salt, ITERATIONS, 32, 'sha256');
const iv = randomBytes(12);
const cipher = createCipheriv('aes-256-gcm', key, iv);
const data = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);

const payload = JSON.stringify({ s: salt.toString('base64'), i: iv.toString('base64'), d: data.toString('base64'), n: ITERATIONS });
const title = String(client.name).replace(/[<>&"]/g, '');

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${title} | Weekly Report</title>
<style>
  :root { --bg:#f4f2ee; --card:#ffffff; --ink:#1b1b1b; --muted:#6b6b6b; --line:#dcd8d0; --accent:#1b1b1b; --err:#b42318; }
  @media (prefers-color-scheme: dark) { :root { --bg:#141414; --card:#1e1e1e; --ink:#f2f2f2; --muted:#a0a0a0; --line:#333; --accent:#f2f2f2; --err:#ff8a80; } }
  * { box-sizing:border-box; }
  body { margin:0; min-height:100vh; display:grid; place-items:center; background:var(--bg); color:var(--ink);
         font-family:-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding:16px; }
  .card { width:100%; max-width:380px; background:var(--card); border:1px solid var(--line); border-radius:14px; padding:28px; }
  .brand { font-size:12px; letter-spacing:.12em; text-transform:uppercase; color:var(--muted); margin:0 0 6px; }
  h1 { font-size:22px; margin:0 0 18px; }
  label { display:block; font-size:14px; margin-bottom:6px; }
  input[type=password] { width:100%; font-size:16px; padding:11px 12px; border:1px solid var(--line); border-radius:8px; background:transparent; color:var(--ink); }
  .remember { display:flex; gap:8px; align-items:center; font-size:14px; color:var(--muted); margin:12px 0 18px; }
  button { width:100%; font-size:16px; padding:12px; border:0; border-radius:8px; background:var(--accent); color:var(--bg); cursor:pointer; }
  button:disabled { opacity:.6; cursor:wait; }
  .err { color:var(--err); font-size:14px; min-height:20px; margin:10px 0 0; }
</style>
</head>
<body>
<form class="card" id="f">
  <p class="brand">Base Brands</p>
  <h1>${title} weekly report</h1>
  <label for="pw">Password</label>
  <input id="pw" type="password" autocomplete="current-password" autofocus required>
  <label class="remember"><input id="rm" type="checkbox" checked> Remember me on this device</label>
  <button id="go" type="submit">Open report</button>
  <p class="err" id="err" role="alert"></p>
</form>
<script>
const P = ${payload};
const STORE = 'bb-report-key:' + location.pathname;
const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function keyFromPassword(pw) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name:'PBKDF2', hash:'SHA-256', salt:b64(P.s), iterations:P.n }, base, 256);
  return new Uint8Array(bits);
}
async function open(raw) {
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
  const plain = await crypto.subtle.decrypt({ name:'AES-GCM', iv:b64(P.i) }, key, b64(P.d));
  const html = new TextDecoder().decode(plain);
  document.open(); document.write(html); document.close();
}
const toHex = a => Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
const fromHex = h => new Uint8Array(h.match(/../g).map(x => parseInt(x, 16)));

(async () => {
  let saved = null;
  try { saved = localStorage.getItem(STORE); } catch (e) {}
  if (saved) { try { await open(fromHex(saved)); return; } catch (e) { try { localStorage.removeItem(STORE); } catch (e2) {} } }
})();

document.getElementById('f').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = document.getElementById('go'), err = document.getElementById('err');
  btn.disabled = true; btn.textContent = 'Opening...'; err.textContent = '';
  try {
    const remember = document.getElementById('rm').checked;
    const raw = await keyFromPassword(document.getElementById('pw').value);
    await open(raw);
    if (remember) { try { localStorage.setItem(STORE, toHex(raw)); } catch (e) {} }
  } catch (x) {
    err.textContent = 'That password did not work. Please try again.';
    btn.disabled = false; btn.textContent = 'Open report';
  }
});
</script>
</body>
</html>
`;

const outDir = join(repoRoot, slug);
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'index.html'), page);
console.log(`Locked report written to ${slug}/index.html`);
