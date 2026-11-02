CREATE TABLE `chat_threads` (
 `id` text PRIMARY KEY NOT NULL,
 `owner_hash` text NOT NULL,
 `title` text NOT NULL,
 `transaction_date` text,
 `pending_key` text,
 `pending_at` text,
 `created_at` text NOT NULL,
 `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `chat_threads_owner` ON `chat_threads` (`owner_hash`);
--> statement-breakpoint
CREATE TABLE `chat_turns` (
 `case_id` text PRIMARY KEY NOT NULL,
 `thread_id` text NOT NULL,
 `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `chat_turns_thread` ON `chat_turns` (`thread_id`);
--> statement-breakpoint
CREATE TABLE `source_cache` (
 `key` text PRIMARY KEY NOT NULL,
 `payload` text NOT NULL,
 `expires_at` text NOT NULL
);
