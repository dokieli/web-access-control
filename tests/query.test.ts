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
import { buildACLContext } from '../src/authorizations.js'
import { agentsWithMode, hasControl, isPublic, modesFor, subjectsWithMode } from '../src/query.js'
import { ACL, Public } from '../src/terms.js'
import type { ACLContext } from '../src/types.js'
import { parseTurtle } from './helpers.js'

const doc = 'https://example.org/data/doc'
const docACL = 'https://example.org/data/doc.acl'
const giuseppina = 'https://example.org/giuseppina#i'
const liliano = 'https://example.org/liliano#i'
const group = 'https://example.org/groups/team#g'

function ownContext(turtle: string): ACLContext {
  return buildACLContext({
    resource: doc,
    defaultACLResource: docACL,
    effectiveACLResource: docACL,
    dataset: parseTurtle(turtle, { baseIRI: docACL }),
  })
}

const fixture = `
@prefix acl: <http://www.w3.org/ns/auth/acl#> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .

<#owner> a acl:Authorization ;
  acl:accessTo <${doc}> ;
  acl:agent <${giuseppina}> ;
  acl:mode acl:Read, acl:Write, acl:Control .

<#readers> a acl:Authorization ;
  acl:accessTo <${doc}> ;
  acl:agent <${liliano}> ;
  acl:agentGroup <${group}> ;
  acl:mode acl:Read .

<#public> a acl:Authorization ;
  acl:accessTo <${doc}> ;
  acl:agentClass foaf:Agent ;
  acl:mode acl:Read .
`

describe('modesFor', () => {
  it('aggregates modes across authorizations for an agent', () => {
    const ctx = ownContext(fixture)
    expect([...modesFor(ctx, { type: 'agent', iri: giuseppina })].sort()).toEqual(['Control', 'Read', 'Write'])
    expect([...modesFor(ctx, { type: 'agent', iri: liliano })]).toEqual(['Read'])
  })

  it('distinguishes subject types', () => {
    const ctx = ownContext(fixture)
    expect(modesFor(ctx, { type: 'agent', iri: group }).size).toBe(0)
    expect([...modesFor(ctx, { type: 'agentGroup', iri: group })]).toEqual(['Read'])
    expect([...modesFor(ctx, Public)]).toEqual(['Read'])
  })
})

describe('subjectsWithMode', () => {
  it('lists every subject holding a mode without duplicates', () => {
    const ctx = ownContext(fixture)
    const readers = subjectsWithMode(ctx, 'Read')
    expect(readers).toHaveLength(4)
    expect(readers).toContainEqual({ type: 'agent', iri: giuseppina })
    expect(readers).toContainEqual({ type: 'agent', iri: liliano })
    expect(readers).toContainEqual({ type: 'agentGroup', iri: group })
    expect(readers).toContainEqual(Public)
  })

  it('filters by mode', () => {
    const ctx = ownContext(fixture)
    expect(subjectsWithMode(ctx, 'Control')).toEqual([{ type: 'agent', iri: giuseppina }])
  })
})

describe('isPublic and hasControl', () => {
  it('reports public read access', () => {
    const ctx = ownContext(fixture)
    expect(isPublic(ctx)).toBe(true)
    expect(isPublic(ctx, 'Write')).toBe(false)
  })

  it('reports control for an exact subject', () => {
    const ctx = ownContext(fixture)
    expect(hasControl(ctx, { type: 'agent', iri: giuseppina })).toBe(true)
    expect(hasControl(ctx, { type: 'agent', iri: liliano })).toBe(false)
  })

  it('matches a bare IRI in any subject position', () => {
    const ctx = ownContext(`
@prefix acl: <http://www.w3.org/ns/auth/acl#> .

<#admins> a acl:Authorization ;
  acl:accessTo <${doc}> ;
  acl:agentGroup <https://example.org/groups#admins> ;
  acl:mode acl:Control .
`)
    const group = 'https://example.org/groups#admins'
    expect(hasControl(ctx, group)).toBe(true)
    expect(hasControl(ctx, { type: 'agent', iri: group })).toBe(false)
    expect(hasControl(ctx, { type: 'agentGroup', iri: group })).toBe(true)
    expect([...modesFor(ctx, group)]).toEqual(['Control'])
  })
})

const conditionalFixture = `
@prefix acl: <http://www.w3.org/ns/auth/acl#> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .

<#owner> a acl:Authorization ;
  acl:accessTo <${doc}> ;
  acl:agent <${giuseppina}> ;
  acl:mode acl:Read, acl:Write, acl:Control .

<#trustedClient> a acl:Authorization ;
  acl:accessTo <${doc}> ;
  acl:agent <${liliano}> ;
  acl:agentClass foaf:Agent ;
  acl:mode acl:Write, acl:Control ;
  acl:condition <#clientCond> .

<#clientCond> a acl:ClientCondition ;
  acl:client <https://app.example.net/id> .
`

describe('conditional authorizations', () => {
  // queries do not evaluate conditions: a conditional grant reads as unconditional
  it('reports modes of a conditional authorization', () => {
    const ctx = ownContext(conditionalFixture)
    expect([...modesFor(ctx, { type: 'agent', iri: liliano })].sort()).toEqual(['Control', 'Write'])
    expect(hasControl(ctx, { type: 'agent', iri: liliano })).toBe(true)
    expect(isPublic(ctx, 'Write')).toBe(true)
    expect(agentsWithMode(ctx, 'Write').sort()).toEqual([giuseppina, liliano])
    expect(subjectsWithMode(ctx, 'Control')).toContainEqual(Public)
  })

  it('keeps conditions on the authorization for callers to evaluate', () => {
    const ctx = ownContext(conditionalFixture)
    const conditioned = ctx.authorizations.filter(authorization => authorization.condition.length > 0)
    expect(conditioned.map(authorization => authorization.id)).toEqual([docACL + '#trustedClient'])
    expect(conditioned[0].condition[0].properties[ACL + 'client']).toEqual(['https://app.example.net/id'])
  })

  it('does not treat a condition as an authorization or a subject', () => {
    const ctx = ownContext(conditionalFixture)
    expect(ctx.authorizations.map(authorization => authorization.id)).not.toContain(docACL + '#clientCond')
    expect(subjectsWithMode(ctx, 'Write').map(subject => subject.iri)).not.toContain('https://app.example.net/id')
  })
})

describe('agentsWithMode', () => {
  it('returns WebIDs only, not classes or groups', () => {
    const ctx = ownContext(fixture)
    expect(agentsWithMode(ctx, 'Read').sort()).toEqual([giuseppina, liliano])
  })
})
