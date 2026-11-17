import Link from 'next/link';
import EngineeringHub from '@/components/engineering/engineering-hub';

export default function EngineeringWorkspacePage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-4 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>ALOAPI Autonomous Integration Engineering</span>
          <div className="flex gap-3">
            <Link href="/factory" className="text-cyan-400 hover:underline">Platform Factory (20)</Link>
            <Link href="/" className="text-cyan-400 hover:underline">&larr; Main Admin Console</Link>
          </div>
        </div>
        <EngineeringHub />
      </div>
    </main>
  );
}
