CREATE TABLE IF NOT EXISTS `gc_provider_subscriptions` (
	`userId` int NOT NULL,
	`priceCents` int NOT NULL,
	`periodEnd` timestamp NULL,
	`autoFailed` boolean NOT NULL DEFAULT false,
	`autoAttemptedFor` timestamp NULL,
	`mpPreapprovalId` varchar(80),
	`mpPreapprovalStatus` varchar(30),
	`lastPaidAt` timestamp NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `gc_provider_subscriptions_userId` PRIMARY KEY(`userId`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `gc_subscription_payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`method` varchar(20) NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'pending',
	`amountCents` int NOT NULL,
	`mpPaymentId` varchar(64),
	`qrCode` text,
	`qrCodeBase64` mediumtext,
	`ticketUrl` varchar(500),
	`expiresAt` timestamp NULL,
	`approvedAt` timestamp NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `gc_subscription_payments_id` PRIMARY KEY(`id`),
	CONSTRAINT `gc_subscription_payments_mp_unique` UNIQUE(`mpPaymentId`)
);
--> statement-breakpoint
CREATE INDEX `gc_subscription_payments_user_idx` ON `gc_subscription_payments` (`userId`, `status`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `gc_password_resets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`tokenHash` varchar(128) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`usedAt` timestamp NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `gc_password_resets_id` PRIMARY KEY(`id`),
	CONSTRAINT `gc_password_resets_token_unique` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `gc_event_dismissals` (
	`eventId` int NOT NULL,
	`userId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `gc_event_dismissals_pk` PRIMARY KEY(`eventId`, `userId`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `gc_provider_expenses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`eventId` int,
	`category` varchar(30) NOT NULL,
	`description` varchar(240) NOT NULL,
	`amountCents` int NOT NULL,
	`spentOn` date NOT NULL,
	`mediaId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `gc_provider_expenses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `gc_provider_expenses_user_idx` ON `gc_provider_expenses` (`userId`, `spentOn`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `gc_user_flags` (
	`userId` int NOT NULL,
	`flag` varchar(60) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `gc_user_flags_pk` PRIMARY KEY(`userId`, `flag`)
);
--> statement-breakpoint
ALTER TABLE `gastro_events` ADD `category` varchar(20) NOT NULL DEFAULT 'event';
--> statement-breakpoint
ALTER TABLE `gastro_events` ADD `eventTime` varchar(5);
--> statement-breakpoint
ALTER TABLE `gastro_events` ADD `scope` varchar(10);
--> statement-breakpoint
ALTER TABLE `gastro_events` ADD `details` text;
--> statement-breakpoint
ALTER TABLE `gastro_events` ADD `acceptedProposalId` int;
--> statement-breakpoint
ALTER TABLE `gastro_proposals` ADD `scope` varchar(10) NOT NULL DEFAULT 'labor';
--> statement-breakpoint
ALTER TABLE `gastro_proposals` ADD `costCents` int NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `gastro_proposals` ADD `paymentTerms` varchar(600);
--> statement-breakpoint
ALTER TABLE `gastro_proposals` ADD `breakdown` mediumtext;
--> statement-breakpoint
ALTER TABLE `gastro_proposals` ADD `eventTime` varchar(5);
--> statement-breakpoint
ALTER TABLE `gastro_contracts` ADD `proposalId` int;
--> statement-breakpoint
ALTER TABLE `gastro_contracts` ADD `acceptedIp` varchar(64);
--> statement-breakpoint
UPDATE `account_profiles` SET `accountType` = 'provider', `status` = IF(`status` = 'active', 'pending', `status`) WHERE `accountType` = 'freelancer';
--> statement-breakpoint
UPDATE `gc_profile_details` SET `completedAt` = NULL WHERE `userId` IN (SELECT `userId` FROM `account_profiles` WHERE `accountType` = 'provider');
--> statement-breakpoint
UPDATE `gastro_jobs` SET `status` = 'cancelled' WHERE `status` = 'open';
