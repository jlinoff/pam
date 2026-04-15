# Encryption format migration v1 → v2 (tracking)

## What this is

PAM 2.0 introduced a new encryption format (v2) that fixes two weaknesses in
the original format (v1). This issue tracks the migration status and serves as
a reference for users who have questions about the transition.

## Do I need to do anything?

**Probably not immediately.** If your master password is strong, your v1 files
are not immediately exploitable. See [MIGRATION.md](./MIGRATION.md) for a
full risk assessment.

When you are ready to migrate, the process is a single save operation:

1. Open PAM 2.0 or later
2. Load your existing file
3. Save it

PAM 2.0 always writes v2 — no settings to change.

## Will my old files stop working?

**No.** The v1 decrypt path is permanently retained. All v1 files remain
readable in PAM 2.0 and all future versions.

## Timeline

| Version | Change |
|---------|--------|
| PAM 2.0 | v2 always written on save. v1 files always readable. |
| PAM 2.1 | v1 encrypt path removed from code (≥ 1 year post-2.0). v1 decrypt retained permanently. |

## References

- [MIGRATION.md](./MIGRATION.md) — full technical details and risk assessment
- [RELEASE_NOTES_v2.0.md](./RELEASE_NOTES_v2.0.md) — what changed in 2.0
