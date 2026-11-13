// ALO Education BD — one-time staging seed (idempotent)
// Creates: master client account with ALL 13 platforms, built-in automation
// rules, knowledge base entries, demo CRM pipeline data.
import { PrismaClient } from '@prisma/client';
import { randomBytes, scryptSync } from 'crypto';

const db = new PrismaClient();

const hash = (pw) => {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(pw, salt, 64).toString('hex')}`;
};

const ALL_13 = [
  'facebook', 'instagram', 'whatsapp', 'messenger', 'tiktok', 'youtube',
  'linkedin', 'x', 'pinterest', 'telegram', 'google_ads', 'google_analytics', 'website',
];

const BUILT_INS = [
  { name: 'নতুন লিড → WhatsApp স্বাগতম মেসেজ', trigger: 'lead_created', action: 'log_interaction',
    payload: { channel: 'whatsapp', body: 'স্বাগতম {name}! ALO Education BD-তে {course}-এ আগ্রহের জন্য ধন্যবাদ। আমাদের প্রতিনিধি শীঘ্রই {phone} নম্বরে যোগাযোগ করবেন ইনশাআল্লাহ।' } },
  { name: 'নতুন লিড → ২৪ ঘণ্টায় ফলো-আপ কল', trigger: 'lead_created', action: 'create_task',
    payload: { title: 'ফলো-আপ কল দিন: {name} ({course})', dueInHours: 24, priority: 'high' } },
  { name: 'ডেমো স্টেজে → ডেমো রিমাইন্ডার টাস্ক', trigger: 'stage_changed', condition: 'demo', action: 'create_task',
    payload: { title: 'ডেমো ক্লাসের সময় নিশ্চিত করুন: {name}', dueInHours: 2, priority: 'high' } },
  { name: 'ভর্তি হলে → ডকুমেন্ট চেকলিস্ট টাস্ক', trigger: 'stage_changed', condition: 'enrolled', action: 'create_task',
    payload: { title: 'ভর্তির ডকুমেন্ট ও ফি সংগ্রহ করুন: {name}', dueInHours: 48, priority: 'high' } },
  { name: 'ভর্তি হলে → অভিনন্দন লগ', trigger: 'stage_changed', condition: 'enrolled', action: 'log_interaction',
    payload: { channel: 'system', body: 'অভিনন্দন! {name} সফলভাবে {course}-এ ভর্তি সম্পন্ন করেছেন। পরবর্তী ব্যাচের শিডিউল জানিয়ে দিন।' } },
  { name: 'লিড হারালে → ৩০ দিন পর রি-এনগেজ', trigger: 'stage_changed', condition: 'lost', action: 'create_task',
    payload: { title: 'রি-এনগেজমেন্ট কল: {name} — নতুন অফার জানান', dueInHours: 720, priority: 'low' } },
];

const KB = [
  { title: 'IELTS প্রস্তুতি ব্যাচ — ফি ২০২৬', category: 'fee', body: 'রেগুলার ফি: ৮,০০০ টাকা (৩ মাস)। ভর্তির সময় ২ কিস্তিতে দেওয়া যায়। পুরনো শিক্ষার্থীদের ১০% ছাড়। YouTube সাবস্ক্রাইবারদের জন্য ৫০০ টাকা ডিসকাউন্ট কোড: ALO2026।' },
  { title: 'HSC ভর্তি প্রস্তুতি (বিজ্ঞান) — ফি', category: 'fee', body: 'সম্পূর্ণ কোর্স: ১২,০০০ টাকা (১১ মাস)। মাসিক ১,২০০ টাকা কিস্তিতেও দেওয়া যায়। ফি-এর সাথে সব নোট ও এক্সাম ফি অন্তর্ভুক্ত।' },
  { title: 'ব্যাচ শিডিউল — চলমান', category: 'schedule', body: 'IELTS ব্যাচ-১২: শনি-সোম-বুধ, রাত ৮টা (অনলাইন)। HSC ব্যাচ: শুক্র-শনি, সকাল ১০টা (অনলাইন)। WhatsApp গ্রুপে ক্লাস লিংক দেওয়া হয়।' },
  { title: 'ভর্তি পলিসি', category: 'policy', body: 'প্রথম ক্লাস ফ্রি ডেমো। ভর্তির পর প্রথম ৭ দিনের মধ্যে বাতিল করলে ৮০% রিফান্ড। সব ক্লাস রেকর্ড করা হয় — মিস করলে রেকর্ডিং পাওয়া যাবে।' },
];

async function main() {
  console.log('— ALO Education BD seed শুরু —');

  // 1) Master client account with ALL 13 platforms
  const exists = await db.clientAccount.findUnique({ where: { username: 'aloeducation' } });
  let pw = null;
  if (!exists) {
    pw = 'Alo-2026-Edu';
    await db.clientAccount.create({
      data: {
        name: 'আলো এডুকেশন (মাস্টার)',
        business: 'ALO Education BD',
        phone: '+8801805020101',
        username: 'aloeducation',
        passwordHash: hash(pw),
        status: 'active',
        platforms: JSON.stringify(ALL_13),
        note: 'মাস্টার অ্যাকাউন্ট — নিজের সব প্ল্যাটফর্মের ক্রেডেনশিয়াল সংগ্রহের জন্য (১৩/১৩)',
      },
    });
    console.log('✅ মাস্টার অ্যাকাউন্ট তৈরি: aloeducation / ' + pw + ' (১৩ প্ল্যাটফর্ম)');
  } else {
    console.log('ℹ️  মাস্টার অ্যাকাউন্ট আগেই আছে (username: aloeducation)');
  }

  // 2) Built-in automation rules
  let rules = 0;
  for (const r of BUILT_INS) {
    const has = await db.automationRule.findFirst({ where: { name: r.name } });
    if (has) continue;
    await db.automationRule.create({
      data: { name: r.name, trigger: r.trigger, condition: r.condition ?? null, action: r.action, payload: JSON.stringify(r.payload), enabled: true, builtIn: true },
    });
    rules++;
  }
  console.log(`✅ অটোমেশন নিয়ম: ${rules}টি নতুন, মোট ${await db.automationRule.count()}টি`);

  // 3) Knowledge base
  let kb = 0;
  for (const e of KB) {
    const has = await db.knowledgeEntry.findFirst({ where: { title: e.title } });
    if (has) continue;
    await db.knowledgeEntry.create({ data: e });
    kb++;
  }
  console.log(`✅ নলেজ বেস: ${kb}টি নতুন, মোট ${await db.knowledgeEntry.count()}টি`);

  // 4) Demo CRM pipeline data (only if empty)
  if ((await db.contact.count()) === 0) {
    const now = Date.now();
    const mk = async (name, phone, source, grade, title, course, stage, value, daysAgo) => {
      const c = await db.contact.create({
        data: { name, phone, source, grade, kind: 'student', createdAt: new Date(now - daysAgo * 86400e3) },
      });
      const l = await db.lead.create({
        data: { contactId: c.id, title, course, stage, value, createdAt: new Date(now - daysAgo * 86400e3) },
      });
      return { c, l };
    };

    const a = await mk('তানভীর আহমেদ', '+8801711223344', 'youtube', 'HSC ২০২৭', 'HSC ভর্তি প্রস্তুতি ব্যাচে ভর্তি চাই', 'HSC ভর্তি প্রস্তুতি', 'new', 12000, 0);
    await db.interaction.create({ data: { contactId: a.c.id, leadId: a.l.id, channel: 'whatsapp', origin: 'manual', body: 'YouTube ভিডিও দেখে ইনবক্স করেছে — ফি ও শিডিউল জানতে চেয়েছে।' } });

    const b = await mk('সাদিয়া ইসলাম', '+8801822334455', 'facebook', 'IELTS', 'IELTS ব্যাচ-১২ এ ভর্তি', 'IELTS প্রস্তুতি', 'demo', 8000, 2);
    await db.interaction.create({ data: { contactId: b.c.id, leadId: b.l.id, channel: 'call', origin: 'manual', body: 'ডেমো ক্লাসে অংশ নিয়েছে — শিক্ষক পদ্ধতি পছন্দ হয়েছে। শুক্রবার ফাইনাল সিদ্ধান্ত জানাবে।' } });

    const c1 = await mk('রফিকুল হাসান', '+8801933445566', 'referral', 'IELTS', 'IELTS ব্যাচে ভর্তি (রেফারেল: সাদিয়া)', 'IELTS প্রস্তুতি', 'negotiated', 8000, 5);
    await db.interaction.create({ data: { contactId: c1.c.id, leadId: c1.l.id, channel: 'call', origin: 'manual', body: '৫০০ টাকা ডিসকাউন্ট চেয়েছে — ALO2026 কোড দেওয়া হয়েছে। আগামীকাল কনফার্ম করবে।' } });
    await db.crmTask.create({ data: { title: 'রফিকুল হাসান-কে কনফার্মেশন কল দিন', dueAt: new Date(now - 2 * 3600e3), priority: 'high', contactId: c1.c.id, leadId: c1.l.id, origin: 'manual' } });

    const d = await mk('মেহেদী হাসান', '+8801644556677', 'walk_in', 'Class 9-10', 'ফিজিক্স স্পেশাল কেয়ার ব্যাচ', 'ফিজিক্স', 'enrolled', 6000, 8);
    await db.interaction.create({ data: { contactId: d.c.id, leadId: d.l.id, channel: 'system', origin: 'manual', body: 'ভর্তি সম্পন্ন — প্রথম মাসের ফি পরিশোধ করেছে।' } });

    console.log('✅ ডেমো CRM ডেটা: ৪ কন্টাক্ট, ৪ লিড (new/demo/negotiated/enrolled), ৩ ইন্টার‍্যাকশন, ১ ওভারডিউ টাস্ক');
  } else {
    console.log('ℹ️  CRM ডেটা আগেই আছে — ডেমো ডেটা স্কিপ');
  }

  console.log('— সিড সম্পন্ন —');
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
