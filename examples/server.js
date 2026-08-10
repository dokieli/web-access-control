/*!
Copyright 2012-2026 Sarven Capadisli <https://csarven.ca/>
Copyright 2023-2026 Virginia Balseiro <https://virginiabalseiro.com/>

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

// WAC-serving origin for the example app: local test documents that advertise
// Link rel="acl" and WAC-Allow, ACL resources held in memory, and PATCH over
// application/sparql-update or text/n3. Run: node examples/server.js

import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Parser, Writer } from 'n3'
import { parsePatch, quadKey } from './patch.js'

const root = fileURLToPath(new URL('..', import.meta.url))
const port = Number(process.env.PORT ?? 3001)
const origin = `http://localhost:${port}`

const ACL = 'http://www.w3.org/ns/auth/acl#'
const FOAF = 'http://xmlns.com/foaf/0.1/'
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
const PREFIXES = { acl: ACL, foaf: FOAF }
const ACCEPT_PATCH = 'application/sparql-update, text/n3'

const parseTurtle = (text, baseIRI) => new Parser({ baseIRI }).parse(text)

function serializeTurtle(quads, baseIRI) {
  const writer = new Writer({ prefixes: PREFIXES, baseIRI })
  writer.addQuads(quads)
  let out = ''
  writer.end((error, result) => { if (error) throw error; out = result })
  return out
}

// the browser is "signed in" as this WebID; WAC-Allow user= is computed for it
const OWNER = 'https://giuseppina.example/#me'
const LILIANO = 'https://liliano.example/#me'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS, PATCH, POST',
  'Access-Control-Allow-Headers': 'Accept, Authorization, Content-Type',
  'Access-Control-Expose-Headers': 'Accept-Patch, Allow, Link, WAC-Allow',
}

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.map': 'application/json',
  '.md': 'text/plain',
  '.svg': 'image/svg+xml',
}

// Every demo resource advertises Link rel="acl" except /orphan.html, which
// makes findEffectiveACL throw ACLNotDeterminedError.
const RESOURCES = {
  '/docs/': { title: 'Documents', container: true },
  '/docs/test.html': {
    title: 'Test document',
    note: 'No ACL resource of its own, so access is inherited from /docs/.acl. Granting here copies the container authorizations into /docs/test.html.acl.',
  },
  '/docs/notes.html': {
    title: 'Notes',
    note: 'Has its own ACL resource, so plans patch it in place.',
  },
  '/conditions/': { title: 'Conditions', container: true },
  '/conditions/report.html': {
    title: 'Report with client conditions',
    note: 'Its ACL resource advertises Link rel="acl:condition", so ACLContext.conditions is non-empty and planGrant attaches an acl:ClientCondition to what it writes.',
  },
  '/private/secret.html': {
    title: 'Forbidden ACL',
    note: 'Its ACL resource answers 403, so discovery stops with ACLAccessDeniedError instead of walking up.',
  },
  '/orphan.html': {
    title: 'No acl link relation',
    note: 'Served without Link rel="acl", so discovery throws ACLNotDeterminedError.',
    noACLLink: true,
  },
}

const INITIAL_ACLS = {
  '/docs/.acl': `
@prefix acl: <${ACL}>.
@prefix foaf: <${FOAF}>.

<#owner> a acl:Authorization;
  acl:agent <${OWNER}>;
  acl:accessTo </docs/>;
  acl:default </docs/>;
  acl:mode acl:Read, acl:Write, acl:Control.

<#public> a acl:Authorization;
  acl:agentClass foaf:Agent;
  acl:accessTo </docs/>;
  acl:default </docs/>;
  acl:mode acl:Read.
`,
  '/docs/notes.html.acl': `
@prefix acl: <${ACL}>.

<#owner> a acl:Authorization;
  acl:agent <${OWNER}>;
  acl:accessTo <notes.html>;
  acl:mode acl:Read, acl:Write, acl:Control.

<#liliano> a acl:Authorization;
  acl:agent <${LILIANO}>;
  acl:accessTo <notes.html>;
  acl:mode acl:Read.
`,
  '/conditions/.acl': `
@prefix acl: <${ACL}>.

<#owner> a acl:Authorization;
  acl:agent <${OWNER}>;
  acl:accessTo </conditions/>;
  acl:default </conditions/>;
  acl:mode acl:Read, acl:Write, acl:Control.
`,
  '/conditions/report.html.acl': `
@prefix acl: <${ACL}>.
@prefix foaf: <${FOAF}>.

<#owner> a acl:Authorization;
  acl:agent <${OWNER}>;
  acl:accessTo <report.html>;
  acl:condition <#anyClient>;
  acl:mode acl:Read, acl:Write, acl:Control.

<#anyClient> a acl:ClientCondition;
  acl:clientClass foaf:Agent.
`,
}

/** path to quads */
const store = new Map()

function seed() {
  store.clear()
  for (const [path, turtle] of Object.entries(INITIAL_ACLS)) {
    store.set(path, parseTurtle(turtle, origin + path))
  }
}
seed()

const aclPathFor = path => path + '.acl'

function parentContainer(path) {
  if (path === '/') return undefined
  const trimmed = path.endsWith('/') ? path.slice(0, -1) : path
  return trimmed.slice(0, trimmed.lastIndexOf('/') + 1)
}

/** the same walk findEffectiveACL performs, over the in-memory store */
function effectiveACL(path) {
  let candidate = path
  for (;;) {
    const aclPath = aclPathFor(candidate)
    if (store.has(aclPath)) return { aclPath, container: candidate === path ? undefined : candidate }
    const container = parentContainer(candidate)
    if (container === undefined) return undefined
    candidate = container
  }
}

function objects(quads, subject, predicate) {
  return quads
    .filter(q => q.subject.value === subject && q.predicate.value === predicate)
    .map(q => q.object.value)
}

function modesFor(path, subjects) {
  const effective = effectiveACL(path)
  const modes = new Set()
  if (!effective) return modes

  const quads = store.get(effective.aclPath)
  const rules = new Set(quads
    .filter(q => q.predicate.value === RDF_TYPE && q.object.value === ACL + 'Authorization')
    .map(q => q.subject.value))

  for (const rule of rules) {
    const scoped = effective.container === undefined
      ? objects(quads, rule, ACL + 'accessTo').includes(origin + path)
      : objects(quads, rule, ACL + 'default').includes(origin + effective.container)
    if (!scoped) continue

    const matches = ['agent', 'agentClass', 'agentGroup']
      .some(type => objects(quads, rule, ACL + type).some(iri => subjects.includes(iri)))
    if (!matches) continue

    for (const mode of objects(quads, rule, ACL + 'mode')) {
      if (mode.startsWith(ACL)) modes.add(mode.slice(ACL.length).toLowerCase())
    }
  }

  return modes
}

function wacAllow(path) {
  const user = modesFor(path, [OWNER, FOAF + 'Agent', ACL + 'AuthenticatedAgent'])
  const publicModes = modesFor(path, [FOAF + 'Agent'])
  return `user="${[...user].join(' ')}",public="${[...publicModes].join(' ')}"`
}

const readBody = req =>
  new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })

function send(res, status, headers, body) {
  res.writeHead(status, headers)
  res.end(body)
}

function documentHTML(path, resource) {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>${resource.title}</title>
  </head>
  <body>
    <h1>${resource.title}</h1>
    <p><code>${origin}${path}</code></p>
    <p>${resource.note ?? 'Demo resource.'}</p>
    <p><a href="/examples/">Back to the example app</a></p>
  </body>
</html>
`
}

function resourceRoute(res, method, path) {
  const resource = RESOURCES[path]
  const headers = { 'Content-Type': 'text/html', 'WAC-Allow': wacAllow(path), ...CORS }
  if (!resource.noACLLink) headers.Link = `<${aclPathFor(path)}>; rel="acl"`

  if (method === 'OPTIONS') return send(res, 204, { Allow: 'GET, HEAD, OPTIONS', ...headers })
  if (method === 'HEAD') return send(res, 200, headers)
  if (method !== 'GET') return send(res, 405, { Allow: 'GET, HEAD, OPTIONS', ...CORS })
  send(res, 200, headers, documentHTML(path, resource))
}

function aclHeaders(path) {
  const headers = { 'Content-Type': 'text/turtle', 'Accept-Patch': ACCEPT_PATCH, ...CORS }
  // https://solid.github.io/web-access-control-spec/#client-link-condition
  if (path.startsWith('/conditions/')) {
    headers.Link = `<${origin}${path}#anyClient>; rel="${ACL}condition"`
  }
  return headers
}

async function aclRoute(req, res, method, path) {
  if (path === '/private/secret.html.acl') {
    return send(res, 403, { 'Content-Type': 'text/plain', ...CORS }, 'Forbidden: this demo ACL resource is not readable.')
  }

  if (method === 'OPTIONS') {
    return send(res, 204, { Allow: 'GET, HEAD, OPTIONS, PATCH', ...aclHeaders(path) })
  }

  if (method === 'GET' || method === 'HEAD') {
    const quads = store.get(path)
    if (quads === undefined) return send(res, 404, { 'Content-Type': 'text/plain', ...CORS }, `No ACL resource at ${path}`)
    const body = serializeTurtle(quads, origin + path)
    return send(res, 200, aclHeaders(path), method === 'HEAD' ? undefined : body)
  }

  if (method !== 'PATCH') {
    return send(res, 405, { Allow: 'GET, HEAD, OPTIONS, PATCH', ...CORS })
  }

  const contentType = (req.headers['content-type'] ?? '').split(';')[0].trim()
  if (contentType !== 'application/sparql-update' && contentType !== 'text/n3') {
    return send(res, 415, { 'Accept-Patch': ACCEPT_PATCH, ...CORS }, `Unsupported patch media type: ${contentType}`)
  }

  let patch
  try {
    patch = parsePatch(await readBody(req), { baseIRI: origin + path })
  }
  catch (error) {
    return send(res, 400, { 'Content-Type': 'text/plain', ...CORS }, `Could not parse the patch: ${error.message}`)
  }

  const quads = store.get(path) ?? []
  const present = new Map(quads.map(quad => [quadKey(quad), quad]))

  // real servers reject a patch whose deletes are not all present; keeping
  // that here means a mis-planned delete shows up as a 409 in the example
  const missing = patch.deletes.filter(quad => !present.has(quadKey(quad)))
  if (missing.length) {
    const body = serializeTurtle(missing, origin + path)
    return send(res, 409, { 'Content-Type': 'text/plain', ...CORS }, `Patch deletes triples that are not present:\n\n${body}`)
  }

  const deleted = new Set(patch.deletes.map(quadKey))
  const kept = quads.filter(quad => !deleted.has(quadKey(quad)))
  for (const quad of patch.inserts) {
    const key = quadKey(quad)
    if (!kept.some(existing => quadKey(existing) === key)) kept.push(quad)
  }

  if (kept.length) store.set(path, kept)
  else store.delete(path)

  console.log(`  patched ${path}: -${patch.deletes.length} +${patch.inserts.length} (${kept.length} triples)`)
  send(res, 204, CORS)
}

async function serveStatic(pathname, res) {
  const path = pathname === '/examples' || pathname === '/examples/' ? '/examples/index.html' : pathname
  const resolved = normalize(join(root, '.' + path))
  if (!resolved.startsWith(root)) return send(res, 404, {}, 'Not found')
  try {
    const data = await readFile(resolved)
    send(res, 200, { 'Content-Type': MIME[extname(resolved)] ?? 'application/octet-stream' }, data)
  }
  catch {
    send(res, 404, { 'Content-Type': 'text/plain' }, `Not found: ${pathname}`)
  }
}

const server = createServer(async (req, res) => {
  const method = req.method.toUpperCase()
  const { pathname } = new URL(req.url, origin)
  console.log(`${method} ${pathname}`)

  try {
    if (pathname === '/') return send(res, 302, { Location: '/examples/' })
    if (pathname === '/reset') {
      if (method === 'OPTIONS') return send(res, 204, { Allow: 'POST, OPTIONS', ...CORS })
      seed()
      console.log('  demo ACL resources reset')
      return send(res, 204, CORS)
    }
    if (pathname.endsWith('.acl')) return await aclRoute(req, res, method, pathname)
    if (pathname in RESOURCES) return resourceRoute(res, method, pathname)
    await serveStatic(pathname, res)
  }
  catch (error) {
    console.error(error)
    send(res, 500, { 'Content-Type': 'text/plain' }, String(error))
  }
})

server.listen(port, () => {
  console.log(`WAC demo origin + example app: ${origin}/examples/`)
  console.log(`Resources: ${Object.keys(RESOURCES).join(' ')}`)
  console.log(`Signed in as ${OWNER} for WAC-Allow user= purposes; POST /reset restores the ACL resources`)
})
