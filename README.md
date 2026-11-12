# bb-reports

Password-locked weekly client reports, served on GitHub Pages.
Each client has one fixed link: `https://basebrandsgroup.github.io/bb-reports/<client>/`

To publish a new week (overwrites last week, same link):

    node tools/lock-report.mjs <client> <path-to-approved-report.html>

Then commit and push. Only locked files ever go in this repo.
Passwords and unlocked drafts live in `../bb-reports-private/` and are never committed.
