-- Persist on-demand list summaries and full article translations.
ALTER TABLE items ADD COLUMN translated_summary TEXT DEFAULT NULL;
ALTER TABLE items ADD COLUMN translated_content TEXT DEFAULT NULL;

