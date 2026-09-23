ALTER TABLE `attendance` ADD `check_in_lat` real;--> statement-breakpoint
ALTER TABLE `attendance` ADD `check_in_lng` real;--> statement-breakpoint
ALTER TABLE `attendance` ADD `check_out_lat` real;--> statement-breakpoint
ALTER TABLE `attendance` ADD `check_out_lng` real;--> statement-breakpoint
ALTER TABLE `payroll_period` ADD `locked_at` integer;
