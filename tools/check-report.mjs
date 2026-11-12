#!/usr/bin/env node
// Pre-publish safety checks on an APPROVED, unlocked report.
// Usage: node tools/check-report.mjs <client-slug> <report.html>
// Exits 1 if anything would break online or the report looks like the wrong client.

import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const clients = JSON.parse(readFileSync(resolve(repoRoot, '..', 'bb-reports-private', 'clients.json'), 'utf8'));
const [slug, file] = process.argv.slice(2);
const client = clients[slug];
if (!client) { console.error(`No client "${slug}" in bb-reports-private/clients.json`); process.exit(1); }
if (!file || !existsSync(file)) { console.error(`Report file not found: ${file}`); process.exit(1); }

const html = readFileSync(file, 'utf8');
const problems = [], warnings = [];

// 1. Wrong-client guard: the report must mention this client, and no other client's name.
const names = [client.name, ...(client.aliases || [])].map(s => s.toLowerCase());
const lower = html.toLowerCase();
if (!names.some(n => lower.includes(n))) problems.push(`Report never mentions "${client.name}". Is this the right client's report?`);
for (const [other, c] of Object.entries(clients)) {
  if (other === slug) continue;
  for (const n of [c.name, ...(c.aliases || [])]) if (n && n.length > 3 && lower.includes(n.toLowerCase())) problems.push(`Report mentions another client: "${n}" (${other}).`);
}

// 2. Self-contained: nothing that points at this laptop or at files that won't be online.
const refs = [...html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi)].map(m => m[1]);
for (const r of refs) {
  if (/^(https?:|data:|#|mailto:|tel:|javascript:)/i.test(r)) continue;
  problems.push(`Links to a local file that won't exist online: ${r}`);
}
if (/file:\/\/|\/Users\//.test(html)) problems.push('Contains a path on this Mac (file:// or /Users/).');
for (const m of html.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
  if (!/^(https?:|data:|#)/i.test(m[1])) problems.push(`CSS points at a local file: ${m[1]}`);
}

// 3. Leftover placeholders.
for (const p of ['lorem ipsum', '[todo', 'todo:', 'xxx', '{{', 'placeholder']) if (lower.includes(p)) warnings.push(`Contains "${p}". Check nothing is unfinished.`);

// 4. Password must never be inside the report.
if (client.password && html.includes(client.password)) problems.push('The client password appears inside the report.');

const kb = Math.round(statSync(file).size / 1024);
if (kb > 15000) problems.push(`Report is ${kb} KB. Too big for GitHub Pages comfort; compress images.`);

for (const w of warnings) console.log('WARN  ' + w);
for (const p of problems) console.log('FAIL  ' + p);
if (problems.length) process.exit(1);
console.log(`OK    ${client.name} report passed checks (${kb} KB).`);
