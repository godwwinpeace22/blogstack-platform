# Source, CI and customer acceptance

The private source repository is https://github.com/godwwinpeace22/blogstack-platform. It is owned by the operator-selected `godwwinpeace22` account. The npm publisher is separately `godwinpeace22`.

## Working copy

The original development directory contains several nested repositories. Those repositories remain intact. The sanitized platform release checkout is `.launch/release-repository`; it has its own `main` branch and GitHub remote. Credentials, backups, customer exports, local databases, generated output and test sessions are excluded.

From the original development directory, synchronize reviewed source changes before committing:

```sh
node scripts/prepare-private-repository.mjs
git -C .launch/release-repository diff --stat
git -C .launch/release-repository add .
node scripts/check-source.mjs .launch/release-repository
git -C .launch/release-repository diff --cached
git -C .launch/release-repository commit -m "Describe the change"
git -C .launch/release-repository push origin main
```

The synchronization copies allowed source files and scans for known private credentials without printing their values. It never moves original Git metadata or deletes files. If a source file was deliberately removed, review and remove its counterpart in the release checkout explicitly. For a new machine, clone the private GitHub repository normally and work directly in that clone; the separate release checkout is only needed for this original multi-repository directory.

## Continuous integration

`.github/workflows/verify.yml` runs on pushes, pull requests and manual dispatch. It uses Node 24, Bun 1.4.0 and the committed npm lockfile. The job checks tracked source, builds the public packages, generates documentation types, checks workspace types, runs all regression suites, builds frontends and the reference installation, dry-runs all production Workers and checks the static launch gate. Build artifacts are retained for seven days. The workflow has read-only repository permissions and does not need production secrets.

CI does not deploy or enable signup, checkout or a Cloudflare paid upgrade. Production deployment uses the existing private launcher and reviewed configuration. Keep `SIGNUP_MODE=pilot`, the operator-only allowlist and `CHECKOUT_ENABLED=false`. Polar remains on hold until the operator buys the product domain and explicitly resumes it.

## Isolated customer and load tests

The November 19 acceptance environment used `blogstack-qa-app`, `blogstack-qa-cdn`, its own D1/R2/KV and synthetic `example.invalid` users. No payment or email credential, operations service binding, queue consumer or cron is configured there. The QA harness is a separate test entry point; it is never a production entry point. Its authenticated job dispatcher refuses payment, reconciliation and outbound-email jobs.

`scripts/prepare-customer-qa.mjs` writes restricted local configuration, seed data and test credentials for explicitly supplied QA resource IDs. `scripts/verify-customer-qa.mjs` uses those synthetic sessions to verify the actual browser-created project, invitation and client article. Browser acceptance covers agency branding, client login/invitation acceptance, editor autosave, cover upload and publication. Native API checks deny an unrelated account and client administrative access, then verify public delivery and an actual npm-installed Next.js consumer.

The bounded load drill sends 286 requests, with concurrency up to 12. It checks public reads, same-revision saves, Solo blog/people/storage caps and shared AI reservations. Expected quota/stale-revision responses are assertions, not failures. Upload-capacity tests reserve bytes without storing 1 GB of media. AI load tests never dispatch inference; their reservations are released explicitly through the generated QA-only SQL. The independent small AI acceptance run uses the real provider and verifies a pending proposal while the draft and publication remain unchanged.

Run load acceptance against a fresh isolated fixture. A completed fixture deliberately retains its quota evidence until cleanup; repeating `--load` against it is not a clean run. Never substitute production resource IDs or real customer sessions. Keep fixture JSON, SQL, credentials, browser screenshots and raw logs private. Sanitized results live under local `artifacts/verification/customer-*.json`.

After acceptance, disable public QA Worker routes/previews and revoke synthetic sessions. Keep outbound jobs stopped. The production operations worker and schedules are independent of QA and remain active.

These are synthetic acceptance and bounded load results. They do not replace the agreed three paying pilot accounts, a week without critical issues, or the deferred payment acceptance matrix.
