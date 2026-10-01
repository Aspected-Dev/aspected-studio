# Changelog

All notable changes to Aspected Studio are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-09-30

### Added

#### Connections and packaging

- Connection manager for multiple Aspected servers, with welcome and sidebar
  flows, disconnect handling, and reconnect.
- Bundled Studio UI support for official Aspected Docker images (cross-port API
  and static listener on `:8081`).
- GitHub Releases for the static Hub image (`xillio/aspected-studio-static`) and
  dist tarball on `v*` tags.
- Unsigned desktop installers on GitHub Releases via `deno desktop` (macOS
  `.dmg`, Windows `.msi`, Linux `.AppImage` and `.deb`), with SHA-256 checksums.

#### Indexes, documents, and search

- Index create, schema editing, document browsing, and search against the
  Aspected HTTP API.
- Request Inspector for inspecting API traffic from Studio screens.
- Year-only and richer datetime handling in aspect value fields.

#### Playground, Scorecard, and Auto-tune

- Playground for weight tuning with Live / Preview / Stale ranking modes.
- Compare A/B overlap, rank-biased overlap, and movement views.
- Scorecard with golden sets and quality metrics.
- Auto-tune for budgeted Live weight, on-off, and depth search.
- Catalog and TMDB movies seed tasks plus golden / planted sets for demos.

#### Docs and UX

- In-app Studio docs and tutorials (connect, indexes, search, Playground,
  Scorecard, Auto-tune, movies readiness).
- Sidebar navigation and branding updates (favicon and app chrome).
