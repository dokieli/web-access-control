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

// The demo server's patch handling. Turtle parsing and serialization come from
// n3, the same parser the library ships; only these two pieces are specific to
// applying what toSparqlUpdate and toN3Patch produce.

import { Parser } from 'n3'

/**
 * Triples out of a SPARQL Update or N3 Patch body. Blocks are classified by
 * the word in front of the brace: DELETE DATA, INSERT DATA, solid:deletes,
 * solid:inserts.
 */
export function parsePatch(body, { baseIRI = '' } = {}) {
  const text = body.replace(/\bPREFIX\s+(\S+)\s+(<[^>]*>)/gi, '@prefix $1 $2.')
  // the IRI may contain dots, so the directive ends at the dot after '>'
  const header = (text.match(/@(?:prefix|base)[^<]*<[^>]*>\s*\./g) ?? []).join('\n')
  const result = { deletes: [], inserts: [] }
  let i = 0

  while ((i = text.indexOf('{', i)) >= 0) {
    let depth = 1
    let end = i + 1
    while (end < text.length && depth > 0) {
      if (text[end] === '{') depth += 1
      if (text[end] === '}') depth -= 1
      end += 1
    }
    if (depth !== 0) throw new SyntaxError('Unbalanced braces in patch body')

    const preceding = text.slice(0, i)
    const inner = text.slice(i + 1, end - 1)
    i = end

    const clause = /delete(?:\s+data)?\s*$|deletes\s*$/i.test(preceding) ? result.deletes
      : /insert(?:\s+data)?\s*$|inserts\s*$/i.test(preceding) ? result.inserts
      : null
    if (clause) clause.push(...new Parser({ baseIRI }).parse(header + '\n' + inner))
  }

  return result
}

export function quadKey(quad) {
  const term = t => (t.termType === 'Literal'
    ? `"${t.value}"${t.language ?? ''}${t.datatype?.value ?? ''}`
    : `${t.termType}:${t.value}`)
  return [quad.subject, quad.predicate, quad.object].map(term).join(' ')
}
