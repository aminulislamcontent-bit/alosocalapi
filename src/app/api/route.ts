import { NextResponse } from 'next/server';
import metadata from '../../../package.json';

export async function GET() {
  return NextResponse.json({
    service: 'ALOAPI',
    version: metadata.version,
    health: '/api/health',
    authentication: '/api/auth/login',
    localOnly: true,
    note: 'Administrative HTTP API is intended for the loopback-bound local service.',
  }, { headers: { 'Cache-Control': 'no-store' } });
}
