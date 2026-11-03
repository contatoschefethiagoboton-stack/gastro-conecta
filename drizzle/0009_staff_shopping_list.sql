CREATE TABLE IF NOT EXISTS `gc_staff` (
	`userId` int NOT NULL,
	`staffRole` varchar(12) NOT NULL,
	`permissions` text,
	`mustChangePassword` boolean NOT NULL DEFAULT false,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `gc_staff_userId` PRIMARY KEY(`userId`)
);
--> statement-breakpoint
ALTER TABLE `gc_subscription_payments` ADD `proposalId` int;
--> statement-breakpoint
ALTER TABLE `gastro_proposals` ADD `shoppingListPaidAt` timestamp NULL;
--> statement-breakpoint
CREATE INDEX `gastro_audit_logs_created_idx` ON `gastro_audit_logs` (`createdAt`);
