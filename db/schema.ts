import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const settings=sqliteTable('settings',{key:text('key').primaryKey(),value:text('value').notNull()});
export const documents=sqliteTable('documents',{
  id:text('id').primaryKey(),title:text('title').notNull(),kind:text('kind').notNull(),url:text('url').notNull(),body:text('body').notNull(),
  effectiveFrom:text('effective_from'),effectiveTo:text('effective_to'),caseNumber:text('case_number'),decisionDate:text('decision_date'),
  status:text('status').notNull().default('pending'),digest:text('digest').notNull(),fileId:text('file_id'),
  verifiedBy:text('verified_by').notNull(),verifiedAt:text('verified_at').notNull(),indexedAt:text('indexed_at'),notes:text('notes').notNull().default('')
});
export const consultations=sqliteTable('consultations',{
  id:text('id').primaryKey(),ownerHash:text('owner_hash').notNull(),requestKey:text('request_key').notNull().unique(),
  question:text('question').notNull(),transactionDate:text('transaction_date'),customer:text('customer').notNull().default(''),contact:text('contact').notNull().default(''),
  history:text('history').notNull().default('[]'),status:text('status').notNull().default('processing'),
  answer:text('answer'),evidence:text('evidence').notNull().default('[]'),reasons:text('reasons').notNull().default('[]'),
  internalNotes:text('internal_notes').notNull().default(''),expertReply:text('expert_reply').notNull().default(''),
  reviewedBy:text('reviewed_by'),reviewedAt:text('reviewed_at'),version:integer('version').notNull().default(1),
  createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull()
},table=>[index('consultations_owner').on(table.ownerHash),index('consultations_status').on(table.status)]);
export const audit=sqliteTable('audit',{id:text('id').primaryKey(),caseId:text('case_id').notNull(),actor:text('actor').notNull(),action:text('action').notNull(),detail:text('detail').notNull(),createdAt:text('created_at').notNull()});
export const rateLimits=sqliteTable('rate_limits',{key:text('key').primaryKey(),count:integer('count').notNull().default(0)});
export const chatThreads=sqliteTable('chat_threads',{
  id:text('id').primaryKey(),ownerHash:text('owner_hash').notNull(),title:text('title').notNull(),transactionDate:text('transaction_date'),
  pendingKey:text('pending_key'),pendingAt:text('pending_at'),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull()
},table=>[index('chat_threads_owner').on(table.ownerHash)]);
export const chatTurns=sqliteTable('chat_turns',{
  caseId:text('case_id').primaryKey(),threadId:text('thread_id').notNull(),createdAt:text('created_at').notNull()
},table=>[index('chat_turns_thread').on(table.threadId)]);
export const sourceCache=sqliteTable('source_cache',{
  key:text('key').primaryKey(),payload:text('payload').notNull(),expiresAt:text('expires_at').notNull()
});
