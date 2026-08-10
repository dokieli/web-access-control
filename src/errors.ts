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

export class WACError extends Error {
  /** IRI the failed operation was about */
  iri?: string
  cause?: unknown

  constructor(message: string, options?: { iri?: string; cause?: unknown }) {
    super(message)
    this.name = 'WACError'
    this.iri = options?.iri
    this.cause = options?.cause
  }
}

/** no effective ACL resource could be determined for the resource */
export class ACLNotDeterminedError extends WACError {
  constructor(message: string, options?: { iri?: string; cause?: unknown }) {
    super(message, options)
    this.name = 'ACLNotDeterminedError'
  }
}

/** a candidate ACL resource answered 403; the search must stop */
export class ACLAccessDeniedError extends WACError {
  /** the forbidden candidate ACL resource */
  iri: string
  status = 403

  constructor(message: string, options: { iri: string; cause?: unknown }) {
    super(message, options)
    this.name = 'ACLAccessDeniedError'
    this.iri = options.iri
  }
}

export class ACLFetchError extends WACError {
  /** the resource or ACL resource that failed to fetch */
  iri: string
  status?: number

  constructor(message: string, options: { iri: string; status?: number; cause?: unknown }) {
    super(message, options)
    this.name = 'ACLFetchError'
    this.iri = options.iri
    this.status = options.status
  }
}

export class PatchApplyError extends WACError {
  /** the ACL resource the patch was sent to */
  iri: string
  status?: number

  constructor(message: string, options: { iri: string; status?: number; cause?: unknown }) {
    super(message, options)
    this.name = 'PatchApplyError'
    this.iri = options.iri
    this.status = options.status
  }
}
