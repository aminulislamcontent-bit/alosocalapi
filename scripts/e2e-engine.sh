#!/bin/bash
# ─────────────────────────────────────────────────────────────────────
# E2E — Universal Lead Discovery & Customer Acquisition Engine
# Covers: taxonomy dynamics, provider verification (real network),
# provenance, dedupe, tenant isolation, approval gates, contact
# governance (DNC), content approval flow, honest PSI handling,
# universal discovery, cost + audit, and existing-CRM intactness.
# ─────────────────────────────────────────────────────────────────────

BASE="http://localhost:3000"
JAR_A="/tmp/engine-admin.jar"
JAR_B="/tmp/engine-client-b.jar"
PASS=0; FAIL=0

check() { # $1 name, $2 "0"=ok "1"=fail, $3 detail
  if [ "$2" = "0" ]; then PASS=$((PASS+1)); echo "  ✓ $1 ${3:+— $3}";
  else FAIL=$((FAIL+1)); echo "  ✗ $1 ${3:+— $3}"; fi
}

jqr() { node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log(eval(process.argv[1]))" "$1"; }

echo "── 0. Auth ──────────────────────────────────────────────"
code=$(curl -s -c "$JAR_A" -o /tmp/login.json -w "%{http_code}" -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' -d '{"username":"alamin","password":"alamin2026","role":"admin"}')
check "admin login" $([ "$code" = "200" ] && echo 0 || echo 1)

echo "── 1. Dynamic taxonomy (§2) ─────────────────────────────"
n=$(curl -s -b "$JAR_A" "$BASE/api/engine/taxonomy" | jqr 'd.categories.length')
check "taxonomy categories seeded (≥15)" $([ "$n" -ge 15 ] && echo 0 || echo 1) "got=$n"
curl -s -b "$JAR_A" -X POST "$BASE/api/engine/taxonomy" -H 'Content-Type: application/json' \
  -d '{"nameEn":"Engine Test Industry","nameBn":"টেস্ট ইন্ডাস্ট্রি","keywords":["enginetestx"]}' -o /tmp/taxpost.json
found=$(curl -s -b "$JAR_A" "$BASE/api/engine/taxonomy" | jqr 'd.categories.some(c=>c.slug==="engine_test_industry")')
check "custom industry added without code change" $([ "$found" = "true" ] && echo 0 || echo 1)

echo "── 2. Provider registry + REAL verification (§4) ────────"
n=$(curl -s -b "$JAR_A" "$BASE/api/engine/providers" | jqr 'd.providers.length')
check "provider registry (≥15 entries)" $([ "$n" -ge 15 ] && echo 0 || echo 1) "got=$n"
curl -s -b "$JAR_A" -X POST "$BASE/api/engine/providers/verify" -H 'Content-Type: application/json' -d '{}' -o /tmp/verify.json
node -e "
const r=JSON.parse(require('fs').readFileSync('/tmp/verify.json','utf8')).results||[];
for(const x of r) console.log('    ['+x.status+'] '+x.key+' '+JSON.stringify(x.check).slice(0,110));
const verified=r.filter(x=>x.status==='verified').length;
console.log('    verified='+verified+'/'+r.length);
require('fs').writeFileSync('/tmp/verified_count', String(verified));
"
v=$(cat /tmp/verified_count)
check "at least 2 free sources verified by live test" $([ "$v" -ge 2 ] && echo 0 || echo 1) "verified=$v (blocked/rate-limited recorded honestly)"

echo "── 3. Tenants ───────────────────────────────────────────"
A=$(curl -s -b "$JAR_A" "$BASE/api/admin/clients" | jqr '[...d.clients].sort((x,y)=>x.createdAt<y.createdAt?-1:1)[0].id')
check "tenant A picked" $([ -n "$A" ] && echo 0 || echo 1) "id=$A"
curl -s -b "$JAR_A" -X POST "$BASE/api/admin/clients" -H 'Content-Type: application/json' \
  -d '{"name":"Engine Test B","business":"EngineTestB","platforms":["facebook"]}' -o /tmp/newb.json
BUSER=$(jqr 'd.client.username' < /tmp/newb.json); BPASS=$(jqr 'd.tempPassword' < /tmp/newb.json)
B=$(jqr 'd.client.id' < /tmp/newb.json)
check "tenant B created" $([ -n "$BUSER" ] && echo 0 || echo 1) "user=$BUSER"
code=$(curl -s -c "$JAR_B" -o /tmp/loginb.json -w "%{http_code}" -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' -d "{\"username\":\"$BUSER\",\"password\":\"$BPASS\"}")
check "tenant B login" $([ "$code" = "200" ] && echo 0 || echo 1)

echo "── 4. Mode B: profile → campaign → discovery run ────────"
PID=$(curl -s -b "$JAR_A" -X POST "$BASE/api/engine/profiles" -H 'Content-Type: application/json' \
  -d "{\"clientId\":\"$A\",\"name\":\"E2E Edu BD\",\"countries\":[\"BD\",\"IN\"],\"industries\":[\"education\"],\"keywords\":[\"education\",\"academy\"]}" \
  | jqr 'd.profileId')
check "targeting profile created" $([ -n "$PID" ] && echo 0 || echo 1) "profile=$PID"
CID=$(curl -s -b "$JAR_A" -X POST "$BASE/api/engine/campaigns" -H 'Content-Type: application/json' \
  -d "{\"clientId\":\"$A\",\"name\":\"E2E Campaign\",\"profileId\":\"$PID\",\"budgetPreference\":\"free_first\",\"sourceKeys\":[\"wikidata_sparql\",\"google_news_rss\"],\"qualificationCriteria\":{\"minScore\":55}}" \
  | jqr 'd.campaignId')
curl -s -b "$JAR_A" -X PATCH "$BASE/api/engine/campaigns" -H 'Content-Type: application/json' \
  -d "{\"clientId\":\"$A\",\"id\":\"$CID\",\"status\":\"active\"}" -o /dev/null
check "campaign created+active" $([ -n "$CID" ] && echo 0 || echo 1) "campaign=$CID"

curl -s -b "$JAR_A" -X POST "$BASE/api/engine/discovery" -H 'Content-Type: application/json' \
  -d "{\"clientId\":\"$A\",\"campaignId\":\"$CID\"}" -o /tmp/run1.json
ins=$(jqr 'd.summary.inserted' < /tmp/run1.json)
cand=$(jqr 'd.summary.candidates' < /tmp/run1.json)
runok=$(jqr 'd.ok' < /tmp/run1.json)
check "discovery run executed" $([ "$runok" = "true" ] && echo 0 || echo 1) "candidates=$cand inserted=$ins (honest: may be 0 if no entity matches campaign industries)"

echo "── 4.5 Import with provenance (§6,§8) ───────────────────"
imp=$(curl -s -b "$JAR_A" -o /tmp/imp.json -X POST "$BASE/api/engine/leads" -H 'Content-Type: application/json' \
  -d "{\"clientId\":\"$A\",\"campaignId\":\"$CID\",\"leads\":[{\"businessName\":\"Pathao\",\"website\":\"https://pathao.com\",\"countryCode\":\"BD\",\"cityName\":\"Dhaka\",\"category\":\"logistics\",\"productsServices\":\"logistics delivery ridesharing\",\"sourceProviderKey\":\"wikidata_sparql\",\"sourceUrl\":\"https://query.wikidata.org/sparql\",\"lawfulBasis\":\"public_business_info\",\"evidence\":[{\"type\":\"directory\",\"detail\":\"Wikidata SPARQL result — business entity with official website (BD)\",\"url\":\"https://query.wikidata.org/sparql\"}]},{\"businessName\":\"Aamra Networks Limited\",\"website\":\"https://www.aamranetworks.com\",\"countryCode\":\"BD\",\"cityName\":\"Dhaka\",\"category\":\"software\",\"productsServices\":\"education it training software\",\"sourceProviderKey\":\"wikidata_sparql\",\"sourceUrl\":\"https://query.wikidata.org/sparql\",\"lawfulBasis\":\"public_business_info\",\"evidence\":[{\"type\":\"directory\",\"detail\":\"Wikidata SPARQL result — business entity with official website (BD)\",\"url\":\"https://query.wikidata.org/sparql\"}]}]}")
impins=$(jqr 'd.inserted' < /tmp/imp.json 2>/dev/null || echo 0)
check "import requires+accepts provenance" $([ "$impins" -ge 1 ] && echo 0 || echo 1) "inserted=$impins"

# recalc score against campaign config
LEAD1=$(curl -s -b "$JAR_A" "$BASE/api/engine/leads?clientId=$A&limit=1" | jqr 'd.leads[0].id')
sc=$(curl -s -b "$JAR_A" -X PATCH "$BASE/api/engine/leads" -H 'Content-Type: application/json' \
  -d "{\"clientId\":\"$A\",\"id\":\"$LEAD1\",\"action\":\"recalc_score\"}" | jqr 'd.ok')
check "score recalculation from evidence+campaign" $([ "$sc" = "true" ] && echo 0 || echo 1)

echo "── 5. Provenance + explainable score (§6,§7) ────────────"
prov=$(curl -s -b "$JAR_A" "$BASE/api/engine/leads?clientId=$A&limit=10" | jqr 'd.leads.length>0 && d.leads.every(l=>l.sourceProviderKey&&l.sourceUrl)')
check "every lead has sourceProviderKey+sourceUrl" $([ "$prov" = "true" ] && echo 0 || echo 1)
expl=$(curl -s -b "$JAR_A" "$BASE/api/engine/leads?clientId=$A&limit=10" | jqr 'd.leads.filter(l=>l.scoreBreakdown).every(l=>l.scoreBreakdown.breakdown.length===7)')
check "score breakdown = 7 explainable components" $([ "$expl" = "true" ] && echo 0 || echo 1)

echo "── 6. Dedupe (§8) ───────────────────────────────────────"
curl -s -b "$JAR_A" -X POST "$BASE/api/engine/discovery" -H 'Content-Type: application/json' \
  -d "{\"clientId\":\"$A\",\"campaignId\":\"$CID\"}" -o /tmp/run2.json
ins2=$(jqr 'd.summary.inserted' < /tmp/run2.json); upd2=$(jqr 'd.summary.updated' < /tmp/run2.json)
imp2=$(curl -s -b "$JAR_A" -X POST "$BASE/api/engine/leads" -H 'Content-Type: application/json' \
  -d "{\"clientId\":\"$A\",\"campaignId\":\"$CID\",\"leads\":[{\"businessName\":\"Pathao\",\"website\":\"https://pathao.com\",\"countryCode\":\"BD\",\"sourceProviderKey\":\"wikidata_sparql\",\"sourceUrl\":\"https://query.wikidata.org/sparql\"}]}")
impdup=$(echo "$imp2" | jqr 'd.duplicated' 2>/dev/null || echo 0)
check "re-run+re-import dedupes (0 new)" $([ "$ins2" = "0" ] && [ "$impdup" -ge 1 ] && echo 0 || echo 1) "runInserted=$ins2 importDup=$impdup"

echo "── 7. Tenant isolation (§11) ────────────────────────────"
code=$(curl -s -b "$JAR_B" -o /tmp/iso1.json -w "%{http_code}" "$BASE/api/engine/leads?clientId=$A")
check "B cannot read A leads (403)" $([ "$code" = "403" ] && echo 0 || echo 1) "http=$code"
btot=$(curl -s -b "$JAR_B" "$BASE/api/engine/leads" | jqr 'd.total')
check "B sees only own workspace (0 leads)" $([ "$btot" = "0" ] && echo 0 || echo 1) "total=$btot"
code=$(curl -s -b "$JAR_B" -o /tmp/iso2.json -w "%{http_code}" "$BASE/api/engine/leads/$LEAD1")
check "B cannot read A lead detail (403)" $([ "$code" = "403" ] && echo 0 || echo 1) "http=$code"

echo "── 8. Contact gate: approval + DNC (§8,§12,§14) ─────────"
LID=$LEAD1
code=$(curl -s -b "$JAR_A" -o /tmp/c1.json -w "%{http_code}" -X POST "$BASE/api/engine/leads/contact" \
  -H 'Content-Type: application/json' -d "{\"clientId\":\"$A\",\"leadId\":\"$LID\"}")
check "contact without approval → 403" $([ "$code" = "403" ] && echo 0 || echo 1) "http=$code"
APID=$(curl -s -b "$JAR_A" -X POST "$BASE/api/engine/approvals" -H 'Content-Type: application/json' \
  -d "{\"clientId\":\"$A\",\"type\":\"outbound_contact\",\"payload\":{\"leadId\":\"$LID\"},\"justification\":\"e2e\"}" | jqr 'd.approvalId')
curl -s -b "$JAR_A" -X PATCH "$BASE/api/engine/approvals" -H 'Content-Type: application/json' \
  -d "{\"id\":\"$APID\",\"decision\":\"approved\"}" -o /tmp/appdec.json
okc=$(curl -s -b "$JAR_A" -X POST "$BASE/api/engine/leads/contact" -H 'Content-Type: application/json' \
  -d "{\"clientId\":\"$A\",\"leadId\":\"$LID\",\"approvalId\":\"$APID\"}" | jqr 'd.ok')
check "contact with approved request → recorded" $([ "$okc" = "true" ] && echo 0 || echo 1)
curl -s -b "$JAR_A" -X PATCH "$BASE/api/engine/leads" -H 'Content-Type: application/json' \
  -d "{\"clientId\":\"$A\",\"id\":\"$LID\",\"action\":\"dnc\"}" -o /dev/null
code=$(curl -s -b "$JAR_A" -o /tmp/c2.json -w "%{http_code}" -X POST "$BASE/api/engine/leads/contact" \
  -H 'Content-Type: application/json' -d "{\"clientId\":\"$A\",\"leadId\":\"$LID\",\"approvalId\":\"$APID\"}")
check "contact after DNC → 403 blocked" $([ "$code" = "403" ] && echo 0 || echo 1) "http=$code"

echo "── 9. Content approval flow (§10,§12) ───────────────────"
ITID=$(curl -s -b "$JAR_A" -X POST "$BASE/api/engine/growth/content" -H 'Content-Type: application/json' \
  -d "{\"clientId\":\"$A\",\"platform\":\"facebook\",\"topic\":\"enginetestx admission tips\"}" | jqr 'd.item.id')
code=$(curl -s -b "$JAR_A" -o /tmp/pub.json -w "%{http_code}" -X PATCH "$BASE/api/engine/growth/content" \
  -H 'Content-Type: application/json' -d "{\"clientId\":\"$A\",\"id\":\"$ITID\",\"status\":\"published\"}")
check "publish from draft without approval → rejected" $([ "$code" = "400" ] && echo 0 || echo 1) "http=$code"
curl -s -b "$JAR_A" -X PATCH "$BASE/api/engine/growth/content" -H 'Content-Type: application/json' -d "{\"clientId\":\"$A\",\"id\":\"$ITID\",\"status\":\"awaiting_approval\"}" -o /dev/null
curl -s -b "$JAR_A" -X PATCH "$BASE/api/engine/growth/content" -H 'Content-Type: application/json' -d "{\"clientId\":\"$A\",\"id\":\"$ITID\",\"status\":\"approved\"}" -o /dev/null
pub=$(curl -s -b "$JAR_A" -X PATCH "$BASE/api/engine/growth/content" -H 'Content-Type: application/json' \
  -d "{\"clientId\":\"$A\",\"id\":\"$ITID\",\"status\":\"published\"}" | jqr 'd.ok')
check "draft→approval→published works" $([ "$pub" = "true" ] && echo 0 || echo 1)

echo "── 10. Website growth — honest PSI (§9) ─────────────────"
node -e "
(async()=>{
  const r=await fetch('$BASE/api/engine/growth/website',{method:'POST',headers:{'Content-Type':'application/json','Cookie':require('fs').readFileSync('$JAR_A','utf8').split('\n').filter(l=>l.includes('aia_session')).map(l=>l.trim().split(/\s+/).slice(-2).join('=')).join(';')},body:JSON.stringify({clientId:'$A',url:'aloeducation.bd'})});
  const d=await r.json();
  if(d.ok) {console.log('    PSI OK — scores', JSON.stringify(d.audit.scores)); process.exit(0);}
  else if(d.rateLimited) {console.log('    PSI rate-limited — honest 429 handling, no fake data'); process.exit(0);}
  else {console.log('    PSI failed:', d.error); process.exit(1);}
})().catch(e=>{console.log(e.message);process.exit(1)})
"
check "PSI audit real-or-honest (no fabrication)" $([ $? = "0" ] && echo 0 || echo 1)

echo "── 11. Mode A universal scan ────────────────────────────"
uok=$(curl -s -b "$JAR_A" -X POST "$BASE/api/engine/universal" -H 'Content-Type: application/json' \
  -d "{\"clientId\":\"$A\",\"countries\":[\"BD\"]}" | jqr 'd.ok')
check "universal scan completed" $([ "$uok" = "true" ] && echo 0 || echo 1)
reps=$(curl -s -b "$JAR_A" "$BASE/api/engine/universal?clientId=$A" | jqr 'd.reports.length')
check "opportunity report stored" $([ "$reps" -ge 1 ] && echo 0 || echo 1) "reports=$reps"

echo "── 12. Cost + audit (§13,§14) ───────────────────────────"
u=$(curl -s -b "$JAR_A" "$BASE/api/engine/cost?clientId=$A" | jqr 'd.usageToday.reduce((a,x)=>a+x.units,0)')
check "provider usage tracked (>0)" $([ "$u" -gt 0 ] && echo 0 || echo 1) "units=$u"
usd=$(curl -s -b "$JAR_A" "$BASE/api/engine/cost?clientId=$A" | jqr 'd.estimatedUsdThisMonth')
check "spend stays \$0 (free-first)" $([ "$usd" = "0" ] && echo 0 || echo 1) "USD=$usd"
ev=$(curl -s -b "$JAR_A" "$BASE/api/engine/audit?clientId=$A" | jqr 'd.events.length')
check "audit events recorded" $([ "$ev" -ge 5 ] && echo 0 || echo 1) "events=$ev"

echo "── 13. Existing CRM intact (§16) ────────────────────────"
code=$(curl -s -b "$JAR_A" -o /tmp/crm.json -w "%{http_code}" "$BASE/api/crm/leads")
crmok=$(jqr 'Array.isArray(d.leads)' < /tmp/crm.json 2>/dev/null)
check "existing CRM leads API still 200" $([ "$code" = "200" ] && [ "$crmok" = "true" ] && echo 0 || echo 1) "http=$code"


echo "── 14. Spec-compliance additions (§8, §12) ──────────────"
TS=$(date +%s)
# §12: suggest_only campaign — imported+recalced lead must NOT auto-advance
PID2=$(curl -s -b "$JAR_A" -X POST "$BASE/api/engine/profiles" -H 'Content-Type: application/json' \
  -d "{\"clientId\":\"$A\",\"name\":\"E2E SuggestOnly\",\"countries\":[\"BD\"],\"industries\":[\"education\"],\"keywords\":[\"suggestonlykw\"]}" \
  | jqr 'd.profileId')
CID2=$(curl -s -b "$JAR_A" -X POST "$BASE/api/engine/campaigns" -H 'Content-Type: application/json' \
  -d "{\"clientId\":\"$A\",\"name\":\"E2E SuggestOnly Camp\",\"profileId\":\"$PID2\",\"autonomy\":\"suggest_only\",\"budgetPreference\":\"free_first\",\"sourceKeys\":[\"wikidata_sparql\"],\"qualificationCriteria\":{\"minScore\":10}}" \
  | jqr 'd.campaignId')
auto_ok=$(curl -s -b "$JAR_A" -X PATCH "$BASE/api/engine/campaigns" -H 'Content-Type: application/json' \
  -d "{\"clientId\":\"$A\",\"id\":\"$CID2\",\"autonomy\":\"approval_required\"}" -o /dev/null -w "%{http_code}")
check "campaign autonomy accepted on PATCH" $([ "$auto_ok" = "200" ] && echo 0 || echo 1)
curl -s -b "$JAR_A" -X PATCH "$BASE/api/engine/campaigns" -H 'Content-Type: application/json' \
  -d "{\"clientId\":\"$A\",\"id\":\"$CID2\",\"autonomy\":\"suggest_only\"}" -o /dev/null
SL_LEAD=$(curl -s -b "$JAR_A" -X POST "$BASE/api/engine/leads" -H 'Content-Type: application/json' \
  -d "{\"clientId\":\"$A\",\"campaignId\":\"$CID2\",\"leads\":[{\"businessName\":\"SuggestOnly Test Co $TS\",\"website\":\"https://suggestonly-test.example\",\"countryCode\":\"BD\",\"cityName\":\"Dhaka\",\"category\":\"education\",\"productsServices\":\"suggestonlykw training academy\",\"sourceProviderKey\":\"wikidata_sparql\",\"sourceUrl\":\"https://query.wikidata.org/sparql\",\"evidence\":[{\"type\":\"directory\",\"detail\":\"test entity\",\"url\":\"https://query.wikidata.org/sparql\"}]}]}" \
  | jqr 'd.inserted')
SLID=$(curl -s -b "$JAR_A" "$BASE/api/engine/leads?clientId=$A&campaignId=$CID2&limit=1" | jqr 'd.leads[0].id')
rcok=$(curl -s -b "$JAR_A" -X PATCH "$BASE/api/engine/leads" -H 'Content-Type: application/json' \
  -d "{\"clientId\":\"$A\",\"id\":\"$SLID\",\"action\":\"recalc_score\"}" | jqr 'd.ok')
check "recalc_score runs under suggest_only" $([ "$rcok" = "true" ] && echo 0 || echo 1)
sl_status=$(curl -s -b "$JAR_A" "$BASE/api/engine/leads?clientId=$A&campaignId=$CID2&limit=1" | jqr 'd.leads[0].pipelineStatus')
check "suggest_only: recalc does NOT auto-advance" $([ "$sl_status" = "discovered" ] && echo 0 || echo 1) "status=$sl_status"

# §8: follow-up scheduling
FLEAD=$(curl -s -b "$JAR_A" "$BASE/api/engine/leads?clientId=$A&campaignId=$CID2&limit=1" | jqr 'd.leads[0].id')
fu=$(curl -s -b "$JAR_A" -X PATCH "$BASE/api/engine/leads" -H 'Content-Type: application/json' \
  -d "{\"clientId\":\"$A\",\"id\":\"$FLEAD\",\"action\":\"schedule_followup\",\"value\":\"2027-01-15T09:00:00.000Z\"}" | jqr 'd.followUpAt')
check "follow-up scheduled (§8)" $([ -n "$fu" ] && [ "$fu" != "null" ] && echo 0 || echo 1) "followUpAt=$fu"
fugot=$(curl -s -b "$JAR_A" "$BASE/api/engine/leads/$FLEAD?clientId=$A" | jqr 'd.lead.followUpAt')
check "followUpAt persisted on lead detail" $([ "$fugot" != "null" ] && echo 0 || echo 1) "detail=$fugot"

# §8: retention settings + sweep (tenant B isolated)
code=$(curl -s -b "$JAR_B" -o /tmp/ret1.json -w "%{http_code}" -X POST "$BASE/api/engine/governance" -H 'Content-Type: application/json' \
  -d "{\"clientId\":\"$A\",\"action\":\"set_retention\",\"retentionDays\":30}")
check "set_retention blocked cross-tenant" $([ "$code" = "403" ] && echo 0 || echo 1) "http=$code"
code=$(curl -s -b "$JAR_A" -o /tmp/ret2.json -w "%{http_code}" -X POST "$BASE/api/engine/governance" -H 'Content-Type: application/json' \
  -d "{\"clientId\":\"$B\",\"action\":\"retention_sweep\"}")
check "sweep before retention set → 400" $([ "$code" = "400" ] && echo 0 || echo 1) "http=$code"
code=$(curl -s -b "$JAR_A" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/engine/governance" -H 'Content-Type: application/json' \
  -d "{\"clientId\":\"$B\",\"action\":\"set_retention\",\"retentionDays\":30}")
check "admin set_retention works" $([ "$code" = "200" ] && echo 0 || echo 1)
swept=$(curl -s -b "$JAR_B" -X POST "$BASE/api/engine/governance" -H 'Content-Type: application/json' \
  -d "{\"action\":\"retention_sweep\"}" | jqr 'd.ok')
check "tenant sweep on own workspace (client role)" $([ "$swept" = "true" ] && echo 0 || echo 1)

# §8 deletion workflow: hard delete is admin-only + justification required
curl -s -b "$JAR_B" -X POST "$BASE/api/engine/leads" -H 'Content-Type: application/json' \
  -d "{\"leads\":[{\"businessName\":\"B Tenant Del Test $TS\",\"website\":\"https://bdeltest.example\",\"sourceProviderKey\":\"wikidata_sparql\",\"sourceUrl\":\"https://query.wikidata.org/sparql\"}]}" -o /dev/null
BLEAD=$(curl -s -b "$JAR_B" "$BASE/api/engine/leads?limit=1" | jqr 'd.leads[0].id')
code=$(curl -s -b "$JAR_B" -o /dev/null -w "%{http_code}" -X DELETE "$BASE/api/engine/leads/$BLEAD?actionClientId=$B")
check "client hard delete → 403" $([ "$code" = "403" ] && echo 0 || echo 1) "http=$code"
code=$(curl -s -b "$JAR_A" -o /dev/null -w "%{http_code}" -X DELETE "$BASE/api/engine/leads/$BLEAD?clientId=$B")
check "admin hard delete w/o justification → 400" $([ "$code" = "400" ] && echo 0 || echo 1) "http=$code"
code=$(curl -s -b "$JAR_A" -o /dev/null -w "%{http_code}" -X DELETE "$BASE/api/engine/leads/$BLEAD?clientId=$B&justification=e2e%20deletion%20workflow%20test")
check "admin hard delete with justification → 200" $([ "$code" = "200" ] && echo 0 || echo 1) "http=$code"
gone=$(curl -s -b "$JAR_B" -o /dev/null -w "%{http_code}" "$BASE/api/engine/leads/$BLEAD")
check "deleted lead gone (404)" $([ "$gone" = "404" ] && echo 0 || echo 1) "http=$gone"

# §12 approved_automation: client can draft→published when campaign authorizes
BID=$(curl -s -b "$JAR_B" -X POST "$BASE/api/engine/growth/content" -H 'Content-Type: application/json' \
  -d "{\"platform\":\"facebook\",\"topic\":\"automation test post\"}" | jqr 'd.item.id')
code=$(curl -s -b "$JAR_B" -o /dev/null -w "%{http_code}" -X PATCH "$BASE/api/engine/growth/content" -H 'Content-Type: application/json' \
  -d "{\"id\":\"$BID\",\"status\":\"published\"}")
check "draft→published WITHOUT automation → 400" $([ "$code" = "400" ] && echo 0 || echo 1) "http=$code"
BPROF=$(curl -s -b "$JAR_B" -X POST "$BASE/api/engine/profiles" -H 'Content-Type: application/json' \
  -d "{\"name\":\"B Auto Profile\",\"countries\":[\"BD\"],\"keywords\":[\"automation\"],\"industries\":[\"software\"]}" | jqr 'd.profileId')
BCAMP=$(curl -s -b "$JAR_B" -X POST "$BASE/api/engine/campaigns" -H 'Content-Type: application/json' \
  -d "{\"name\":\"B Auto Camp\",\"profileId\":\"$BPROF\",\"autonomy\":\"approved_automation\",\"sourceKeys\":[\"wikidata_sparql\"]}" | jqr 'd.campaignId')
curl -s -b "$JAR_B" -X PATCH "$BASE/api/engine/campaigns" -H 'Content-Type: application/json' \
  -d "{\"id\":\"$BCAMP\",\"status\":\"active\"}" -o /dev/null
code=$(curl -s -b "$JAR_B" -o /tmp/autopub.json -w "%{http_code}" -X PATCH "$BASE/api/engine/growth/content" -H 'Content-Type: application/json' \
  -d "{\"id\":\"$BID\",\"status\":\"published\"}")
check "approved_automation authorizes client draft→published" $([ "$code" = "200" ] && echo 0 || echo 1) "http=$code"
echo ""
echo "═══ RESULT: PASS=$PASS FAIL=$FAIL ═══"
[ "$FAIL" = "0" ] && exit 0 || exit 1
