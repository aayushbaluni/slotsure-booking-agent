# Migrations

Generate the baseline migration (does not apply it), then append the raw SQL that creates
the exclusion constraint so a plain `prisma migrate deploy` always produces it:

```bash
pnpm --filter @slotsure/api exec prisma migrate dev --create-only --name init
# then append constraint.sql's contents to the generated migration.sql, e.g.:
cat prisma/migrations/constraint.sql >> prisma/migrations/<timestamp>_init/migration.sql
```

`constraint.sql` (in this folder) is the source of the overlap guarantee — the `btree_gist`
exclusion constraint is the final word on overlaps (build spec §4). It is kept as a standalone
file so it is reviewable and so the race test can apply the same SQL against a throwaway DB.
