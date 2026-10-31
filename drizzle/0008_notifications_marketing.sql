CREATE TABLE IF NOT EXISTS `gc_notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`audience` varchar(10) NOT NULL,
	`userId` int,
	`type` varchar(40) NOT NULL,
	`title` varchar(200) NOT NULL,
	`body` text,
	`link` varchar(300),
	`readAt` timestamp NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `gc_notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `gc_notifications_target_idx` ON `gc_notifications` (`audience`, `userId`, `readAt`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `gc_magic_links` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`tokenHash` varchar(128) NOT NULL,
	`path` varchar(300) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `gc_magic_links_id` PRIMARY KEY(`id`),
	CONSTRAINT `gc_magic_links_token_unique` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `gc_visits` (
	`id` int AUTO_INCREMENT NOT NULL,
	`visitorId` varchar(40) NOT NULL,
	`source` varchar(40) NOT NULL,
	`medium` varchar(40) NOT NULL,
	`campaign` varchar(120),
	`referrer` varchar(200),
	`path` varchar(200),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `gc_visits_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `gc_visits_created_idx` ON `gc_visits` (`createdAt`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `gc_searches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`term` varchar(120),
	`category` varchar(80),
	`city` varchar(120),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `gc_searches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `gc_searches_created_idx` ON `gc_searches` (`createdAt`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `gc_benefit_products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(120) NOT NULL,
	`description` text,
	`priceCents` int NOT NULL,
	`days` int NOT NULL DEFAULT 30,
	`effect` varchar(20) NOT NULL DEFAULT 'none',
	`active` boolean NOT NULL DEFAULT true,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `gc_benefit_products_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `account_profiles` ADD `whatsapp` varchar(20);
--> statement-breakpoint
ALTER TABLE `account_profiles` ADD `notifyOptIn` boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE `account_profiles` ADD `signupSource` varchar(40);
--> statement-breakpoint
ALTER TABLE `account_profiles` ADD `signupMedium` varchar(40);
--> statement-breakpoint
ALTER TABLE `account_profiles` ADD `signupCampaign` varchar(120);
--> statement-breakpoint
ALTER TABLE `account_profiles` ADD `referredBy` int;
--> statement-breakpoint
ALTER TABLE `account_profiles` ADD `subscriptionFree` boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE `account_profiles` ADD `featuredUntil` timestamp NULL;
--> statement-breakpoint
ALTER TABLE `gc_subscription_payments` ADD `benefitId` int;
