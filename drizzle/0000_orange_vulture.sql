CREATE TABLE `audit` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`detail` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `consultations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_hash` text NOT NULL,
	`request_key` text NOT NULL,
	`question` text NOT NULL,
	`transaction_date` text,
	`customer` text DEFAULT '' NOT NULL,
	`contact` text DEFAULT '' NOT NULL,
	`history` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'processing' NOT NULL,
	`answer` text,
	`evidence` text DEFAULT '[]' NOT NULL,
	`reasons` text DEFAULT '[]' NOT NULL,
	`internal_notes` text DEFAULT '' NOT NULL,
	`expert_reply` text DEFAULT '' NOT NULL,
	`reviewed_by` text,
	`reviewed_at` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `consultations_request_key_unique` ON `consultations` (`request_key`);--> statement-breakpoint
CREATE INDEX `consultations_owner` ON `consultations` (`owner_hash`);--> statement-breakpoint
CREATE INDEX `consultations_status` ON `consultations` (`status`);--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`kind` text NOT NULL,
	`url` text NOT NULL,
	`body` text NOT NULL,
	`effective_from` text,
	`effective_to` text,
	`case_number` text,
	`decision_date` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`digest` text NOT NULL,
	`file_id` text,
	`verified_by` text NOT NULL,
	`verified_at` text NOT NULL,
	`indexed_at` text,
	`notes` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
