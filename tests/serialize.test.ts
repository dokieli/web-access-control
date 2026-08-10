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

import factory from '@rdfjs/data-model'
import { describe, expect, it } from 'vitest'
import { WACError } from '../src/errors.js'
import { serializeTerm, toN3Patch, toSparqlUpdate, toTurtle } from '../src/serialize.js'
import { namedNode, quad, variable } from '../src/terms.js'
import type { PatchPlan } from '../src/types.js'

const s = namedNode('https://example.org/acl#rule')
const p = namedNode('http://www.w3.org/ns/auth/acl#agent')
const giuseppina = namedNode('https://example.org/giuseppina#i')
const liliano = namedNode('https://example.org/liliano#i')

describe('serializeTerm', () => {
  it('serializes named nodes', () => {
    expect(serializeTerm(giuseppina)).toBe('<https://example.org/giuseppina#i>')
  })

  it('serializes blank nodes', () => {
    expect(serializeTerm(factory.blankNode('b1'))).toBe('_:b1')
  })

  it('escapes literals', () => {
    expect(serializeTerm(factory.literal('say "hi"\nplease'))).toBe('"say \\"hi\\"\\nplease"')
  })

  it('serializes language tags and datatypes', () => {
    expect(serializeTerm(factory.literal('hola', 'es'))).toBe('"hola"@es')
    expect(serializeTerm(
      factory.literal('4', factory.namedNode('http://www.w3.org/2001/XMLSchema#integer'))
    )).toBe('"4"^^<http://www.w3.org/2001/XMLSchema#integer>')
    expect(serializeTerm(
      factory.literal('plain', factory.namedNode('http://www.w3.org/2001/XMLSchema#string'))
    )).toBe('"plain"')
  })
})

describe('toTurtle', () => {
  it('groups by subject and predicate', () => {
    const turtle = toTurtle([quad(s, p, giuseppina), quad(s, p, liliano)])
    expect(turtle).toBe(
      '<https://example.org/acl#rule>\n' +
      '  <http://www.w3.org/ns/auth/acl#agent> <https://example.org/giuseppina#i>, <https://example.org/liliano#i> .\n')
  })
})

describe('toSparqlUpdate', () => {
  it('emits delete and insert statements', () => {
    const plan: PatchPlan = {
      target: 'https://example.org/acl',
      deletes: [quad(s, p, giuseppina)],
      inserts: [quad(s, p, liliano)],
    }
    const update = toSparqlUpdate(plan)
    expect(update).toContain('DELETE DATA {\n<https://example.org/acl#rule> <http://www.w3.org/ns/auth/acl#agent> <https://example.org/giuseppina#i> .\n}')
    expect(update).toContain(';\nINSERT DATA {')
    expect(update).toContain('<https://example.org/liliano#i> .')
  })

  it('omits empty clauses', () => {
    const update = toSparqlUpdate({ target: 'x', deletes: [], inserts: [quad(s, p, liliano)] })
    expect(update).not.toContain('DELETE DATA')
    expect(update.startsWith('INSERT DATA')).toBe(true)
  })
})

describe('toN3Patch', () => {
  it('emits a solid:InsertDeletePatch', () => {
    const patch = toN3Patch({ target: 'x', deletes: [quad(s, p, giuseppina)], inserts: [quad(s, p, liliano)] })
    expect(patch).toContain('@prefix solid: <http://www.w3.org/ns/solid/terms#>.')
    expect(patch).toContain('a solid:InsertDeletePatch')
    expect(patch).toContain('solid:deletes {')
    expect(patch).toContain('solid:inserts {')
  })
})

describe('pattern patches', () => {
  const agent = variable('agent')
  // delete whatever agent the rule currently names, insert liliano
  const plan: PatchPlan = {
    target: 'https://example.org/acl',
    deletes: [quad(s, p, agent)],
    inserts: [quad(s, p, liliano)],
    where: [quad(s, p, agent)],
  }

  it('serializes variables', () => {
    expect(serializeTerm(agent)).toBe('?agent')
  })

  it('emits a single SPARQL modify operation under a where clause', () => {
    const update = toSparqlUpdate(plan)
    expect(update).toBe(
      'DELETE {\n<https://example.org/acl#rule> <http://www.w3.org/ns/auth/acl#agent> ?agent .\n}\n' +
      'INSERT {\n<https://example.org/acl#rule> <http://www.w3.org/ns/auth/acl#agent> <https://example.org/liliano#i> .\n}\n' +
      'WHERE {\n<https://example.org/acl#rule> <http://www.w3.org/ns/auth/acl#agent> ?agent .\n}')
    expect(update).not.toContain('DATA')
  })

  it('emits solid:where', () => {
    const patch = toN3Patch(plan)
    expect(patch).toContain('solid:where {\n<https://example.org/acl#rule> <http://www.w3.org/ns/auth/acl#agent> ?agent .\n}')
    expect(patch).toContain('solid:deletes {')
  })

  it('rejects a variable that the where clause does not bind', () => {
    const unbound = { ...plan, where: [quad(s, p, variable('other'))] }
    expect(() => toSparqlUpdate(unbound)).toThrow(WACError)
    expect(() => toN3Patch(unbound)).toThrow(/\?agent/)
  })

  it('rejects variables without any where clause', () => {
    const bare: PatchPlan = { target: 'x', deletes: [quad(s, p, agent)], inserts: [] }
    expect(() => toSparqlUpdate(bare)).toThrow(WACError)
  })

  it('rejects blank nodes in deletes and in where', () => {
    const bnode = factory.blankNode('b1')
    expect(() => toSparqlUpdate({ target: 'x', deletes: [quad(s, p, bnode)], inserts: [] }))
      .toThrow(/blank nodes/)
    expect(() => toN3Patch({ ...plan, where: [quad(s, p, bnode)] })).toThrow(/variables/)
  })

  it('allows blank node inserts in SPARQL but not in N3 Patch', () => {
    const ground: PatchPlan = { target: 'x', deletes: [], inserts: [quad(s, p, factory.blankNode('b1'))] }
    expect(toSparqlUpdate(ground)).toContain('_:b1')
    expect(() => toN3Patch(ground)).toThrow(/blank nodes/)
  })
})
