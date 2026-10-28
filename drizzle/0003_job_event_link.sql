ALTER TABLE `gastro_jobs` ADD COLUMN `eventId` int NULL;--> statement-breakpoint
ALTER TABLE `gastro_jobs` ADD INDEX `gastro_jobs_event_idx` (`eventId`);
