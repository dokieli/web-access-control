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
import { authorizationsFromDataset, buildACLContext } from '../src/authorizations.js'
import { WACError } from '../src/errors.js'
import { ACL, FOAF } from '../src/terms.js'
import { parseTurtle } from './helpers.js'

const doc = 'https://example.org/data/doc'
const docACL = 'https://example.org/data/doc.acl'
const container = 'https://example.org/data/'
const luigi = 'https://example.org/luigi#i'

const fixture = `
@prefix acl: <http://www.w3.org/ns/auth/acl#> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .

<#owner> a acl:Authorization ;
  acl:accessTo <${doc}> ;
  acl:agent <${luigi}> ;
  acl:mode acl:Read, acl:Write, acl:Control ;
  acl:origin <https://apps.example.net> ;
  acl:condition <#clientCond> .

<#clientCond> a acl:ClientCondition ;
  acl:clientClass foaf:Agent .

<#defaults> a acl:Authorization ;
  acl:default <${container}> ;
  acl:agentClass foaf:Agent ;
  acl:mode acl:Read .

<#notAnAuthorization> acl:accessTo <${doc}> ;
  acl:agent <${luigi}> .
`

describe('authorizationsFromDataset', () => {
  it('matches acl:accessTo authorizations', () => {
    const dataset = parseTurtle(fixture, { baseIRI: docACL })
    const authorizations = authorizationsFromDataset(dataset, { accessTo: doc })

    expect(authorizations).toHaveLength(1)
    const owner = authorizations[0]
    expect(owner.id).toBe(docACL + '#owner')
    expect(owner.agent).toEqual([luigi])
    expect(owner.mode.sort()).toEqual(['Control', 'Read', 'Write'])
    expect(owner.origin).toEqual(['https://apps.example.net'])
  })

  it('matches acl:default authorizations', () => {
    const dataset = parseTurtle(fixture, { baseIRI: docACL })
    const authorizations = authorizationsFromDataset(dataset, { default: container })

    expect(authorizations).toHaveLength(1)
    expect(authorizations[0].agentClass).toEqual([FOAF + 'Agent'])
  })

  it('parses conditions with their triples', () => {
    const dataset = parseTurtle(fixture, { baseIRI: docACL })
    const [owner] = authorizationsFromDataset(dataset, { accessTo: doc })

    expect(owner.condition).toHaveLength(1)
    expect(owner.condition[0].id).toBe(docACL + '#clientCond')
    expect(owner.condition[0].blankNode).toBe(false)
    expect(owner.condition[0].properties[ACL + 'clientClass']).toEqual([FOAF + 'Agent'])
  })

  it('flags blank node conditions', () => {
    const dataset = parseTurtle(`
@prefix acl: <http://www.w3.org/ns/auth/acl#> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .
<#rule> a acl:Authorization ;
  acl:accessTo <${doc}> ;
  acl:agent <${luigi}> ;
  acl:mode acl:Read ;
  acl:condition [ a acl:ClientCondition ; acl:clientClass foaf:Agent ] .
`, { baseIRI: docACL })
    const [rule] = authorizationsFromDataset(dataset, { accessTo: doc })

    expect(rule.condition[0].blankNode).toBe(true)
    expect(rule.condition[0].properties[ACL + 'clientClass']).toEqual([FOAF + 'Agent'])
  })

  it('ignores subjects without the Authorization type', () => {
    const dataset = parseTurtle(fixture, { baseIRI: docACL })
    const authorizations = authorizationsFromDataset(dataset, { accessTo: doc })
    expect(authorizations.map(a => a.id)).not.toContain(docACL + '#notAnAuthorization')
  })
})

describe('buildACLContext', () => {
  it('derives the matcher from inheritance', () => {
    const dataset = parseTurtle(fixture, { baseIRI: docACL })

    const own = buildACLContext({
      resource: doc,
      defaultACLResource: docACL,
      effectiveACLResource: docACL,
      dataset,
    })
    expect(own.inherited).toBe(false)
    expect(own.authorizations.map(a => a.id)).toEqual([docACL + '#owner'])

    const inherited = buildACLContext({
      resource: doc,
      defaultACLResource: docACL,
      effectiveACLResource: 'https://example.org/data/.acl',
      effectiveContainer: container,
      dataset,
    })
    expect(inherited.inherited).toBe(true)
    expect(inherited.authorizations.map(a => a.id)).toEqual([docACL + '#defaults'])
  })

  it('requires effectiveContainer when inherited', () => {
    expect(() => buildACLContext({
      resource: doc,
      defaultACLResource: docACL,
      effectiveACLResource: 'https://example.org/data/.acl',
      dataset: [],
    })).toThrow(WACError)
  })
})
