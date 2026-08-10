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

export interface LinkEntry {
  target: string
  params: Record<string, string>
}

const ENTRY_PATTERN = /<([^>]*)>((?:\s*;\s*[\w*-]+\s*=\s*(?:"[^"]*"|[^,;]+))*)/g
const PARAM_PATTERN = /;\s*([\w*-]+)\s*=\s*(?:"([^"]*)"|([^,;\s]+))/g

export function parseLinkHeader(headerValue: string): LinkEntry[] {
  const entries: LinkEntry[] = []

  for (const match of headerValue.matchAll(ENTRY_PATTERN)) {
    const params: Record<string, string> = {}
    for (const param of match[2].matchAll(PARAM_PATTERN)) {
      const key = param[1].toLowerCase()
      // first occurrence of a parameter wins, per RFC 8288
      if (!(key in params)) params[key] = param[2] ?? param[3] ?? ''
    }
    entries.push({ target: match[1], params })
  }

  return entries
}

/** absolute targets of entries carrying the given link relation */
export function linkTargets(headerValue: string | null | undefined, rel: string, baseIRI: string): string[] {
  if (!headerValue) return []

  const targets: string[] = []
  const wanted = rel.toLowerCase()

  for (const entry of parseLinkHeader(headerValue)) {
    const rels = (entry.params.rel ?? '').toLowerCase().split(/\s+/)
    if (rels.includes(wanted)) targets.push(new URL(entry.target, baseIRI).href)
  }

  return targets
}
