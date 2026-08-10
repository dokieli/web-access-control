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
import { WACError } from '../src/errors.js'
import { planContainerACL, planGrant, planOwnerControl, planPublicRead, planRevoke } from '../src/plan.js'
import { ACL, FOAF, Public, RDF_TYPE } from '../src/terms.js'
import type { ACLContext } from '../src/types.js'
import { counterIdFactory, hasQuad, parseTurtle, quadsAbout } from './helpers.js'

const doc = 'https://example.org/data/doc'
const docACL = 'https://example.org/data/doc.acl'
const container = 'https://example.org/data/'
const containerACL = 'https://example.org/data/.acl'
const giuseppina = 'https://example.org/giuseppina#i'
const liliano = 'https://example.org/liliano#i'
const flora = 'https://example.org/flora#i'
const pennyLane = 'https://example.org/penny-lane#i'

const PREFIXES = `
@prefix acl: <http://www.w3.org/ns/auth/acl#> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .
`

function ownContext(turtle: string, conditions: string[] = []): ACLContext {
  return buildACLContext({
    resource: doc,
    defaultACLResource: docACL,
    effectiveACLResource: docACL,
    conditions,
    dataset: parseTurtle(PREFIXES + turtle, { baseIRI: docACL }),
  })
}

function inheritedContext(turtle: string, conditions: string[] = []): ACLContext {
  return buildACLContext({
    resource: doc,
    defaultACLResource: docACL,
    effectiveACLResource: containerACL,
    effectiveContainer: container,
    conditions,
    dataset: parseTurtle(PREFIXES + turtle, { baseIRI: containerACL }),
  })
}

const ownFixture = `
<#owner> a acl:Authorization ;
  acl:accessTo <${doc}> ;
  acl:agent <${giuseppina}> ;
  acl:mode acl:Read, acl:Write, acl:Control .

<#friends> a acl:Authorization ;
  acl:accessTo <${doc}> ;
  acl:agent <${liliano}>, <${flora}> ;
  acl:mode acl:Read .

<#public> a acl:Authorization ;
  acl:accessTo <${doc}> ;
  acl:agentClass foaf:Agent ;
  acl:mode acl:Read .
`

describe('planGrant on an own ACL', () => {
  it('inserts a fresh authorization for a new agent', () => {
    const ctx = ownContext(ownFixture)
    const plan = planGrant(ctx, { type: 'agent', iri: pennyLane }, ['Read'], { newId: counterIdFactory() })

    expect(plan.target).toBe(docACL)
    expect(plan.deletes).toEqual([])

    const rule = docACL + '#auth-1'
    expect(hasQuad(plan.inserts, rule, RDF_TYPE, ACL + 'Authorization')).toBe(true)
    expect(hasQuad(plan.inserts, rule, ACL + 'accessTo', doc)).toBe(true)
    expect(hasQuad(plan.inserts, rule, ACL + 'agent', pennyLane)).toBe(true)
    expect(hasQuad(plan.inserts, rule, ACL + 'mode', ACL + 'Read')).toBe(true)
    expect(plan.inserts).toHaveLength(4)
  })

  it('rewrites only the mode triples of a sole-subject authorization', () => {
    const ctx = ownContext(ownFixture)
    const plan = planGrant(ctx, { type: 'agent', iri: giuseppina }, ['Read'], { newId: counterIdFactory() })

    const rule = docACL + '#owner'
    expect(plan.deletes).toHaveLength(3)
    plan.deletes.forEach(q => {
      expect(q.subject.value).toBe(rule)
      expect(q.predicate.value).toBe(ACL + 'mode')
    })
    expect(plan.inserts).toEqual([expect.objectContaining({
      subject: expect.objectContaining({ value: rule }),
      predicate: expect.objectContaining({ value: ACL + 'mode' }),
      object: expect.objectContaining({ value: ACL + 'Read' }),
    })])
  })

  it('splits a shared authorization when one member changes mode', () => {
    const ctx = ownContext(ownFixture)
    const plan = planGrant(ctx, { type: 'agent', iri: liliano }, ['Read', 'Write'], { newId: counterIdFactory() })

    // liliano leaves the shared rule; flora keeps it untouched
    expect(plan.deletes).toHaveLength(1)
    expect(plan.deletes[0].subject.value).toBe(docACL + '#friends')
    expect(plan.deletes[0].object.value).toBe(liliano)

    const rule = docACL + '#auth-1'
    expect(hasQuad(plan.inserts, rule, ACL + 'agent', liliano)).toBe(true)
    expect(hasQuad(plan.inserts, rule, ACL + 'mode', ACL + 'Read')).toBe(true)
    expect(hasQuad(plan.inserts, rule, ACL + 'mode', ACL + 'Write')).toBe(true)
  })

  it('adds a client condition to fresh rules when the ACL enforces conditions', () => {
    const ctx = ownContext(ownFixture, ['https://example.org/conditions/client'])
    const plan = planGrant(ctx, { type: 'agent', iri: pennyLane }, ['Read'], { newId: counterIdFactory() })

    const rule = docACL + '#auth-1'
    const condition = docACL + '#auth-2'
    expect(hasQuad(plan.inserts, rule, ACL + 'condition', condition)).toBe(true)
    expect(hasQuad(plan.inserts, condition, RDF_TYPE, ACL + 'ClientCondition')).toBe(true)
    expect(hasQuad(plan.inserts, condition, ACL + 'clientClass', FOAF + 'Agent')).toBe(true)
  })

  it('sets acl:origin on fresh rules when requested', () => {
    const ctx = ownContext(ownFixture)
    const plan = planGrant(ctx, { type: 'agent', iri: pennyLane }, ['Read'], {
      newId: counterIdFactory(),
      origin: ['https://apps.example.net'],
    })

    expect(hasQuad(plan.inserts, docACL + '#auth-1', ACL + 'origin', 'https://apps.example.net')).toBe(true)
  })

  it('rejects an empty mode list', () => {
    const ctx = ownContext(ownFixture)
    expect(() => planGrant(ctx, { type: 'agent', iri: pennyLane }, [])).toThrow(WACError)
  })

  // such a server would ignore the condition and grant more than the rule states
  it('refuses explicit conditions when the ACL resource advertises no condition support', () => {
    const ctx = ownContext(ownFixture)
    expect(() => planGrant(ctx, { type: 'agent', iri: pennyLane }, ['Read'], {
      conditions: [{ type: 'ClientCondition', property: 'clientClass', iri: FOAF + 'Agent' }],
    })).toThrow(/condition support/)
  })

  it('writes explicit conditions when support is advertised', () => {
    const ctx = ownContext(ownFixture, ['https://example.org/conditions/client'])
    const plan = planGrant(ctx, { type: 'agent', iri: pennyLane }, ['Read'], {
      newId: counterIdFactory(),
      conditions: [{ type: 'IssuerCondition', property: 'issuer', iri: 'https://issuer.example/' }],
    })

    const condition = docACL + '#auth-2'
    expect(hasQuad(plan.inserts, docACL + '#auth-1', ACL + 'condition', condition)).toBe(true)
    expect(hasQuad(plan.inserts, condition, RDF_TYPE, ACL + 'IssuerCondition')).toBe(true)
    expect(hasQuad(plan.inserts, condition, ACL + 'issuer', 'https://issuer.example/')).toBe(true)
  })

  it('strips conditions with an empty array regardless of advertised support', () => {
    const ctx = ownContext(`
<#rule> a acl:Authorization ;
  acl:accessTo <${doc}> ;
  acl:agent <${giuseppina}> ;
  acl:mode acl:Read ;
  acl:condition <#clientCond> .
<#clientCond> a acl:ClientCondition ;
  acl:clientClass foaf:Agent .
`)
    const plan = planGrant(ctx, { type: 'agent', iri: giuseppina }, ['Read'], { conditions: [] })

    const condition = docACL + '#clientCond'
    expect(hasQuad(plan.deletes, docACL + '#rule', ACL + 'condition', condition)).toBe(true)
    expect(hasQuad(plan.deletes, condition, RDF_TYPE, ACL + 'ClientCondition')).toBe(true)
    expect(plan.inserts.some(q => q.predicate.value === ACL + 'condition')).toBe(false)
  })
})

describe('planRevoke on an own ACL', () => {
  it('deletes the whole authorization for a sole subject', () => {
    const ctx = ownContext(ownFixture)
    const plan = planRevoke(ctx, Public)

    const rule = docACL + '#public'
    expect(plan.inserts).toEqual([])
    expect(quadsAbout(plan.deletes, rule)).toHaveLength(4)
    expect(hasQuad(plan.deletes, rule, RDF_TYPE, ACL + 'Authorization')).toBe(true)
    expect(hasQuad(plan.deletes, rule, ACL + 'accessTo', doc)).toBe(true)
    expect(hasQuad(plan.deletes, rule, ACL + 'agentClass', FOAF + 'Agent')).toBe(true)
    expect(hasQuad(plan.deletes, rule, ACL + 'mode', ACL + 'Read')).toBe(true)
  })

  it('removes only the membership triple from a shared authorization', () => {
    const ctx = ownContext(ownFixture)
    const plan = planRevoke(ctx, { type: 'agent', iri: flora })

    expect(plan.deletes).toHaveLength(1)
    expect(plan.deletes[0].subject.value).toBe(docACL + '#friends')
    expect(plan.deletes[0].predicate.value).toBe(ACL + 'agent')
    expect(plan.deletes[0].object.value).toBe(flora)
  })

  it('deletes IRI-identified condition triples along with the rule', () => {
    const ctx = ownContext(`
<#rule> a acl:Authorization ;
  acl:accessTo <${doc}> ;
  acl:agent <${giuseppina}> ;
  acl:mode acl:Read ;
  acl:condition <#clientCond> .
<#clientCond> a acl:ClientCondition ;
  acl:clientClass foaf:Agent .
`)
    const plan = planRevoke(ctx, { type: 'agent', iri: giuseppina })

    const condition = docACL + '#clientCond'
    expect(hasQuad(plan.deletes, docACL + '#rule', ACL + 'condition', condition)).toBe(true)
    expect(hasQuad(plan.deletes, condition, RDF_TYPE, ACL + 'ClientCondition')).toBe(true)
    expect(hasQuad(plan.deletes, condition, ACL + 'clientClass', FOAF + 'Agent')).toBe(true)
  })

  it('leaves blank node conditions dangling since a patch cannot match them', () => {
    const ctx = ownContext(`
<#rule> a acl:Authorization ;
  acl:accessTo <${doc}> ;
  acl:agent <${giuseppina}> ;
  acl:mode acl:Read ;
  acl:condition [ a acl:ClientCondition ; acl:clientClass foaf:Agent ] .
`)
    const plan = planRevoke(ctx, { type: 'agent', iri: giuseppina })

    // the acl:condition triple and the blank node's own triples are skipped
    expect(plan.deletes.every(q => q.object.termType !== 'BlankNode')).toBe(true)
    expect(plan.deletes.every(q => q.subject.termType !== 'BlankNode')).toBe(true)
    expect(quadsAbout(plan.deletes, docACL + '#rule')).toHaveLength(4)
  })

  it('throws when there is nothing to revoke', () => {
    const ctx = ownContext(ownFixture)
    expect(() => planRevoke(ctx, { type: 'agent', iri: pennyLane })).toThrow(WACError)
  })
})

const inheritedFixture = `
<#defaults> a acl:Authorization ;
  acl:default <${container}> ;
  acl:agent <${giuseppina}> ;
  acl:mode acl:Read, acl:Write, acl:Control .

<#sharedDefaults> a acl:Authorization ;
  acl:default <${container}> ;
  acl:agent <${liliano}>, <${flora}> ;
  acl:mode acl:Read .

<#containerOnly> a acl:Authorization ;
  acl:accessTo <${container}> ;
  acl:agent <${giuseppina}> ;
  acl:mode acl:Read .
`

describe('planGrant on an inherited ACL', () => {
  it('copies governing authorizations into a resource-specific ACL and adds the new rule', () => {
    const ctx = inheritedContext(inheritedFixture)
    const plan = planGrant(ctx, { type: 'agent', iri: pennyLane }, ['Read'], { newId: counterIdFactory() })

    expect(plan.target).toBe(docACL)
    expect(plan.deletes).toEqual([])

    // clone of #defaults, clone of #sharedDefaults, fresh rule for Penny Lane
    const cloneOfDefaults = docACL + '#auth-1'
    const cloneOfShared = docACL + '#auth-2'
    const fresh = docACL + '#auth-3'

    expect(hasQuad(plan.inserts, cloneOfDefaults, ACL + 'accessTo', doc)).toBe(true)
    expect(hasQuad(plan.inserts, cloneOfDefaults, ACL + 'agent', giuseppina)).toBe(true)
    expect(hasQuad(plan.inserts, cloneOfDefaults, ACL + 'mode', ACL + 'Control')).toBe(true)

    expect(hasQuad(plan.inserts, cloneOfShared, ACL + 'agent', liliano)).toBe(true)
    expect(hasQuad(plan.inserts, cloneOfShared, ACL + 'agent', flora)).toBe(true)

    expect(hasQuad(plan.inserts, fresh, ACL + 'agent', pennyLane)).toBe(true)
    expect(hasQuad(plan.inserts, fresh, ACL + 'mode', ACL + 'Read')).toBe(true)

    // container-only authorizations are not copied
    expect(plan.inserts.some(q => q.object.value === container)).toBe(false)
  })

  it('updates the mode in the clone for a sole subject', () => {
    const ctx = inheritedContext(inheritedFixture)
    const plan = planGrant(ctx, { type: 'agent', iri: giuseppina }, ['Read'], { newId: counterIdFactory() })

    const cloneOfDefaults = docACL + '#auth-1'
    expect(hasQuad(plan.inserts, cloneOfDefaults, ACL + 'agent', giuseppina)).toBe(true)
    expect(hasQuad(plan.inserts, cloneOfDefaults, ACL + 'mode', ACL + 'Read')).toBe(true)
    expect(hasQuad(plan.inserts, cloneOfDefaults, ACL + 'mode', ACL + 'Control')).toBe(false)

    // no extra fresh rule for giuseppina
    expect(plan.inserts.filter(q => q.object.value === giuseppina)).toHaveLength(1)
  })

  // the draft's "inadvertent condition removal": a copy that sheds a condition is broader than its source
  it('preserves conditions on cloned rules without advertised condition support', () => {
    const ctx = inheritedContext(`
<#defaults> a acl:Authorization ;
  acl:default <${container}> ;
  acl:agent <${giuseppina}> ;
  acl:mode acl:Read ;
  acl:condition <#clientCond> .
<#clientCond> a acl:ClientCondition ;
  acl:clientClass foaf:Agent .
`)
    const plan = planGrant(ctx, { type: 'agent', iri: pennyLane }, ['Read'], { newId: counterIdFactory() })

    const clone = docACL + '#auth-1'
    const clonedCondition = docACL + '#auth-2'
    expect(hasQuad(plan.inserts, clone, ACL + 'condition', clonedCondition)).toBe(true)
    expect(hasQuad(plan.inserts, clonedCondition, RDF_TYPE, ACL + 'ClientCondition')).toBe(true)
    expect(hasQuad(plan.inserts, clonedCondition, ACL + 'clientClass', FOAF + 'Agent')).toBe(true)
  })

  it('moves a shared-rule member to a fresh rule with the new mode', () => {
    const ctx = inheritedContext(inheritedFixture)
    const plan = planGrant(ctx, { type: 'agent', iri: liliano }, ['Read', 'Write'], { newId: counterIdFactory() })

    const cloneOfShared = docACL + '#auth-2'
    expect(hasQuad(plan.inserts, cloneOfShared, ACL + 'agent', flora)).toBe(true)
    expect(hasQuad(plan.inserts, cloneOfShared, ACL + 'agent', liliano)).toBe(false)

    const fresh = docACL + '#auth-3'
    expect(hasQuad(plan.inserts, fresh, ACL + 'agent', liliano)).toBe(true)
    expect(hasQuad(plan.inserts, fresh, ACL + 'mode', ACL + 'Write')).toBe(true)
  })
})

describe('planRevoke on an inherited ACL', () => {
  it('copies everything except the revoked subject', () => {
    const ctx = inheritedContext(inheritedFixture)
    const plan = planRevoke(ctx, { type: 'agent', iri: giuseppina }, { newId: counterIdFactory() })

    expect(plan.deletes).toEqual([])
    // #defaults (sole subject giuseppina) is dropped; #sharedDefaults is cloned
    expect(plan.inserts.some(q => q.object.value === giuseppina)).toBe(false)
    expect(plan.inserts.some(q => q.object.value === liliano)).toBe(true)
    expect(plan.inserts.some(q => q.object.value === flora)).toBe(true)
  })
})

describe('planPublicRead', () => {
  it('grants public read', () => {
    const ctx = ownContext(`
<#owner> a acl:Authorization ;
  acl:accessTo <${doc}> ;
  acl:agent <${giuseppina}> ;
  acl:mode acl:Read, acl:Write, acl:Control .
`)
    const plan = planPublicRead(ctx, true, { newId: counterIdFactory() })
    expect(hasQuad(plan.inserts, docACL + '#auth-1', ACL + 'agentClass', FOAF + 'Agent')).toBe(true)
    expect(hasQuad(plan.inserts, docACL + '#auth-1', ACL + 'mode', ACL + 'Read')).toBe(true)
  })

  it('retracts public access', () => {
    const ctx = ownContext(ownFixture)
    const plan = planPublicRead(ctx, false)
    expect(hasQuad(plan.deletes, docACL + '#public', ACL + 'agentClass', FOAF + 'Agent')).toBe(true)
    expect(plan.inserts).toEqual([])
  })
})

describe('planOwnerControl', () => {
  it('grants read, write, and control to the owner', () => {
    const ctx = ownContext(`
<#public> a acl:Authorization ;
  acl:accessTo <${doc}> ;
  acl:agentClass foaf:Agent ;
  acl:mode acl:Read .
`)
    const plan = planOwnerControl(ctx, giuseppina, { newId: counterIdFactory() })
    const rule = docACL + '#auth-1'
    expect(hasQuad(plan.inserts, rule, ACL + 'agent', giuseppina)).toBe(true)
    expect(hasQuad(plan.inserts, rule, ACL + 'mode', ACL + 'Read')).toBe(true)
    expect(hasQuad(plan.inserts, rule, ACL + 'mode', ACL + 'Write')).toBe(true)
    expect(hasQuad(plan.inserts, rule, ACL + 'mode', ACL + 'Control')).toBe(true)
  })
})

describe('planContainerACL', () => {
  it('creates owner, default, and condition rules', () => {
    const aclURL = containerACL
    const plan = planContainerACL({
      aclURL,
      containerURL: container,
      owner: giuseppina,
      ownerModes: ['Read', 'Append', 'Control'],
      defaultModes: ['Read', 'Write'],
      conditions: 'anyClient',
    })

    expect(plan.target).toBe(aclURL)
    expect(plan.deletes).toEqual([])

    const owner = aclURL + '#owner'
    const defaults = aclURL + '#default'
    const condition = aclURL + '#anyClient'

    expect(hasQuad(plan.inserts, owner, ACL + 'accessTo', container)).toBe(true)
    expect(hasQuad(plan.inserts, owner, ACL + 'agent', giuseppina)).toBe(true)
    expect(hasQuad(plan.inserts, owner, ACL + 'mode', ACL + 'Append')).toBe(true)
    expect(hasQuad(plan.inserts, owner, ACL + 'condition', condition)).toBe(true)

    expect(hasQuad(plan.inserts, defaults, ACL + 'default', container)).toBe(true)
    expect(hasQuad(plan.inserts, defaults, ACL + 'mode', ACL + 'Write')).toBe(true)
    expect(hasQuad(plan.inserts, defaults, ACL + 'condition', condition)).toBe(true)

    expect(hasQuad(plan.inserts, condition, RDF_TYPE, ACL + 'ClientCondition')).toBe(true)
    expect(hasQuad(plan.inserts, condition, ACL + 'clientClass', FOAF + 'Agent')).toBe(true)
  })
})
