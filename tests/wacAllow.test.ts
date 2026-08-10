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
import { allows, parseWacAllow } from '../src/wacAllow.js'

describe('parseWacAllow', () => {
  it('parses user and public groups', () => {
    const wac = parseWacAllow('user="read write append control",public="read"')!
    expect([...wac.user].sort()).toEqual(['Append', 'Control', 'Read', 'Write'])
    expect([...wac.public]).toEqual(['Read'])
  })

  it('tolerates messy field values', () => {
    const wac = parseWacAllow('foo=bar ,user=" READ wriTe Append control ", public=" read append" ,other="read " , baz= write, group=" ",,')!
    expect([...wac.user].sort()).toEqual(['Append', 'Control', 'Read', 'Write'])
    expect([...wac.public].sort()).toEqual(['Append', 'Read'])
    expect([...wac.other]).toEqual(['Read'])
    expect([...wac.group]).toEqual([])
  })

  it('returns null for a missing header', () => {
    expect(parseWacAllow(null)).toBe(null)
    expect(parseWacAllow(undefined)).toBe(null)
    expect(parseWacAllow('')).toBe(null)
  })

  it('distinguishes an empty group from a missing header', () => {
    const wac = parseWacAllow('user="",public=""')!
    expect(wac.user.size).toBe(0)
    expect(wac.public.size).toBe(0)
  })

  it('ignores unknown mode tokens', () => {
    const wac = parseWacAllow('user="read destroy"')!
    expect([...wac.user]).toEqual(['Read'])
  })
})

describe('allows', () => {
  it('is true when the user group holds the mode', () => {
    expect(allows(parseWacAllow('user="write"')!, 'Write')).toBe(true)
  })

  it('is true when the public group holds the mode', () => {
    expect(allows(parseWacAllow('public="read"')!, 'Read')).toBe(true)
  })

  it('is false otherwise', () => {
    expect(allows(parseWacAllow('user="read"')!, 'Write')).toBe(false)
  })
})

