CREATE TABLE IF NOT EXISTS `gc_media` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int,
	`kind` varchar(40) NOT NULL,
	`mime` varchar(100) NOT NULL,
	`filename` varchar(200),
	`size` int NOT NULL,
	`isPublic` boolean NOT NULL DEFAULT true,
	`data` longblob NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `gc_media_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `gc_media_owner_idx` ON `gc_media` (`ownerId`, `kind`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `gc_profile_details` (
	`userId` int NOT NULL,
	`details` mediumtext NOT NULL,
	`completedAt` timestamp NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `gc_profile_details_userId` PRIMARY KEY(`userId`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `gc_site_content` (
	`key` varchar(120) NOT NULL,
	`value` mediumtext NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `gc_site_content_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `gc_promotions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`badge` varchar(60) NOT NULL,
	`title` varchar(160) NOT NULL,
	`text` text NOT NULL,
	`ctaLabel` varchar(60) NOT NULL,
	`whatsappMessage` varchar(600) NOT NULL,
	`eventType` varchar(100),
	`imageUrl` varchar(300),
	`startMd` char(5) NOT NULL,
	`endMd` char(5) NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `gc_promotions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `gc_user_benefits` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`kind` enum('bonus','credit','discount','vip','featured','custom') NOT NULL,
	`title` varchar(160) NOT NULL,
	`description` text,
	`amountCents` int NOT NULL DEFAULT 0,
	`percent` int NOT NULL DEFAULT 0,
	`expiresAt` date,
	`active` boolean NOT NULL DEFAULT true,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `gc_user_benefits_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `gc_user_benefits_user_idx` ON `gc_user_benefits` (`userId`);
