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

import { parseTurtle as parseRDF } from '../src/parse.js'
import type { FetchLike, GraphParser, Quad } from '../src/types.js'

export function parseTurtle(input: string, options: { baseIRI: string }): Quad[] {
  return parseRDF(input, { baseIRI: options.baseIRI, contentType: 'text/turtle' }) as Quad[]
}

export const turtleParser: GraphParser = parseRDF

export interface RecordedCall {
  url: string
  init?: RequestInit
}

export type StubbedFetch = FetchLike & { calls: RecordedCall[] }

/** routes keyed by "METHOD url"; values are factories so each call gets a fresh Response */
export function stubFetch(routes: Record<string, (init?: RequestInit) => Response>): StubbedFetch {
  const calls: RecordedCall[] = []

  const stub = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    const method = (init?.method ?? 'GET').toUpperCase()
    const route = routes[method + ' ' + url]
    if (!route) throw new Error('No stub for ' + method + ' ' + url)
    return route(init)
  }) as StubbedFetch

  stub.calls = calls
  return stub
}

export function textResponse(body: string, options?: { status?: number; headers?: Record<string, string> }): Response {
  return new Response(body, {
    status: options?.status ?? 200,
    headers: { 'Content-Type': 'text/turtle', ...options?.headers },
  })
}

export function emptyResponse(options?: { status?: number; headers?: Record<string, string> }): Response {
  return new Response(null, { status: options?.status ?? 200, headers: options?.headers })
}

export function counterIdFactory(prefix = 'auth'): () => string {
  let n = 0
  return () => {
    n += 1
    return prefix + '-' + n
  }
}

export function hasQuad(quads: Quad[], subject: string, predicate: string, object: string): boolean {
  return quads.some(q =>
    q.subject.value === subject && q.predicate.value === predicate && q.object.value === object)
}

export function quadsAbout(quads: Quad[], subject: string): Quad[] {
  return quads.filter(q => q.subject.value === subject)
}
