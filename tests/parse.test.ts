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
import { findEffectiveACL } from '../src/discovery.js'
import { WACError } from '../src/errors.js'
import { parseTurtle } from '../src/parse.js'
import { ACL, RDF_TYPE } from '../src/terms.js'
import { emptyResponse, stubFetch, textResponse } from './helpers.js'

const docACL = 'https://example.org/data/doc.acl'
const turtle = (input: string) => parseTurtle(input, { baseIRI: docACL, contentType: 'text/turtle' })

describe('parseTurtle', () => {
  it('resolves relative IRIs against the base', () => {
    const quads = turtle(`<#rule> a <${ACL}Authorization> .`)

    expect(quads).toHaveLength(1)
    expect(quads[0].subject.value).toBe(docACL + '#rule')
    expect(quads[0].predicate.value).toBe(RDF_TYPE)
  })

  it('honors @base', () => {
    const quads = turtle(`
@base <https://other.example/acl> .
<#rule> a <${ACL}Authorization> .
`)

    expect(quads[0].subject.value).toBe('https://other.example/acl#rule')
  })

  it('reads collections', () => {
    const quads = turtle(`<#rule> <${ACL}mode> ( <${ACL}Read> <${ACL}Write> ) .`)

    const objects = quads.filter(q => q.predicate.value.endsWith('#first')).map(q => q.object.value)
    expect(objects).toEqual([ACL + 'Read', ACL + 'Write'])
  })

  it('reads datatyped and language-tagged literals', () => {
    const quads = turtle(`
<#rule> <https://example.org/p> "42"^^<http://www.w3.org/2001/XMLSchema#integer> ;
  <https://example.org/q> "hola"@es .
`)

    const typed = quads.find(q => q.predicate.value.endsWith('/p'))
    const tagged = quads.find(q => q.predicate.value.endsWith('/q'))
    expect(typed?.object.value).toBe('42')
    expect(tagged?.object.value).toBe('hola')
    expect((tagged?.object as { language: string }).language).toBe('es')
  })

  it('reads N-Triples', () => {
    const quads = parseTurtle(`<https://example.org/s> <https://example.org/p> <https://example.org/o> .`, {
      baseIRI: docACL,
      contentType: 'application/n-triples',
    })

    expect(quads).toHaveLength(1)
  })

  it('ignores content type parameters', () => {
    const quads = parseTurtle(`<#rule> a <${ACL}Authorization> .`, {
      baseIRI: docACL,
      contentType: 'text/turtle; charset=utf-8',
    })

    expect(quads).toHaveLength(1)
  })

  it('rejects a media type it does not read', () => {
    expect(() => parseTurtle('{}', { baseIRI: docACL, contentType: 'application/ld+json' }))
      .toThrow(WACError)
  })

  it('wraps a syntax error', () => {
    expect(() => turtle('<#rule> a')).toThrow(/Failed to parse/)
  })
})

describe('findEffectiveACL without a parse option', () => {
  it('reads a Turtle ACL resource with the built-in parser', async () => {
    const doc = 'https://example.org/data/doc'
    const fetch = stubFetch({
      ['HEAD ' + doc]: () => emptyResponse({ headers: { Link: `<doc.acl>; rel="acl"` } }),
      ['GET ' + docACL]: () => textResponse(`
@prefix acl: <${ACL}> .

<#owner> a acl:Authorization ;
  acl:accessTo <${doc}> ;
  acl:agent <https://example.org/giuseppina#i> ;
  acl:mode acl:Read, acl:Control .
`),
    })

    const ctx = await findEffectiveACL(doc, { fetch })

    expect(ctx.authorizations).toHaveLength(1)
    expect(ctx.authorizations[0].mode.sort()).toEqual(['Control', 'Read'])
  })
})
