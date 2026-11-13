#!/bin/bash
# ============================================================
# Al-Amin IP Access — E2E proof of the full client workflow:
# 1) admin creates client account (temp user/pass)
# 2) client logs in with temp password
# 3) system collects all info step-by-step (PUT entries)
# 4) on completion → auto-logout (session killed)
# 5) temp password dead on re-login (403)
# 6) password change later does NOT affect collected tokens
# 7) admin exports collected data
# ============================================================
BASE=http://localhost:3000
D=/home/z/my-project/scripts
JAR_A="$D/.e2e_admin.jar"
JAR_C="$D/.e2e_client.jar"
rm -f "$JAR_A" "$JAR_C"
PASS=0; FAIL=0

step()  { echo; echo "━━━ $1 ━━━"; }
jget()  { python3 -c "import sys,json; d=json.load(sys.stdin); print(eval('d'+sys.argv[1]))" "$1" 2>/dev/null; }
check() {
  if [ "$2" = "$3" ]; then echo "✅ PASS: $1"; PASS=$((PASS+1));
  else echo "❌ FAIL: $1 (expected [$3], got [$2])"; FAIL=$((FAIL+1)); fi
}

step "0) Health check"
code=$(curl -s -o /dev/null -w "%{http_code}" $BASE/)
check "Homepage alive" "$code" "200"

step "1) Admin login (alamin)"
res=$(curl -s -c "$JAR_A" -X POST $BASE/api/auth/login -H 'Content-Type: application/json' \
  -d '{"username":"alamin","password":"alamin2026","role":"admin"}')
check "Admin login ok" "$(echo "$res" | jget "['ok']")" "True"

step "2) Admin creates client account → temp credentials"
res=$(curl -s -b "$JAR_A" -X POST $BASE/api/admin/clients -H 'Content-Type: application/json' \
  -d '{"name":"ই২ই টেস্ট ক্লায়েন্ট","business":"E2E Motors BD","phone":"+8801711111111","platforms":["facebook","whatsapp"]}')
CID=$(echo "$res" | jget "['client']['id']")
CUSER=$(echo "$res" | jget "['client']['username']")
CTMP=$(echo "$res" | jget "['tempPassword']")
echo "   client id=$CID username=$CUSER temp_password=$CTMP"
[ -n "$CID" ] && [ "$CID" != "None" ] && check "Client created with temp password" "yes" "yes" || check "Client created" "fail" "yes"

step "3) Client logs in with temp password"
code=$(curl -s -c "$JAR_C" -o /dev/null -w "%{http_code}" -X POST $BASE/api/auth/login -H 'Content-Type: application/json' \
  -d "{\"username\":\"$CUSER\",\"password\":\"$CTMP\",\"role\":\"client\"}")
check "Client login with temp password" "$code" "200"

step "4) System serves step-by-step collection fields"
res=$(curl -s -b "$JAR_C" $BASE/api/portal/entries)
NPF=$(echo "$res" | jget "['client']['platforms']" 2>/dev/null)
echo "   assigned platforms: $NPF"
code=$(curl -s -b "$JAR_C" -o /dev/null -w "%{http_code}" $BASE/api/portal/entries)
check "Entries endpoint accessible" "$code" "200"

step "5) Client submits values (collect + skip)"
r1=$(curl -s -b "$JAR_C" -X PUT $BASE/api/portal/entries -H 'Content-Type: application/json' \
  -d '{"platform":"facebook","fieldKey":"page_id","value":"123456789012345","status":"collected"}')
check "Collect facebook.page_id" "$(echo "$r1" | jget "['entry']['status']")" "collected"
r2=$(curl -s -b "$JAR_C" -X PUT $BASE/api/portal/entries -H 'Content-Type: application/json' \
  -d '{"platform":"facebook","fieldKey":"page_access_token","value":"EAAG-TEST-TOKEN-xyz789","status":"collected"}')
check "Collect facebook.page_access_token" "$(echo "$r2" | jget "['entry']['status']")" "collected"
r3=$(curl -s -b "$JAR_C" -X PUT $BASE/api/portal/entries -H 'Content-Type: application/json' \
  -d '{"platform":"facebook","fieldKey":"ad_account_id","value":"","status":"skipped"}')
check "Skip facebook.ad_account_id" "$(echo "$r3" | jget "['entry']['status']")" "skipped"
r4=$(curl -s -b "$JAR_C" -X PUT $BASE/api/portal/entries -H 'Content-Type: application/json' \
  -d '{"platform":"whatsapp","fieldKey":"phone_number_id","value":"WA-LITE-ID-555","status":"collected"}')
check "Collect whatsapp.phone_number_id (API Lite ID)" "$(echo "$r4" | jget "['entry']['status']")" "collected"

step "6) Complete → auto-logout + account locked"
res=$(curl -s -b "$JAR_C" -X POST $BASE/api/portal/complete -H 'Content-Type: application/json' -d '{"force":true}')
check "Complete ok" "$(echo "$res" | jget "['ok']")" "True"
echo "   summary: $(echo "$res" | jget "['summary']")"
u=$(curl -s -b "$JAR_C" $BASE/api/auth/me | jget "['user']")
check "AUTO-LOGOUT: session invalidated (user=null)" "$u" "None"
code=$(curl -s -b "$JAR_C" -o /dev/null -w "%{http_code}" $BASE/api/portal/entries)
check "AUTO-LOGOUT: data endpoints now require login" "$code" "401"

step "7) Temp password is DEAD after completion"
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST $BASE/api/auth/login -H 'Content-Type: application/json' \
  -d "{\"username\":\"$CUSER\",\"password\":\"$CTMP\",\"role\":\"client\"}")
check "Re-login with old temp password blocked" "$code" "403"

step "8) Admin can see & export ALL collected data"
res=$(curl -s -b "$JAR_A" $BASE/api/admin/clients/$CID)
TOK=$(echo "$res" | jget "['client']['entries']" >/dev/null 2>&1; echo "$res" | python3 -c "
import sys,json
d=json.load(sys.stdin)
vals={e['fieldKey']:(e['value'],e['status']) for e in d['client']['entries'] for e in [e]}
tok=[e['value'] for e in d['client']['entries'] if e['fieldKey']=='page_access_token']
logs=[l['action'] for l in d['client']['logs']]
print(tok[0] if tok else 'MISSING', '|', 'collection_completed' in logs)
")
echo "   $TOK"
check "Token survives & present in admin export" "$(echo "$TOK" | cut -d'|' -f1 | xargs)" "EAAG-TEST-TOKEN-xyz789"
check "Audit log has collection_completed" "$(echo "$TOK" | cut -d'|' -f2 | xargs)" "True"

step "9) Password change later does NOT affect collected tokens"
res=$(curl -s -b "$JAR_A" -X PATCH $BASE/api/admin/clients/$CID -H 'Content-Type: application/json' -d '{"action":"reset_password"}')
NEWPW=$(echo "$res" | jget "['tempPassword']")
echo "   new temp password: $NEWPW"
code=$(curl -s -c "$JAR_C" -o /dev/null -w "%{http_code}" -X POST $BASE/api/auth/login -H 'Content-Type: application/json' \
  -d "{\"username\":\"$CUSER\",\"password\":\"$NEWPW\",\"role\":\"client\"}")
check "Login with NEW password works" "$code" "200"
res=$(curl -s -b "$JAR_C" $BASE/api/portal/entries)
TOK2=$(echo "$res" | python3 -c "
import sys,json
d=json.load(sys.stdin)
tok=[e['value'] for e in d['entries'] if e['fieldKey']=='page_access_token']
print(tok[0] if tok else 'MISSING')")
check "API token INTACT after password change" "$TOK2" "EAAG-TEST-TOKEN-xyz789"

step "10) Cleanup — delete E2E test client"
code=$(curl -s -b "$JAR_A" -o /dev/null -w "%{http_code}" -X DELETE $BASE/api/admin/clients/$CID)
check "Test client deleted" "$code" "200"

rm -f "$JAR_A" "$JAR_C"
echo
echo "════════════════════════════════════"
echo "RESULT: $PASS passed, $FAIL failed"
echo "════════════════════════════════════"
[ $FAIL -eq 0 ]
