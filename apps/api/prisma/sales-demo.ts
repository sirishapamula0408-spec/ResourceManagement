/**
 * Sample sales team and pipeline. Used by the main seed, and runnable on its own against an
 * existing database (it only ADDS data):
 *
 *   npm run db:demo:sales               add the sales users and their leads
 *   npm run db:demo:sales -- --remove   delete them again
 *
 * Sales logins (development only): rohan.gupta@ / ananya.iyer@resourceboard.local, Sales@12345.
 */
import bcrypt from 'bcryptjs';
import { pathToFileURL } from 'node:url';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import type { LeadPriority, LeadSource, LeadStage } from '../src/generated/prisma/enums.js';

export const SALES_PASSWORD = 'Sales@12345';
const SALES_PEOPLE = [
  { name: 'Rohan Gupta', email: 'rohan.gupta@resourceboard.local', title: 'Sales Manager' },
  { name: 'Ananya Iyer', email: 'ananya.iyer@resourceboard.local', title: 'Account Executive' },
];

// [company, contact, source, stage, priority, value (INR), close in days, follow-up in days, owner, notes]
type LeadSpec = [
  string,
  string,
  LeadSource,
  LeadStage,
  LeadPriority,
  number | null,
  number | null,
  number | null,
  0 | 1 | null, // owner: Rohan, Ananya or nobody
  string,
];
const LEADS: LeadSpec[] = [
  [
    'Kaveri Finance',
    'Meghna Rao',
    'REFERRAL',
    'NEGOTIATION',
    'HIGH',
    4_800_000,
    14,
    1,
    0,
    'Loan origination portal; legal reviewing the MSA.',
  ],
  [
    'Trident Logistics',
    'Arvind Menon',
    'EVENT',
    'PROPOSAL',
    'HIGH',
    2_600_000,
    30,
    2,
    1,
    'Fleet tracking dashboard. Proposal sent on Monday.',
  ],
  [
    'Bluepeak Insurance',
    'Sara Thomas',
    'WEBSITE',
    'QUALIFIED',
    'MEDIUM',
    1_500_000,
    45,
    3,
    0,
    'Claims workflow modernisation; budget confirmed for Q1.',
  ],
  [
    'Nimbus Retail',
    'Karan Shah',
    'OUTBOUND',
    'CONTACTED',
    'MEDIUM',
    900_000,
    60,
    -2,
    1,
    'Interested in a mobile loyalty app; follow-up overdue.',
  ],
  [
    'Orchid Health',
    'Dr. Leena Pillai',
    'PARTNER',
    'QUALIFIED',
    'HIGH',
    3_200_000,
    35,
    0,
    1,
    'Patient portal and appointment booking.',
  ],
  [
    'Granite Steel',
    'Vikram Desai',
    'OUTBOUND',
    'NEW',
    'LOW',
    600_000,
    90,
    7,
    0,
    'Inbound reply to the manufacturing campaign.',
  ],
  [
    'Saffron Foods',
    'Priyanka Nair',
    'WEBSITE',
    'NEW',
    'MEDIUM',
    null,
    null,
    4,
    1,
    'Asked for a call about inventory analytics.',
  ],
  [
    'Zenith Telecom',
    'Rahul Bose',
    'REFERRAL',
    'WON',
    'HIGH',
    5_500_000,
    -6,
    null,
    0,
    'Signed. Hand over to delivery for kick-off.',
  ],
  [
    'Coral Bank',
    'Anita Kulkarni',
    'EVENT',
    'LOST',
    'MEDIUM',
    2_000_000,
    -20,
    null,
    1,
    'Core banking integration.',
  ],
  [
    'Evergreen Education',
    'Joseph Mathew',
    'PARTNER',
    'PROPOSAL',
    'LOW',
    750_000,
    40,
    5,
    0,
    'LMS migration; small first phase.',
  ],
];

// A wider pipeline for testing: paging, filters, sorting and the summary tiles. Covers follow-ups
// due today / overdue / upcoming / none, leads won this month and last month, lost leads with
// reasons, unassigned leads, leads with no value or contact details, and a very long name.
const MORE_LEADS: LeadSpec[] = [
  [
    'Aurora Pharmaceuticals',
    'Nikhil Joshi',
    'REFERRAL',
    'NEGOTIATION',
    'HIGH',
    6_200_000,
    10,
    0,
    0,
    'Clinical trials data platform; pricing call today.',
  ],
  [
    'Banyan Realty',
    'Shreya Kapoor',
    'WEBSITE',
    'PROPOSAL',
    'MEDIUM',
    1_800_000,
    28,
    3,
    1,
    'Property listings portal with CRM sync.',
  ],
  [
    'Cascade Energy',
    'Imran Qureshi',
    'EVENT',
    'QUALIFIED',
    'HIGH',
    4_100_000,
    50,
    -3,
    0,
    'Smart meter analytics. Follow-up missed after the expo.',
  ],
  [
    'Deccan Motors',
    'Pooja Reddy',
    'OUTBOUND',
    'CONTACTED',
    'LOW',
    850_000,
    75,
    6,
    1,
    'Dealer management app; early conversation.',
  ],
  [
    'Elixir Wellness',
    'Tanvi Mehra',
    'PARTNER',
    'NEW',
    'MEDIUM',
    500_000,
    null,
    1,
    null,
    'Came in through the partner portal; not assigned yet.',
  ],
  [
    'Falcon Aviation Services',
    'Capt. Ravi Iyer',
    'REFERRAL',
    'QUALIFIED',
    'HIGH',
    7_500_000,
    60,
    2,
    0,
    'Crew rostering and compliance tracking.',
  ],
  [
    'Gulmohar Hotels',
    'Neha Sinha',
    'WEBSITE',
    'WON',
    'MEDIUM',
    2_200_000,
    -3,
    null,
    1,
    'Booking engine revamp. Signed this week.',
  ],
  [
    'Horizon Media Group',
    'Aditya Rao',
    'EVENT',
    'WON',
    'LOW',
    900_000,
    -12,
    null,
    0,
    'Content scheduling tool. Signed earlier this month.',
  ],
  [
    'Indus Textiles',
    'Farah Khan',
    'OUTBOUND',
    'WON',
    'HIGH',
    3_400_000,
    -35,
    null,
    1,
    'ERP integration. Won last month (not counted as won this month).',
  ],
  [
    'Jade Logistics',
    'Sunil Varma',
    'PARTNER',
    'LOST',
    'HIGH',
    2_900_000,
    -15,
    null,
    0,
    'Warehouse automation.',
  ],
  [
    'Kesari Agro',
    'Manoj Patil',
    'OUTBOUND',
    'LOST',
    'LOW',
    400_000,
    -40,
    null,
    1,
    'Farm advisory app.',
  ],
  [
    'Lotus Diagnostics',
    'Dr. Kavya Menon',
    'REFERRAL',
    'PROPOSAL',
    'HIGH',
    3_900_000,
    21,
    -1,
    1,
    'Lab reports portal. Proposal follow-up is a day late.',
  ],
  [
    'Monsoon Travels',
    'Rajiv Malhotra',
    'WEBSITE',
    'NEW',
    'LOW',
    null,
    null,
    null,
    null,
    'Newsletter sign-up; no budget discussed yet.',
  ],
  [
    'Nirvana Interiors',
    'Ishita Bajaj',
    'EVENT',
    'CONTACTED',
    'MEDIUM',
    650_000,
    45,
    8,
    0,
    'Wants a 3D catalogue for showrooms.',
  ],
  [
    'Opal Securities',
    'Harish Chandra',
    'REFERRAL',
    'NEGOTIATION',
    'HIGH',
    8_800_000,
    7,
    -4,
    0,
    'Trading dashboard; procurement asking for a discount.',
  ],
  [
    'Peacock Apparel',
    'Divya Saxena',
    'OUTBOUND',
    'QUALIFIED',
    'MEDIUM',
    1_200_000,
    55,
    4,
    1,
    'E-commerce replatforming.',
  ],
  [
    'Quantum Robotics',
    'Arjun Kale',
    'PARTNER',
    'PROPOSAL',
    'MEDIUM',
    2_700_000,
    33,
    9,
    null,
    'Fleet monitoring; owner to be decided.',
  ],
  [
    'Rivera Coffee Estates',
    'Maria Fernandes',
    'WEBSITE',
    'NEW',
    'MEDIUM',
    300_000,
    90,
    0,
    1,
    'Small traceability pilot; call scheduled today.',
  ],
  [
    'Sapphire Jewellers',
    'Kunal Agarwal',
    'EVENT',
    'CONTACTED',
    'HIGH',
    1_600_000,
    40,
    -7,
    0,
    'Inventory and billing; overdue for a week.',
  ],
  [
    'Tulip Schools Network',
    'Rekha Narayanan',
    'REFERRAL',
    'QUALIFIED',
    'LOW',
    700_000,
    80,
    12,
    1,
    'Parent communication app for 40 campuses.',
  ],
  [
    'Umbrella Healthcare Cooperative of Southern and Western India',
    'Dr. Suresh Pillai',
    'PARTNER',
    'PROPOSAL',
    'HIGH',
    9_600_000,
    25,
    2,
    0,
    'Hospital network EMR rollout (long name for layout testing).',
  ],
  [
    'Vanguard Cement',
    'Prakash Rao',
    'OUTBOUND',
    'NEGOTIATION',
    'MEDIUM',
    2_100_000,
    15,
    1,
    1,
    'Plant maintenance scheduling.',
  ],
  [
    'Willow Fintech',
    'Ayesha Siddiqui',
    'WEBSITE',
    'QUALIFIED',
    'HIGH',
    5_200_000,
    38,
    -2,
    1,
    'Credit scoring APIs; follow-up two days late.',
  ],
  [
    'Xenon Semiconductors',
    'Varun Bhatt',
    'EVENT',
    'NEW',
    'HIGH',
    null,
    null,
    2,
    0,
    'Met at the expo; value not known yet.',
  ],
  [
    'Yamuna Water Utilities',
    'Geeta Joshi',
    'REFERRAL',
    'CONTACTED',
    'MEDIUM',
    1_400_000,
    70,
    5,
    null,
    'Billing and complaints portal.',
  ],
  [
    'Zephyr Airlines Cargo',
    'Rohit Khanna',
    'PARTNER',
    'LOST',
    'MEDIUM',
    3_000_000,
    -8,
    null,
    0,
    'Cargo tracking platform.',
  ],
  [
    'Amber Analytics',
    'Sneha Pillai',
    'OUTBOUND',
    'PROPOSAL',
    'LOW',
    450_000,
    30,
    14,
    1,
    'BI dashboards for a mid-size retailer.',
  ],
  [
    'Brightline Rail',
    'Mohan Das',
    'REFERRAL',
    'QUALIFIED',
    'HIGH',
    6_800_000,
    65,
    3,
    0,
    'Passenger information system.',
  ],
  [
    'Cedar Legal Associates',
    'Anjali Deshmukh',
    'WEBSITE',
    'CONTACTED',
    'LOW',
    250_000,
    85,
    -5,
    1,
    'Case management; small firm.',
  ],
  [
    'Delta Ports',
    'Faisal Ahmed',
    'EVENT',
    'NEGOTIATION',
    'HIGH',
    7_200_000,
    12,
    0,
    1,
    'Terminal operations system; final round today.',
  ],
  [
    'Emerald Foods',
    'Lakshmi Rao',
    'PARTNER',
    'WON',
    'MEDIUM',
    1_100_000,
    -20,
    null,
    null,
    'Distributor ordering app. Won this month; the owner has left.',
  ],
  [
    'Fortune Insurance Brokers',
    'Vivek Anand',
    'OUTBOUND',
    'NEW',
    'MEDIUM',
    950_000,
    100,
    10,
    0,
    'Policy comparison portal.',
  ],
  [
    'Ganga Steel Works',
    'Ramesh Tiwari',
    'REFERRAL',
    'CONTACTED',
    'MEDIUM',
    1_300_000,
    58,
    null,
    0,
    'No follow-up booked yet.',
  ],
  [
    'Hilltop Resorts',
    'Pallavi Ghosh',
    'WEBSITE',
    'PROPOSAL',
    'MEDIUM',
    1_700_000,
    26,
    7,
    1,
    'Guest experience app.',
  ],
  [
    'Ivory Coast Exports',
    'Samuel George',
    'EVENT',
    'QUALIFIED',
    'LOW',
    600_000,
    95,
    20,
    null,
    'Export documentation workflow.',
  ],
];

/** Leads with no email or phone yet, to test empty contact details. */
const NO_CONTACT_DETAILS = new Set(['Monsoon Travels', 'Xenon Semiconductors']);
const LOST_REASONS = [
  'Chose an incumbent vendor on price.',
  'Project postponed to next financial year.',
  'Went with an in-house team.',
  'Budget cut after leadership change.',
];
const ALL_LEADS = [...LEADS, ...MORE_LEADS];

const day = (offset: number) => {
  const t = new Date();
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + offset));
};

/** Add the sales users (if missing) and their leads. Returns the number of leads added. */
export async function addSalesDemo(prisma: PrismaClient): Promise<number> {
  const dept = await prisma.department.upsert({
    where: { name: 'Sales' },
    update: {},
    create: { name: 'Sales' },
  });
  const passwordHash = await bcrypt.hash(SALES_PASSWORD, 10);
  const people: { id: string }[] = [];
  for (const p of SALES_PEOPLE) {
    people.push(
      await prisma.person.upsert({
        where: { email: p.email },
        update: { active: true, role: 'SALES' },
        create: {
          ...p,
          role: 'SALES',
          departmentId: dept.id,
          passwordHash,
          weeklyCapacityHours: 40,
        },
      }),
    );
  }

  // Re-running replaces the sample leads instead of duplicating them.
  await prisma.lead.deleteMany({ where: { company: { in: ALL_LEADS.map((l) => l[0]) } } });
  await prisma.lead.createMany({
    data: ALL_LEADS.map(
      ([company, contactName, source, stage, priority, value, close, follow, owner, notes], i) => ({
        company,
        contactName,
        contactEmail: NO_CONTACT_DETAILS.has(company)
          ? null
          : `${contactName
              .toLowerCase()
              .replace(/^(dr|capt)\. /, '')
              .replace(/[^a-z]+/g, '.')}@example.com`,
        contactPhone: NO_CONTACT_DETAILS.has(company)
          ? null
          : `+91 98${String((i * 7_919_993 + 10_234_567) % 100_000_000).padStart(8, '0')}`,
        source,
        stage,
        priority,
        estimatedValue: value,
        expectedCloseDate: close === null ? null : day(close),
        nextFollowUp: follow === null ? null : day(follow),
        notes,
        lostReason: stage === 'LOST' ? LOST_REASONS[i % LOST_REASONS.length] : null,
        ownerId: owner === null ? null : people[owner].id,
        createdById: people[owner ?? 0].id,
      }),
    ),
  });
  return ALL_LEADS.length;
}

export async function removeSalesDemo(prisma: PrismaClient) {
  const { count } = await prisma.lead.deleteMany({
    where: { company: { in: ALL_LEADS.map((l) => l[0]) } },
  });
  const people = await prisma.person.deleteMany({
    where: { email: { in: SALES_PEOPLE.map((p) => p.email) } },
  });
  return { leads: count, people: people.count };
}

// Run directly: npm run db:demo:sales [-- --remove]
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { prisma } = await import('../src/lib/prisma.js');
  try {
    if (process.argv.includes('--remove')) {
      const r = await removeSalesDemo(prisma);
      console.log(`Removed ${r.leads} sample leads and ${r.people} sales users.`);
    } else {
      const n = await addSalesDemo(prisma);
      console.log(`Added ${SALES_PEOPLE.length} sales users and ${n} sample leads.`);
      console.log(
        `Sales logins: ${SALES_PEOPLE.map((p) => p.email).join(', ')} / ${SALES_PASSWORD}`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}
