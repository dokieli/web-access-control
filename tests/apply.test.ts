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

import { describe, expect, it } from 'vitest'
import { applyPlan, negotiatePatchContentType } from '../src/apply.js'
import { PatchApplyError } from '../src/errors.js'
import { namedNode, quad } from '../src/terms.js'
import type { PatchPlan } from '../src/types.js'
import { emptyResponse, stubFetch } from './helpers.js'

const target = 'https://example.org/data/doc.acl'

const plan: PatchPlan = {
  target,
  deletes: [],
  inserts: [quad(
    namedNode(target + '#rule'),
    namedNode('http://www.w3.org/ns/auth/acl#agent'),
    namedNode('https://example.org/luigi#i'))],
}

describe('negotiatePatchContentType', () => {
  it('prefers text/n3 when both formats are advertised', async () => {
    const fetch = stubFetch({
      ['OPTIONS ' + target]: () => emptyResponse({ headers: { 'Accept-Patch': 'text/n3, application/sparql-update' } }),
    })
    expect(await negotiatePatchContentType(target, { fetch })).toBe('text/n3')
  })

  it('treats */* as text/n3', async () => {
    const fetch = stubFetch({
      ['OPTIONS ' + target]: () => emptyResponse({ headers: { 'Accept-Patch': '*/*' } }),
    })
    expect(await negotiatePatchContentType(target, { fetch })).toBe('text/n3')
  })

  it('uses application/sparql-update when it is the only match', async () => {
    const fetch = stubFetch({
      ['OPTIONS ' + target]: () => emptyResponse({ headers: { 'Accept-Patch': 'application/sparql-update' } }),
    })
    expect(await negotiatePatchContentType(target, { fetch })).toBe('application/sparql-update')
  })

  it('assumes text/n3 without Accept-Patch information', async () => {
    const fetch = stubFetch({
      ['OPTIONS ' + target]: () => emptyResponse(),
    })
    expect(await negotiatePatchContentType(target, { fetch })).toBe('text/n3')
  })

  it('throws when no advertised media type is supported', async () => {
    const fetch = stubFetch({
      ['OPTIONS ' + target]: () => emptyResponse({ headers: { 'Accept-Patch': 'text/ldpatch' } }),
    })
    await expect(negotiatePatchContentType(target, { fetch }))
      .rejects.toThrow(/PATCH media type not supported/)
  })
})

describe('applyPlan', () => {
  it('negotiates and PATCHes', async () => {
    const fetch = stubFetch({
      ['OPTIONS ' + target]: () => emptyResponse({ headers: { 'Accept-Patch': 'text/n3' } }),
      ['PATCH ' + target]: () => emptyResponse({ status: 205 }),
    })

    const response = await applyPlan(plan, { fetch })

    expect(response.status).toBe(205)
    const patchCall = fetch.calls.find(call => (call.init?.method ?? '') === 'PATCH')
    expect(patchCall?.init?.headers).toEqual({ 'Content-Type': 'text/n3' })
    expect(String(patchCall?.init?.body)).toContain('solid:inserts')
  })

  it('skips negotiation when a content type is given', async () => {
    const fetch = stubFetch({
      ['PATCH ' + target]: () => emptyResponse(),
    })

    await applyPlan(plan, { fetch, contentType: 'application/sparql-update' })

    expect(fetch.calls).toHaveLength(1)
    expect(String(fetch.calls[0].init?.body)).toContain('INSERT DATA')
  })

  it('throws PatchApplyError on failure', async () => {
    const fetch = stubFetch({
      ['PATCH ' + target]: () => emptyResponse({ status: 409 }),
    })

    await expect(applyPlan(plan, { fetch, contentType: 'application/sparql-update' }))
      .rejects.toBeInstanceOf(PatchApplyError)
  })
})
