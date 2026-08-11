/**
 * Additive-only: inserts NEW aged leads (received_at older than the aged-days
 * threshold) into the dev database for /admin/aged and /partner/aged demos.
 *
 * Unlike scripts/seed-aged-leads.mjs, this script never deletes or replaces
 * existing rows — every run appends a fresh, uniquely-prefixed batch so
 * previously seeded leads (any prefix) are left untouched.
 *
 * Covers all four enabled lead categories (high_intent_iul, traditional_iul,
 * mortgage_protection, final_expense) across the three aged-pricing tiers
 * (30-180d, 181-365d, 366+d) with a mix of statuses/availability.
 *
 * Usage: node scripts/add-aged-leads.mjs
 */
import { PrismaClient, LeadStatus, LeadCategoryResolution } from "@prisma/client";
import crypto from "node:crypto";

const prisma = new PrismaClient();

const BATCH_PREFIX = `aged-extra-${Date.now()}`;

const REQUIRED_CATEGORY_TYPES = [
  "high_intent_iul",
  "traditional_iul",
  "mortgage_protection",
  "final_expense",
];

const FIRST_NAMES = [
  "Angela",
  "Brian",
  "Carla",
  "Derek",
  "Elena",
  "Frank",
  "Gloria",
  "Hector",
  "Irene",
  "Jason",
  "Kayla",
  "Leonard",
  "Melissa",
  "Nathan",
  "Olivia",
  "Peter",
  "Rachel",
  "Steven",
  "Tina",
  "Victor",
];

const LAST_NAMES = [
  "Alvarez",
  "Bennett",
  "Castillo",
  "Dawson",
  "Espinoza",
  "Fletcher",
  "Gutierrez",
  "Henderson",
  "Ibarra",
  "Jennings",
  "Kirby",
  "Lozano",
  "Mendoza",
  "Nolan",
  "Osborne",
  "Pruitt",
  "Quintero",
  "Ramsey",
  "Sanchez",
  "Torres",
];

/**
 * New batch of aged leads. Deliberately different states/day-ages than the
 * existing seed-aged-leads.mjs plan so both batches can coexist cleanly.
 * daysAgo, state, leadType, status, available
 */
const LEADS_PLAN = [
  // High Intent IUL — 30-180d, 181-365d, 366+d
  { daysAgo: 31, state: "WA", leadType: "high_intent_iul", status: LeadStatus.unmatched, available: true },
  { daysAgo: 47, state: "NV", leadType: "high_intent_iul", status: LeadStatus.unmatched, available: true },
  { daysAgo: 63, state: "UT", leadType: "high_intent_iul", status: LeadStatus.delivered, available: false },
  { daysAgo: 99, state: "CA", leadType: "high_intent_iul", status: LeadStatus.unmatched, available: true },
  { daysAgo: 150, state: "ID", leadType: "high_intent_iul", status: LeadStatus.unmatched, available: true },
  { daysAgo: 220, state: "MT", leadType: "high_intent_iul", status: LeadStatus.unmatched, available: true },
  { daysAgo: 290, state: "WY", leadType: "high_intent_iul", status: LeadStatus.integrity_posted, available: false },
  { daysAgo: 420, state: "ND", leadType: "high_intent_iul", status: LeadStatus.unmatched, available: true },
  { daysAgo: 500, state: "SD", leadType: "high_intent_iul", status: LeadStatus.unmatched, available: true },

  // Traditional IUL — 30-180d, 181-365d, 366+d
  { daysAgo: 40, state: "OH", leadType: "traditional_iul", status: LeadStatus.unmatched, available: true },
  { daysAgo: 58, state: "MI", leadType: "traditional_iul", status: LeadStatus.unmatched, available: true },
  { daysAgo: 88, state: "IN", leadType: "traditional_iul", status: LeadStatus.delivered, available: false },
  { daysAgo: 130, state: "KY", leadType: "traditional_iul", status: LeadStatus.unmatched, available: true },
  { daysAgo: 175, state: "WV", leadType: "traditional_iul", status: LeadStatus.unmatched, available: true },
  { daysAgo: 260, state: "VA", leadType: "traditional_iul", status: LeadStatus.unmatched, available: true },
  { daysAgo: 330, state: "MD", leadType: "traditional_iul", status: LeadStatus.integrity_posted, available: false },
  { daysAgo: 380, state: "DE", leadType: "traditional_iul", status: LeadStatus.unmatched, available: true },
  { daysAgo: 470, state: "NJ", leadType: "traditional_iul", status: LeadStatus.unmatched, available: true },

  // Mortgage Protection — 30-180d, 181-365d, 366+d
  { daysAgo: 36, state: "TX", leadType: "mortgage_protection", status: LeadStatus.unmatched, available: true },
  { daysAgo: 52, state: "AZ", leadType: "mortgage_protection", status: LeadStatus.unmatched, available: true },
  { daysAgo: 80, state: "NM", leadType: "mortgage_protection", status: LeadStatus.delivered, available: false },
  { daysAgo: 120, state: "OK", leadType: "mortgage_protection", status: LeadStatus.unmatched, available: true },
  { daysAgo: 210, state: "AR", leadType: "mortgage_protection", status: LeadStatus.unmatched, available: true },
  { daysAgo: 275, state: "MO", leadType: "mortgage_protection", status: LeadStatus.unmatched, available: true },
  { daysAgo: 350, state: "KS", leadType: "mortgage_protection", status: LeadStatus.integrity_posted, available: false },
  { daysAgo: 440, state: "NE", leadType: "mortgage_protection", status: LeadStatus.unmatched, available: true },

  // Final Expense — 30-180d, 181-365d, 366+d
  { daysAgo: 42, state: "GA", leadType: "final_expense", status: LeadStatus.unmatched, available: true },
  { daysAgo: 65, state: "AL", leadType: "final_expense", status: LeadStatus.unmatched, available: true },
  { daysAgo: 105, state: "MS", leadType: "final_expense", status: LeadStatus.delivered, available: false },
  { daysAgo: 160, state: "LA", leadType: "final_expense", status: LeadStatus.unmatched, available: true },
  { daysAgo: 230, state: "SC", leadType: "final_expense", status: LeadStatus.unmatched, available: true },
  { daysAgo: 310, state: "NC", leadType: "final_expense", status: LeadStatus.unmatched, available: true },
  { daysAgo: 390, state: "TN", leadType: "final_expense", status: LeadStatus.integrity_posted, available: false },
  { daysAgo: 460, state: "FL", leadType: "final_expense", status: LeadStatus.unmatched, available: true },
];

function daysAgoDate(days, hour = 10) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, 15, 0, 0);
  return d;
}

function intentForLeadType(leadType) {
  if (leadType === "high_intent_iul") return "High Intent";
  if (leadType === "traditional_iul") return "Traditional";
  if (leadType === "mortgage_protection") return "Mortgage Protection";
  if (leadType === "final_expense") return "Final Expense";
  return null;
}

function primaryGoalForLeadType(leadType, n) {
  if (leadType === "mortgage_protection") {
    return n % 2 === 0 ? "Mortgage protection" : "Pay off mortgage";
  }
  if (leadType === "final_expense") {
    return n % 2 === 0 ? "Burial / final expense" : "Leave money for family";
  }
  return n % 2 === 0 ? "Retirement income" : "Legacy planning";
}

function ageTierBucket(daysAgo) {
  if (daysAgo >= 366) return "366+";
  if (daysAgo >= 181) return "181-365";
  return "30-180";
}

async function ensureRequiredCategories() {
  const rows = await prisma.leadCategory.findMany({
    where: { type: { in: REQUIRED_CATEGORY_TYPES } },
    select: { type: true, enabled: true, label: true },
  });
  const byType = new Map(rows.map((r) => [r.type, r]));
  const missing = REQUIRED_CATEGORY_TYPES.filter((t) => !byType.has(t));
  if (missing.length > 0) {
    throw new Error(
      `Missing lead_categories (run migrations / seed categories first): ${missing.join(", ")}`,
    );
  }
  const disabled = rows.filter((r) => !r.enabled);
  for (const row of disabled) {
    await prisma.leadCategory.update({
      where: { type: row.type },
      data: { enabled: true },
    });
    console.log(`Enabled category ${row.type} (${row.label}).`);
  }
}

async function main() {
  await ensureRequiredCategories();

  const created = [];
  let n = 0;

  for (const row of LEADS_PLAN) {
    n += 1;
    const receivedAt = daysAgoDate(row.daysAgo, 8 + (n % 10));
    const firstName = FIRST_NAMES[(n - 1) % FIRST_NAMES.length];
    const lastName = LAST_NAMES[(n - 1) % LAST_NAMES.length];
    const externalId = `${BATCH_PREFIX}-${n}`;
    const isMortgage = row.leadType === "mortgage_protection";
    const isFinalExpense = row.leadType === "final_expense";
    const uniqueSuffix = crypto.randomBytes(3).toString("hex");

    const lead = await prisma.lead.create({
      data: {
        firstName,
        lastName,
        email: `${externalId}@aged-demo.example.com`,
        phone: `555099${String(n).padStart(4, "0").slice(-4)}`,
        address: `${400 + n} Birch Avenue`,
        city: "Fairview",
        state: row.state,
        zip: String(80000 + n).slice(0, 5),
        age: String(30 + (n % 30)),
        leadType: row.leadType,
        categoryResolution: LeadCategoryResolution.matched,
        categoryCandidateTypes: [row.leadType],
        intent: intentForLeadType(row.leadType),
        haveIul: isMortgage || isFinalExpense ? null : n % 3 === 0 ? "Yes" : "No",
        primaryGoal: primaryGoalForLeadType(row.leadType, n),
        mortgageLoanAmount: isMortgage
          ? String(120000 + (n % 12) * 20000)
          : null,
        beneficiary: isFinalExpense || isMortgage ? "Spouse" : null,
        beneficiaryType: isFinalExpense || isMortgage ? "Individual" : null,
        source: "aged_demo_seed",
        status: row.status,
        available: row.available,
        receivedAt,
        createdAt: receivedAt,
        externalId,
        trustedformCertUrl:
          n % 4 === 0 ? `https://cert.trustedform.com/${externalId}-${uniqueSuffix}` : null,
      },
    });
    created.push({
      id: lead.id,
      daysAgo: row.daysAgo,
      state: row.state,
      leadType: row.leadType,
      status: row.status,
      tier: ageTierBucket(row.daysAgo),
    });
  }

  const minDays = Math.min(...LEADS_PLAN.map((r) => r.daysAgo));
  const maxDays = Math.max(...LEADS_PLAN.map((r) => r.daysAgo));
  const byStatus = {};
  const byType = {};
  const byTier = {};
  const byTypeTier = {};
  for (const c of created) {
    byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
    byType[c.leadType] = (byType[c.leadType] ?? 0) + 1;
    byTier[c.tier] = (byTier[c.tier] ?? 0) + 1;
    const key = `${c.leadType} / ${c.tier}`;
    byTypeTier[key] = (byTypeTier[key] ?? 0) + 1;
  }

  console.log("Added new aged leads (existing data untouched):", {
    batchPrefix: BATCH_PREFIX,
    count: created.length,
    ageRangeDays: `${minDays}-${maxDays}`,
    byType,
    byTier,
    byTypeTier,
    byStatus,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
