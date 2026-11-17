import Link from 'next/link';
import CommandCenter from '@/components/factory/command-center';

export default function FactoryHubPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-4 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>ALOAPI Platform Factory</span>
          <Link href="/" className="text-cyan-400 hover:underline">&larr; Back to Main Admin Console</Link>
        </div>
        <CommandCenter />
      </div>
    </main>
  );
}
