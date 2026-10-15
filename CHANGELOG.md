# Changelog

All notable changes to Aspected Studio are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-10-15

### Added

#### Connections and packaging

- Connection manager for multiple Aspected servers, with welcome and sidebar
  flows, disconnect handling, and reconnect.
- Silent reconnect on reload for the last saved or unsaved session. Unsaved
  sessions show as **Not saved** in the sidebar with Disconnect and Save.
- Bundled Studio under `/studio/` on the same origin as the Aspected API
  (auto-connects to `window.location.origin`).
- GitHub Releases with a production dist tarball (`/studio/` base) and unsigned
  desktop installers via `deno desktop` (macOS `.dmg`, Windows `.msi`, Linux
  `.AppImage` and `.deb`).
- Catch-all 404 page and root route error boundary.

#### Indexes, documents, and search

- Index create, schema editing, document browsing, and search against the
  Aspected HTTP API.
- Request Inspector for inspecting API traffic from Studio screens.
- Year-only and richer datetime handling in aspect value fields.
- Create-index form ↔ JSON toggle works with incomplete drafts.

#### Playground, Scorecard, and Auto-tune

- Playground for weight tuning with Live / Preview / Stale ranking modes.
- Compare A/B overlap, rank-biased overlap, and movement views.
- Scorecard with golden sets and quality metrics.
- Auto-tune for budgeted Live weight, on-off, and depth search.
- Catalog and TMDB movies seed tasks plus golden / planted sets for demos.

#### Docs and UX

- In-app Studio docs and tutorials (connect, indexes, search, Playground,
  Scorecard, Auto-tune, movies readiness).
- Docs catalog paths aligned with the live docs site (authentication, document
  access control, static API token hash).
- Sidebar navigation and branding updates (favicon and app chrome).
- Desktop app icons for Linux and Windows, including a `.desktop` entry on deb
  packages.
