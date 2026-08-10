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

export type {
  AccessCondition,
  AccessMode,
  AccessSubject,
  ACLContext,
  ApplyOptions,
  Authorization,
  ClientConditionProperty,
  ConditionSpec,
  DiscoveryOptions,
  FetchLike,
  GrantOptions,
  GraphParser,
  IssuerConditionProperty,
  PatchContentType,
  PatchPlan,
  PlanOptions,
  Quad,
  SubjectType,
  Term,
  WacAllow,
} from './types.js'

export {
  ACCESS_MODES,
  ACL,
  Authenticated,
  FOAF,
  modeFromIRI,
  modeIRI,
  namedNode,
  Public,
  quad,
  RDF_TYPE,
  variable,
} from './terms.js'

export {
  ACLAccessDeniedError,
  ACLFetchError,
  ACLNotDeterminedError,
  PatchApplyError,
  WACError,
} from './errors.js'

export { allows, parseWacAllow } from './wacAllow.js'

export { linkTargets, parseLinkHeader } from './link.js'
export type { LinkEntry } from './link.js'

export { findEffectiveACL, parentContainer } from './discovery.js'

export { parseTurtle, TURTLE_MEDIA_TYPES } from './parse.js'

export { authorizationsFromDataset, buildACLContext } from './authorizations.js'
export type { AuthorizationMatcher } from './authorizations.js'

export { agentsWithMode, hasControl, isPublic, modesFor, subjectsWithMode } from './query.js'

export {
  planContainerACL,
  planGrant,
  planOwnerControl,
  planPublicRead,
  planRevoke,
} from './plan.js'

export { serializeTerm, toN3Patch, toSparqlUpdate, toTurtle } from './serialize.js'

export { applyPlan, negotiatePatchContentType } from './apply.js'
