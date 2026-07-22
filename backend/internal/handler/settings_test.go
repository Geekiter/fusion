package handler

import "testing"

func TestSettingSecretRoundTrip(t *testing.T) {
	encrypted, err := encryptSettingSecret("password", "secret-api-key")
	if err != nil {
		t.Fatalf("encryptSettingSecret() failed: %v", err)
	}
	if encrypted == "secret-api-key" || encrypted == "" {
		t.Fatalf("secret was not encrypted: %q", encrypted)
	}
	decrypted, err := decryptSettingSecret("password", encrypted)
	if err != nil {
		t.Fatalf("decryptSettingSecret() failed: %v", err)
	}
	if decrypted != "secret-api-key" {
		t.Fatalf("unexpected decrypted secret: %q", decrypted)
	}
	if _, err := decryptSettingSecret("wrong-password", encrypted); err == nil {
		t.Fatal("expected decryption with wrong password to fail")
	}
}
