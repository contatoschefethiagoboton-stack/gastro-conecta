ALTER TABLE `gastro_events` ADD COLUMN `preferredProviderId` int NULL;--> statement-breakpoint
ALTER TABLE `gastro_events` ADD INDEX `gastro_events_preferred_provider_idx` (`preferredProviderId`);
