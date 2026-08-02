# Zona version archives

This directory preserves the database migrations, documentation, and user-facing release items for Zona 0.0.1 through 0.0.8.

These are immutable historical snapshots, not current setup or feature
documentation. Use [`../docs/README.md`](../docs/README.md) and
[`../docs/FEATURE_STATUS.md`](../docs/FEATURE_STATUS.md) for current behavior.

Each version is intentionally split into:

- `database/`: every migration available at that release boundary, the migrations introduced by that version, origin/blob metadata, and SHA-256 checksums.
- `documents/`: the documentation snapshot from that release boundary, changed-file list, human-facing release notes, structured version items, and SHA-256 checksums.

## Archive index

| Release | Boundary metadata | Customer note |
| --- | --- | --- |
| [v0.0.1](v0.0.1/) | [release.json](v0.0.1/release.json) | [English](v0.0.1/documents/release-notes.en.md) |
| [v0.0.2](v0.0.2/) | [release.json](v0.0.2/release.json) | [English](v0.0.2/documents/release-notes.en.md) |
| [v0.0.3](v0.0.3/) | [release.json](v0.0.3/release.json) | [English](v0.0.3/documents/release-notes.en.md) |
| [v0.0.4](v0.0.4/) | [release.json](v0.0.4/release.json) | [English](v0.0.4/documents/release-notes.en.md) |
| [v0.0.5](v0.0.5/) | [release.json](v0.0.5/release.json) | [English](v0.0.5/documents/release-notes.en.md) |
| [v0.0.6](v0.0.6/) | [release.json](v0.0.6/release.json) | [English](v0.0.6/documents/release-notes.en.md) |
| [v0.0.7](v0.0.7/) | [release.json](v0.0.7/release.json) | [English](v0.0.7/documents/release-notes.en.md) |
| [v0.0.8](v0.0.8/) | [release.json](v0.0.8/release.json) | [English](v0.0.8/documents/release-notes.en.md) |

The database package is cumulative so a version can be reconstructed without borrowing migrations from another folder. `delta-migrations.txt` identifies only the migrations introduced in that version.

## Historical accuracy

The repository did not create Git tags for these releases. Boundaries for 0.0.1 and 0.0.3 are inferred from commit history, while later boundaries have stronger version/commit evidence. Read each `release.json` before treating a folder as an official shipped artifact.

Migration ownership follows the earliest release boundary containing the migration's addition commit. Application order always follows the complete migration filename. A migration can contain retroactive release-note content without being reassigned to that earlier version.

## Rebuild

Run `scripts/build-version-archives.ps1` only after moving or deleting the existing `versions/` directory. The script refuses to overwrite an archive and always extracts exact Git blobs from the recorded commits.
