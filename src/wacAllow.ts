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

import { ACCESS_MODES } from './terms.js'
import type { AccessMode, WacAllow } from './types.js'

// tolerant of unquoted values, stray whitespace, and unknown groups
const PERMISSION_GROUP_PATTERN = /(\w+)\s*=\s*"?\s*((?:\s*[^",\s]+)*)\s*"?/g

function toAccessMode(token: string): AccessMode | undefined {
  const name = token.charAt(0).toUpperCase() + token.slice(1).toLowerCase()
  return (ACCESS_MODES as readonly string[]).includes(name) ? (name as AccessMode) : undefined
}

/** null when the header carries no information; empty groups mean no access */
export function parseWacAllow(headerValue: string | null | undefined): WacAllow | null {
  if (!headerValue) return null

  const groups: WacAllow = { user: new Set<AccessMode>(), public: new Set<AccessMode>() }

  for (const match of headerValue.matchAll(PERMISSION_GROUP_PATTERN)) {
    const modes = new Set<AccessMode>()
    for (const token of (match[2] ?? '').trim().split(/\s+/)) {
      if (!token) continue
      const mode = toAccessMode(token)
      if (mode) modes.add(mode)
    }
    groups[match[1]] = modes
  }

  return groups
}

export function allows(wacAllow: WacAllow, mode: AccessMode): boolean {
  return wacAllow.user.has(mode) || wacAllow.public.has(mode)
}
