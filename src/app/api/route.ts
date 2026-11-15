import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    service: 'ALOAPI',
    version: '0.1.0',
    health: '/api/health',
    authentication: '/api/auth/login',
    localOnly: true,
    note: 'Administrative HTTP API is intended for the loopback-bound local service.',
  }, { headers: { 'Cache-Control': 'no-store' } });
}
