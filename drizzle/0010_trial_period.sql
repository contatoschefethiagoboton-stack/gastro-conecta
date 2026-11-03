ALTER TABLE `gc_provider_subscriptions` ADD `trialUntil` timestamp NULL;
--> statement-breakpoint
ALTER TABLE `gc_provider_subscriptions` ADD `trialGrantedAt` timestamp NULL;
--> statement-breakpoint
ALTER TABLE `gc_provider_subscriptions` ADD `trialWarnedAt` timestamp NULL;
--> statement-breakpoint
ALTER TABLE `gc_provider_subscriptions` ADD `trialEndedAt` timestamp NULL;
