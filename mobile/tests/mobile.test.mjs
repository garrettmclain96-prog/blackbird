import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
const esbuild = createRequire(require.resolve('wrangler/package.json'))('esbuild');
const out = await mkdtemp(path.join(tmpdir(), 'blackbird-mobile-test-'));
await esbuild.build({ entryPoints: ['lib/engine.ts', 'lib/export.ts', 'app/api/scan/route.ts', 'app/api/catalog/route.ts'], bundle: true, platform: 'node', format: 'esm', outbase: '.', outdir: out, tsconfig: 'tsconfig.json', logLevel: 'silent' });
const engine = await import(pathToFileURL(path.join(out, 'lib/engine.js')));
const exporter = await import(pathToFileURL(path.join(out, 'lib/export.js')));
const scan = await import(pathToFileURL(path.join(out, 'app/api/scan/route.js')));
const catalog = await import(pathToFileURL(path.join(out, 'app/api/catalog/route.js')));
const rule = { id: 'test', name: 'Test', cat: 'coding', uri_check: 'https://profiles.example.net/{account}', e_code: 200, e_string: 'account-exists', m_code: 404, m_string: 'account-missing' };

test('catalog IDs are unique and email automation is limited to read-only rules', () => {
  const users = engine.catalogFor('username'); assert.equal(users.length, 692); assert.equal(new Set(users.map(x=>x.id)).size, users.length); assert.ok(users.filter(s=>s.popular).length >= 20);
  const mail = engine.catalogFor('email'); assert.equal(mail.length, 16); assert.equal(mail.filter(s=>s.automated).length, 8);
  assert.equal(engine.canAutomate({ ...rule, method: 'POST' }), false); assert.equal(engine.canAutomate({ ...rule, post_body: '{}' }), false);
});
test('generic successful pages are uncertain, never fabricated matches', () => {
  assert.equal(engine.classifyResponse(rule, 200, '<html>Welcome</html>').status, 'unknown');
  assert.equal(engine.classifyResponse(rule, 200, 'account-exists').status, 'found');
  assert.equal(engine.classifyResponse(rule, 404, 'account-missing').status, 'not_found');
});
test('blocked and rate-limited responses never become not-found', () => {
  for (const code of [401,403,429]) assert.equal(engine.classifyResponse(rule, code, 'account-missing').status, 'blocked');
  assert.equal(engine.classifyResponse(rule, 200, '<title>Just a moment</title> cf-chl-').status, 'blocked');
  assert.equal(engine.classifyResponse(rule, 502, 'account-missing').status, 'error');
});
test('same-code missing markers and empty missing markers are handled independently', () => {
  const same = { ...rule, m_code: 200, m_string: 'missing-user' };
  assert.equal(engine.classifyResponse(same, 200, 'missing-user').status, 'not_found');
  assert.equal(engine.classifyResponse({ ...same, m_string: '' }, 200, 'account-exists').status, 'found');
});
test('queries are normalized without accepting URLs, query injection or excessive lengths', () => {
  assert.equal(engine.validateQuery(' @garrettmclain96-prog ', 'username'), 'garrettmclain96-prog');
  assert.equal(engine.validateQuery(' Example@Example.org ', 'email'), 'example@example.org');
  for (const query of ['https://somewhere.com/name','abc?admin=1','abc/../root','x'.repeat(65),'']) assert.throws(()=>engine.validateQuery(query, 'username'));
  assert.throws(()=>engine.validateQuery('not-an-email', 'email'));
});
test('private and non-HTTPS destinations are blocked, including redirect hops', async () => {
  for (const u of ['http://site.com','https://127.0.0.1','https://[::1]','https://169.254.169.254/latest','https://a.internal','https://localhost','https://site.com:8888','https://user:pass@site.com']) assert.equal(engine.isPublicUrl(u), false, u);
  let calls=0; const result = await engine.checkPlatform(rule, 'name', 'username', undefined, async()=>{calls++;return new Response(null,{status:302,headers:{location:'https://127.0.0.1/private'}});});
  assert.equal(calls,1); assert.equal(result.status,'error');
});
test('a real check request encodes the account and applies response rules', async () => {
  let requested=''; const result = await engine.checkPlatform(rule, 'a name', 'username', undefined, async(url, opts)=>{requested=String(url);assert.equal(opts.redirect,'manual');return new Response('account-exists',{status:200});});
  assert.equal(requested,'https://profiles.example.net/a%20name'); assert.equal(result.status,'found'); assert.equal(result.httpStatus,200);
});
test('Gravatar email hashing uses normalized SHA-256 without including the email in its URL', async () => {
  const site = engine.rulesFor('email').find(s=>s.name==='Gravatar'); let url='';
  const result = await engine.checkPlatform(site, 'someone@example.org', 'email', undefined, async(input)=>{url=String(input);return new Response('User not found',{status:404});});
  assert.match(url,/\/[a-f0-9]{64}\.json$/); assert.ok(!url.includes('@')); assert.equal(result.status,'not_found');
});
test('unsupported requests never contact an upstream platform', async()=>{
  const result=await engine.checkPlatform({...rule,method:'POST'},'name','username',undefined,async()=>{throw new Error('must not fetch');});assert.equal(result.status,'manual');
});
test('scan endpoint validates origins, batch size and catalog IDs', async()=>{
  const req=(body,origin='https://app.example.org')=>new Request('https://app.example.org/api/scan',{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify(body)});
  assert.equal((await scan.POST(req({mode:'username',query:'x',ids:['u209']},'https://other.example.org'))).status,403);
  assert.equal((await scan.POST(req({mode:'username',query:'x',ids:Array(7).fill('u209')}))).status,400);
  assert.equal((await scan.POST(req({mode:'username',query:'x',ids:['invented']}))).status,400);
});
test('scan endpoint streams platform results and a completion event', async(t)=>{
  const before=globalThis.fetch;t.after(()=>{globalThis.fetch=before;}); globalThis.fetch=async()=>new Response('{"id": 123, "login":"fixture"}',{status:200});
  const response=await scan.POST(new Request('https://app.example.org/api/scan',{method:'POST',headers:{'content-type':'application/json',origin:'https://app.example.org'},body:JSON.stringify({mode:'username',query:'fixture',ids:['u209']})}));
  assert.equal(response.status,200);const events=(await response.text()).trim().split('\n').map(JSON.parse);assert.equal(events[0].result.status,'found');assert.equal(events[0].result.name,'GitHub (User)');assert.equal(events.at(-1).type,'done');
});
test('catalog endpoint returns serializable metadata and supported flags',async()=>{const response=await catalog.GET();const data=await response.json();assert.equal(data.username.length,692);assert.ok(data.username.every(s=>typeof s.automated==='boolean'));});
test('CSV exports escape quotes, newlines and spreadsheet formulas',()=>{
  assert.equal(exporter.csvCell('=SUM(A1)'), '"\'=SUM(A1)"');assert.equal(exporter.csvCell('a"b'), '"a""b"');
  const csv=exporter.buildCsv({query:'@handle',mode:'username',results:[{name:'Quoted, Name',category:'coding',status:'found',detail:'one\ntwo',checkedAt:'2026-10-19',url:'https://example.org'}]});assert.ok(csv.includes('"Quoted, Name"'));assert.ok(csv.includes('"one\ntwo"'));
});
