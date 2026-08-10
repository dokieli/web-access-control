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

import { describe, expect, it } from 'vitest'
import { findEffectiveACL, parentContainer } from '../src/discovery.js'
import { ACLAccessDeniedError, ACLNotDeterminedError } from '../src/errors.js'
import { emptyResponse, stubFetch, textResponse, turtleParser } from './helpers.js'

const doc = 'https://example.org/data/doc'
const docACL = 'https://example.org/data/doc.acl'
const container = 'https://example.org/data/'
const containerACL = 'https://example.org/data/.acl'

const ownACLTurtle = `
@prefix acl: <http://www.w3.org/ns/auth/acl#> .

<#owner> a acl:Authorization ;
  acl:accessTo <${doc}> ;
  acl:agent <https://example.org/luigi#i> ;
  acl:mode acl:Read, acl:Write, acl:Control .
`

const containerACLTurtle = `
@prefix acl: <http://www.w3.org/ns/auth/acl#> .

<#defaults> a acl:Authorization ;
  acl:default <${container}> ;
  acl:agent <https://example.org/luigi#i> ;
  acl:mode acl:Read, acl:Write, acl:Control .

<#containerOnly> a acl:Authorization ;
  acl:accessTo <${container}> ;
  acl:agent <https://example.org/luigi#i> ;
  acl:mode acl:Read .
`

describe('parentContainer', () => {
  it('walks from a resource to its container', () => {
    expect(parentContainer(doc)).toBe(container)
  })

  it('walks from a container to its parent', () => {
    expect(parentContainer(container)).toBe('https://example.org/')
  })

  it('stops at the root container', () => {
    expect(parentContainer('https://example.org/')).toBeUndefined()
  })
})

describe('findEffectiveACL', () => {
  it('resolves a resource with its own ACL', async () => {
    const fetch = stubFetch({
      ['HEAD ' + doc]: () => emptyResponse({ headers: { Link: `<doc.acl>; rel="acl"` } }),
      ['GET ' + docACL]: () => textResponse(ownACLTurtle),
    })

    const ctx = await findEffectiveACL(doc, { fetch, parse: turtleParser })

    expect(ctx.resource).toBe(doc)
    expect(ctx.defaultACLResource).toBe(docACL)
    expect(ctx.effectiveACLResource).toBe(docACL)
    expect(ctx.inherited).toBe(false)
    expect(ctx.authorizations).toHaveLength(1)
    expect(ctx.authorizations[0].agent).toEqual(['https://example.org/luigi#i'])
    expect(ctx.authorizations[0].mode.sort()).toEqual(['Control', 'Read', 'Write'])
  })

  it('walks to the container when the resource ACL does not exist', async () => {
    const fetch = stubFetch({
      ['HEAD ' + doc]: () => emptyResponse({ headers: { Link: `<doc.acl>; rel="acl"` } }),
      ['GET ' + docACL]: () => emptyResponse({ status: 404 }),
      ['HEAD ' + container]: () => emptyResponse({ headers: { Link: `<.acl>; rel="acl"` } }),
      ['GET ' + containerACL]: () => textResponse(containerACLTurtle),
    })

    const ctx = await findEffectiveACL(doc, { fetch, parse: turtleParser })

    expect(ctx.defaultACLResource).toBe(docACL)
    expect(ctx.effectiveACLResource).toBe(containerACL)
    expect(ctx.effectiveContainer).toBe(container)
    expect(ctx.inherited).toBe(true)
    // only acl:default authorizations govern member resources
    expect(ctx.authorizations).toHaveLength(1)
    expect(ctx.authorizations[0].id).toBe(containerACL + '#defaults')
  })

  it('stops with ACLAccessDeniedError on a 403 candidate', async () => {
    const fetch = stubFetch({
      ['HEAD ' + doc]: () => emptyResponse({ headers: { Link: `<doc.acl>; rel="acl"` } }),
      ['GET ' + docACL]: () => emptyResponse({ status: 403 }),
    })

    await expect(findEffectiveACL(doc, { fetch, parse: turtleParser }))
      .rejects.toBeInstanceOf(ACLAccessDeniedError)
  })

  it('fails when no rel=acl link is advertised', async () => {
    const fetch = stubFetch({
      ['HEAD ' + doc]: () => emptyResponse(),
      ['GET ' + doc]: () => emptyResponse(),
    })

    await expect(findEffectiveACL(doc, { fetch, parse: turtleParser }))
      .rejects.toBeInstanceOf(ACLNotDeterminedError)
  })

  // RFC 9110 lets a server omit headers computed while generating the content
  it('falls back to GET when HEAD omits the Link header', async () => {
    const fetch = stubFetch({
      ['HEAD ' + doc]: () => emptyResponse(),
      ['GET ' + doc]: () => textResponse('', { headers: { Link: `<doc.acl>; rel="acl"` } }),
      ['GET ' + docACL]: () => textResponse(ownACLTurtle),
    })

    const ctx = await findEffectiveACL(doc, { fetch, parse: turtleParser })

    expect(ctx.effectiveACLResource).toBe(docACL)
    expect(fetch.calls.map(call => (call.init?.method ?? 'GET') + ' ' + call.url))
      .toEqual(['HEAD ' + doc, 'GET ' + doc, 'GET ' + docACL])
  })

  it('falls back to GET when HEAD is not allowed', async () => {
    const fetch = stubFetch({
      ['HEAD ' + doc]: () => emptyResponse({ status: 405, headers: { Allow: 'GET, OPTIONS' } }),
      ['GET ' + doc]: () => textResponse('', { headers: { Link: `<doc.acl>; rel="acl"` } }),
      ['GET ' + docACL]: () => textResponse(ownACLTurtle),
    })

    const ctx = await findEffectiveACL(doc, { fetch, parse: turtleParser })

    expect(ctx.effectiveACLResource).toBe(docACL)
  })

  it('does not GET when HEAD already advertised the ACL resource', async () => {
    const fetch = stubFetch({
      ['HEAD ' + doc]: () => emptyResponse({ headers: { Link: `<doc.acl>; rel="acl"` } }),
      ['GET ' + docACL]: () => textResponse(ownACLTurtle),
    })

    await findEffectiveACL(doc, { fetch, parse: turtleParser })

    expect(fetch.calls.filter(call => call.url === doc)).toHaveLength(1)
  })

  it('falls back to GET on the container during the walk', async () => {
    const fetch = stubFetch({
      ['HEAD ' + doc]: () => emptyResponse({ headers: { Link: `<doc.acl>; rel="acl"` } }),
      ['GET ' + docACL]: () => emptyResponse({ status: 404 }),
      ['HEAD ' + container]: () => emptyResponse(),
      ['GET ' + container]: () => textResponse('', { headers: { Link: `<.acl>; rel="acl"` } }),
      ['GET ' + containerACL]: () => textResponse(containerACLTurtle),
    })

    const ctx = await findEffectiveACL(doc, { fetch, parse: turtleParser })

    expect(ctx.effectiveACLResource).toBe(containerACL)
    expect(ctx.inherited).toBe(true)
  })

  it('fails after exhausting ancestors', async () => {
    const root = 'https://example.org/'
    const rootACL = 'https://example.org/.acl'
    const fetch = stubFetch({
      ['HEAD ' + doc]: () => emptyResponse({ headers: { Link: `<doc.acl>; rel="acl"` } }),
      ['GET ' + docACL]: () => emptyResponse({ status: 404 }),
      ['HEAD ' + container]: () => emptyResponse({ headers: { Link: `<.acl>; rel="acl"` } }),
      ['GET ' + containerACL]: () => emptyResponse({ status: 404 }),
      ['HEAD ' + root]: () => emptyResponse({ headers: { Link: `<.acl>; rel="acl"` } }),
      ['GET ' + rootACL]: () => emptyResponse({ status: 404 }),
    })

    await expect(findEffectiveACL(doc, { fetch, parse: turtleParser }))
      .rejects.toBeInstanceOf(ACLNotDeterminedError)
  })

  it('skips the initial HEAD when the ACL resource is known', async () => {
    const fetch = stubFetch({
      ['GET ' + docACL]: () => textResponse(ownACLTurtle),
    })

    const ctx = await findEffectiveACL(doc, { fetch, parse: turtleParser, aclResource: 'doc.acl' })

    expect(ctx.effectiveACLResource).toBe(docACL)
    expect(ctx.inherited).toBe(false)
    expect(fetch.calls).toHaveLength(1)
  })

  it('falls back to the container walk when the known ACL resource does not exist', async () => {
    const fetch = stubFetch({
      ['GET ' + docACL]: () => emptyResponse({ status: 404 }),
      ['HEAD ' + container]: () => emptyResponse({ headers: { Link: `<.acl>; rel="acl"` } }),
      ['GET ' + containerACL]: () => textResponse(containerACLTurtle),
    })

    const ctx = await findEffectiveACL(doc, { fetch, parse: turtleParser, aclResource: docACL })

    expect(ctx.defaultACLResource).toBe(docACL)
    expect(ctx.effectiveACLResource).toBe(containerACL)
    expect(ctx.inherited).toBe(true)
  })

  it('captures acl:condition link relations on the ACL response', async () => {
    const fetch = stubFetch({
      ['HEAD ' + doc]: () => emptyResponse({ headers: { Link: `<doc.acl>; rel="acl"` } }),
      ['GET ' + docACL]: () => textResponse(ownACLTurtle, {
        headers: { Link: `<https://example.org/conditions/client>; rel="http://www.w3.org/ns/auth/acl#condition"` },
      }),
    })

    const ctx = await findEffectiveACL(doc, { fetch, parse: turtleParser })

    expect(ctx.conditions).toEqual(['https://example.org/conditions/client'])
  })
})
