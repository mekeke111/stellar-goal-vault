# SQLite Schema Contract

`db.ts` is the authoritative migration runner. `initDb()` applies its
idempotent schema changes to the configured SQLite database on every startup.
Migrations must preserve existing rows and remain safe to run more than once.

## Ownership and invariants

- `campaigns` owns campaign lifecycle state. `pledged_amount` is the cached
  accounting total for non-refunded rows in `pledges`; lifecycle changes are
  represented by `claimed_at`, `failed_at`, and `deleted_at`.
- `pledges` owns contribution records. `transaction_hash` is unique when
  present, `campaign_id` references `campaigns(id)`, and a refunded pledge is
  excluded from the campaign's pledged total.
- `campaign_events` is the append-only history for campaign lifecycle and
  accounting changes. Blockchain metadata is optional for local events.
- `campaign_comments` owns user feedback. `campaign_id` references
  `campaigns(id)` and `deleted_at` is a soft-delete marker; comment rows are
  not physically removed as part of normal lifecycle operations.
- `campaigns_fts` is a derived search index maintained by triggers. It can be
  rebuilt from `campaigns` and is never the source of truth.

## Migration expectations

Use `CREATE TABLE/INDEX/TRIGGER IF NOT EXISTS` for new objects and guarded
`ALTER TABLE` changes for existing objects, following the patterns in
`db.ts`. Additive changes must account for databases created by older
versions, backfill only when the existing data has a clear default, and avoid
rewriting lifecycle or accounting history. Update the focused database test
when a schema object or invariant changes.