# Contributing Guide

Thank you for investing your time in contribution to the dokieli Web Access
Control project!

The [dokieli/web-access-control](https://github.com/dokieli/web-access-control) repository contains the source code, which was originally derived from the [dokieli](https://dokie.li/) project.

## How to contribute

We welcome contributions in the form of issues or PRs.

## Code of conduct

We have a [Code of Conduct](CODE_OF_CONDUCT.md) to help keep our community
inclusive, welcoming, and friendly.

See [additional
resources](https://www.w3.org/about/positive-work-environment/#Education) for
education and training to promote a positive work environment.

## Licensing

Contributions are made in a personal capacity. By contributing, you represent that you have the right to submit the work under:

* Source code is licensed under the [Apache License, Version 2.0](http://www.apache.org/licenses/LICENSE-2.0).
* Unless otherwise noted, resources such as images and other media assets are licensed under the [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/).

## Quality Assurance

This project follows a set of quality assurance principles to ensure code, translations, accessibility, and security meet expectations.

**Code**: There is documentation for [tests](#tests). Code contributions are expected to be ultimately authored by humans, even if automated tools assist.

**Security**: This project has a [Security Policy](SECURITY.md).

**Standards**: This project is committed to implementing recognised web standards and best practises.

## Development

* See the generated [API Reference](https://dokieli.github.io/web-access-control/).
* See [fork a repo](https://help.github.com/articles/fork-a-repo/) to setup
your own development repository and stay
[synchronised](https://help.github.com/articles/syncing-a-fork). Useful later
to make pull requests. For example, using your fork at `https://github.com/YOUR-USERNAME/web-access-control` :

Clone your work repository, for example:

```sh
git clone git@github.com:YOUR-USERNAME/web-access-control
cd web-access-control
```

Install packages:

```sh
yarn
```

Make your code updates at src/ , tests/ etc.

Build (compiles TypeScript to `dist/`):

```sh
yarn build
```

Lint:

```sh
yarn lint
yarn lint:fix
```

Build the API reference documentation (generates `docs/` with [TypeDoc](https://typedoc.org/)):

```sh
yarn docs
```

Run the example app (serves the page and a small in-memory WAC origin; requires a build first):

```sh
yarn build
node examples/server.js
# open http://localhost:3001/examples/
```

## Tests

### Unit tests

This project uses [Vitest](https://vitest.dev/) for unit tests.

To run unit tests, run:

```sh
yarn test
```

To run unit tests and the TypeScript type check together, run:

```sh
yarn test:all
```

## Commits

We use [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): description`.

Common types: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`. Example:

```text
feat(plan): support issuer conditions on new authorizations
```

## Comment Tags

We follow common codetag conventions. See [PEP 350 - Codetags](https://peps.python.org/pep-0350/) for background and historical discussion.

* `TODO` - Planned work or improvements.
* `FIXME` - Known problems or broken behavior.
* `NOTE` - Important context or explanation.
* `HACK` - Temporary workaround or non-ideal solution.
* `PERF` - Performance-related improvement or optimization opportunity.
* `XXX` - Suspicious code requiring attention or review.
