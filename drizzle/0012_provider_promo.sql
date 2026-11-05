ALTER TABLE `gc_social_posts` ADD `providerId` int NULL;
--> statement-breakpoint
ALTER TABLE `gc_social_posts` ADD `sentAt` timestamp NULL;
--> statement-breakpoint
ALTER TABLE `gc_social_posts` ADD `sharedAt` timestamp NULL;
--> statement-breakpoint
CREATE INDEX `gc_social_posts_provider_idx` ON `gc_social_posts` (`providerId`, `status`);
