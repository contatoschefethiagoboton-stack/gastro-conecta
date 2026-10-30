ALTER TABLE `account_profiles` ADD `promoVip` boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE `account_profiles` ADD `levelOverride` varchar(10);
--> statement-breakpoint
ALTER TABLE `gc_promotions` ADD `providerFeeCents` int NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `gc_subscription_payments` ADD `purpose` varchar(20) NOT NULL DEFAULT 'subscription';
--> statement-breakpoint
ALTER TABLE `gc_subscription_payments` ADD `promotionId` int;
--> statement-breakpoint
ALTER TABLE `gc_subscription_payments` ADD `reference` varchar(120);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `gc_promotion_participants` (
	`promotionId` int NOT NULL,
	`userId` int NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'active',
	`source` varchar(20) NOT NULL,
	`paymentId` int,
	`validUntil` timestamp NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `gc_promotion_participants_pk` PRIMARY KEY(`promotionId`,`userId`)
);
