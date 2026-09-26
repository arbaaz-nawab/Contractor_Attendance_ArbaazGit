#!/usr/bin/env bash
# Route auth-matrix smoke test.
#
# Hits every pages/api/*.js route twice — once with no session cookie, once
# with a valid dashboard session cookie — and reports the HTTP status for
# each. Expected shape: PUBLIC routes never 401; DASHBOARD routes always
# 401 with no cookie and never 401 with one; CRON routes depend on
# CRON_SECRET being set in the environment this is run against.
#
# Deliberately avoids completing any real write: POST bodies are either
# empty or missing required fields, so routes fail with a 400 validation
# error (proving the handler ran) rather than actually writing a row.
#
# trigger-notify and notify-overdue are the two exceptions to "harmless empty
# body": trigger-notify is session-gated (not secret-gated) and an empty body
# is enough for its handler to run to completion — if RESEND_API_KEY is ever
# configured, a with-cookie call here would send a real email to real
# managers (see MEMORY.md 2026-09-20, where this happened harmlessly only
# because email was unconfigured). Both routes are therefore only ever
# probed without a cookie/secret here, asserting 401/503 — never with one.
#
# Usage: I_CONFIRM_THIS_IS_A_DEV_SERVER=yes BASE_URL=http://localhost:3000 \
#          DASHBOARD_PIN=1234 bash scripts/route-audit.sh
# Re-run after adding/changing any pages/api route or its auth wrapper.

if [ "$I_CONFIRM_THIS_IS_A_DEV_SERVER" != 'yes' ]; then
  echo "Refusing to run: set I_CONFIRM_THIS_IS_A_DEV_SERVER=yes to confirm BASE_URL" >&2
  echo "points at a local dev server, not production — this script logs in with" >&2
  echo "DASHBOARD_PIN and exercises write-shaped requests against every route." >&2
  exit 1
fi

BASE_URL="${BASE_URL:-http://localhost:3000}"
COOKIE_JAR="$(mktemp)"
trap 'rm -f "$COOKIE_JAR"' EXIT

if [ -z "$DASHBOARD_PIN" ]; then
  echo "Set DASHBOARD_PIN to a valid PIN for the target environment before running." >&2
  exit 1
fi

login_status=$(curl -s -o /dev/null -w '%{http_code}' -c "$COOKIE_JAR" -X POST \
  "$BASE_URL/api/check-pin" -H 'Content-Type: application/json' \
  -d "{\"pin\":\"$DASHBOARD_PIN\"}")
if [ "$login_status" != "200" ]; then
  echo "check-pin login failed (HTTP $login_status) — check DASHBOARD_PIN / SESSION_SECRET." >&2
  exit 1
fi

# route|method|class|body(for POST; empty = none)
#
# Classes:
#   PUBLIC / PUBLIC-NARROW  — never 401, cookie or not.
#   PINCHECK                — check-pin itself: given the real PIN, always
#                             200 whether or not a cookie already exists
#                             (it's the login route, not a protected one —
#                             a 401 here with either the real PIN or a
#                             pre-existing cookie would be a lockout bug).
#   AUTH                    — logout: always succeeds (200), cookie or not.
#   DASHBOARD               — 401 with no cookie, never 401 with one.
#   EMAIL                   — session-gated but can send real email
#                             (trigger-notify): probed WITHOUT a cookie only.
#   CRON                    — secret-gated (flag-missing-shifts,
#                             notify-overdue): probed WITHOUT a cookie only —
#                             the cookie is never its real credential, and
#                             notify-overdue also sends real email once
#                             configured.
routes='
signin|POST|PUBLIC|{}
signout|POST|PUBLIC|{}
active-check|GET|PUBLIC|
contractor-lookup|GET|PUBLIC|
operative-lookup|GET|PUBLIC|
overtime-signin|POST|PUBLIC|{}
overtime-signout|POST|PUBLIC|{}
shift-signin|POST|PUBLIC|{}
shift-signout|POST|PUBLIC|{}
shift-status|GET|PUBLIC|
overtime-list?engineer=Test&status=ACTIVE|GET|PUBLIC-NARROW|
overtime-list|GET|DASHBOARD|
check-pin|POST|PINCHECK|{"pin":"'"$DASHBOARD_PIN"'"}
logout|POST|AUTH|{}
dashboard|GET|DASHBOARD|
managers|GET|DASHBOARD|
compliance-list|GET|DASHBOARD|
compliance-files|GET|DASHBOARD|
compliance-serve|GET|DASHBOARD|
compliance-update|POST|DASHBOARD|{}
compliance-delete|POST|DASHBOARD|{}
amend-contractor|POST|DASHBOARD|{}
amend-overtime|POST|DASHBOARD|{}
overtime-approve|POST|DASHBOARD|{}
rota|GET|DASHBOARD|
rota-confirm|POST|DASHBOARD|{}
shift-list?from=2026-01-01&to=2026-01-02|GET|DASHBOARD|
shift-correct|POST|DASHBOARD|{}
parking-list|GET|DASHBOARD|
parking-save|POST|DASHBOARD|{}
parking-staff|GET|DASHBOARD|
planned-works?weekStart=2026-09-21|GET|DASHBOARD|
planned-works-save|POST|DASHBOARD|{}
planned-works-search?q=x|GET|DASHBOARD|
planned-works-export?weekStart=2026-09-21|GET|DASHBOARD|
trigger-notify|POST|EMAIL|{}
notify-overdue|GET|CRON|
flag-missing-shifts|GET|CRON|
'

printf '%-55s %-10s %-12s %-12s %s\n' 'ROUTE' 'CLASS' 'NO-COOKIE' 'W/-COOKIE' 'VERDICT'
echo "$routes" | while IFS='|' read -r route method class body; do
  [ -z "$route" ] && continue
  url="$BASE_URL/api/$route"
  if [ "$method" = 'POST' ]; then
    no_cookie=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$url" -H 'Content-Type: application/json' -d "$body")
  else
    no_cookie=$(curl -s -o /dev/null -w '%{http_code}' "$url")
  fi

  # EMAIL and CRON routes are never called with a session cookie — see the
  # class comment above. Everything else gets the normal with-cookie probe.
  if [ "$class" = 'EMAIL' ] || [ "$class" = 'CRON' ]; then
    with_cookie='skipped'
  elif [ "$method" = 'POST' ]; then
    with_cookie=$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_JAR" -X POST "$url" -H 'Content-Type: application/json' -d "$body")
  else
    with_cookie=$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_JAR" "$url")
  fi

  verdict='ok'
  case "$class" in
    PUBLIC|PUBLIC-NARROW)
      [ "$no_cookie" = '401' ] && verdict='MISMATCH: public route 401d with no cookie'
      ;;
    PINCHECK)
      [ "$no_cookie" != '200' ] && verdict="MISMATCH: check-pin with the real PIN returned $no_cookie, expected 200"
      [ "$with_cookie" != '200' ] && verdict="MISMATCH: check-pin with the real PIN + existing cookie returned $with_cookie, expected 200"
      ;;
    AUTH)
      [ "$no_cookie" = '401' ] && verdict='MISMATCH: auth route 401d with no cookie'
      ;;
    DASHBOARD)
      [ "$no_cookie" != '401' ] && verdict="MISMATCH: dashboard route returned $no_cookie with no cookie (expected 401)"
      [ "$with_cookie" = '401' ] && verdict='MISMATCH: still 401 with a valid session cookie'
      ;;
    EMAIL)
      verdict='email-sending route — with-cookie call skipped for safety (see header comment)'
      [ "$no_cookie" != '401' ] && verdict="MISMATCH: email route returned $no_cookie with no cookie (expected 401)"
      ;;
    CRON)
      verdict='cron: gated only if CRON_SECRET is set in this environment — with-cookie call skipped, cookie is never its real credential'
      ;;
  esac
  printf '%-55s %-10s %-12s %-12s %s\n' "$route" "$class" "$no_cookie" "$with_cookie" "$verdict"
done
