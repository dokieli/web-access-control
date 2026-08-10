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

import { WACError } from './errors.js'
import type { PatchPlan, Quad, Term } from './types.js'

const XSD_STRING = 'http://www.w3.org/2001/XMLSchema#string'
const LANG_STRING = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#langString'

export function serializeTerm(term: Term): string {
  switch (term.termType) {
    case 'NamedNode':
      return '<' + term.value + '>'
    case 'BlankNode':
      return '_:' + term.value
    case 'Literal': {
      const escaped = term.value
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
      let out = '"' + escaped + '"'
      if (term.language) {
        out += '@' + term.language
      }
      else if (term.datatype && term.datatype.value !== XSD_STRING && term.datatype.value !== LANG_STRING) {
        out += '^^<' + term.datatype.value + '>'
      }
      return out
    }
    case 'Variable':
      return '?' + term.value
    // DefaultGraph and quoted triples have no place in a patch clause
    default:
      throw new WACError(`Cannot serialize a ${term.termType} term`)
  }
}

function serializeTriples(quads: Quad[]): string {
  return quads
    .map(q => serializeTerm(q.subject) + ' ' + serializeTerm(q.predicate) + ' ' + serializeTerm(q.object) + ' .')
    .join('\n')
}

export function toTurtle(quads: Quad[]): string {
  const bySubject = new Map<string, { subject: Term; predicates: Map<string, { predicate: Term; objects: Term[] }> }>()

  for (const q of quads) {
    const subjectId = serializeTerm(q.subject)
    let entry = bySubject.get(subjectId)
    if (!entry) {
      entry = { subject: q.subject, predicates: new Map() }
      bySubject.set(subjectId, entry)
    }
    let objects = entry.predicates.get(q.predicate.value)
    if (!objects) {
      objects = { predicate: q.predicate, objects: [] }
      entry.predicates.set(q.predicate.value, objects)
    }
    objects.objects.push(q.object)
  }

  const blocks: string[] = []
  for (const entry of bySubject.values()) {
    const predicateParts: string[] = []
    for (const { predicate, objects } of entry.predicates.values()) {
      predicateParts.push(serializeTerm(predicate) + ' ' + objects.map(serializeTerm).join(', '))
    }
    blocks.push(serializeTerm(entry.subject) + '\n  ' + predicateParts.join(' ;\n  ') + ' .')
  }

  return blocks.join('\n\n') + (blocks.length ? '\n' : '')
}

function variableNames(quads: readonly Quad[]): Set<string> {
  const names = new Set<string>()
  for (const q of quads) {
    for (const term of [q.subject, q.predicate, q.object]) {
      if (term.termType === 'Variable') names.add(term.value)
    }
  }
  return names
}

function hasBlankNode(quads: readonly Quad[]): boolean {
  return quads.some(q =>
    q.subject.termType === 'BlankNode' || q.object.termType === 'BlankNode')
}

// A patch cannot delete or match blank nodes, and variables must be bound by the where clause.
function assertPatchClauses(plan: PatchPlan): void {
  const where = plan.where ?? []

  if (hasBlankNode(plan.deletes)) {
    throw new WACError('A patch cannot delete triples containing blank nodes', { iri: plan.target })
  }
  if (hasBlankNode(where)) {
    throw new WACError('Use variables rather than blank nodes in a where clause', { iri: plan.target })
  }

  const bound = variableNames(where)
  for (const name of variableNames([...plan.deletes, ...plan.inserts])) {
    if (!bound.has(name)) {
      throw new WACError(
        `Variable ?${name} in the patch does not occur in the where clause`, { iri: plan.target })
    }
  }
}

export function toSparqlUpdate(plan: PatchPlan): string {
  assertPatchClauses(plan)

  // pattern form: one DELETE/INSERT/WHERE operation
  if (plan.where?.length) {
    const clauses: string[] = []
    if (plan.deletes.length) clauses.push('DELETE {\n' + serializeTriples(plan.deletes) + '\n}')
    if (plan.inserts.length) clauses.push('INSERT {\n' + serializeTriples(plan.inserts) + '\n}')
    if (!clauses.length) return ''
    return clauses.join('\n') + '\nWHERE {\n' + serializeTriples(plan.where) + '\n}'
  }

  const statements: string[] = []

  if (plan.deletes.length) {
    statements.push('DELETE DATA {\n' + serializeTriples(plan.deletes) + '\n}')
  }
  if (plan.inserts.length) {
    statements.push('INSERT DATA {\n' + serializeTriples(plan.inserts) + '\n}')
  }

  return statements.join(';\n')
}

export function toN3Patch(plan: PatchPlan): string {
  assertPatchClauses(plan)
  // N3 Patch formulae must not contain blank nodes, unlike SPARQL INSERT DATA
  if (hasBlankNode(plan.inserts)) {
    throw new WACError('N3 Patch formulae cannot contain blank nodes; use IRIs', { iri: plan.target })
  }

  const clauses: string[] = []

  if (plan.where?.length) {
    clauses.push('solid:where {\n' + serializeTriples(plan.where) + '\n}')
  }
  if (plan.deletes.length) {
    clauses.push('solid:deletes {\n' + serializeTriples(plan.deletes) + '\n}')
  }
  if (plan.inserts.length) {
    clauses.push('solid:inserts {\n' + serializeTriples(plan.inserts) + '\n}')
  }

  // blank node labels are document-scoped, so any label conforms
  const uuid = globalThis.crypto?.randomUUID?.()
  const subject = '_:' + (uuid ?? Math.random().toString(36).slice(2, 10))

  return '@prefix solid: <http://www.w3.org/ns/solid/terms#>.\n' +
    subject + ' a solid:InsertDeletePatch' +
    (clauses.length ? ';\n' + clauses.join(';\n') : '') +
    '.\n'
}
