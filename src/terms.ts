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
import type { NamedNode, Quad, Quad_Object, Quad_Predicate, Quad_Subject, Variable } from '@rdfjs/types'
import type { AccessMode, AccessSubject } from './types.js'

export const ACL = 'http://www.w3.org/ns/auth/acl#'
export const FOAF = 'http://xmlns.com/foaf/0.1/'
export const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'

export const Public: AccessSubject = { type: 'agentClass', iri: FOAF + 'Agent' }
export const Authenticated: AccessSubject = { type: 'agentClass', iri: ACL + 'AuthenticatedAgent' }

export const ACCESS_MODES: readonly AccessMode[] = ['Read', 'Write', 'Append', 'Control']

export function modeIRI(mode: AccessMode): string {
  return ACL + mode
}

export function modeFromIRI(iri: string): AccessMode | undefined {
  if (!iri.startsWith(ACL)) return undefined
  const name = iri.slice(ACL.length)
  return (ACCESS_MODES as readonly string[]).includes(name) ? (name as AccessMode) : undefined
}

export function namedNode(value: string): NamedNode {
  return factory.namedNode(value)
}

export function quad(subject: Quad_Subject, predicate: Quad_Predicate, object: Quad_Object): Quad {
  return factory.quad(subject, predicate, object)
}

/** for PatchPlan.where patterns; serialized as ?name */
export function variable(value: string): Variable {
  return factory.variable(value)
}
