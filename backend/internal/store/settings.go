package store

import (
	"database/sql"
	"errors"
	"fmt"
)

func (s *Store) GetSetting(key string) (string, error) {
	var value string
	err := s.db.QueryRow(`SELECT value FROM app_settings WHERE key = :key`, sql.Named("key", key)).Scan(&value)
	if errors.Is(err, sql.ErrNoRows) {
		return "", fmt.Errorf("%w: setting", ErrNotFound)
	}
	if err != nil {
		return "", fmt.Errorf("get setting: %w", err)
	}
	return value, nil
}

func (s *Store) UpsertSetting(key, value string) error {
	_, err := s.db.Exec(`
		INSERT INTO app_settings (key, value, updated_at)
		VALUES (:key, :value, unixepoch())
		ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
	`, sql.Named("key", key), sql.Named("value", value))
	if err != nil {
		return fmt.Errorf("upsert setting: %w", err)
	}
	return nil
}
