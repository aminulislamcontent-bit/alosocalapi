import dns from 'node:dns/promises';
import { db } from '@/lib/db';
import { auditEvent } from '@/lib/security/audit';

export interface DnsExpectedRecord {
  type: 'TXT' | 'CNAME' | 'MX';
  host: string;
  expectedValueSubstring: string;
  purpose: string;
}

export interface DnsRecordCheckResult {
  type: 'TXT' | 'CNAME' | 'MX';
  host: string;
  expectedValueSubstring: string;
  purpose: string;
  observedValues: string[];
  matched: boolean;
  error?: string;
}

export interface DnsResolverAdapter {
  resolveTxt: (hostname: string) => Promise<string[][]>;
  resolveCname: (hostname: string) => Promise<string[]>;
  resolveMx: (hostname: string) => Promise<{ exchange: string; priority: number }[]>;
}

const DEFAULT_RESOLVER: DnsResolverAdapter = {
  resolveTxt: hostname => dns.resolveTxt(hostname),
  resolveCname: hostname => dns.resolveCname(hostname),
  resolveMx: hostname => dns.resolveMx(hostname),
};

export async function verifyLiveDnsRecords(params: {
  domain: string;
  expectedRecords: DnsExpectedRecord[];
  resolver?: DnsResolverAdapter;
}): Promise<{
  domain: string;
  verified: boolean;
  status: 'DNS_LIVE_VERIFIED' | 'DNS_RECORDS_NOT_OBSERVED';
  checkedAt: string;
  results: DnsRecordCheckResult[];
}> {
  const resolver = params.resolver ?? DEFAULT_RESOLVER;
  const results: DnsRecordCheckResult[] = [];

  for (const rec of params.expectedRecords) {
    const fqdn = rec.host === '@' ? params.domain : rec.host.endsWith(params.domain) ? rec.host : `${rec.host}.${params.domain}`;
    try {
      let observed: string[] = [];
      if (rec.type === 'TXT') {
        const txtGroups = await resolver.resolveTxt(fqdn);
        observed = txtGroups.map(chunks => chunks.join(''));
      } else if (rec.type === 'CNAME') {
        observed = await resolver.resolveCname(fqdn);
      } else if (rec.type === 'MX') {
        const mx = await resolver.resolveMx(fqdn);
        observed = mx.map(m => m.exchange);
      }
      const needle = rec.expectedValueSubstring.toLowerCase();
      const matched = observed.some(v => v.toLowerCase().includes(needle));
      results.push({
        type: rec.type,
        host: fqdn,
        expectedValueSubstring: rec.expectedValueSubstring,
        purpose: rec.purpose,
        observedValues: observed,
        matched,
      });
    } catch (err) {
      results.push({
        type: rec.type,
        host: fqdn,
        expectedValueSubstring: rec.expectedValueSubstring,
        purpose: rec.purpose,
        observedValues: [],
        matched: false,
        error: err instanceof Error ? err.message : 'DNS resolution failed',
      });
    }
  }

  const allMatched = results.length > 0 && results.every(r => r.matched);
  return {
    domain: params.domain,
    verified: allMatched,
    status: allMatched ? 'DNS_LIVE_VERIFIED' : 'DNS_RECORDS_NOT_OBSERVED',
    checkedAt: new Date().toISOString(),
    results,
  };
}

export async function verifyProjectProviderDns(params: {
  projectId: string;
  providerKey: string;
  resolver?: DnsResolverAdapter;
  actor: string;
}) {
  const project = await db.integrationProject.findUnique({ where: { id: params.projectId } });
  if (!project) throw new Error('IntegrationProject not found.');

  const oauthApp = await db.oAuthAppRegistryEntry.findUnique({
    where: { projectId_providerKey: { projectId: params.projectId, providerKey: params.providerKey } },
  });
  const storedRecords = (() => {
    try {
      return JSON.parse(oauthApp?.dnsRecordsJson || '[]') as { type: 'TXT' | 'CNAME'; host: string; valueHint: string; purpose: string }[];
    } catch {
      return [];
    }
  })();

  const expectedRecords: DnsExpectedRecord[] = storedRecords.length > 0
    ? storedRecords.map(r => ({
        type: r.type,
        host: r.host,
        expectedValueSubstring: r.type === 'TXT' && r.host === '@' ? 'v=spf1' : r.host.includes('_dmarc') ? 'v=DMARC1' : r.valueHint,
        purpose: r.purpose,
      }))
    : [
        { type: 'TXT', host: '@', expectedValueSubstring: 'v=spf1', purpose: 'SPF baseline verification' },
        { type: 'TXT', host: '_dmarc', expectedValueSubstring: 'v=DMARC1', purpose: 'DMARC baseline verification' },
      ];

  const report = await verifyLiveDnsRecords({
    domain: project.domain,
    expectedRecords,
    resolver: params.resolver,
  });

  if (oauthApp && report.verified) {
    await db.oAuthAppRegistryEntry.update({
      where: { id: oauthApp.id },
      data: { verificationStatus: 'VERIFIED' },
    });
  }

  await auditEvent({
    actor: params.actor,
    action: 'engineering.dns.verified',
    target: `${project.id}:${params.providerKey}`,
    providerKey: params.providerKey,
    metadata: { domain: project.domain, verified: report.verified, status: report.status },
  });

  return report;
}
