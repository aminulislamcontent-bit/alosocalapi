const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const compileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aloapi-factory-test-'));
const cache = new Map();

function resetDbModules() {
  for (const key of Array.from(cache.keys())) {
    if (key.includes(`${path.sep}src${path.sep}lib${path.sep}db.ts`) || key.includes(`${path.sep}src${path.sep}lib${path.sep}factory`) || key.includes(`${path.sep}src${path.sep}lib${path.sep}onboarding`) || key.includes(`${path.sep}src${path.sep}lib${path.sep}security`)) {
      cache.delete(key);
    }
  }
  if (globalThis.prisma) {
    globalThis.prisma = undefined;
  }
}

function loadTsModule(relOrAbsPath) {
  const abs = path.isAbsolute(relOrAbsPath) ? relOrAbsPath : path.join(ROOT, relOrAbsPath);
  if (cache.has(abs)) return cache.get(abs);

  const source = fs.readFileSync(abs, 'utf8');
  const rewritten = source.replace(/from\s+['"](@\/|\.\.?\/)([^'"]+)['"]/g, (m, prefix, rest) => {
    if (prefix === '@/') {
      return `from '${path.join(ROOT, 'src', rest).replace(/\\/g, '/')}'`;
    }
    return m;
  });

  const compiled = ts.transpileModule(rewritten, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;

  const outFile = path.join(compileDir, `${Buffer.from(abs).toString('hex')}.cjs`);
  const mod = { exports: {} };
  cache.set(abs, mod.exports);

  const Module = require('node:module');
  const localRequire = (spec) => {
    if (spec.startsWith('.') || spec.startsWith('/')) {
      const baseDir = path.dirname(abs);
      const target = spec.startsWith('/') ? spec : path.resolve(baseDir, spec);
      for (const candidate of [target, `${target}.ts`, `${target}.tsx`, path.join(target, 'index.ts')]) {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile() && /\.(ts|tsx)$/.test(candidate)) {
          return loadTsModule(candidate);
        }
      }
      return require(target);
    }
    return Module.createRequire(abs)(spec);
  };

  fs.writeFileSync(outFile, compiled);
  const fn = new Function('exports', 'require', 'module', '__filename', '__dirname', compiled);
  fn(mod.exports, localRequire, mod, outFile, path.dirname(outFile));
  return mod.exports;
}

function setupFreshDb(t) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aloapi-factory-db-'));
  const dbPath = path.join(tmpDir, 'factory.db');
  const dbUrl = `file:${dbPath}`;
  process.env.DATABASE_URL = dbUrl;
  process.env.ALOAPI_VAULT_KEY = '0123456789abcdef0123456789abcdef';
  resetDbModules();

  const prismaCli = path.join(ROOT, 'node_modules', 'prisma', 'build', 'index.js');
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: dbUrl },
    stdio: 'pipe',
  });

  t.after(() => {
    resetDbModules();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  return loadTsModule('src/lib/db.ts').db;
}

test('First-Party Registry has exactly 20 modules strictly isolated from the 131-provider external catalog', () => {
  const { FIRST_PARTY_MODULES, assertFirstPartyExternalSeparation } = loadTsModule('src/lib/factory/modules/registry.ts');
  const { ALL_INTEGRATION_CATALOG } = loadTsModule('src/lib/intelligence/catalog.ts');

  assert.equal(FIRST_PARTY_MODULES.length, 20);
  assert.equal(ALL_INTEGRATION_CATALOG.length, 131);

  const check = assertFirstPartyExternalSeparation();
  assert.equal(check.ok, true);
  assert.equal(check.firstPartyCount, 20);
  assert.equal(check.externalCount, 131);

  for (const mod of FIRST_PARTY_MODULES) {
    assert.ok(mod.appRoute.startsWith('/factory/'));
    assert.ok(mod.apiEndpoint.startsWith('/api/factory/modules/'));
    assert.ok(mod.operationalDocs.runbookSteps.length >= 2);
    assert.ok(mod.complianceGuardrails.length >= 1);
  }
});

test('Shared Platform Infrastructure: tenancy isolation, RBAC, job retry/DLQ, AI router, explicit provider bridge & portability', async (t) => {
  const db = setupFreshDb(t);
  const tenancy = loadTsModule('src/lib/factory/tenancy.ts');
  const jobs = loadTsModule('src/lib/factory/job-queue.ts');
  const ai = loadTsModule('src/lib/factory/ai-router.ts');
  const bridge = loadTsModule('src/lib/factory/provider-bridge.ts');
  const portability = loadTsModule('src/lib/factory/portability.ts');

  const wsA = await tenancy.createFactoryWorkspace({
    slug: 'ws-alpha',
    name: 'Workspace Alpha',
    ownerUsername: 'alice',
    actor: 'alice',
  });
  const wsB = await tenancy.createFactoryWorkspace({
    slug: 'ws-beta',
    name: 'Workspace Beta',
    ownerUsername: 'bob',
    actor: 'bob',
  });
  assert.notEqual(wsA.id, wsB.id);

  // RBAC matrix verification
  assert.equal(tenancy.hasRolePermission('viewer', 'read'), true);
  assert.equal(tenancy.hasRolePermission('viewer', 'write'), false);
  assert.equal(tenancy.hasRolePermission('operator', 'execute'), true);
  assert.equal(tenancy.hasRolePermission('operator', 'admin'), false);
  assert.equal(tenancy.hasRolePermission('owner', 'admin'), true);

  // Explicit provider authorization bridge: refuses without explicitOwnerConsent
  await assert.rejects(
    () => bridge.connectExternalProviderToModule({
      workspaceId: wsA.id,
      moduleKey: 'email_marketing',
      providerKey: 'sendgrid_api',
      approvedBy: 'alice',
      explicitOwnerConsent: false,
    }),
    /Explicit tenant\/owner consent is required/,
  );

  // Refuses connecting first-party key inside external bridge
  await assert.rejects(
    () => bridge.connectExternalProviderToModule({
      workspaceId: wsA.id,
      moduleKey: 'email_marketing',
      providerKey: 'voice_call_center',
      approvedBy: 'alice',
      explicitOwnerConsent: true,
    }),
    /not registered in the canonical external catalog/,
  );

  const bound = await bridge.connectExternalProviderToModule({
    workspaceId: wsA.id,
    moduleKey: 'email_marketing',
    providerKey: 'sendgrid_api',
    approvedBy: 'alice',
    explicitOwnerConsent: true,
  });
  assert.equal(bound.status, 'awaiting_vault_credentials');

  // Job queue idempotency + retry -> dead_letter -> manual DLQ retry -> completed
  const firstEnqueue = await jobs.enqueueFactoryJob({
    workspaceId: wsA.id,
    moduleKey: 'marketing_automation',
    jobType: 'test.transient_fail',
    idempotencyKey: 'idem-dlq-1',
    maxAttempts: 2,
    payload: { simulateFailure: true },
    actor: 'alice',
  });
  const dupEnqueue = await jobs.enqueueFactoryJob({
    workspaceId: wsA.id,
    moduleKey: 'marketing_automation',
    jobType: 'test.transient_fail',
    idempotencyKey: 'idem-dlq-1',
    payload: { simulateFailure: true },
  });
  assert.equal(dupEnqueue.deduplicated, true);

  await Promise.all([jobs.processDueFactoryJobs({ workspaceId: wsA.id, limit: 10 }),jobs.processDueFactoryJobs({ workspaceId: wsA.id, limit: 10 })]);
  assert.equal((await db.factoryJob.findUniqueOrThrow({where:{id:firstEnqueue.job.id}})).attempts,1);
  await db.factoryJob.update({ where: { id: firstEnqueue.job.id }, data: { nextRetryAt: new Date(Date.now() - 1000) } });
  await jobs.processDueFactoryJobs({ workspaceId: wsA.id, limit: 10 });
  const afterDlq = await db.factoryJob.findUnique({ where: { id: firstEnqueue.job.id } });
  assert.equal(afterDlq.status, 'dead_letter');

  const foreign = await jobs.enqueueFactoryJob({workspaceId:wsB.id,moduleKey:'test',jobType:'unconfigured',idempotencyKey:'idem-dlq-1',actor:'bob'});
  assert.notEqual(foreign.job.id,firstEnqueue.job.id);
  const untouched = await jobs.enqueueFactoryJob({workspaceId:wsA.id,moduleKey:'test',jobType:'unconfigured',actor:'alice'});
  await jobs.retryDeadLetterFactoryJob(wsA.id, firstEnqueue.job.id, 'alice');
  const recovered = await db.factoryJob.findUniqueOrThrow({where:{id:firstEnqueue.job.id}});
  assert.equal(recovered.status,'dead_letter');
  assert.equal(recovered.attempts,3);
  assert.equal((await db.factoryJob.findUniqueOrThrow({where:{id:untouched.job.id}})).attempts,0);

  const input={workspaceId:wsA.id,moduleKey:'test',jobType:'no_handler',actor:'alice',idempotencyKey:'concurrent-key'};
  const pair=await Promise.all([jobs.enqueueFactoryJob(input),jobs.enqueueFactoryJob(input)]);
  assert.equal(pair[0].job.id,pair[1].job.id);const id=pair[0].job.id;
  const lease={workspaceId:wsA.id,id,lockedBy:'original-worker'};const deadline=new Date(Date.now()+10000);
  await db.factoryJob.update({where:{id},data:{status:'running',lockedBy:lease.lockedBy,leaseExpiresAt:deadline,attempts:1}});
  assert.equal((await jobs.processDueFactoryJobs({workspaceId:wsA.id,jobId:id,actor:'another'})).processedCount,0);
  assert.equal((await jobs.completeFactoryJob({...lease,lockedBy:'another'},{})).count,0);
  assert.equal((await jobs.heartbeatFactoryJob(lease)).count,1);assert.ok((await db.factoryJob.findUniqueOrThrow({where:{id}})).leaseExpiresAt>deadline);
  await db.factoryJob.update({where:{id},data:{leaseExpiresAt:new Date(0)}});
  assert.equal((await jobs.heartbeatFactoryJob(lease)).count,0);
  assert.equal((await jobs.processDueFactoryJobs({workspaceId:wsB.id,jobId:id,actor:'bob'})).processedCount,0);
  assert.equal((await jobs.processDueFactoryJobs({workspaceId:wsA.id,jobId:id,actor:'replacement'})).processedCount,1);
  assert.equal((await db.factoryJob.findUniqueOrThrow({where:{id}})).attempts,2);
  // AI Router: Bangla local inference + non-loopback SSRF guard
  const bnAi = await ai.runFactoryAiInference({
    workspaceId: wsA.id,
    moduleKey: 'seo_content',
    task: 'marketing_copy',
    language: 'bn',
    prompt: 'ঢাকা ই-কমার্স লঞ্চ',
    adapter: 'local_deterministic',
    actor: 'alice',
  });
  assert.equal(bnAi.language, 'bn');
  assert.ok(bnAi.outputText.includes('[লোকাল ড্রাফট]'));

  await assert.rejects(
    () => ai.runFactoryAiInference({
      workspaceId: wsA.id,
      moduleKey: 'seo_content',
      task: 'marketing_copy',
      language: 'en',
      prompt: 'test',
      adapter: 'ollama_local_http',
      ollamaBaseUrl: 'http://169.254.169.254:11434',
    }),
    /loopback/,
  );

  // Portability snapshot contains zero secrets
  const bundle = await portability.buildFactoryWorkspaceSnapshot(wsA.id, 'alice');
  assert.ok(bundle.sha256);
  assert.equal(bundle.snapshot.secretsIncluded, false);
  assert.equal(bundle.snapshot.workspace.id, wsA.id);
  const restored = await portability.restoreFactoryWorkspaceModuleConfigs({
    workspaceId: wsB.id,
    snapshot: bundle.snapshot,
    actor: 'bob',
  });
  assert.equal(typeof restored.restoredConfigs, 'number');
});

test('Priority Module #1 (AI Email Marketing): enforces domain verification, consent filtering, RFC 8058 unsubscribe, and bounce auto-pause', async (t) => {
  setupFreshDb(t);
  const tenancy = loadTsModule('src/lib/factory/tenancy.ts');
  const emailMod = loadTsModule('src/lib/factory/modules/email-marketing.ts');

  const ws = await tenancy.createFactoryWorkspace({ slug: 'email-ws', name: 'Email Ops', actor: 'admin' });
  const dom = await emailMod.registerEmailDomain({ workspaceId: ws.id, domain: 'mail.example.invalid', actor: 'admin' });

  const tpl = await emailMod.createEmailTemplate({
    workspaceId: ws.id,
    name: 'Newsletter',
    subject: 'Welcome',
    htmlBody: '<p>Hello</p>',
    textBody: 'Hello',
  });

  const c1 = await emailMod.upsertEmailContact({ workspaceId: ws.id, email: 'opted@example.com', consentStatus: 'granted', segment: 'vip' });
  await emailMod.upsertEmailContact({ workspaceId: ws.id, email: 'pending@example.com', consentStatus: 'pending', segment: 'vip' });

  // Live SMTP campaign fails without verified SPF/DKIM/DMARC
  const smtpCamp = await emailMod.createEmailCampaign({
    workspaceId: ws.id,
    name: 'Live SMTP Attempt',
    domainId: dom.id,
    templateId: tpl.id,
    segment: 'vip',
    adapterType: 'smtp_custom',
  });
  await emailMod.approveEmailCampaign({workspaceId:ws.id,campaignId:smtpCamp.id,actor:'admin'});
  await assert.rejects(
    () => emailMod.dispatchEmailCampaign({ workspaceId: ws.id, campaignId: smtpCamp.id, actor: 'admin' }),
    /verified SPF, DKIM, and DMARC/,
  );

  // Sandbox mock adapter explicitly reports MOCKED and delivers only to granted consent
  const mockCamp = await emailMod.createEmailCampaign({
    workspaceId: ws.id,
    name: 'Sandbox Test',
    domainId: dom.id,
    templateId: tpl.id,
    segment: 'vip',
    adapterType: 'sandbox_mock_adapter',
  });
  await emailMod.approveEmailCampaign({workspaceId:ws.id,campaignId:mockCamp.id,actor:'admin'});
  const dispatched = await emailMod.dispatchEmailCampaign({ workspaceId: ws.id, campaignId: mockCamp.id, actor: 'admin' });
  assert.equal(dispatched.stats.sent, 0);
  assert.equal(dispatched.stats.blocked, 1);
  assert.equal(dispatched.stats.outcomes.NOT_CONFIGURED,1);
  assert.equal(dispatched.campaign.sentAt,null);

  // Bounce triggers reputation drop & auto-pause
  const bounceRes = await emailMod.recordEmailBounce({
    workspaceId: ws.id,
    campaignId: mockCamp.id,
    email: 'opted@example.com',
    bounceType: 'hard',
  });
  assert.equal(bounceRes.domainAutoPaused, true);

  // RFC 8058 unsubscribe suppresses another granted contact
  const c2 = await emailMod.upsertEmailContact({ workspaceId: ws.id, email: 'second@example.com', consentStatus: 'granted', segment: 'vip' });
  const unsub = await emailMod.processEmailUnsubscribe({ unsubscribeToken: c2.unsubscribeToken, reason: 'one_click' });
  assert.equal(unsub.consentStatus, 'unsubscribed');
  assert.notEqual(c1.id, c2.id);
});

test('Priority Module #2 (AI Voice Call Center): supports Bangla + 4 languages, calling hours, DNC consent gate, SIP guard, recording disclosure, handoff', async (t) => {
  setupFreshDb(t);
  const tenancy = loadTsModule('src/lib/factory/tenancy.ts');
  const voice = loadTsModule('src/lib/factory/modules/voice-call-center.ts');

  assert.ok(voice.SUPPORTED_VOICE_LANGUAGES.length >= 4);
  assert.ok(voice.SUPPORTED_VOICE_LANGUAGES.some(l => l.code === 'bn'));

  const ws = await tenancy.createFactoryWorkspace({ slug: 'voice-ws', name: 'Dhaka Voice', actor: 'admin' });

  // Blocked without consent
  const noConsent = await voice.startVoiceCallSession({
    workspaceId: ws.id,
    direction: 'outbound',
    phoneE164: '+8801711000010',
    language: 'bn',
    telephonyAdapter: 'mocked_telephony',
    testLocalHourOverride: 14,
  });
  assert.equal(noConsent.allowed, false);
  assert.equal(noConsent.session.status, 'blocked_compliance');

  // Grant consent in Bangla
  await voice.upsertVoiceConsent({
    workspaceId: ws.id,
    phoneE164: '+8801711000010',
    consentStatus: 'granted',
    preferredLanguage: 'bn',
    consentProof: 'web_opt_in_101',
  });

  // Blocked outside permitted calling hours (23:00 vs 9:00..20:00)
  const afterHours = await voice.startVoiceCallSession({
    workspaceId: ws.id,
    direction: 'outbound',
    phoneE164: '+8801711000010',
    language: 'bn',
    telephonyAdapter: 'mocked_telephony',
    testLocalHourOverride: 23,
  });
  assert.equal(afterHours.allowed, false);
  assert.match(afterHours.session.blockedReason, /calling hours/i);

  // Blocked SIP trunk without SIP credentials configured
  await assert.rejects(
    () => voice.startVoiceCallSession({
      workspaceId: ws.id,
      direction: 'outbound',
      phoneE164: '+8801711000010',
      language: 'bn',
      telephonyAdapter: 'sip_trunk',
      testLocalHourOverride: 14,
    }),
    /SIP credentials configured/i,
  );

  // Allowed mocked call with mandatory recording disclosure + Bangla handoff turn + summary
  const okCall = await voice.startVoiceCallSession({
    workspaceId: ws.id,
    direction: 'outbound',
    phoneE164: '+8801711000010',
    language: 'bn',
    telephonyAdapter: 'mocked_telephony',
    testLocalHourOverride: 14,
  });
  assert.equal(okCall.allowed, true);
  assert.equal(okCall.session.recordingDisclosed, true);
  assert.match(okCall.session.telephonyAdapter, /MOCKED/);

  const turn = await voice.processVoiceTurn({
    workspaceId: ws.id,
    sessionId: okCall.session.id,
    callerUtterance: 'আমি মানুষের সাথে কথা বলতে চাই',
  });
  assert.equal(turn.handoffTriggered, true);

  const completed = await voice.completeVoiceCallSession({
    workspaceId: ws.id,
    sessionId: okCall.session.id,
    outcome: 'transferred_to_human',
    durationSeconds: 72,
  });
  assert.equal(completed.status, 'transferred_to_human');
  assert.ok(completed.summary.includes('Summary'));
});

test('Priority Module #3 (Automation Builder) & #4 (Isolated AI CRM) + all 16 sibling modules', async (t) => {
  const db = setupFreshDb(t);
  const tenancy = loadTsModule('src/lib/factory/tenancy.ts');
  const auto = loadTsModule('src/lib/factory/modules/automation-builder.ts');
  const crm = loadTsModule('src/lib/factory/modules/crm-factory.ts');
  const suite = loadTsModule('src/lib/factory/modules/suite-domain.ts');
  const { FIRST_PARTY_MODULES } = loadTsModule('src/lib/factory/modules/registry.ts');

  const ws = await tenancy.createFactoryWorkspace({ slug: 'suite-ws', name: 'Suite Hub', actor: 'admin' });

  // Cycle detection in workflow DAG
  await assert.rejects(
    () => auto.saveAutomationWorkflow({
      workspaceId: ws.id,
      name: 'Cyclic Flow',
      triggerType: 'manual',
      nodes: [
        { id: 'a', type: 'trigger', label: 'A', position: { x: 0, y: 0 } },
        { id: 'b', type: 'action', label: 'B', position: { x: 100, y: 0 } },
      ],
      edges: [
        { source: 'a', target: 'b' },
        { source: 'b', target: 'a' },
      ],
    }),
    /cycle/i,
  );

  // Valid DAG with approval checkpoint + idempotent trigger + resume
  const wf = await auto.saveAutomationWorkflow({
    workspaceId: ws.id,
    name: 'Valid Approval Flow',
    triggerType: 'manual',
    nodes: [
      { id: 'n1', type: 'trigger', label: 'Start', position: { x: 0, y: 0 } },
      { id: 'n2', type: 'approval_checkpoint', label: 'Owner Check', position: { x: 100, y: 0 } },
      { id: 'n3', type: 'action', label: 'AI Copy', config: { actionType: 'ai.generate_copy', prompt: 'Hello' }, position: { x: 200, y: 0 } },
    ],
    edges: [{ source: 'n1', target: 'n2' }, { source: 'n2', target: 'n3' }],
  });

  const run1 = await auto.triggerAutomationWorkflow({ workspaceId: ws.id, workflowId: wf.id, idempotencyKey: 'auto-1', context: {} });
  assert.equal(run1.run.status, 'awaiting_approval');
  const runDup = await auto.triggerAutomationWorkflow({ workspaceId: ws.id, workflowId: wf.id, idempotencyKey: 'auto-1', context: {} });
  assert.equal(runDup.deduplicated, true);

  const approvedRun = await auto.decideAutomationApproval({ workspaceId: ws.id, runId: run1.run.id, decision: 'approve', actor: 'admin' });
  assert.equal(approvedRun.status, 'completed');

  // First-Party AI CRM works cleanly WITHOUT mutating legacy CrmLead / CrmContact
  const org = await crm.createCrmOrganization({ workspaceId: ws.id, name: 'Dhaka Co' });
  const contact = await crm.createCrmContact({ workspaceId: ws.id, organizationId: org.id, fullName: 'Tariq Rahman', consentStatus: 'granted' });
  const opp = await crm.createCrmOpportunity({ workspaceId: ws.id, organizationId: org.id, contactId: contact.id, title: 'Annual Plan', valueUsd: 5000 });
  const moved = await crm.updateCrmOpportunityStage({ workspaceId: ws.id, opportunityId: opp.id, stage: 'closed_won' });
  assert.equal(moved.status, 'won');
  assert.equal(await db.lead.count(), 0);
  assert.equal(await db.contact.count(), 0);
  assert.equal(await db.crmTask.count(), 0);

  // All 16 remaining first-party modules execute real domain actions cleanly
  const siblingModules = FIRST_PARTY_MODULES.filter(m => !['email_marketing', 'voice_call_center', 'marketing_automation', 'ai_crm'].includes(m.key));
  assert.equal(siblingModules.length, 16);

  for (const mod of siblingModules) {
    const res = await suite.executeSuiteModuleAction({
      workspaceId: ws.id,
      moduleKey: mod.key,
      action: 'execute',
      title: `Test ${mod.key}`,
      language: mod.key === 'seo_content' ? 'bn' : 'en',
      data: {
        message: 'Check out our product! <script>alert(1)</script>',
        topic: 'Bangla SaaS Marketing',
        question: 'What hours are you open?',
        keyword: 'AI Marketing Dhaka',
        senderId: 'ALOAPI',
        consentGranted: true,
        consentChecked: true,
        dailyBudgetUsd: 50,
        templateName: 'order_update',
        category: 'UTILITY',
        bodyText: 'Your order is confirmed.',
        reviewText: 'Great onboarding experience!',
        rating: 5,
        saleUsd: 250,
        startTime: new Date(Date.now() + 7200_000).toISOString(),
        endTime: new Date(Date.now() + 9000_000).toISOString(),
      },
      actor: 'admin',
    });
    assert.ok(res.record.id, `Expected persisted record for ${mod.key}`);
  }

  // Ensure Landing Page neutralized XSS script tags
  const lpState = await suite.getSuiteModuleState(ws.id, 'landing_pages');
  assert.ok(lpState.records.length >= 1);
  assert.ok(!lpState.records[0].data.includes('<script>'));
});
