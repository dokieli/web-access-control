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
import { ACL, RDF_TYPE, modeFromIRI } from './terms.js'
import type { AccessCondition, AccessMode, ACLContext, Authorization, Quad, Term } from './types.js'

export interface AuthorizationMatcher {
  accessTo?: string
  default?: string
}

interface SubjectEntry {
  term: Term
  properties: Map<string, Term[]>
}

function subjectKey(term: Term): string {
  return term.termType + ':' + term.value
}

function indexBySubject(dataset: Quad[]): Map<string, SubjectEntry> {
  const index = new Map<string, SubjectEntry>()

  for (const q of dataset) {
    const key = subjectKey(q.subject)
    let entry = index.get(key)
    if (!entry) {
      entry = { term: q.subject, properties: new Map() }
      index.set(key, entry)
    }
    let objects = entry.properties.get(q.predicate.value)
    if (!objects) {
      objects = []
      entry.properties.set(q.predicate.value, objects)
    }
    objects.push(q.object)
  }

  return index
}

function values(entry: SubjectEntry | undefined, predicate: string): string[] {
  return (entry?.properties.get(predicate) ?? []).map(term => term.value)
}

function parseCondition(index: Map<string, SubjectEntry>, term: Term): AccessCondition {
  const properties: Record<string, string[]> = {}
  const entry = index.get(subjectKey(term))

  if (entry) {
    for (const [predicate, objects] of entry.properties) {
      properties[predicate] = objects.map(o => o.value)
    }
  }

  return { id: term.value, blankNode: term.termType === 'BlankNode', properties }
}

export function authorizationsFromDataset(dataset: Quad[], matcher: AuthorizationMatcher): Authorization[] {
  const index = indexBySubject(dataset)
  const authorizations: Authorization[] = []

  for (const entry of index.values()) {
    if (!values(entry, RDF_TYPE).includes(ACL + 'Authorization')) continue

    const matched = Object.entries(matcher).every(([key, value]) =>
      value === undefined || values(entry, ACL + key).includes(value))
    if (!matched) continue

    const modes: AccessMode[] = []
    for (const iri of values(entry, ACL + 'mode')) {
      const mode = modeFromIRI(iri)
      if (mode && !modes.includes(mode)) modes.push(mode)
    }

    authorizations.push({
      id: entry.term.value,
      blankNode: entry.term.termType === 'BlankNode',
      accessTo: values(entry, ACL + 'accessTo'),
      default: values(entry, ACL + 'default'),
      agent: values(entry, ACL + 'agent'),
      agentClass: values(entry, ACL + 'agentClass'),
      agentGroup: values(entry, ACL + 'agentGroup'),
      mode: modes,
      origin: values(entry, ACL + 'origin'),
      condition: (entry.properties.get(ACL + 'condition') ?? []).map(term => parseCondition(index, term)),
    })
  }

  return authorizations
}

export function buildACLContext(input: {
  resource: string
  defaultACLResource: string
  effectiveACLResource: string
  effectiveContainer?: string
  conditions?: string[]
  dataset: Quad[]
}): ACLContext {
  const inherited = input.defaultACLResource !== input.effectiveACLResource

  if (inherited && input.effectiveContainer === undefined) {
    throw new WACError('effectiveContainer is required when the effective ACL resource is inherited', {
      iri: input.resource,
    })
  }

  const matcher: AuthorizationMatcher = inherited
    ? { default: input.effectiveContainer }
    : { accessTo: input.resource }

  return {
    resource: input.resource,
    defaultACLResource: input.defaultACLResource,
    effectiveACLResource: input.effectiveACLResource,
    effectiveContainer: input.effectiveContainer,
    inherited,
    conditions: input.conditions ?? [],
    authorizations: authorizationsFromDataset(input.dataset, matcher),
    dataset: input.dataset,
  }
}
