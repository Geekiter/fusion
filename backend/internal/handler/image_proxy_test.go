package handler

import "testing"

func TestValidateArticleImageURL(t *testing.T) {
	valid := []string{
		"https://cdnfile.sspai.com/2026/07/image.jpg?format/webp",
		"https://img1.doubanio.com/view/photo/image.webp",
		"https://img9.doubanio.com/view/photo/image.webp",
	}
	for _, raw := range valid {
		if _, err := validateArticleImageURL(raw); err != nil {
			t.Fatalf("valid URL rejected: %q: %v", raw, err)
		}
	}

	invalid := []string{
		"http://cdnfile.sspai.com/image.jpg",
		"https://cdnfile.sspai.com.evil.test/image.jpg",
		"https://user@cdnfile.sspai.com/image.jpg",
		"https://cdnfile.sspai.com:443/image.jpg",
		"https://127.0.0.1/image.jpg",
		"https://img0.doubanio.com/image.webp",
		"https://img10.doubanio.com/image.webp",
		"https://img9.doubanio.com.evil.test/image.webp",
		"not-a-url",
	}
	for _, raw := range invalid {
		if _, err := validateArticleImageURL(raw); err == nil {
			t.Errorf("invalid URL accepted: %q", raw)
		}
	}
}
