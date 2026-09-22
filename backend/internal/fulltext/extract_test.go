package fulltext

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestFetchExtractsArticleAndResolvesRelativeURLs(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(`
			<html><body>
				<nav>Navigation links that must not be included</nav>
				<article><h1>Article title</h1><p>This is the first paragraph of the article body with useful information.</p><p>This is a second paragraph that makes the extracted article sufficiently long.</p><img src="images/cover.jpg"><script>alert('ignore')</script></article>
			</body></html>`))
	}))
	defer server.Close()

	content, err := Fetch(context.Background(), server.URL+"/posts/1", "", time.Second, true)
	if err != nil {
		t.Fatalf("Fetch() failed: %v", err)
	}
	if strings.Contains(content, "Navigation") || strings.Contains(content, "alert(") {
		t.Fatalf("unexpected boilerplate in extracted content: %s", content)
	}
	if !strings.Contains(content, "first paragraph") {
		t.Fatalf("expected article text in extracted content: %s", content)
	}
	if !strings.Contains(content, server.URL+"/posts/images/cover.jpg") {
		t.Fatalf("expected relative image URL to be resolved: %s", content)
	}
}

func TestFetchRejectsNonSuccessResponse(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.NotFound(w, r)
	}))
	defer server.Close()

	if _, err := Fetch(context.Background(), server.URL, "", time.Second, true); err == nil {
		t.Fatal("Fetch() succeeded for a 404 response")
	}
}
