DROP INDEX IF EXISTS `payroll_line_periodId_employeeId_uidx`;--> statement-breakpoint
CREATE TABLE `__payroll_line_bak` (
	`id` text PRIMARY KEY NOT NULL,
	`period_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`days_present` integer NOT NULL,
	`alpa_days` integer NOT NULL,
	`ongkos_percent` integer NOT NULL,
	`daily_pay_idr` integer NOT NULL,
	`job_share_idr` integer NOT NULL,
	`konsumsi_idr` integer NOT NULL,
	`bonus_idr` integer NOT NULL,
	`kasbon_balance_idr` integer NOT NULL,
	`kasbon_deduction_idr` integer NOT NULL,
	`take_home_idr` integer NOT NULL,
	`kasbon_remaining_idr` integer NOT NULL
);--> statement-breakpoint
INSERT INTO `__payroll_line_bak` SELECT `id`, `period_id`, `employee_id`, `days_present`, `alpa_days`, `ongkos_percent`, `daily_pay_idr`, `job_share_idr`, `konsumsi_idr`, `bonus_idr`, `kasbon_balance_idr`, `kasbon_deduction_idr`, `take_home_idr`, `kasbon_remaining_idr` FROM `payroll_line`;--> statement-breakpoint
DROP TABLE `payroll_line`;--> statement-breakpoint
DROP INDEX IF EXISTS `payroll_period_year_month_uidx`;--> statement-breakpoint
CREATE TABLE `__new_payroll_period` (
	`id` text PRIMARY KEY NOT NULL,
	`year` integer NOT NULL,
	`month` integer NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`pay_date` text NOT NULL
);--> statement-breakpoint
INSERT INTO `__new_payroll_period` (`id`, `year`, `month`, `start_date`, `end_date`, `pay_date`) SELECT `id`, `year`, `month`, `start_date`, `end_date`, `pay_date` FROM `payroll_period`;--> statement-breakpoint
DROP TABLE `payroll_period`;--> statement-breakpoint
ALTER TABLE `__new_payroll_period` RENAME TO `payroll_period`;--> statement-breakpoint
CREATE UNIQUE INDEX `payroll_period_year_month_uidx` ON `payroll_period` (`year`,`month`);--> statement-breakpoint
CREATE TABLE `payroll_line` (
	`id` text PRIMARY KEY NOT NULL,
	`period_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`days_present` integer NOT NULL,
	`alpa_days` integer NOT NULL,
	`ongkos_percent` integer NOT NULL,
	`daily_pay_idr` integer NOT NULL,
	`job_share_idr` integer NOT NULL,
	`konsumsi_idr` integer NOT NULL,
	`bonus_idr` integer NOT NULL,
	`kasbon_balance_idr` integer NOT NULL,
	`kasbon_deduction_idr` integer NOT NULL,
	`take_home_idr` integer NOT NULL,
	`kasbon_remaining_idr` integer NOT NULL,
	FOREIGN KEY (`period_id`) REFERENCES `payroll_period`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`employee_id`) REFERENCES `employee`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
INSERT INTO `payroll_line` SELECT * FROM `__payroll_line_bak`;--> statement-breakpoint
DROP TABLE `__payroll_line_bak`;--> statement-breakpoint
CREATE UNIQUE INDEX `payroll_line_periodId_employeeId_uidx` ON `payroll_line` (`period_id`,`employee_id`);
