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

import { buildACLContext } from './authorizations.js'
import { ACLAccessDeniedError, ACLFetchError, ACLNotDeterminedError } from './errors.js'
import { linkTargets } from './link.js'
import { parseTurtle } from './parse.js'
import { ACL } from './terms.js'
import type { ACLContext, DiscoveryOptions, FetchLike } from './types.js'

const NOT_DETERMINED = 'Effective ACL resource not determined. https://solidproject.org/TR/wac#effective-acl-resource-algorithm'

interface Advertisement {
  targets: string[]
  method: 'HEAD' | 'GET'
  status: number
}

// WAC names no discovery method; RFC 9110 lets servers omit computed headers on HEAD, so GET is the fallback.
async function advertisedACLResource(candidate: string, fetch: FetchLike): Promise<Advertisement> {
  let last: Advertisement = { targets: [], method: 'HEAD', status: 0 }

  for (const method of ['HEAD', 'GET'] as const) {
    let response: Response
    try {
      response = await fetch(candidate, { method })
    }
    catch (cause) {
      throw new ACLFetchError(`Failed to ${method} ${candidate}`, { iri: candidate, cause })
    }

    const targets = linkTargets(response.headers.get('Link'), 'acl', candidate)
    // the representation is never wanted
    if (method === 'GET') response.body?.cancel().catch(() => {})

    last = { targets, method, status: response.status }
    if (targets.length) return last
  }

  return last
}

/** Determine parent container based on RFC 3986's notion of `/`s representing hierarchical syntactic convention. Other methods, e.g., `rel="up"`, are considered. https://github.com/dokieli/web-access-control/issues/1 */
export function parentContainer(url: string): string | undefined {
  const parsed = new URL(url)
  if (parsed.pathname === '/' || parsed.pathname === '') return undefined

  const path = parsed.pathname.endsWith('/') ? parsed.pathname.slice(0, -1) : parsed.pathname
  return parsed.origin + path.slice(0, path.lastIndexOf('/') + 1)
}

/** https://solidproject.org/TR/wac#effective-acl-resource-algorithm */
export async function findEffectiveACL(resourceURL: string, options: DiscoveryOptions): Promise<ACLContext> {
  const { fetch = globalThis.fetch, parse = parseTurtle, accept = 'text/turtle' } = options
  const resource = new URL(resourceURL).href

  let candidate = resource
  let hint = options.aclResource === undefined ? undefined : new URL(options.aclResource, resource).href
  let defaultACLResource: string | undefined
  let effectiveContainer: string | undefined

  for (;;) {
    let aclResource: string

    if (hint === undefined) {
      const advertised = await advertisedACLResource(candidate, fetch)
      if (advertised.targets.length === 0) {
        throw new ACLNotDeterminedError(
          `No Link rel="acl" on ${candidate}; neither HEAD nor GET advertised one ` +
          `(${advertised.method} answered ${advertised.status}). ${NOT_DETERMINED}`,
          { iri: candidate })
      }
      aclResource = advertised.targets[0]
    }
    else {
      aclResource = hint
      hint = undefined
    }

    defaultACLResource = defaultACLResource ?? aclResource

    let response: Response
    try {
      response = await fetch(aclResource, { headers: { Accept: accept } })
    }
    catch (cause) {
      throw new ACLFetchError(`Failed to fetch ${aclResource}`, { iri: aclResource, cause })
    }

    if (response.status === 404) {
      const container = parentContainer(candidate)
      if (container === undefined) {
        throw new ACLNotDeterminedError(NOT_DETERMINED, { iri: resource })
      }
      effectiveContainer = container
      candidate = container
      continue
    }

    if (response.status === 403) {
      throw new ACLAccessDeniedError(
        `Access to candidate ACL resource ${aclResource} is forbidden. Stopping effective ACL resource search.`,
        { iri: aclResource })
    }

    if (!response.ok) {
      throw new ACLFetchError(`Failed to fetch ${aclResource}: ${response.status}`, {
        iri: aclResource,
        status: response.status,
      })
    }

    const contentType = response.headers.get('Content-Type') ?? accept
    const text = await response.text()
    const dataset = await parse(text, { baseIRI: aclResource, contentType })

    // https://solid.github.io/web-access-control-spec/#client-link-condition
    const conditions = linkTargets(response.headers.get('Link'), ACL + 'condition', aclResource)

    return buildACLContext({
      resource,
      defaultACLResource,
      effectiveACLResource: aclResource,
      effectiveContainer,
      conditions,
      dataset,
    })
  }
}
