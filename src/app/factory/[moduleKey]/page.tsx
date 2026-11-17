import Link from 'next/link';
import { notFound } from 'next/navigation';
import CommandCenter from '@/components/factory/command-center';
import { FIRST_PARTY_MODULE_KEYS, getFirstPartyModule } from '@/lib/factory/modules/registry';

export function generateStaticParams() {
  return FIRST_PARTY_MODULE_KEYS.map(moduleKey => ({ moduleKey }));
}

export default async function FactoryModulePage({
  params,
}: {
  params: Promise<{ moduleKey: string }>;
}) {
  const { moduleKey } = await params;
  const mod = getFirstPartyModule(moduleKey);
  if (!mod) notFound();

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-4 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
          <span>ALOAPI First-Party Module #{mod.order}: <strong className="text-white">{mod.name}</strong></span>
          <div className="flex gap-3">
            <Link href="/factory" className="text-cyan-400 hover:underline">All 20 Modules</Link>
            <Link href="/" className="text-cyan-400 hover:underline">&larr; Main Admin Console</Link>
          </div>
        </div>
        <CommandCenter initialModuleKey={mod.key} />
      </div>
    </main>
  );
}
