// Seed ALO Education BD's OWN known info into the master account (aloeducation).
// Idempotent: upserts known values only; leaves ID/token fields pending for
// the owner to collect via the Bengali-guided portal.
//   node scripts/seed-alo-info.mjs

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const KNOWN = [
  // Facebook — page identity (URL is known; ID/token must come from Meta Business)
  {
    platform: 'facebook',
    fieldKey: 'page_url',
    value: 'https://www.facebook.com/ALOLearningJourney',
  },
  // WhatsApp — business number given by owner (+880 1805-020103)
  {
    platform: 'whatsapp',
    fieldKey: 'wa_display_phone',
    value: '+880 1805-020103',
  },
  // Website — primary domain from brand info
  {
    platform: 'website',
    fieldKey: 'web_domain',
    value: 'aloeducation.bd',
  },
  // YouTube — official channel
  {
    platform: 'youtube',
    fieldKey: 'yt_channel_url',
    value: 'https://www.youtube.com/@aloeducationbd',
  },
];

// Legacy/mistyped keys to remove if present (self-heal on re-run)
const STALE = ['website_url', 'channel_url'];

async function main() {
  const client = await prisma.clientAccount.findUnique({
    where: { username: 'aloeducation' },
    select: { id: true, username: true },
  });
  if (!client) {
    console.error('ERROR: master account "aloeducation" not found. Run scripts/seed-alo.mjs first.');
    process.exit(1);
  }

  for (const fieldKey of STALE) {
    const gone = await prisma.credentialEntry.deleteMany({
      where: { clientId: client.id, fieldKey },
    });
    if (gone.count) console.log(`removed stale fieldKey: ${fieldKey}`);
  }

  for (const item of KNOWN) {
    const entry = await prisma.credentialEntry.upsert({
      where: {
        clientId_platform_fieldKey: {
          clientId: client.id,
          platform: item.platform,
          fieldKey: item.fieldKey,
        },
      },
      update: { value: item.value, status: 'collected' },
      create: { ...item, clientId: client.id, status: 'collected' },
    });
    console.log(`upserted ${item.platform}.${item.fieldKey} = ${entry.value} (${entry.status})`);
  }

  const total = await prisma.credentialEntry.count({ where: { clientId: client.id } });
  console.log(`\nOK — aloeducation now has ${total} entries (known info pre-filled, tokens pending).`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
