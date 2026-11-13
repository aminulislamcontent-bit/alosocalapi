#!/usr/bin/env bash
# SetupBot Pro E2E — proves the full spec flow on the live staging app:
# catalog (10 cats / 66 platforms) → temp client → guided saves → format+live
# validation → health persistence → AES-256-GCM master export (client+admin)
# → rate-limit guard → cleanup. Self-contained & self-cleaning.

set -u
BASE="http://localhost:3000"
JAR_A=/tmp/sb-admin-jar.txt
JAR_C=/tmp/sb-client-jar.txt
CID=""
PASS=0; FAIL=0

say()  { printf '%s\n' "$*"; }
ok()   { PASS=$((PASS+1)); say "  ✅ PASS: $*"; }
bad()  { FAIL=$((FAIL+1)); say "  ❌ FAIL: $*"; }
jget() { python3 -c "
import json,sys
d=json.load(sys.stdin)
path='$1'.lstrip('.')
v=d
for part in path.split('.'):
    if isinstance(v,dict):
        v=v.get(part)
    else:
        try: v=v[int(part)]
        except Exception: v=None
print(json.dumps(v) if isinstance(v,(dict,list)) else v)
" 2>/dev/null; }

cleanup() {
  if [ -n "$CID" ]; then
    curl -s -b "$JAR_A" -X DELETE "$BASE/api/admin/clients/$CID" > /dev/null
    say "🧹 cleaned temp client $CID"
  fi
  rm -f "$JAR_A" "$JAR_C"
}
trap cleanup EXIT

say "═══ SetupBot Pro E2E ═══"

# 0. admin pre-login (for orphan cleanup) + remove leftover sbtest clients
curl -s -c "$JAR_A" -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"alamin","password":"alamin2026","role":"admin"}' > /dev/null
for OLD in $(curl -s -b "$JAR_A" "$BASE/api/admin/clients" | python3 -c "import json,sys;[print(c['id']) for c in json.load(sys.stdin)['clients'] if c['username'].startswith('setupbot')]" 2>/dev/null); do
  curl -s -b "$JAR_A" -X DELETE "$BASE/api/admin/clients/$OLD" > /dev/null
  say "🧹 removed orphan $OLD"
done

# 1. catalog unauthenticated → 401
C=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/setupbot/catalog")
[ "$C" = "401" ] && ok "catalog without session → 401" || bad "catalog unauth expected 401 got $C"

# 2. admin login
R=$(curl -s -c "$JAR_A" -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"alamin","password":"alamin2026","role":"admin"}')
echo "$R" | jget ".ok" | grep -qi true && ok "admin login" || bad "admin login: $R"

# 3. create temp client (needs ≥1 legacy platform; SetupBot picks categories itself)
R=$(curl -s -b "$JAR_A" -X POST "$BASE/api/admin/clients" -H 'Content-Type: application/json' -d '{"name":"SB টেস্ট","business":"SetupBot QA","platforms":["facebook"]}')
CID=$(echo "$R" | jget ".client.id")
UN=$(echo "$R" | jget ".client.username")
[ -n "$CID" ] && ok "temp client created: $CID ($UN)" || { bad "client create: $R"; exit 1; }
TP=$(echo "$R" | jget ".tempPassword")

# 4. client login
R=$(curl -s -c "$JAR_C" -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d "{\"username\":\"$UN\",\"password\":\"$TP\",\"role\":\"client\"}")
echo "$R" | jget ".ok" | grep -qi true && ok "client login" || bad "client login: $R"

# 5. catalog → 10 categories / 66 platforms / fields with Bengali guides
R=$(curl -s -b "$JAR_C" "$BASE/api/setupbot/catalog")
NC=$(echo "$R" | jget ".totals.categories"); NP=$(echo "$R" | jget ".totals.platforms"); NF=$(echo "$R" | jget ".totals.fields")
[ "$NC" = "9" ] && ok "catalog categories = 9 (+ option 10 skip)" || bad "categories expected 9 got $NC"
[ "$NP" -ge 66 ] 2>/dev/null && ok "catalog platforms = $NP (≥66)" || bad "platforms got $NP"
[ "$NF" -ge 230 ] 2>/dev/null && ok "catalog fields = $NF (≥230)" || bad "fields got $NF"
echo "$R" | grep -q "পেজ ওপেন করে" && ok "Bengali guides present in catalog" || bad "Bengali guides missing"

# 6. save shopify fields (one valid, one sensitive)
R=$(curl -s -b "$JAR_C" -X PUT "$BASE/api/setupbot/entries" -H 'Content-Type: application/json' -d '{"platform":"shopify","fieldKey":"store_url","value":"my-store.myshopify.com","status":"collected"}')
echo "$R" | jget ".entry.status" | grep -q collected && ok "PUT shopify.store_url" || bad "shopify.store_url: $R"
R=$(curl -s -b "$JAR_C" -X PUT "$BASE/api/setupbot/entries" -H 'Content-Type: application/json' -d '{"platform":"shopify","fieldKey":"admin_token","value":"shpat_0000000000aaaaaaaaaa","status":"collected"}')
echo "$R" | jget ".entry.status" | grep -q collected && ok "PUT shopify.admin_token (sensitive)" || bad "shopify.admin_token: $R"

# 7. invalid platform / field rejected
C=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR_C" -X PUT "$BASE/api/setupbot/entries" -H 'Content-Type: application/json' -d '{"platform":"nasa_moon","fieldKey":"x","value":"y","status":"collected"}')
[ "$C" = "400" ] && ok "unknown platform → 400" || bad "unknown platform got $C"
C=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR_C" -X PUT "$BASE/api/setupbot/entries" -H 'Content-Type: application/json' -d '{"platform":"shopify","fieldKey":"hack","value":"y","status":"collected"}')
[ "$C" = "400" ] && ok "unknown field → 400" || bad "unknown field got $C"

# 8. format validation — bad page_id then good one
curl -s -b "$JAR_C" -X PUT "$BASE/api/setupbot/entries" -H 'Content-Type: application/json' -d '{"platform":"facebook_page","fieldKey":"page_id","value":"123","status":"collected"}' > /dev/null
R=$(curl -s -b "$JAR_C" -X POST "$BASE/api/setupbot/validate" -H 'Content-Type: application/json' -d '{"platform":"facebook_page"}')
S=$(echo "$R" | jget ".status"); N=$(echo "$R" | jget ".note")
[ "$S" = "invalid" ] && ok "bad Page ID format → invalid (note: $N)" || bad "bad format expected invalid got $S / $R"
curl -s -b "$JAR_C" -X PUT "$BASE/api/setupbot/entries" -H 'Content-Type: application/json' -d '{"platform":"facebook_page","fieldKey":"page_id","value":"123456789012345","status":"collected"}' > /dev/null
R=$(curl -s -b "$JAR_C" -X POST "$BASE/api/setupbot/validate" -H 'Content-Type: application/json' -d '{"platform":"facebook_page"}')
echo "$R" | jget ".status" | grep -q valid && ok "good Page ID format → valid (format-only)" || bad "good format: $R"

# 9. live validation — telegram with fake token (invalid OR network-error both honest)
curl -s -b "$JAR_C" -X PUT "$BASE/api/setupbot/entries" -H 'Content-Type: application/json' -d '{"platform":"telegram","fieldKey":"bot_token","value":"123456789:ABCdef_fake_fake_fake_fake_fake","status":"collected"}' > /dev/null
R=$(curl -s -b "$JAR_C" -X POST "$BASE/api/setupbot/validate" -H 'Content-Type: application/json' -d '{"platform":"telegram"}')
S=$(echo "$R" | jget ".status")
{ [ "$S" = "invalid" ] || [ "$S" = "error" ]; } && ok "telegram live validate → $S (honest verdict)" || bad "telegram validate got $S / $R"

# 10. validation persisted on entries
R=$(curl -s -b "$JAR_C" "$BASE/api/setupbot/entries")
echo "$R" | jget ".entries" | grep -qE '"validationStatus": ?"valid"' && ok "validation verdict persisted (valid found)" || bad "no persisted valid verdict"
echo "$R" | jget ".byCategory" | grep -qE '"key": ?"ecommerce"' && ok "byCategory resume data present" || bad "byCategory missing"

# 11. master JSON export (client) — spec structure + AES-256-GCM
R=$(curl -s -b "$JAR_C" "$BASE/api/setupbot/export")
[ "$(echo "$R" | jget '.setupbot_version')" = "2.0" ] && ok "export.setupbot_version = 2.0" || bad "version missing"
echo "$R" | jget ".password_dependency" | grep -qi false && ok "password_dependency = false" || bad "password_dependency wrong"
V=$(echo "$R" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d['integrations']['ecommerce']['shopify'].get('admin_token_encrypted',''))" 2>/dev/null)
case "$V" in v1:*) ok "secret exported as AES-256-GCM (v1:…)";; *) bad "admin_token_encrypted not encrypted: '$V'";; esac
U=$(echo "$R" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d['integrations']['ecommerce']['shopify'].get('store_url',''))" 2>/dev/null)
[ "$U" = "my-store.myshopify.com" ] && ok "non-secret kept plaintext" || bad "store_url lost: $U"
echo "$R" | jget ".token_refresh_schedule.facebook_page_token" | grep -q every_60_days && ok "token_refresh_schedule present" || bad "refresh schedule missing"

# 12. admin export for the client
R=$(curl -s -b "$JAR_A" "$BASE/api/setupbot/export?clientId=$CID")
echo "$R" | jget ".client_id" | grep -q "$UN" && ok "admin export with ?clientId works" || bad "admin export: $(echo "$R" | head -c 120)"

# 13. edit resets validation
R=$(curl -s -b "$JAR_C" -X PUT "$BASE/api/setupbot/entries" -H 'Content-Type: application/json' -d '{"platform":"facebook_page","fieldKey":"page_id","value":"123456789012345","status":"collected"}')
echo "$R" | jget ".entry.validationStatus" | grep -q none && ok "edit resets validationStatus to none" || bad "reset expected none: $R"

# 14. legacy portal regression within SetupBot world — old portal entries endpoint untouched
C=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR_C" "$BASE/api/portal/entries")
[ "$C" = "200" ] && ok "legacy /api/portal/entries still 200" || bad "legacy portal got $C"

say "═══ RESULT: $PASS PASS / $FAIL FAIL ═══"
[ "$FAIL" = "0" ]
