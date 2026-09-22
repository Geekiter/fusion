package handler

import "testing"

func TestValidateArticleImageURL(t *testing.T) {
	valid := []string{
		"https://cdnfile.sspai.com/2026/07/image.jpg?format/webp",
		"https://img1.doubanio.com/view/photo/image.webp",
		"https://img9.doubanio.com/view/photo/image.webp",
		"https://img.hellogithub.com/i/abc_123.gif",
		"https://example.com/path/to/image.png",
		"https://sub.domain.example.org/img/test.jpg",
	}
	for _, raw := range valid {
		if _, err := validateArticleImageURL(raw); err != nil {
			t.Fatalf("valid URL rejected: %q: %v", raw, err)
		}
	}

	invalid := []string{
		"http://cdnfile.sspai.com/image.jpg",
		"https://user@cdnfile.sspai.com/image.jpg",
		"https://cdnfile.sspai.com:443/image.jpg",
		"https://127.0.0.1/image.jpg",
		"https://192.168.1.1/image.jpg",
		"https://10.0.0.1/image.jpg",
		"https://[::1]/image.jpg",
		"not-a-url",
		"",
	}
	for _, raw := range invalid {
		if _, err := validateArticleImageURL(raw); err == nil {
			t.Errorf("invalid URL accepted: %q", raw)
		}
	}
}

func TestArticleImageReferer(t *testing.T) {
	tests := []struct {
		host string
		want string
	}{
		{"cdnfile.sspai.com", "https://sspai.com/"},
		{"CDNFILE.SSPAI.COM", "https://sspai.com/"},
		{"img1.doubanio.com", "https://www.douban.com/"},
		{"img9.doubanio.com", "https://www.douban.com/"},
		{"img.hellogithub.com", "https://img.hellogithub.com/"},
		{"example.com", "https://example.com/"},
		{"sub.domain.org", "https://sub.domain.org/"},
	}
	for _, tt := range tests {
		rawURL := "https://" + tt.host + "/image.jpg"
		if got := articleImageReferer(tt.host, rawURL); got != tt.want {
			t.Errorf("articleImageReferer(%q, %q) = %q, want %q", tt.host, rawURL, got, tt.want)
		}
	}

	if got := articleImageReferer("172.17.0.1", "http://172.17.0.1:8082/pic/media%2Fabc.jpg"); got != "http://172.17.0.1:8082/" {
		t.Errorf("articleImageReferer(nitter) = %q, want %q", got, "http://172.17.0.1:8082/")
	}
}
