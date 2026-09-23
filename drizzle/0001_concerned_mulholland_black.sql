CREATE TABLE `ai_attempts` (
	`owner_id` text NOT NULL,
	`ticket_id` text NOT NULL,
	`ticket_revision` integer NOT NULL,
	PRIMARY KEY(`owner_id`, `ticket_id`, `ticket_revision`)
);
--> statement-breakpoint
CREATE TABLE `ai_budget` (
	`id` text PRIMARY KEY NOT NULL,
	`reserved_cents` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
INSERT INTO ai_budget (id, reserved_cents) VALUES ('resolveai', 0);
--> statement-breakpoint
CREATE TRIGGER ai_attempt_reserves_budget AFTER INSERT ON ai_attempts
BEGIN
  UPDATE ai_budget SET reserved_cents = reserved_cents + 1 WHERE id = 'resolveai';
END;
