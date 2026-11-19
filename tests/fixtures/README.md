# Test fixtures

Recorded once, never fetched during a test run. Every payload here is a verbatim
response body captured from a real API, so the parsers under test see exactly the
shape production sees.

| File | Endpoint | Recorded | Notes |
|---|---|---|---|
| `qf/chapter-reciters.en.json` | `GET {QF_API_BASE}/content/api/v4/resources/chapter_reciters?language=en` | 2026-11-18 | Prelive environment (seeded reciters only: 6, 7, 12, 173). |
| `qf/chapter-recitation-7-1.json` | `GET {QF_API_BASE}/content/api/v4/chapter_recitations/7/1?segments=true` | 2026-11-18 | Prelive. Al-Fatihah, reciter 7 (Mishari Rashid al-Afasy), 7 verse timestamps, word segments included. |
| `qf/uthmani-1.json` | `GET {QF_API_BASE}/content/api/v4/quran/verses/uthmani?chapter_number=1` | 2026-11-18 | Prelive. |
| `qf/uthmani-108.json` | `GET https://api.quran.com/api/v4/quran/verses/uthmani?chapter_number=108` | 2026-11-18 | Public API, used by the integrity test (short surah). |
| `qf/uthmani-112.json` | `GET https://api.quran.com/api/v4/quran/verses/uthmani?chapter_number=112` | 2026-11-18 | Public API. Note `112:1` starts with a leading space — kept verbatim on purpose. |
| `qf/uthmani-114.json` | `GET https://api.quran.com/api/v4/quran/verses/uthmani?chapter_number=114` | 2026-11-18 | Public API. |
| `qf/translations-85-1.json` | `GET {QF_API_BASE}/content/api/v4/quran/translations/85?chapter_number=1` | 2026-11-18 | Prelive. **The v4 response carries no `verse_key`**, only positional rows — see `docs/audit.md`, finding A-4. |
| `expected/timeline-1.json` | — | — | Not a recorded payload: the timeline Vitest's snapshot test pins (see `src/data/timeline.test.ts`). |

## Re-recording

```bash
set -a; . ./.env; set +a
TOKEN=$(curl -s -X POST "$QF_TOKEN_ENDPOINT" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -H "Authorization: Basic $(printf '%s:%s' "$QF_CLIENT_ID" "$QF_CLIENT_SECRET" | base64 -w0)" \
  -d 'grant_type=client_credentials&scope=content' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')

curl -s -H "x-auth-token: $TOKEN" -H "x-client-id: $QF_CLIENT_ID" \
  "$QF_API_BASE/content/api/v4/chapter_recitations/7/1?segments=true" \
  -o tests/fixtures/qf/chapter-recitation-7-1.json
```

Recording is a deliberate, reviewed action: a fixture change is a behavior
contract change and must be justified in the commit message. The Qur'anic text in
these files is never edited by hand.
