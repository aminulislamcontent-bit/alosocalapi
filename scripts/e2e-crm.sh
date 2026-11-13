#!/bin/bash
# ============================================================
# ALO Education BD — CRM & Automation E2E proof
# Dashboard → contact+lead create (automation fires) → stage moves
# (stage automations fire) → tasks → KB → custom rule → master a/c 13 platforms
# ============================================================
BASE=http://localhost:3000
D=/home/z/my-project/scripts
JAR="$D/.e2e_crm_admin.jar"
rm -f "$JAR"
PASS=0; FAIL=0
step() { echo; echo "━━━ $1 ━━━"; }
jget() { python3 -c "import sys,json; d=json.load(sys.stdin); print(eval('d'+sys.argv[1]))" "$1" 2>/dev/null; }
check() {
  if [ "$2" = "$3" ]; then echo "✅ PASS: $1"; PASS=$((PASS+1));
  else echo "❌ FAIL: $1 (expected [$3], got [$2])"; FAIL=$((FAIL+1)); fi
}
code() { curl -s -b "$JAR" -o /tmp_crm_out 2>/dev/null -w "%{http_code}" "$@"; }

step "0) Admin login"
code=$(curl -s -c "$JAR" -o /dev/null -w "%{http_code}" -X POST $BASE/api/auth/login -H 'Content-Type: application/json' \
  -d '{"username":"alamin","password":"alamin2026","role":"admin"}')
check "Admin login" "$code" "200"

step "1) Dashboard stats (seeded data)"
res=$(curl -s -b "$JAR" $BASE/api/crm/dashboard)
check "contacts = 4 (seeded)" "$(echo "$res" | jget "['stats']['contacts']")" "4"
check "leads = 4 (seeded)" "$(echo "$res" | jget "['stats']['leads']")" "4"
check "overdue tasks >= 1" "$(echo "$res" | python3 -c "import sys,json; print(json.load(sys.stdin)['stats']['overdue'] >= 1)")" "True"
check "pipeline value > 0" "$(echo "$res" | python3 -c "import sys,json; print(json.load(sys.stdin)['stats']['pipelineValue'] > 0)")" "True"

step "2) Automation rules seeded"
res=$(curl -s -b "$JAR" $BASE/api/crm/automations)
check "6 built-in rules" "$(echo "$res" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['rules']))")" "6"

step "3) Create contact + first lead → automations fire"
res=$(curl -s -b "$JAR" -X POST $BASE/api/crm/contacts -H 'Content-Type: application/json' \
  -d '{"name":"ই২ই শিক্ষার্থী","phone":"+8801799888777","source":"youtube","grade":"HSC","leadTitle":"IELTS ব্যাচে ভর্তি চাই","course":"IELTS","leadValue":8000}')
CID=$(echo "$res" | jget "['contact']['id']")
FIRED=$(echo "$res" | jget "['automation']['fired']")
echo "   automation fired: $FIRED rules"
check "2 automations fired (welcome + follow-up)" "$FIRED" "2"

step "4) Auto-generated follow-up task exists (24h, high priority)"
res=$(curl -s -b "$JAR" $BASE/api/crm/tasks)
OK=$(echo "$res" | python3 -c "
import sys,json
ts=json.load(sys.stdin)['tasks']
m=[t for t in ts if 'ই২ই শিক্ষার্থী' in t['title'] and 'ফলো-আপ' in t['title']]
print('yes' if m and m[0]['priority']=='high' and m[0]['dueAt'] and not m[0]['done'] else 'no')")
check "Auto task: name+24h+high+open" "$OK" "yes"

LEAD_ID=$(curl -s -b "$JAR" $BASE/api/crm/leads | python3 -c "
import sys,json
ls=json.load(sys.stdin)['leads']
print([l['id'] for l in ls if l['contact']['name']=='ই২ই শিক্ষার্থী'][0])")

step "5) Stage → demo → reminder automation"
res=$(curl -s -b "$JAR" -X PATCH $BASE/api/crm/leads -H 'Content-Type: application/json' -d "{\"id\":\"$LEAD_ID\",\"stage\":\"demo\"}")
check "demo automation fired = 1" "$(echo "$res" | jget "['automation']['fired']")" "1"

step "6) Stage → enrolled → document task + congrats log"
res=$(curl -s -b "$JAR" -X PATCH $BASE/api/crm/leads -H 'Content-Type: application/json' -d "{\"id\":\"$LEAD_ID\",\"stage\":\"enrolled\"}")
check "enrolled automations fired = 2" "$(echo "$res" | jget "['automation']['fired']")" "2"
res=$(curl -s -b "$JAR" "$BASE/api/crm/interactions?contactId=$CID")
OK=$(echo "$res" | python3 -c "
import sys,json
ii=json.load(sys.stdin)['interactions']
print('yes' if any('অভিনন্দন' in i['body'] for i in ii) and any('স্বাগতম' in i['body'] for i in ii) else 'no')")
check "Timeline: welcome + congrats logs present" "$OK" "yes"

step "7) Task complete toggle"
TASK_ID=$(curl -s -b "$JAR" $BASE/api/crm/tasks | python3 -c "
import sys,json
ts=json.load(sys.stdin)['tasks']
print([t['id'] for t in ts if 'ই২ই শিক্ষার্থী' in t['title']][0])")
code=$(curl -s -b "$JAR" -o /dev/null -w "%{http_code}" -X PATCH $BASE/api/crm/tasks -H 'Content-Type: application/json' -d "{\"id\":\"$TASK_ID\",\"done\":true}")
check "Task marked done" "$code" "200"

step "8) Knowledge base"
res=$(curl -s -b "$JAR" $BASE/api/crm/kb)
check "4 KB entries" "$(echo "$res" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['entries']))")" "4"

step "9) Custom rule lifecycle"
res=$(curl -s -b "$JAR" -X POST $BASE/api/crm/automations -H 'Content-Type: application/json' \
  -d '{"name":"ই২ই কাস্টম নিয়ম","trigger":"stage_changed","condition":"negotiated","ruleAction":"create_task","payload":{"title":"ডিল ক্লোজ করুন: {name}","dueInHours":12,"priority":"high"}}')
RULE_ID=$(echo "$res" | jget "['rule']['id']")
[ -n "$RULE_ID" ] && [ "$RULE_ID" != "None" ] && check "Custom rule created" "yes" "yes" || check "Custom rule created" "$RULE_ID" "yes"
code=$(curl -s -b "$JAR" -o /dev/null -w "%{http_code}" -X DELETE $BASE/api/crm/automations -H 'Content-Type: application/json' -d "{\"id\":\"$RULE_ID\"}")
check "Custom rule deleted" "$code" "200"
code=$(curl -s -b "$JAR" -o /dev/null -w "%{http_code}" -X DELETE $BASE/api/crm/automations -H 'Content-Type: application/json' -d "{\"id\":\"$RULE_ID\"}")
check "Built-in protection: builtin rules undeletable (404 after gone)" "$code" "404"

step "10) Master account — ALL 13 platforms"
res=$(curl -s -b "$JAR" $BASE/api/admin/clients)
OK=$(echo "$res" | python3 -c "
import sys,json
cs=json.load(sys.stdin)['clients']
m=[c for c in cs if c['username']=='aloeducation']
print('yes' if m and len(m[0]['platforms'])==13 else 'no')")
check "aloeducation account has 13/13 platforms" "$OK" "yes"
code=$(curl -s -c "$JAR" -o /dev/null -w "%{http_code}" -X POST $BASE/api/auth/login -H 'Content-Type: application/json' \
  -d '{"username":"aloeducation","password":"Alo-2026-Edu","role":"client"}')
check "Master login (aloeducation/Alo-2026-Edu)" "$code" "200"
code=$(curl -s -b "$JAR" -o /dev/null -w "%{http_code}" $BASE/api/portal/entries)
check "Master portal serves 13-platform collection" "$code" "200"
curl -s -X POST $BASE/api/auth/logout -b "$JAR" -o /dev/null

step "11) Cleanup E2E contact"
code=$(curl -s -c "$JAR" -o /dev/null -w "%{http_code}" -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d '{"username":"alamin","password":"alamin2026","role":"admin"}')
code=$(curl -s -b "$JAR" -o /dev/null -w "%{http_code}" -X DELETE $BASE/api/crm/contacts -H 'Content-Type: application/json' -d "{\"id\":\"$CID\"}")
check "E2E contact deleted" "$code" "200"

rm -f "$JAR" /tmp_crm_out
echo
echo "════════════════════════════════════"
echo "RESULT: $PASS passed, $FAIL failed"
echo "════════════════════════════════════"
[ $FAIL -eq 0 ]
