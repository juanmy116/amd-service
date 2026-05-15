ALTER TABLE machine_counters ADD COLUMN IF NOT EXISTS day integer CHECK (day >= 1 AND day <= 31);
