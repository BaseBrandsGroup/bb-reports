#!/usr/bin/env node
// Confirms a locked page opens with the client's password and rejects a wrong one.
// Usage: node tools/verify.mjs <client-slug> [--live]
//   default: checks the local <slug>/index.html
//   --live:  waits (up to ~5 min) for the live GitHub Pages copy to match the local one, then checks it

import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const clients = JSON.parse(readFileSync(resolve(repoRoot, '..', 'bb-reports-private', 'clients.json'), 'utf8'));
const [slug, flag] = process.argv.slice(2);
const client = clients[slug];
if (!client) { console.error(`No client "${slug}"`); process.exit(1); }

const local = readFileSync(join(repoRoot, slug, 'index.html'), 'utf8');
const url = `https://basebrandsgroup.github.io/bb-reports/${slug}/`;
let html = local;

if (flag === '--live') {
  html = '';
  for (let i = 0; i < 30; i++) {
    const r = await fetch(url + '?v=' + Date.now(), { cache: 'no-store' });
    if (r.ok) { const t = await r.text(); if (t === local) { html = t; break; } }
    await new Promise(res => setTimeout(res, 10000));
  }
  if (!html) { console.error(`FAIL  Live page did not update within 5 minutes: ${url}`); process.exit(1); }
}

const P = JSON.parse(html.match(/const P = (\{.*?\});/)[1]);
const b64 = s => Uint8Array.from(Buffer.from(s, 'base64'));
async function open(pw) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: b64(P.s), iterations: P.n }, base, 256);
  const key = await crypto.subtle.importKey('raw', bits, 'AES-GCM', false, ['decrypt']);
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(P.i) }, key, b64(P.d)));
}

let ok = true;
try { const out = await open(client.password); console.log(`OK    Right password opens it (${Math.round(out.length / 1024)} KB report).`); }
catch { console.log('FAIL  Right password does not open it.'); ok = false; }
try { await open(client.password + '-wrong'); console.log('FAIL  A wrong password opened it.'); ok = false; }
catch { console.log('OK    Wrong password is rejected.'); }
if (/<h1|<table|<canvas/i.test(html.replace(/<form[\s\S]*?<\/form>/, ''))) { console.log('FAIL  Readable report content found in the locked page.'); ok = false; }
console.log((ok ? 'OK    ' : 'FAIL  ') + (flag === '--live' ? url : `${slug}/index.html (local)`));
process.exit(ok ? 0 : 1);
