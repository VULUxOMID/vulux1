# VUL-93 Report System v1 QA

## Build proof

```bash
cd /private/tmp/vul-93-report-system/vulu-spacetime/spacetimedb
/Users/omid/.local/bin/spacetime build
```

Result:

```text
Build finished successfully.
```

## Automated test proof

```bash
cd /private/tmp/vul-93-report-system
node --test --experimental-strip-types vulu-spacetime/spacetimedb/src/reportingPolicy.test.mjs
npm run test:live-regression
```

Results:

```text
✔ report policy allows a fresh submission
✔ report policy rejects a duplicate report within the dedupe window
✔ report policy rejects report spam bursts from the same reporter
✔ normalizeReportStatus accepts only known review states

ℹ pass 4
ℹ fail 0
```

```text
ℹ pass 15
ℹ fail 0
```

## Submission surfaces

- Global chat message action menu: `Report`
- Messages screen conversation menu: `Report user`
- Live screen report sheet: submits live/session report

Each submission captures:

- reporter user id
- target type/id
- reported user id when applicable
- surface
- reason
- optional details
- moderation context JSON

## Review path

- Admin screen now includes `Reports` tab
- Queue is populated from `admin_report_queue`
- Review actions: `open`, `triaged`, `resolved`, `dismissed`
- Every review action appends an immutable moderation audit row

## DB verification queries

After publishing the module and submitting a report, verify persistence with:

```sql
SELECT id, reporter_user_id, target_type, target_id, reported_user_id, surface, reason, status
FROM report_item
ORDER BY created_at DESC;
```

```sql
SELECT action_type, target_user_id, target_type, target_id, reason, created_at
FROM moderation_action_item
WHERE action_type IN ('report_submitted', 'report_reviewed')
ORDER BY created_at DESC;
```

## Expected QA evidence

1. Submit one report from a user-facing surface.
2. Confirm a `report_item` row exists with the expected context.
3. Open Admin -> Reports and review the report without direct DB access.
4. Change status to `triaged` or `resolved`.
5. Confirm a `report_reviewed` moderation audit row exists.
