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

import { Parser } from 'n3'
import { WACError } from './errors.js'
import type { GraphParser, Quad } from './types.js'

/** media types parseTurtle reads */
export const TURTLE_MEDIA_TYPES = [
  'text/turtle',
  'application/trig',
  'application/n-triples',
  'application/n-quads',
  'text/n3',
] as const

function isSupported(mediaType: string): boolean {
  return (TURTLE_MEDIA_TYPES as readonly string[]).includes(mediaType)
}

/** The default GraphParser. Reads the Turtle family; pass your own for anything else. */
export const parseTurtle: GraphParser = (input, { baseIRI, contentType }): Quad[] => {
  const mediaType = contentType.split(';')[0].trim().toLowerCase()

  if (!isSupported(mediaType)) {
    throw new WACError(
      `The built-in parser reads ${TURTLE_MEDIA_TYPES.join(', ')}, not ${mediaType}; ` +
      'pass a parse function that does',
      { iri: baseIRI })
  }

  try {
    return new Parser({ baseIRI, format: mediaType }).parse(input) as Quad[]
  }
  catch (cause) {
    throw new WACError(`Failed to parse ${mediaType} from ${baseIRI}`, { iri: baseIRI, cause })
  }
}
