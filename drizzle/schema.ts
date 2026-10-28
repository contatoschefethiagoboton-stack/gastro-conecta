import {
	boolean,
	date,
	index,
	int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/** Core Manus user table. Existing OAuth columns are intentionally preserved. */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const accountProfiles = mysqlTable("account_profiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  accountType: mysqlEnum("accountType", ["client", "provider", "freelancer"]).notNull().default("client"),
  status: mysqlEnum("status", ["active", "pending", "suspended", "blocked", "deleted"]).notNull().default("active"),
  city: varchar("city", { length: 160 }),
  bio: text("bio"),
  specialty: varchar("specialty", { length: 160 }),
  vip: boolean("vip").notNull().default(false),
  discountPercent: int("discountPercent").notNull().default(0),
  featured: boolean("featured").notNull().default(false),
  passwordHash: varchar("passwordHash", { length: 512 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const gcSessions = mysqlTable("gc_sessions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  tokenHash: varchar("tokenHash", { length: 128 }).notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
});

export const events = mysqlTable("gastro_events", {
  id: int("id").autoincrement().primaryKey(),
  clientId: int("clientId").notNull(),
  providerId: int("providerId"),
  preferredProviderId: int("preferredProviderId"),
  title: varchar("title", { length: 180 }).notNull(),
  type: varchar("type", { length: 100 }).notNull(),
  eventDate: date("eventDate"),
  city: varchar("city", { length: 160 }).notNull(),
  location: varchar("location", { length: 240 }),
  guests: int("guests").notNull(),
  budgetCents: int("budgetCents").notNull(),
  description: text("description"),
  stage: mysqlEnum("stage", ["ready", "comparing", "research"]).notNull().default("research"),
  score: int("score").notNull().default(0),
	status: mysqlEnum("status", ["open", "booked", "completed", "cancelled"]).notNull().default("open"),
	createdAt: timestamp("createdAt").defaultNow().notNull(),
	completedAt: timestamp("completedAt"),
}, table => ({ preferredProviderIdx: index("gastro_events_preferred_provider_idx").on(table.preferredProviderId) }));

export const proposals = mysqlTable("gastro_proposals", {
  id: int("id").autoincrement().primaryKey(),
  eventId: int("eventId").notNull(),
  providerId: int("providerId").notNull(),
  amountCents: int("amountCents").notNull(),
  message: text("message").notNull(),
  status: mysqlEnum("status", ["pending", "accepted", "rejected", "withdrawn"]).notNull().default("pending"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({ eventProviderUnique: uniqueIndex("gastro_proposals_event_provider_unique").on(table.eventId, table.providerId) }));

export const jobs = mysqlTable("gastro_jobs", {
  id: int("id").autoincrement().primaryKey(),
  providerId: int("providerId").notNull(),
  eventId: int("eventId"),
  title: varchar("title", { length: 180 }).notNull(),
  role: mysqlEnum("role", ["Cozinheiro", "Ajudante", "Garçom", "Barman"]).notNull(),
  jobDate: date("jobDate").notNull(),
  city: varchar("city", { length: 160 }).notNull(),
  hours: int("hours").notNull(),
  dailyCents: int("dailyCents").notNull(),
	description: text("description").notNull(),
	status: mysqlEnum("status", ["open", "booked", "completed", "cancelled"]).notNull().default("open"),
	createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({ eventIdx: index("gastro_jobs_event_idx").on(table.eventId) }));

export const applications = mysqlTable("gastro_applications", {
  id: int("id").autoincrement().primaryKey(),
  jobId: int("jobId").notNull(),
  userId: int("userId").notNull(),
  status: mysqlEnum("status", ["pending", "accepted", "rejected", "withdrawn"]).notNull().default("pending"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({ jobUserUnique: uniqueIndex("gastro_applications_job_user_unique").on(table.jobId, table.userId) }));

export const walletTransactions = mysqlTable("gastro_wallet_transactions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  type: mysqlEnum("type", ["credit", "debit"]).notNull(),
  description: varchar("description", { length: 240 }).notNull(),
  grossCents: int("grossCents").notNull(),
  feeCents: int("feeCents").notNull().default(0),
  netCents: int("netCents").notNull(),
  status: mysqlEnum("status", ["pending", "completed", "failed"]).notNull().default("pending"),
  externalReference: varchar("externalReference", { length: 180 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const subscriptions = mysqlTable("gastro_subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  planId: varchar("planId", { length: 50 }).notNull(),
  status: mysqlEnum("status", ["pending_payment", "active", "cancelled", "expired"]).notNull().default("pending_payment"),
  priceCents: int("priceCents").notNull(),
  days: int("days").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const reviews = mysqlTable("gastro_reviews", {
  id: int("id").autoincrement().primaryKey(),
  eventId: int("eventId").notNull(),
  reviewerId: int("reviewerId").notNull(),
  targetId: int("targetId").notNull(),
  rating: int("rating").notNull(),
  feedback: text("feedback").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({ eventReviewerTargetUnique: uniqueIndex("gastro_reviews_event_reviewer_target_unique").on(table.eventId, table.reviewerId, table.targetId) }));

export const contracts = mysqlTable("gastro_contracts", {
  id: int("id").autoincrement().primaryKey(),
  kind: mysqlEnum("kind", ["A", "B", "C"]).notNull(),
  eventId: int("eventId"),
  jobId: int("jobId"),
  createdByUserId: int("createdByUserId").notNull(),
  title: varchar("title", { length: 240 }).notNull(),
  status: mysqlEnum("status", ["draft", "generated"]).notNull().default("generated"),
  payload: text("payload").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const messages = mysqlTable("gastro_messages", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  role: mysqlEnum("role", ["user", "assistant"]).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const auditLogs = mysqlTable("gastro_audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  action: varchar("action", { length: 120 }).notNull(),
  details: text("details").notNull(),
  actorId: int("actorId").notNull(),
  targetId: int("targetId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const coupons = mysqlTable("gastro_coupons", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 64 }).notNull().unique(),
  discountPercent: int("discountPercent").notNull().default(0),
  cashbackPercent: int("cashbackPercent").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
