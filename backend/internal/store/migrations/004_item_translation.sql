-- Add translated_title column to items table for storing translated titles.
-- NULL means not yet translated or translation not needed (e.g., already in Chinese).
ALTER TABLE items ADD COLUMN translated_title TEXT DEFAULT NULL;
