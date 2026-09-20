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
# Usage: BASE_URL=http://localhost:3000 DASHBOARD_PIN=1234 bash scripts/route-audit.sh
# Re-run after adding/changing any pages/api route or its auth wrapper.

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
check-pin|POST|AUTH|{}
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
trigger-notify|POST|DASHBOARD|{}
notify-overdue|GET|CRON|
flag-missing-shifts|GET|CRON|
'

printf '%-55s %-14s %-12s %-12s %s\n' 'ROUTE' 'CLASS' 'NO-COOKIE' 'W/-COOKIE' 'VERDICT'
echo "$routes" | while IFS='|' read -r route method class body; do
  [ -z "$route" ] && continue
  url="$BASE_URL/api/$route"
  if [ "$method" = 'POST' ]; then
    no_cookie=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$url" -H 'Content-Type: application/json' -d "$body")
    with_cookie=$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_JAR" -X POST "$url" -H 'Content-Type: application/json' -d "$body")
  else
    no_cookie=$(curl -s -o /dev/null -w '%{http_code}' "$url")
    with_cookie=$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_JAR" "$url")
  fi

  verdict='ok'
  case "$class" in
    PUBLIC|PUBLIC-NARROW|AUTH)
      [ "$no_cookie" = '401' ] && verdict='MISMATCH: public route 401d with no cookie'
      ;;
    DASHBOARD)
      [ "$no_cookie" != '401' ] && verdict="MISMATCH: dashboard route returned $no_cookie with no cookie (expected 401)"
      [ "$with_cookie" = '401' ] && verdict='MISMATCH: still 401 with a valid session cookie'
      ;;
    CRON)
      verdict='cron: gated only if CRON_SECRET is set in this environment — see report'
      ;;
  esac
  printf '%-55s %-14s %-12s %-12s %s\n' "$route" "$class" "$no_cookie" "$with_cookie" "$verdict"
done
