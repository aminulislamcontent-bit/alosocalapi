import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';

const db = new PrismaClient();

// ─── Dynamic industry taxonomy seed (§2) — bilingual, admin-extensible ──

const TAXONOMY = [
  {
    slug: 'education', nameEn: 'Education & study abroad', nameBn: 'শিক্ষা ও স্টাডি অ্যাব্রোড', level: 1, parent: null,
    keywords: ['education', 'school', 'coaching', 'academy', 'study abroad', 'university', 'admission', 'tuition', 'scholarship', 'শিক্ষা', 'কোচিং', 'ভর্তি', 'স্কুল', 'একাডেমি', 'স্টাডি অ্যাব্রোড', 'বৃত্তি'],
    subs: [
      { slug: 'study_abroad_consultancy', nameEn: 'Study abroad consultancy', nameBn: 'স্টাডি অ্যাব্রোড কনসালট্যান্সি', keywords: ['study abroad', 'consultancy', 'consultant', 'student visa', 'visa processing', 'education consultancy', 'overseas education', 'স্টাডি অ্যাব্রোড', 'ভিসা', 'বিদেশে পড়াশোনা'] },
      { slug: 'language_test_prep', nameEn: 'Language & test preparation', nameBn: 'ভাষা ও টেস্ট প্রস্তুতি', keywords: ['ielts', 'toefl', 'pte', 'language test', 'english course', 'test preparation', 'আইইএলটিএস', 'ভাষা কোর্স'] },
      { slug: 'school_k12', nameEn: 'School & K-12', nameBn: 'স্কুল ও কে-১২', keywords: ['school', 'kindergarten', 'high school', 'k-12', 'playgroup', 'স্কুল', 'কিন্ডারগার্টেন'] },
      { slug: 'tutoring', nameEn: 'Tutoring & coaching center', nameBn: 'টিউশন ও কোচিং সেন্টার', keywords: ['tuition', 'tutor', 'coaching center', 'private tutor', 'টিউশন', 'টিউটর'] },
    ],
  },
  {
    slug: 'healthcare', nameEn: 'Healthcare & wellness', nameBn: 'স্বাস্থ্য ও ওয়েলনেস', level: 1, parent: null,
    keywords: ['healthcare', 'hospital', 'clinic', 'doctor', 'medical', 'pharmacy', 'diagnostics', 'dental', 'স্বাস্থ্য', 'হাসপাতাল', 'ক্লিনিক', 'ডাক্তার', 'ফার্মেসি'],
    subs: [
      { slug: 'hospitals_clinics', nameEn: 'Hospitals & clinics', nameBn: 'হাসপাতাল ও ক্লিনিক', keywords: ['hospital', 'clinic', 'medical center', 'হাসপাতাল', 'ক্লিনিক'] },
      { slug: 'diagnostics', nameEn: 'Diagnostics & labs', nameBn: 'ডায়াগনস্টিক ও ল্যাব', keywords: ['diagnostic', 'laboratory', 'pathology', 'imaging', 'ডায়াগনস্টিক', 'ল্যাব'] },
      { slug: 'pharmacy', nameEn: 'Pharmacy', nameBn: 'ফার্মেসি', keywords: ['pharmacy', 'drug store', 'medicine shop', 'ফার্মেসি', 'ঔষধ'] },
      { slug: 'telemedicine', nameEn: 'Telemedicine & health tech', nameBn: 'টেলিমেডিসিন ও হেলথ টেক', keywords: ['telemedicine', 'health app', 'online doctor', 'টেলিমেডিসিন'] },
    ],
  },
  {
    slug: 'real_estate', nameEn: 'Real estate & construction', nameBn: 'রিয়েল এস্টেট ও নির্মাণ', level: 1, parent: null,
    keywords: ['real estate', 'developer', 'construction', 'property', 'apartment', 'housing', 'land', 'রিয়েল এস্টেট', 'প্রপার্টি', 'ফ্ল্যাট', 'নির্মাণ', 'আবাসন'],
    subs: [
      { slug: 'developers', nameEn: 'Property developers', nameBn: 'প্রপার্টি ডেভেলপার', keywords: ['developer', 'real estate company', 'housing ltd', 'ডেভেলপার'] },
      { slug: 'agencies_brokers', nameEn: 'Agencies & brokers', nameBn: 'এজেন্সি ও ব্রোকার', keywords: ['real estate agency', 'broker', 'property listing', 'ব্রোকার'] },
      { slug: 'construction_contractors', nameEn: 'Construction contractors', nameBn: 'নির্মাণ ঠিকাদার', keywords: ['construction company', 'contractor', 'civil works', 'ঠিকাদার'] },
      { slug: 'interior_design', nameEn: 'Interior & architecture', nameBn: 'ইন্টেরিয়র ও স্থাপত্য', keywords: ['interior design', 'architecture firm', 'ইন্টেরিয়র', 'স্থপতি'] },
    ],
  },
  {
    slug: 'software', nameEn: 'Software & technology', nameBn: 'সফটওয়্যার ও প্রযুক্তি', level: 1, parent: null,
    keywords: ['software', 'saas', 'technology', 'it services', 'app development', 'web development', 'tech', 'data', 'cloud', 'সফটওয়্যার', 'প্রযুক্তি', 'আইটি'],
    subs: [
      { slug: 'saas_products', nameEn: 'SaaS products', nameBn: 'সাস প্রোডাক্ট', keywords: ['saas', 'platform', 'software company', 'সাস'] },
      { slug: 'it_services', nameEn: 'IT services & outsourcing', nameBn: 'আইটি সার্ভিস ও আউটসোর্সিং', keywords: ['it services', 'outsourcing', 'software development company', 'আইটি সার্ভিস'] },
      { slug: 'web_agencies', nameEn: 'Web & app agencies', nameBn: 'ওয়েব ও অ্যাপ এজেন্সি', keywords: ['web development', 'app development', 'digital agency', 'ওয়েব ডেভেলপমেন্ট'] },
    ],
  },
  {
    slug: 'ecommerce_retail', nameEn: 'E-commerce & retail', nameBn: 'ই-কমার্স ও রিটেইল', level: 1, parent: null,
    keywords: ['ecommerce', 'e-commerce', 'retail', 'shop', 'store', 'marketplace', 'online shopping', 'fashion brand', 'ই-কমার্স', 'দোকান', 'বিক্রয়', 'অনলাইন শপ'],
    subs: [],
  },
  {
    slug: 'finance_professional', nameEn: 'Finance & professional services', nameBn: 'ফাইন্যান্স ও প্রফেশনাল সার্ভিস', level: 1, parent: null,
    keywords: ['finance', 'bank', 'insurance', 'accounting', 'audit', 'tax', 'investment', 'leasing', 'ফাইন্যান্স', 'ব্যাংক', 'ইনস্যুরেন্স', 'হিসাব', 'ট্যাক্স'],
    subs: [],
  },
  {
    slug: 'travel_hospitality', nameEn: 'Travel & hospitality', nameBn: 'ট্রাভেল ও হসপিটালিটি', level: 1, parent: null,
    keywords: ['travel', 'travel agency', 'tour operator', 'hotel', 'resort', 'hospitality', 'airline', 'ট্রাভেল', 'হোটেল', 'রিসোর্ট', 'ট্যুর'],
    subs: [],
  },
  {
    slug: 'manufacturing', nameEn: 'Manufacturing & wholesale', nameBn: 'ম্যানুফ্যাকচারিং ও পাইকারি', level: 1, parent: null,
    keywords: ['manufacturing', 'manufacturer', 'factory', 'wholesale', 'supplier', 'industrial', 'textile', 'garments', 'ম্যানুফ্যাকচারিং', 'কারখানা', 'পাইকারি', 'গার্মেন্টস', 'সরবরাহকারী'],
    subs: [],
  },
  {
    slug: 'logistics', nameEn: 'Logistics & transportation', nameBn: 'লজিস্টিকস ও পরিবহন', level: 1, parent: null,
    keywords: ['logistics', 'courier', 'freight', 'shipping', 'transport', 'delivery service', 'supply chain', 'লজিস্টিকস', 'কুরিয়ার', 'পরিবহন', 'শিপিং'],
    subs: [],
  },
  {
    slug: 'legal_consulting', nameEn: 'Legal & consulting', nameBn: 'আইন ও কনসালটিং', level: 1, parent: null,
    keywords: ['law firm', 'law', 'attorney', 'legal', 'consulting', 'consultant', 'chamber', 'আইন', 'অ্যাটর্নি', 'কনসালটিং'],
    subs: [],
  },
  {
    slug: 'agriculture_food', nameEn: 'Agriculture & food', nameBn: 'কৃষি ও খাদ্য', level: 1, parent: null,
    keywords: ['agriculture', 'agro', 'farm', 'food', 'food processing', 'dairy', 'fisheries', 'poultry', 'seed', 'কৃষি', 'খামার', 'খাদ্য', 'ডেইরি', 'মৎস্য'],
    subs: [],
  },
  {
    slug: 'automotive', nameEn: 'Automotive', nameBn: 'অটোমোটিভ', level: 1, parent: null,
    keywords: ['automotive', 'car dealer', 'auto parts', 'workshop', 'garage', 'vehicle', 'ev', 'অটোমোটিভ', 'গাড়ি', 'গ্যারেজ', 'মেকানিক'],
    subs: [],
  },
  {
    slug: 'beauty_lifestyle', nameEn: 'Beauty & lifestyle', nameBn: 'বিউটি ও লাইফস্টাইল', level: 1, parent: null,
    keywords: ['beauty', 'salon', 'parlour', 'spa', 'cosmetics', 'fitness', 'gym', 'wellness', 'বিউটি', 'সেলুন', 'স্পা', 'জিম'],
    subs: [],
  },
  {
    slug: 'nonprofit', nameEn: 'Non-profit & community', nameBn: 'এনজিও ও কমিউনিটি', level: 1, parent: null,
    keywords: ['ngo', 'foundation', 'charity', 'nonprofit', 'non-profit', 'social enterprise', 'community', 'এনজিও', 'ফাউন্ডেশন', 'চ্যারিটি', 'সমাজসেবা'],
    subs: [],
  },
  {
    slug: 'media_marketing', nameEn: 'Media, marketing & creative', nameBn: 'মিডিয়া ও মার্কেটিং', level: 1, parent: null,
    keywords: ['marketing', 'marketing agency', 'advertising', 'media', 'printing', 'event management', 'creative agency', 'মার্কেটিং', 'বিজ্ঞাপন', 'মিডিয়া', 'ইভেন্ট'],
    subs: [],
  },
];

async function main() {
  let cats = 0;
  let subs = 0;
  for (const cat of TAXONOMY) {
    await db.industryTaxonomy.upsert({
      where: { slug: cat.slug },
      update: { nameEn: cat.nameEn, nameBn: cat.nameBn, keywords: JSON.stringify(cat.keywords) },
      create: {
        slug: cat.slug,
        nameEn: cat.nameEn,
        nameBn: cat.nameBn,
        level: 1,
        keywords: JSON.stringify(cat.keywords),
        custom: false,
      },
    });
    cats++;
    for (const sub of cat.subs ?? []) {
      await db.industryTaxonomy.upsert({
        where: { slug: sub.slug },
        update: { nameEn: sub.nameEn, nameBn: sub.nameBn, parentSlug: cat.slug, keywords: JSON.stringify(sub.keywords) },
        create: {
          slug: sub.slug,
          nameEn: sub.nameEn,
          nameBn: sub.nameBn,
          parentSlug: cat.slug,
          level: 2,
          keywords: JSON.stringify(sub.keywords),
          custom: false,
        },
      });
      subs++;
    }
  }
  console.log(`taxonomy: ${cats} categories, ${subs} sub-industries`);

  // Countries from maintained dataset (scripts/data/countries.json)
  const countries = JSON.parse(readFileSync(new URL('./data/countries.json', import.meta.url), 'utf-8'));
  let n = 0;
  for (const c of countries) {
    await db.geoCountry.upsert({
      where: { code: c.code },
      update: { nameEn: c.nameEn, nameBn: c.nameBn, region: c.region, currency: c.currency },
      create: { code: c.code, nameEn: c.nameEn, nameBn: c.nameBn, region: c.region, currency: c.currency },
    });
    n++;
  }
  console.log(`geo: ${n} countries`);

  const tc = await db.industryTaxonomy.count();
  const gc = await db.geoCountry.count();
  console.log(`TOTALS: taxonomy=${tc}, countries=${gc}`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
