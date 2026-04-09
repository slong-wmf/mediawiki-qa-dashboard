# API Setup Guide

This guide explains how to obtain credentials for the dashboard's data sources
and where to place them in your `.env` file.

---

## 1. Wikimedia Jenkins CI — No Authentication Required

The Jenkins REST API at `https://integration.wikimedia.org/ci` is a publicly readable
endpoint. No token or login is needed.

**How to verify access:**
1. Open a browser and navigate to:
   `https://integration.wikimedia.org/ci/job/quibble-composer-mysql-php83-selenium/api/json?tree=builds[result]{0,3}`
2. You should receive a JSON object with a `builds` array immediately.

No `.env` entry is required for Jenkins.

---

## 2. doc.wikimedia.org Coverage Index — No Authentication Required

Coverage data is read directly from the HTML index pages at
`https://doc.wikimedia.org/cover/` and `https://doc.wikimedia.org/cover-extensions/`.
These are public pages — no token or login is needed.

**How to verify access:**
1. Open a browser and navigate to:
   `https://doc.wikimedia.org/cover-extensions/`
2. You should see an HTML page listing extensions with coverage percentages.

No `.env` entry is required for the coverage index.

---

## 3. Phabricator Conduit Token (Optional)

The dashboard reads open tasks from Phabricator Maniphest using the Conduit API.
Public read access works without a token, but providing one raises the rate-limit
ceiling and is recommended for regular use.

**Step-by-step:**

1. Sign in to Phabricator at `https://phabricator.wikimedia.org`.
2. Click your profile avatar (top-right) → **Settings**.
3. In the left sidebar, click **Conduit API Tokens**.
4. Click **Generate Token**.
5. Add a description, e.g. `mediawiki-dashboard-read`.
6. Leave the token type as the default (standard Conduit token).
7. Click **Generate Token** to confirm.
8. Copy the token (it starts with `api-`).

**To verify the token works:**
```bash
curl -d "api.token=api-yourtoken&constraints[modifiedStart]=1700000000&limit=3" \
  https://phabricator.wikimedia.org/api/maniphest.search
```
You should receive a JSON response with `"error_code": null` and a `result.data` array.

**`.env` entry:**
```
VITE_PHABRICATOR_TOKEN=api-yourtoken
```

> **Security:** Phabricator tokens are account-level. Consider creating a dedicated
> bot account with read-only access for production use.

---

---

## 4. Refreshing the Wikipedia Extension List

The "Wikipedia only" filter in the Code Coverage panel is driven by a static list of
extensions deployed on en.wikipedia.org, stored in `src/data/activeExtensions.js`.
This list was generated on **2026-04-03** and should be refreshed periodically as the
set of deployed extensions changes.

### How to regenerate the list

**Step 1 — Fetch the current extension list from the Wikipedia siteinfo API:**

```bash
curl -s "https://en.wikipedia.org/w/api.php?action=query&meta=siteinfo&siprop=extensions&format=json" \
  | python3 -c "
import json, sys
data = json.load(sys.stdin)
exts = data['query']['extensions']
names = sorted(set(e.get('name','') for e in exts if e.get('name')))
for n in names:
    print(n)
"
```

**Step 2 — Cross-reference against doc.wikimedia.org:**

The coverage index at `https://doc.wikimedia.org/cover-extensions/` uses directory names
that sometimes differ from the API name (e.g. spaces, capitalisation). Compare the list
from Step 1 against the directory names in the coverage index and update the alias map
at the bottom of `activeExtensions.js` for any new mismatches.

**Step 3 — Update the file:**

1. Replace the contents of the `WIKIPEDIA_DEPLOYED` set in `src/data/activeExtensions.js`
   with the new list.
2. Update the `GENERATED_DATE` constant at the top of the file to today's date
   (`'YYYY-MM-DD'`).
3. Run `npm run test:run` — the `activeExtensions.test.js` suite will catch obvious
   regressions (set size, known extension presence, alias coverage).

> **Tip:** Exclude skins (Vector, MonoBook, Timeless, etc.) and non-extension entries
> such as `WikimediaCaptcha` that appear in the API response but are not tracked on
> doc.wikimedia.org.

---

## Complete `.env` Example

```dotenv
# Optional — omit to use Phabricator's public (unauthenticated) rate limit
VITE_PHABRICATOR_TOKEN=api-your_token_here

# Optional — default is 3600000 (1 hour)
VITE_REFRESH_INTERVAL_MS=3600000
```

No real tokens should appear in this file when committed. Confirm `.env` is listed
in `.gitignore` before running `git add`.
