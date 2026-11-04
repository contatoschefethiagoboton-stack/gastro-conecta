CREATE TABLE IF NOT EXISTS `gc_index_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`url` varchar(500) NOT NULL,
	`engine` varchar(12) NOT NULL,
	`type` varchar(16) NOT NULL,
	`status` varchar(20) NOT NULL,
	`detail` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `gc_index_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `gc_index_log_engine_idx` ON `gc_index_log` (`engine`, `createdAt`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `gc_social_inbox` (
	`id` int AUTO_INCREMENT NOT NULL,
	`platform` varchar(12) NOT NULL,
	`kind` varchar(10) NOT NULL,
	`externalId` varchar(120) NOT NULL,
	`senderId` varchar(80),
	`senderName` varchar(160),
	`text` text,
	`intent` text,
	`reply` text,
	`status` varchar(12) NOT NULL,
	`error` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `gc_social_inbox_id` PRIMARY KEY(`id`),
	CONSTRAINT `gc_social_inbox_external_unique` UNIQUE(`platform`, `externalId`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `gc_social_posts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`kind` varchar(20) NOT NULL,
	`refId` int NOT NULL,
	`caption` text NOT NULL,
	`imageUrl` varchar(500),
	`link` varchar(500),
	`status` varchar(12) NOT NULL,
	`fbPostId` varchar(80),
	`igPostId` varchar(80),
	`error` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`publishedAt` timestamp NULL,
	CONSTRAINT `gc_social_posts_id` PRIMARY KEY(`id`),
	CONSTRAINT `gc_social_posts_ref_unique` UNIQUE(`kind`, `refId`)
);
