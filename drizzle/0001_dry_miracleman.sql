CREATE TABLE `account_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`accountType` enum('client','provider','freelancer') NOT NULL DEFAULT 'client',
	`status` enum('active','pending','suspended','blocked','deleted') NOT NULL DEFAULT 'active',
	`city` varchar(160),
	`bio` text,
	`specialty` varchar(160),
	`vip` boolean NOT NULL DEFAULT false,
	`discountPercent` int NOT NULL DEFAULT 0,
	`featured` boolean NOT NULL DEFAULT false,
	`passwordHash` varchar(512),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `account_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `account_profiles_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `gastro_applications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jobId` int NOT NULL,
	`userId` int NOT NULL,
	`status` enum('pending','accepted','rejected','withdrawn') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `gastro_applications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `gastro_audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`action` varchar(120) NOT NULL,
	`details` text NOT NULL,
	`actorId` int NOT NULL,
	`targetId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `gastro_audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `gastro_contracts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`kind` enum('A','B','C') NOT NULL,
	`eventId` int,
	`jobId` int,
	`createdByUserId` int NOT NULL,
	`title` varchar(240) NOT NULL,
	`status` enum('draft','generated') NOT NULL DEFAULT 'generated',
	`payload` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `gastro_contracts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `gastro_coupons` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(64) NOT NULL,
	`discountPercent` int NOT NULL DEFAULT 0,
	`cashbackPercent` int NOT NULL DEFAULT 0,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `gastro_coupons_id` PRIMARY KEY(`id`),
	CONSTRAINT `gastro_coupons_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `gastro_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clientId` int NOT NULL,
	`providerId` int,
	`title` varchar(180) NOT NULL,
	`type` varchar(100) NOT NULL,
	`eventDate` date,
	`city` varchar(160) NOT NULL,
	`location` varchar(240),
	`guests` int NOT NULL,
	`budgetCents` int NOT NULL,
	`description` text,
	`stage` enum('ready','comparing','research') NOT NULL DEFAULT 'research',
	`score` int NOT NULL DEFAULT 0,
	`status` enum('open','booked','completed','cancelled') NOT NULL DEFAULT 'open',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `gastro_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `gc_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`tokenHash` varchar(128) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`lastSeenAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `gc_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `gc_sessions_tokenHash_unique` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
CREATE TABLE `gastro_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`providerId` int NOT NULL,
	`title` varchar(180) NOT NULL,
	`role` enum('Cozinheiro','Ajudante','Garçom','Barman') NOT NULL,
	`jobDate` date NOT NULL,
	`city` varchar(160) NOT NULL,
	`hours` int NOT NULL,
	`dailyCents` int NOT NULL,
	`description` text NOT NULL,
	`status` enum('open','booked','completed','cancelled') NOT NULL DEFAULT 'open',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `gastro_jobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `gastro_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`role` enum('user','assistant') NOT NULL,
	`content` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `gastro_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `gastro_proposals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventId` int NOT NULL,
	`providerId` int NOT NULL,
	`amountCents` int NOT NULL,
	`message` text NOT NULL,
	`status` enum('pending','accepted','rejected','withdrawn') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `gastro_proposals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `gastro_reviews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventId` int NOT NULL,
	`reviewerId` int NOT NULL,
	`targetId` int NOT NULL,
	`rating` int NOT NULL,
	`feedback` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `gastro_reviews_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `gastro_subscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`planId` varchar(50) NOT NULL,
	`status` enum('pending_payment','active','cancelled','expired') NOT NULL DEFAULT 'pending_payment',
	`priceCents` int NOT NULL,
	`days` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `gastro_subscriptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `gastro_wallet_transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`type` enum('credit','debit') NOT NULL,
	`description` varchar(240) NOT NULL,
	`grossCents` int NOT NULL,
	`feeCents` int NOT NULL DEFAULT 0,
	`netCents` int NOT NULL,
	`status` enum('pending','completed','failed') NOT NULL DEFAULT 'pending',
	`externalReference` varchar(180),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `gastro_wallet_transactions_id` PRIMARY KEY(`id`)
);
