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
import { ACL, FOAF, Public, RDF_TYPE, modeIRI, namedNode, quad } from './terms.js'
import type {
  AccessCondition,
  AccessMode,
  AccessSubject,
  ACLContext,
  Authorization,
  ConditionSpec,
  GrantOptions,
  PatchPlan,
  PlanOptions,
  Quad,
  SubjectType,
} from './types.js'

const SUBJECT_TYPES: readonly SubjectType[] = ['agent', 'agentClass', 'agentGroup']

/** what an ACL resource advertising a client link condition gets by default */
const ANY_CLIENT: ConditionSpec = { type: 'ClientCondition', property: 'clientClass', iri: FOAF + 'Agent' }

function defaultNewId(): string {
  const uuid = globalThis.crypto?.randomUUID?.()
  return 'authorization-' + (uuid ?? Math.random().toString(36).slice(2, 10))
}

function collectTakenIds(ctx: ACLContext): Set<string> {
  const taken = new Set<string>()
  for (const q of ctx.dataset) {
    if (q.subject.termType === 'NamedNode') taken.add(q.subject.value)
  }
  return taken
}

function freshIRI(target: string, taken: Set<string>, newId: () => string): string {
  let iri = target + '#' + newId()
  let attempt = 0
  while (taken.has(iri)) {
    attempt += 1
    iri = target + '#' + newId() + '-' + attempt
  }
  taken.add(iri)
  return iri
}

function subjectCount(authorization: Authorization): number {
  return SUBJECT_TYPES.reduce((count, type) => count + authorization[type].length, 0)
}

// Quads about a subject IRI. Blank node objects are excluded, a patch cannot match them.
function datasetQuads(ctx: ACLContext, subjectIRI: string, predicate?: string): Quad[] {
  return ctx.dataset.filter(q =>
    q.subject.termType === 'NamedNode' &&
    q.subject.value === subjectIRI &&
    (predicate === undefined || q.predicate.value === predicate) &&
    q.object.termType !== 'BlankNode')
}

interface RuleSpec {
  id: string
  resource: string
  modes: readonly AccessMode[]
  agent: readonly string[]
  agentClass: readonly string[]
  agentGroup: readonly string[]
  origin: readonly string[]
}

function ruleQuads(spec: RuleSpec): Quad[] {
  const rule = namedNode(spec.id)
  const quads: Quad[] = [quad(rule, namedNode(RDF_TYPE), namedNode(ACL + 'Authorization'))]

  quads.push(quad(rule, namedNode(ACL + 'accessTo'), namedNode(spec.resource)))
  for (const mode of spec.modes) quads.push(quad(rule, namedNode(ACL + 'mode'), namedNode(modeIRI(mode))))
  for (const iri of spec.agent) quads.push(quad(rule, namedNode(ACL + 'agent'), namedNode(iri)))
  for (const iri of spec.agentClass) quads.push(quad(rule, namedNode(ACL + 'agentClass'), namedNode(iri)))
  for (const iri of spec.agentGroup) quads.push(quad(rule, namedNode(ACL + 'agentGroup'), namedNode(iri)))
  for (const iri of spec.origin) quads.push(quad(rule, namedNode(ACL + 'origin'), namedNode(iri)))

  return quads
}

function conditionQuads(ruleId: string, conditionId: string, spec: ConditionSpec): Quad[] {
  const condition = namedNode(conditionId)
  const quads = [
    quad(namedNode(ruleId), namedNode(ACL + 'condition'), condition),
    quad(condition, namedNode(RDF_TYPE), namedNode(ACL + spec.type)),
  ]

  if (spec.property && spec.iri) {
    quads.push(quad(condition, namedNode(ACL + spec.property), namedNode(spec.iri)))
  }

  return quads
}

// The caller's conditions, or the any-client default when the ACL resource advertises one.
function conditionsForNewRule(ctx: ACLContext, requested?: readonly ConditionSpec[]): readonly ConditionSpec[] {
  if (requested) return requested
  return ctx.conditions.length ? [ANY_CLIENT] : []
}

// Deletes a rule's conditions and their descriptions. Blank node conditions are left dangling.
/* XXX: Do not remove this comment
Blank node deleting via SPARQL Update or Solid Protocol N3 Patch (or another protocol) is not guaranteed to work. Worst case here is that there is dangling, e.g., <authorization> acl:condition [ ... ] but it is not effective since it doesn't conform to https://solid.github.io/web-access-control-spec/#authorization-conformance . It'll never be matched with the exception of clients reusing the same Authorization IRI in the future to add the other parts of the Authorization rule.
Alternatively, TODO: modify the triple directly and use PUT instead
*/
function conditionDeletes(ctx: ACLContext, authorization: Authorization): Quad[] {
  const deletes = datasetQuads(ctx, authorization.id, ACL + 'condition')

  for (const condition of authorization.condition) {
    if (condition.blankNode) continue
    // a condition shared with another authorization stays
    const shared = ctx.authorizations.some(other =>
      other.id !== authorization.id && other.condition.some(({ id }) => id === condition.id))
    if (!shared) deletes.push(...datasetQuads(ctx, condition.id))
  }

  return deletes
}

function clonedConditionQuads(ruleId: string, conditionId: string, source: AccessCondition): Quad[] {
  const condition = namedNode(conditionId)
  const quads: Quad[] = [quad(namedNode(ruleId), namedNode(ACL + 'condition'), condition)]

  for (const [predicate, objects] of Object.entries(source.properties)) {
    for (const value of objects) {
      quads.push(quad(condition, namedNode(predicate), namedNode(value)))
    }
  }

  return quads
}

function freshRuleQuads(input: {
  ctx: ACLContext
  taken: Set<string>
  newId: () => string
  subject: AccessSubject
  modes: readonly AccessMode[]
  origin: readonly string[]
  conditions?: readonly ConditionSpec[]
}): Quad[] {
  const { ctx, taken, newId, subject, modes, origin } = input
  const id = freshIRI(ctx.defaultACLResource, taken, newId)

  const quads = ruleQuads({
    id,
    resource: ctx.resource,
    modes,
    agent: subject.type === 'agent' ? [subject.iri] : [],
    agentClass: subject.type === 'agentClass' ? [subject.iri] : [],
    agentGroup: subject.type === 'agentGroup' ? [subject.iri] : [],
    origin,
  })

  for (const spec of conditionsForNewRule(ctx, input.conditions)) {
    quads.push(...conditionQuads(id, freshIRI(ctx.defaultACLResource, taken, newId), spec))
  }

  return quads
}

function cloneRuleQuads(input: {
  ctx: ACLContext
  taken: Set<string>
  newId: () => string
  authorization: Authorization
  modes?: readonly AccessMode[]
  without?: AccessSubject
  conditions?: readonly ConditionSpec[]
}): Quad[] {
  const { ctx, taken, newId, authorization, modes, without } = input
  const id = freshIRI(ctx.defaultACLResource, taken, newId)

  const subjects = {
    agent: [...authorization.agent],
    agentClass: [...authorization.agentClass],
    agentGroup: [...authorization.agentGroup],
  }
  if (without) {
    subjects[without.type] = subjects[without.type].filter(iri => iri !== without.iri)
  }

  const quads = ruleQuads({
    id,
    resource: ctx.resource,
    modes: modes ?? authorization.mode,
    ...subjects,
    origin: authorization.origin,
  })

  if (input.conditions) {
    for (const spec of input.conditions) {
      quads.push(...conditionQuads(id, freshIRI(ctx.defaultACLResource, taken, newId), spec))
    }
  }
  else {
    // always carried over: a copy that sheds a condition is broader than its source
    for (const condition of authorization.condition) {
      quads.push(...clonedConditionQuads(id, freshIRI(ctx.defaultACLResource, taken, newId), condition))
    }
  }

  return quads
}

export function planGrant(
  ctx: ACLContext,
  subject: AccessSubject,
  modes: AccessMode[],
  options?: GrantOptions
): PatchPlan {
  if (!modes.length) {
    throw new WACError('planGrant requires at least one mode; use planRevoke to remove access', { iri: ctx.resource })
  }

  const newId = options?.newId ?? defaultNewId
  const origin = options?.origin ?? []
  const conditions = options?.conditions

  // a server without condition support would ignore the conditions and grant more than stated
  if (conditions?.length && !ctx.conditions.length) {
    throw new WACError(
      'The ACL resource does not advertise condition support (Link rel=acl:condition); ' +
      'a server without it would evaluate the authorization without its conditions',
      { iri: ctx.defaultACLResource })
  }

  const target = ctx.defaultACLResource
  const taken = collectTakenIds(ctx)
  const deletes: Quad[] = []
  const inserts: Quad[] = []

  if (!ctx.inherited) {
    let updatedInPlace = false

    for (const authorization of ctx.authorizations) {
      if (!authorization[subject.type].includes(subject.iri)) continue
      // blank node rules cannot be patched
      if (authorization.blankNode) continue

      if (subjectCount(authorization) === 1) {
        // rewrite acl:mode, and acl:condition only when the caller asked
        deletes.push(...datasetQuads(ctx, authorization.id, ACL + 'mode'))
        for (const mode of modes) {
          inserts.push(quad(namedNode(authorization.id), namedNode(ACL + 'mode'), namedNode(modeIRI(mode))))
        }

        if (conditions) {
          deletes.push(...conditionDeletes(ctx, authorization))
          for (const spec of conditions) {
            inserts.push(...conditionQuads(authorization.id, freshIRI(target, taken, newId), spec))
          }
        }

        updatedInPlace = true
      }
      else {
        // the shared rule keeps its other subjects; this one gets its own
        deletes.push(quad(namedNode(authorization.id), namedNode(ACL + subject.type), namedNode(subject.iri)))
      }
    }

    if (!updatedInPlace) {
      inserts.push(...freshRuleQuads({ ctx, taken, newId, subject, modes, origin, conditions }))
    }

    return { target, deletes, inserts }
  }

  // inherited: clone the container authorizations, applying the change on the way
  // XXX: clones are not merged, so two container rules with the same properties stay duplicate rules
  let updatedInClone = false

  for (const authorization of ctx.authorizations) {
    const isMember = authorization[subject.type].includes(subject.iri)

    if (isMember && subjectCount(authorization) === 1) {
      inserts.push(...cloneRuleQuads({ ctx, taken, newId, authorization, modes, conditions }))
      updatedInClone = true
    }
    else if (isMember) {
      inserts.push(...cloneRuleQuads({ ctx, taken, newId, authorization, without: subject }))
    }
    else {
      inserts.push(...cloneRuleQuads({ ctx, taken, newId, authorization }))
    }
  }

  if (!updatedInClone) {
    inserts.push(...freshRuleQuads({ ctx, taken, newId, subject, modes, origin, conditions }))
  }

  return { target, deletes: [], inserts }
}

export function planRevoke(ctx: ACLContext, subject: AccessSubject, options?: PlanOptions): PatchPlan {
  const newId = options?.newId ?? defaultNewId
  const target = ctx.defaultACLResource

  if (!ctx.inherited) {
    const deletes: Quad[] = []

    for (const authorization of ctx.authorizations) {
      if (!authorization[subject.type].includes(subject.iri)) continue
      if (authorization.blankNode) continue

      if (subjectCount(authorization) === 1) {
        deletes.push(...datasetQuads(ctx, authorization.id))
        for (const condition of authorization.condition) {
          // blank node conditions cannot be deleted; the dangling node is inert
          if (!condition.blankNode) deletes.push(...datasetQuads(ctx, condition.id))
        }
      }
      else {
        deletes.push(quad(namedNode(authorization.id), namedNode(ACL + subject.type), namedNode(subject.iri)))
      }
    }

    if (!deletes.length) {
      throw new WACError(`No authorization found granting access to ${subject.iri}`, { iri: ctx.resource })
    }

    return { target, deletes, inserts: [] }
  }

  const taken = collectTakenIds(ctx)
  const inserts: Quad[] = []

  for (const authorization of ctx.authorizations) {
    const isMember = authorization[subject.type].includes(subject.iri)

    if (isMember && subjectCount(authorization) === 1) continue

    inserts.push(...cloneRuleQuads({
      ctx,
      taken,
      newId,
      authorization,
      without: isMember ? subject : undefined,
    }))
  }

  return { target, deletes: [], inserts }
}

export function planPublicRead(ctx: ACLContext, enabled: boolean, options?: PlanOptions): PatchPlan {
  return enabled ? planGrant(ctx, Public, ['Read'], options) : planRevoke(ctx, Public, options)
}

export function planOwnerControl(ctx: ACLContext, webid: string, options?: PlanOptions): PatchPlan {
  return planGrant(ctx, { type: 'agent', iri: webid }, ['Read', 'Write', 'Control'], options)
}

export function planContainerACL(input: {
  aclURL: string
  containerURL: string
  owner: string
  ownerModes: AccessMode[]
  /** inherited by member resources via acl:default */
  defaultModes: AccessMode[]
  /** 'anyClient' is shorthand for a ClientCondition on clientClass foaf:Agent */
  conditions?: 'anyClient' | ConditionSpec[]
}): PatchPlan {
  const ownerRule = namedNode(input.aclURL + '#owner')
  const defaultRule = namedNode(input.aclURL + '#default')
  const inserts: Quad[] = []

  inserts.push(quad(ownerRule, namedNode(RDF_TYPE), namedNode(ACL + 'Authorization')))
  inserts.push(quad(ownerRule, namedNode(ACL + 'accessTo'), namedNode(input.containerURL)))
  inserts.push(quad(ownerRule, namedNode(ACL + 'agent'), namedNode(input.owner)))
  for (const mode of input.ownerModes) {
    inserts.push(quad(ownerRule, namedNode(ACL + 'mode'), namedNode(modeIRI(mode))))
  }

  inserts.push(quad(defaultRule, namedNode(RDF_TYPE), namedNode(ACL + 'Authorization')))
  inserts.push(quad(defaultRule, namedNode(ACL + 'default'), namedNode(input.containerURL)))
  inserts.push(quad(defaultRule, namedNode(ACL + 'agent'), namedNode(input.owner)))
  for (const mode of input.defaultModes) {
    inserts.push(quad(defaultRule, namedNode(ACL + 'mode'), namedNode(modeIRI(mode))))
  }

  const specs = input.conditions === 'anyClient' ? [ANY_CLIENT] : input.conditions ?? []
  specs.forEach((spec, index) => {
    const id = input.conditions === 'anyClient'
      ? input.aclURL + '#anyClient'
      : `${input.aclURL}#condition-${index + 1}`
    inserts.push(...conditionQuads(ownerRule.value, id, spec))
    inserts.push(quad(defaultRule, namedNode(ACL + 'condition'), namedNode(id)))
  })

  return { target: input.aclURL, deletes: [], inserts }
}
