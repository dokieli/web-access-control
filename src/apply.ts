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

import { PatchApplyError } from './errors.js'
import { toN3Patch, toSparqlUpdate } from './serialize.js'
import type { ApplyOptions, FetchLike, PatchContentType, PatchPlan } from './types.js'

/** Prefers text/n3, and assumes it when no Accept-Patch information is available. */
export async function negotiatePatchContentType(
  target: string,
  options?: { fetch?: FetchLike }
): Promise<PatchContentType> {
  const { fetch = globalThis.fetch } = options ?? {}

  let acceptPatch: string | null = null
  try {
    const response = await fetch(target, { method: 'OPTIONS' })
    acceptPatch = response.headers.get('Accept-Patch')
  }
  catch {
    return 'text/n3'
  }

  if (!acceptPatch) return 'text/n3'

  const types = acceptPatch.split(',').map(t => t.split(';')[0].trim().toLowerCase())
  if (types.includes('text/n3') || types.includes('*/*')) return 'text/n3'
  if (types.includes('application/sparql-update')) return 'application/sparql-update'

  throw new PatchApplyError(
    `PATCH media type not supported: ${target} accepts ${acceptPatch}`,
    { iri: target })
}

export async function applyPlan(plan: PatchPlan, options?: ApplyOptions): Promise<Response> {
  const { fetch = globalThis.fetch } = options ?? {}
  const contentType = options?.contentType ?? await negotiatePatchContentType(plan.target, { fetch })
  const body = contentType === 'text/n3' ? toN3Patch(plan) : toSparqlUpdate(plan)

  let response: Response
  try {
    response = await fetch(plan.target, {
      method: 'PATCH',
      headers: { 'Content-Type': contentType },
      body,
    })
  }
  catch (cause) {
    throw new PatchApplyError(`Failed to PATCH ${plan.target}`, { iri: plan.target, cause })
  }

  if (!response.ok) {
    throw new PatchApplyError(`Failed to PATCH ${plan.target}: ${response.status}`, {
      iri: plan.target,
      status: response.status,
    })
  }

  return response
}
