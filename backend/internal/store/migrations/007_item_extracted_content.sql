-- Persist on-demand article full text separately from the feed-provided content.
ALTER TABLE items ADD COLUMN extracted_content TEXT DEFAULT NULL;
