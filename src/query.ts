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

import { Public } from './terms.js'
import type { AccessMode, AccessSubject, ACLContext, Authorization, SubjectType } from './types.js'

const SUBJECT_TYPES: readonly SubjectType[] = ['agent', 'agentClass', 'agentGroup']

function matches(authorization: Authorization, subject: AccessSubject | string): boolean {
  if (typeof subject === 'string') {
    return SUBJECT_TYPES.some(type => authorization[type].includes(subject))
  }
  return authorization[subject.type].includes(subject.iri)
}

/** Aggregate modes for a subject. An AccessSubject matches one subject type; a bare IRI matches any. */
export function modesFor(ctx: ACLContext, subject: AccessSubject | string): Set<AccessMode> {
  const modes = new Set<AccessMode>()

  for (const authorization of ctx.authorizations) {
    if (!matches(authorization, subject)) continue
    for (const mode of authorization.mode) modes.add(mode)
  }

  return modes
}

export function subjectsWithMode(ctx: ACLContext, mode: AccessMode): AccessSubject[] {
  const subjects: AccessSubject[] = []
  const seen = new Set<string>()

  for (const authorization of ctx.authorizations) {
    if (!authorization.mode.includes(mode)) continue
    for (const type of SUBJECT_TYPES) {
      for (const iri of authorization[type]) {
        const key = type + ':' + iri
        if (seen.has(key)) continue
        seen.add(key)
        subjects.push({ type, iri })
      }
    }
  }

  return subjects
}

export function isPublic(ctx: ACLContext, mode: AccessMode = 'Read'): boolean {
  return modesFor(ctx, Public).has(mode)
}

export function hasControl(ctx: ACLContext, subject: AccessSubject | string): boolean {
  return modesFor(ctx, subject).has('Control')
}

/** WebIDs holding a mode; agent classes and groups are not expanded */
export function agentsWithMode(ctx: ACLContext, mode: AccessMode): string[] {
  const agents: string[] = []

  for (const authorization of ctx.authorizations) {
    if (!authorization.mode.includes(mode)) continue
    for (const iri of authorization.agent) {
      if (!agents.includes(iri)) agents.push(iri)
    }
  }

  return agents
}
