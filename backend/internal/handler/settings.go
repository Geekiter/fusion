package handler

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/0x2E/fusion/internal/store"
	"github.com/0x2E/fusion/internal/translate"
	"github.com/gin-gonic/gin"
)

const translationSettingsKey = "translation"

type translationSettings struct {
	Enabled          bool                   `json:"enabled"`
	APIURL           string                 `json:"api_url"`
	APIKey           string                 `json:"api_key,omitempty"`
	APIKeyConfigured bool                   `json:"api_key_configured"`
	Models           []string               `json:"models"`
	FallbackURL      string                 `json:"fallback_url"`
	Prompts          translate.PromptConfig `json:"prompts"`
}

type persistedTranslationSettings struct {
	Enabled      bool                   `json:"enabled"`
	APIURL       string                 `json:"api_url"`
	EncryptedKey string                 `json:"encrypted_key"`
	Models       []string               `json:"models"`
	FallbackURL  string                 `json:"fallback_url"`
	Prompts      translate.PromptConfig `json:"prompts"`
}

func (h *Handler) defaultTranslationSettings() translationSettings {
	return translationSettings{
		Enabled:          h.config.TranslateEnabled,
		APIURL:           h.config.TranslateAPIURL,
		APIKey:           h.config.TranslateAPIKey,
		APIKeyConfigured: strings.TrimSpace(h.config.TranslateAPIKey) != "",
		Models:           []string{h.config.TranslateModel},
		FallbackURL:      h.config.TranslateFallbackURL,
		Prompts:          translate.DefaultPrompts(),
	}
}

func (h *Handler) loadTranslationSettings() (translationSettings, error) {
	value, err := h.store.GetSetting(translationSettingsKey)
	if errors.Is(err, store.ErrNotFound) {
		return h.defaultTranslationSettings(), nil
	}
	if err != nil {
		return translationSettings{}, err
	}
	var persisted persistedTranslationSettings
	if err := json.Unmarshal([]byte(value), &persisted); err != nil {
		return translationSettings{}, fmt.Errorf("decode translation settings: %w", err)
	}
	apiKey, err := decryptSettingSecret(h.config.Password, persisted.EncryptedKey)
	if err != nil {
		return translationSettings{}, fmt.Errorf("decrypt translation API key: %w", err)
	}
	settings := translationSettings{
		Enabled:          persisted.Enabled,
		APIURL:           persisted.APIURL,
		APIKey:           apiKey,
		APIKeyConfigured: apiKey != "",
		Models:           persisted.Models,
		FallbackURL:      persisted.FallbackURL,
		Prompts:          persisted.Prompts,
	}
	return normalizeTranslationSettings(settings), nil
}

func normalizeTranslationSettings(settings translationSettings) translationSettings {
	seen := make(map[string]bool)
	models := make([]string, 0, len(settings.Models))
	for _, model := range settings.Models {
		model = strings.TrimSpace(model)
		if model != "" && !seen[model] {
			seen[model] = true
			models = append(models, model)
		}
	}
	settings.APIURL = strings.TrimSpace(settings.APIURL)
	settings.FallbackURL = strings.TrimSpace(settings.FallbackURL)
	settings.Models = models
	settings.APIKeyConfigured = strings.TrimSpace(settings.APIKey) != ""
	return settings
}

func validateTranslationSettings(settings translationSettings) error {
	if len(settings.Models) > 10 {
		return fmt.Errorf("at most 10 models are allowed")
	}
	if settings.Enabled && (settings.APIURL == "" || settings.APIKey == "" || len(settings.Models) == 0) {
		return fmt.Errorf("API URL, API key and at least one model are required")
	}
	for _, prompt := range []string{settings.Prompts.Title, settings.Prompts.Preview, settings.Prompts.Content, settings.Prompts.Summary} {
		if len(prompt) > 12000 {
			return fmt.Errorf("prompt is too long")
		}
	}
	return nil
}

func (h *Handler) runtimeTranslationConfig(settings translationSettings) translate.Config {
	model := ""
	if len(settings.Models) > 0 {
		model = settings.Models[0]
	}
	return translate.Config{
		Enabled: settings.Enabled, APIKey: settings.APIKey, APIURL: settings.APIURL,
		Model: model, Models: settings.Models, FallbackURL: settings.FallbackURL, Prompts: settings.Prompts,
	}
}

func (h *Handler) applyTranslationSettings(settings translationSettings) {
	cfg := h.runtimeTranslationConfig(settings)
	h.translator.UpdateConfig(cfg)
	if updater, ok := h.puller.(interface{ UpdateTranslationConfig(translate.Config) }); ok {
		updater.UpdateTranslationConfig(cfg)
	}
}

func (h *Handler) getTranslationSettings(c *gin.Context) {
	settings, err := h.loadTranslationSettings()
	if err != nil {
		internalError(c, err, "load translation settings")
		return
	}
	settings.APIKey = ""
	dataResponse(c, settings)
}

func (h *Handler) updateTranslationSettings(c *gin.Context) {
	var requested translationSettings
	if err := c.ShouldBindJSON(&requested); err != nil {
		badRequestError(c, "invalid settings")
		return
	}
	current, err := h.loadTranslationSettings()
	if err != nil {
		internalError(c, err, "load translation settings")
		return
	}
	if strings.TrimSpace(requested.APIKey) == "" {
		requested.APIKey = current.APIKey
	}
	requested = normalizeTranslationSettings(requested)
	if err := validateTranslationSettings(requested); err != nil {
		badRequestError(c, err.Error())
		return
	}
	encrypted, err := encryptSettingSecret(h.config.Password, requested.APIKey)
	if err != nil {
		internalError(c, err, "encrypt translation API key")
		return
	}
	persisted := persistedTranslationSettings{
		Enabled: requested.Enabled, APIURL: requested.APIURL, EncryptedKey: encrypted,
		Models: requested.Models, FallbackURL: requested.FallbackURL, Prompts: requested.Prompts,
	}
	value, err := json.Marshal(persisted)
	if err != nil {
		internalError(c, err, "encode translation settings")
		return
	}
	if err := h.store.UpsertSetting(translationSettingsKey, string(value)); err != nil {
		internalError(c, err, "save translation settings")
		return
	}
	h.applyTranslationSettings(requested)
	requested.APIKey = ""
	dataResponse(c, requested)
}

func (h *Handler) testTranslationSettings(c *gin.Context) {
	result, err := h.translator.TranslateTitle(c.Request.Context(), "OpenAI launches a useful new model")
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	dataResponse(c, gin.H{"result": result})
}

func encryptSettingSecret(password, plaintext string) (string, error) {
	if plaintext == "" {
		return "", nil
	}
	gcm, err := settingGCM(password)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return "v1:" + base64.RawURLEncoding.EncodeToString(ciphertext), nil
}

func decryptSettingSecret(password, encrypted string) (string, error) {
	if encrypted == "" {
		return "", nil
	}
	if !strings.HasPrefix(encrypted, "v1:") {
		return "", fmt.Errorf("unsupported encrypted value")
	}
	raw, err := base64.RawURLEncoding.DecodeString(strings.TrimPrefix(encrypted, "v1:"))
	if err != nil {
		return "", err
	}
	gcm, err := settingGCM(password)
	if err != nil {
		return "", err
	}
	if len(raw) < gcm.NonceSize() {
		return "", fmt.Errorf("encrypted value is truncated")
	}
	plain, err := gcm.Open(nil, raw[:gcm.NonceSize()], raw[gcm.NonceSize():], nil)
	if err != nil {
		return "", err
	}
	return string(plain), nil
}

func settingGCM(password string) (cipher.AEAD, error) {
	key := sha256.Sum256([]byte("fusion-translation-settings:" + password))
	block, err := aes.NewCipher(key[:])
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}
