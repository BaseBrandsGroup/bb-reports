# bb-reports

Password-locked weekly client reports, served on GitHub Pages.
Each client has one fixed link: `https://basebrandsgroup.github.io/bb-reports/<client>/`

To publish a new week (overwrites last week, same link), after Fee approves:

    node tools/check-report.mjs <client> <approved-report.html>
    node tools/lock-report.mjs <client> <approved-report.html>
    tools/publish.sh <client> "w/c 3 Nov 2026"

The full process (with Fee's stop checks and the Base Central card) is the
`publish-client-report` Claude Code skill. Only locked files ever go in this repo.
Passwords and unlocked drafts live in `../bb-reports-private/` and are never committed.
