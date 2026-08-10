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

import type { Quad, Term } from '@rdfjs/types'

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

// Re-exported so callers need not depend on @rdfjs/types directly.
export type { Quad, Term }

export type GraphParser = (
  input: string,
  options: { baseIRI: string; contentType: string }
) => Quad[] | Promise<Quad[]>

export type AccessMode = 'Read' | 'Write' | 'Append' | 'Control'

export type SubjectType = 'agent' | 'agentClass' | 'agentGroup'

export interface AccessSubject {
  type: SubjectType
  iri: string
}

export interface AccessCondition {
  id: string
  blankNode: boolean
  properties: Record<string, string[]>
}

export type ClientConditionProperty = 'client' | 'clientClass' | 'clientGroup'

export type IssuerConditionProperty = 'issuer' | 'issuerClass' | 'issuerGroup'

/** a condition to write; a condition carrying only its type is legal */
export type ConditionSpec =
  | { type: 'ClientCondition'; property?: ClientConditionProperty; iri?: string }
  | { type: 'IssuerCondition'; property?: IssuerConditionProperty; iri?: string }

export interface Authorization {
  id: string
  blankNode: boolean
  accessTo: string[]
  default: string[]
  agent: string[]
  agentClass: string[]
  agentGroup: string[]
  mode: AccessMode[]
  origin: string[]
  condition: AccessCondition[]
}

export interface ACLContext {
  /** resource whose access is being managed */
  resource: string
  /** rel=acl of the resource; where patches are written */
  defaultACLResource: string
  /** ACL resource currently governing access */
  effectiveACLResource: string
  /** set when access is inherited from a container */
  effectiveContainer?: string
  inherited: boolean
  /** acl:condition Link relations advertised on the effective ACL resource */
  conditions: string[]
  /** authorizations governing `resource` */
  authorizations: Authorization[]
  /** full effective ACL graph */
  dataset: Quad[]
}

export interface PatchPlan {
  target: string
  deletes: Quad[]
  inserts: Quad[]
  /** caller-provided patterns; SPARQL applies to every match, N3 Patch requires exactly one mapping */
  where?: Quad[]
}

export interface PlanOptions {
  /** fragment identifier factory for new authorizations; defaults to random */
  newId?: () => string
}

export interface GrantOptions extends PlanOptions {
  /** acl:origin values to set on the new authorization */
  origin?: string[]
  /** conditions to set, replacing existing ones; [] strips, omitted preserves; requires Link rel=acl:condition */
  conditions?: ConditionSpec[]
}

export interface WacAllow extends Record<string, ReadonlySet<AccessMode>> {
  user: ReadonlySet<AccessMode>
  public: ReadonlySet<AccessMode>
}

export interface DiscoveryOptions {
  fetch?: FetchLike
  /** defaults to the built-in Turtle parser */
  parse?: GraphParser
  /** Accept header for ACL resource requests; defaults to text/turtle */
  accept?: string
  /** known rel=acl target, skipping the first discovery request */
  aclResource?: string
}

export type PatchContentType = 'application/sparql-update' | 'text/n3'

export interface ApplyOptions {
  fetch?: FetchLike
  /** skip Accept-Patch negotiation and use this serialization */
  contentType?: PatchContentType
}
