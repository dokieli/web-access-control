# dokieli Web Access Control

[Web Access Control](https://solidproject.org/TR/wac) (WAC) implementation for clients to read and change access controls to resources. Supports inspection of authorization rules, planning of authorizations, patching of resources, and allows clients to use their own RDF parsers and HTTP stacks.

* [Code of Conduct](https://github.com/dokieli/web-access-control/blob/main/CODE-OF-CONDUCT.md)
* [Contributing Guide](https://github.com/dokieli/web-access-control/blob/main/CONTRIBUTING.md)
* [API Reference](https://dokieli.github.io/web-access-control/)
* [Security Policy](https://github.com/dokieli/web-access-control/blob/main/SECURITY.md)

## License

* Source code is licensed under the [Apache License, Version 2.0](http://www.apache.org/licenses/LICENSE-2.0).
* Unless otherwise noted, images and other media assets are licensed under the [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/).

## Installation

```sh
npm install @dokieli/web-access-control
```

or

```sh
yarn install @dokieli/web-access-control
```

```js
import { findEffectiveACL, isPublic, modesFor } from '@dokieli/web-access-control';

const ctx = await findEffectiveACL('https://example.org/article', { fetch });

modesFor(ctx, 'https://example.org/giuseppina#i');
isPublic(ctx);
```

```js
import { applyPlan, planGrant, planRevoke, Public } from '@dokieli/web-access-control';

const plan = planGrant(ctx, { type: 'agent', iri: 'https://example.org/liliano#i' }, ['Read', 'Write']);

await applyPlan(plan, { fetch });

await applyPlan(planRevoke(ctx, Public), { fetch });
```

## Documentation

See [API Reference](https://dokieli.github.io/web-access-control/) and [Examples](https://github.com/dokieli/web-access-control/blob/main/examples/).

## Features

* Effective ACL resource discovery via `Link rel="acl"`.
* Interprets `WAC-Allow` header.
* Queries the authorizations governing a resource.
* Pure patch planners for granting and revoking access, copying inherited container ACLs.
* Supports client and issuer [access conditions](https://solid.github.io/web-access-control-spec/#access-conditions).
* Adapts to server's acceptable `PATCH` media types (N3 Patch or SPARQL 1.1 Update).
* Authentication left to the caller via an injected `fetch`.
* Reads Turtle out of the box, or any serialization via a caller-supplied parser returning RDF/JS quads.

## Specifications

* [Web Access Control](https://solidproject.org/TR/wac) and the [Editor's Draft](https://solid.github.io/web-access-control-spec/)
* Solid Protocol's [N3 Patch](https://solidproject.org/TR/protocol#n3-patch)
* W3C [SPARQL 1.1 Update](https://www.w3.org/TR/sparql11-update/)
* [RDF/JS: Data model specification](http://rdf.js.org/data-model-spec/)

## Conformance

What the library implements WAC's [Editor's Draft](https://solid.github.io/web-access-control-spec/):

* **WAC**: discovery via `Link rel=acl`; determining the [effective ACL resource](https://solid.github.io/web-access-control-spec/#effective-acl-resource); the [`acl` vocabulary](https://www.w3.org/ns/auth/acl); `WAC-Allow` groups and modes.
* **N3 Patch**: exactly one patch resource per document with a blank node subject, no blank nodes in the formulae, every variable bound in `solid:where`.
* **SPARQL 1.1 Update**: ground `DELETE DATA`/`INSERT DATA`, and the `DELETE {} INSERT {} WHERE {}` form when a plan carries `where` patterns.

Where the specifications are silent, the library is opinionated. WAC does not require a particular way to write ACL resources. So, `PATCH` with `Accept-Patch` negotiation is this library's choice, as is trying `HEAD` before `GET` for discovery. All planner behavior is policy: copy-on-write when access is inherited, splitting multi-subject rules, rewriting modes in place, skipping rules a patch cannot address, and no mode implication (`Write` does not imply `Read`).

The library determines parent containers based on RFC 3986's notion of `/`s representing hierarchical syntactic convention. Other methods, e.g., `rel="up"`, are [considered](https://github.com/dokieli/web-access-control/issues/1).

[Conditional authorizations](https://solid.github.io/web-access-control-spec/#access-conditions) implements work in progress.Its security considerations shape the planners: a server without condition support evaluates an authorization with its conditions ignored, granting more than stated, so conditions are attached automatically only when the ACL resource advertises support, an explicit request to write them to one that does not is refused, and cloned authorizations always keep their conditions.

## Contributing

See the [Contributing Guide](CONTRIBUTING.md) for development setup, tests, and commit conventions.

## Supported By

* This project was funded by [NLnet](https://nlnet.nl/) (2025-09–2026-08) as part of [NLnet Dokieli Collaborative](https://nlnet.nl/project/Dokieli-Collaborative/).

## Support the project

Help the project grow by sponsoring it on [Open Collective](https://opencollective.com/dokieli/) or reach out to us.
