# Changelog

## 1.0.0 (2026-08-10)

Making it so! Initial release of `@dokieli/web-access-control` - a Web Access Control (WAC) client library. Source code derived and extended from https://git.dokie.li/ .

### Features

* `WAC-Allow` header interpretation, tolerant of unquoted values and unknown groups.
* Effective ACL resource discovery per the WAC algorithm, over `Link rel="acl"`, with `HEAD` falling back to `GET`.
* Authorization queries over an `ACLContext`: modes for a subject, subjects holding a mode, public access, and control.
* Pure patch planning for grants, revocations, public read, owner control, and container ACLs, including copy-on-write when access is inherited from a container.
* Conditional authorizations (`acl:ClientCondition`, `acl:IssuerCondition`) with `Link rel=acl:condition` discovery, written only where the server advertises support.
* Patch serialization to SPARQL 1.1 Update and N3 Patch, with format constraints enforced, and application over `PATCH` with `Accept-Patch` negotiation.
* No DOM access and no global state: HTTP goes through an injected `fetch`, RDF parsing through an injected parser returning RDF/JS quads.
