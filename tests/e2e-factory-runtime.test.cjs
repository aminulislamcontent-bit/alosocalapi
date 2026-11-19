const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const STANDALONE_SERVER = path.join(ROOT, '.next', 'standalone', 'server.js');

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      srv.close(() => resolve(addr.port));
    });
  });
}

async function waitForHealth(baseUrl, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/api/health`);
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'ok') return data;
      }
    } catch {
      // Server booting
    }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error(`Timed out waiting for ${baseUrl}/api/health`);
}

test('full E2E Factory HTTP runtime: 20 modules, pages, RBAC, compliance, automation checkpoints, AI router & portability', async (t) => {
  if (!fs.existsSync(STANDALONE_SERVER)) {
    assert.fail(`Standalone build missing at ${STANDALONE_SERVER}. Run npm run build first.`);
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aloapi-factory-e2e-'));
  const dbPath = path.join(tmpDir, 'factory-e2e.db');
  const dbUrl = `file:${dbPath}`;

  t.after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const prismaCli = path.join(ROOT, 'node_modules', 'prisma', 'build', 'index.js');
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: dbUrl },
    stdio: 'pipe',
  });

  const sink = await require('./support/mail-fixture.cjs').start(t);
  const preload = path.join(tmpDir,'dns.cjs'); fs.writeFileSync(preload,`require('node:dns/promises').setServers(['127.0.0.1:${sink.dnsPort}']);`);
  const db = require('../scripts/prisma-client.mjs').createPrismaClient(dbUrl);t.after(()=>db.$disconnect());
  const crypto=require('node:crypto'); const token=crypto.randomBytes(32).toString('hex');
  const client=await db.clientAccount.create({data:{name:'QA',business:'QA',username:'qaoperator',passwordHash:'disabled'}});
  await db.portalSession.create({data:{role:'client',clientId:client.id,token:crypto.createHash('sha256').update(token).digest('hex'),expiresAt:new Date(Date.now()+600000)}});
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const serverLogs = [];

  const child = spawn(process.execPath, ['-r',preload,STANDALONE_SERVER], {
    cwd: path.join(ROOT, '.next', 'standalone'),
    env: {
      ...process.env,
      NODE_ENV: 'production',
      HOSTNAME: '127.0.0.1',
      PORT: String(port),
      DATABASE_URL: dbUrl,
      ALOAPI_VAULT_KEY: '0123456789abcdef0123456789abcdef',
      ADMIN_BOOTSTRAP_USERNAME: 'factoryadmin',
      ADMIN_BOOTSTRAP_PASSWORD: 'FactoryStrongPassword2026!',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', c => serverLogs.push(c.toString()));
  child.stderr.on('data', c => serverLogs.push(c.toString()));
  t.after(() => {
    if (!child.killed) child.kill('SIGTERM');
  });

  try {
    await waitForHealth(baseUrl);

    // 1. Unauthenticated access denied
    const unauth = await fetch(`${baseUrl}/api/factory/overview`);
    assert.equal(unauth.status, 401);

    const memberHeaders={cookie:`aia_session=${token}`,origin:baseUrl,'content-type':'application/json'};
    assert.equal((await fetch(`${baseUrl}/api/factory/workspaces?username=factoryadmin`,{headers:memberHeaders})).status,403);
    assert.equal(await db.factoryWorkspace.count(),0);assert.equal(await db.factoryWorkspaceMember.count(),0);
    // 2. Sign in
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: baseUrl },
      body: JSON.stringify({
        username: 'factoryadmin',
        password: 'FactoryStrongPassword2026!',
        role: 'admin',
      }),
    });
    assert.equal(loginRes.status, 200);
    const setCookie = loginRes.headers.get('set-cookie') || '';
    const sessionMatch = /aia_session=([^;]+)/.exec(setCookie);
    assert.ok(sessionMatch, 'Expected session cookie');
    const cookieHeader = `aia_session=${sessionMatch[1]}`;

    const api = (urlPath, opts = {}) =>
      fetch(`${baseUrl}${urlPath}`, {
        ...opts,
        headers: {
          cookie: cookieHeader,
          origin: baseUrl,
          'content-type': 'application/json',
          ...(opts.headers || {}),
        },
      });

    // 3. Dedicated Factory UI routes return 200
    for (const route of [
      '/factory',
      '/factory/email_marketing',
      '/factory/voice_call_center',
      '/factory/marketing_automation',
      '/factory/ai_crm',
      '/factory/sms_marketing',
    ]) {
      const pageRes = await fetch(`${baseUrl}${route}`, { headers: { cookie: cookieHeader } });
      assert.equal(pageRes.status, 200, `Expected 200 on ${route}`);
    }

    // 4. Versioned Gateway & Overview reflect 20 first-party modules and 131 external providers
    const v1Res = await api('/api/v1/factory');
    assert.equal(v1Res.status, 200);
    const v1 = await v1Res.json();
    assert.equal(v1.firstPartyModulesCount, 20);
    assert.equal(v1.externalCatalogSummary.total, 131);

    // 5. Email Marketing HTTP flow + public RFC 8058 unsubscribe
    const domRes = await api('/api/factory/modules/email_marketing', {
      method: 'POST',
      body: JSON.stringify({ action: 'register_domain', domain: 'e2e.example.invalid' }),
    });
    assert.equal(domRes.status, 201);
    const { domain } = await domRes.json();

    const contactRes = await api('/api/factory/modules/email_marketing', {
      method: 'POST',
      body: JSON.stringify({ action: 'upsert_contact', email: 'e2e-user@example.com', consentStatus: 'granted' }),
    });
    assert.equal(contactRes.status, 200);
    const { contact } = await contactRes.json();

    const unsubRes = await fetch(`${baseUrl}/api/factory/modules/email_marketing/unsubscribe?token=${encodeURIComponent(contact.unsubscribeToken)}`, {
      method: 'POST',
    });
    assert.equal(unsubRes.status, 200);
    assert.equal((await unsubRes.json()).unsubscribed, true);

    const post=(url,body,headers)=>api(url,{method:'POST',body:JSON.stringify(body),headers});
    const email=(body,headers)=>post('/api/factory/modules/email_marketing',body,headers);
    assert.equal((await post('/api/factory/workspaces',{action:'create_workspace',name:'Other',slug:'other'})).status,201);
    assert.equal((await post('/api/factory/workspaces',{action:'upsert_member',username:client.username,role:'operator'})).status,200);
    assert.equal((await (await api('/api/factory/workspaces')).json()).workspaces.length,2);
    assert.deepEqual((await (await api('/api/factory/workspaces',{headers:memberHeaders})).json()).workspaces.map(w=>w.id),['default-workspace']);
    const store=await post('/api/onboarding/vault',{tenantId:'default-workspace',providerKey:'smtp_custom',credentialType:'custom_secret',label:'smtp_host',value:`127.0.0.1:${sink.port}`});assert.equal(store.status,200);
    const {template}=await (await email({action:'save_template',name:'Regression',subject:'Controlled message',textBody:'Test message',htmlBody:'<p>Test message</p>'})).json();
    for(const addr of ['success','reject','timeout'])assert.equal((await email({action:'upsert_contact',email:`${addr}@example.invalid`,segment:'regression',consentStatus:'granted'})).status,200);
    const {campaign}=await (await email({action:'create_campaign',name:'Controlled dispatch',segment:'regression',domainId:domain.id,templateId:template.id,adapterType:'smtp_custom'})).json();
    const approve={action:'approve_campaign',campaignId:campaign.id}; const dispatch={action:'dispatch_campaign',campaignId:campaign.id};
    assert.equal((await email(approve,memberHeaders)).status,403);assert.equal((await email({...dispatch,approveNow:true},memberHeaders)).status,403);
    assert.equal((await db.emailCampaign.findUniqueOrThrow({where:{id:campaign.id}})).approvalStatus,'pending');
    assert.equal((await email(approve)).status,200);
    const blocked=await email(dispatch,memberHeaders);assert.equal(blocked.status,400);assert.match((await blocked.json()).error,/domain requires verified SPF/);
    const events=()=>db.emailDeliveryEvent.findMany({where:{campaignId:campaign.id}});
    const usage=()=>db.factoryUsageEvent.count({where:{metric:'email_sent'}});
    assert.equal(sink.connections,0);assert.equal((await events()).length,0);assert.equal(await usage(),0);assert.equal((await db.emailCampaign.findUniqueOrThrow({where:{id:campaign.id}})).sentAt,null);
    sink.verified=true;const verified=await email({action:'verify_domain',domainId:domain.id});assert.equal((await verified.json()).domain.verifiedForProduction,true);
    const accepted=await email(dispatch,memberHeaders);assert.equal(accepted.status,200);
    const stats=(await accepted.json()).stats;assert.deepEqual(stats.outcomes,{ACCEPTED:1,REJECTED:1,UNKNOWN:1});
    assert.equal((await events()).find(e=>e.status==='ACCEPTED').detail,'250 queued receipt-123');
    assert.equal(sink.accepted,1);assert.equal(await usage(),1);await email(dispatch,memberHeaders);assert.equal(sink.connections,3);assert.equal(await usage(),1);
    await db.emailTemplate.update({where:{id:template.id},data:{subject:'Changed after approval'}});assert.match((await (await email(dispatch,memberHeaders)).json()).error,/requires approval/);assert.equal(sink.connections,3);

    // 6. Voice Call Center HTTP flow (Bangla + calling-hours gate + conversation turn + completion)
    const vcConsent = await api('/api/factory/modules/voice_call_center', {
      method: 'POST',
      body: JSON.stringify({ action: 'upsert_consent', phoneE164: '+8801711223344', consentStatus: 'granted', preferredLanguage: 'bn' }),
    });
    assert.equal(vcConsent.status, 200);

    const blockedHour = await api('/api/factory/modules/voice_call_center', {
      method: 'POST',
      body: JSON.stringify({ action: 'start_call', direction: 'outbound', phoneE164: '+8801711223344', language: 'bn', telephonyAdapter: 'mocked_telephony', testLocalHourOverride: 23 }),
    });
    assert.equal(blockedHour.status, 422);

    const startedCall = await api('/api/factory/modules/voice_call_center', {
      method: 'POST',
      body: JSON.stringify({ action: 'start_call', direction: 'outbound', phoneE164: '+8801711223344', language: 'bn', telephonyAdapter: 'mocked_telephony', testLocalHourOverride: 13 }),
    });
    assert.equal(startedCall.status, 201);
    const { session } = await startedCall.json();
    assert.equal(session.recordingDisclosed, true);

    const completedCall = await api('/api/factory/modules/voice_call_center', {
      method: 'POST',
      body: JSON.stringify({ action: 'complete_call', sessionId: session.id, outcome: 'resolved', durationSeconds: 42 }),
    });
    assert.equal(completedCall.status, 200);

    // 7. Automation Builder checkpoint approval + AI CRM + Jobs + AI Router + SMS Marketing + Portability Export
    const wfRes = await api('/api/factory/modules/marketing_automation', {
      method: 'POST',
      body: JSON.stringify({
        action: 'save_workflow',
        name: 'E2E Approval Flow',
        triggerType: 'manual',
        nodes: [
          { id: 't1', type: 'trigger', label: 'Start', position: { x: 0, y: 0 } },
          { id: 'c1', type: 'approval_checkpoint', label: 'Approve', position: { x: 100, y: 0 } },
        ],
        edges: [{ source: 't1', target: 'c1' }],
      }),
    });
    assert.equal(wfRes.status, 201);
    const { workflow } = await wfRes.json();

    const trigRes = await api('/api/factory/modules/marketing_automation', {
      method: 'POST',
      body: JSON.stringify({ action: 'trigger', workflowId: workflow.id }),
    });
    assert.equal(trigRes.status, 200);
    const { run } = await trigRes.json();
    assert.equal(run.status, 'awaiting_approval');

    const decRes = await api('/api/factory/modules/marketing_automation', {
      method: 'POST',
      body: JSON.stringify({ action: 'decide_approval', runId: run.id, decision: 'approve' }),
    });
    assert.equal(decRes.status, 200);
    assert.equal((await decRes.json()).run.status, 'completed');

    const smsRes = await api('/api/factory/modules/sms_marketing', {
      method: 'POST',
      body: JSON.stringify({ action: 'execute', title: 'Flash Alert', data: { senderId: 'ALOAPI', message: 'Hello Dhaka', consentChecked: true } }),
    });
    assert.equal(smsRes.status, 201);

    const aiRes = await api('/api/factory/ai', {
      method: 'POST',
      body: JSON.stringify({ task: 'marketing_copy', language: 'bn', prompt: 'ই-মেইল হেডলাইন', adapter: 'local_deterministic' }),
    });
    assert.equal(aiRes.status, 200);

    const portRes = await api('/api/factory/portability');
    assert.equal(portRes.status, 200);
    const portBody = await portRes.json();
    assert.ok(portBody.sha256);
    assert.equal(portBody.snapshot.secretsIncluded, false);
  } catch (err) {
    console.error('Server logs:\n', serverLogs.join(''));
    throw err;
  }
});
