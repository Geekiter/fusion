package handler

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

type imageRoundTripFunc func(*http.Request) (*http.Response, error)

func (f imageRoundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

func imageTestResponse(status int, contentType, body string) *http.Response {
	return &http.Response{
		StatusCode:    status,
		Header:        http.Header{"Content-Type": {contentType}},
		Body:          io.NopCloser(strings.NewReader(body)),
		ContentLength: int64(len(body)),
	}
}

func TestProxyArticleImageAdditionalFormats(t *testing.T) {
	for _, contentType := range []string{"image/svg+xml", "image/x-icon", "image/vnd.microsoft.icon"} {
		t.Run(contentType, func(t *testing.T) {
			original := http.DefaultTransport
			t.Cleanup(func() { http.DefaultTransport = original })
			body := `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect width="10" height="10"/></svg>`
			http.DefaultTransport = imageRoundTripFunc(func(*http.Request) (*http.Response, error) {
				return imageTestResponse(http.StatusOK, contentType, body), nil
			})
			recorder := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(recorder)
			c.Request = httptest.NewRequest(http.MethodGet, "/api/images/proxy?url="+url.QueryEscape("https://cdn.example.com/image"), nil)
			(&Handler{}).proxyArticleImage(c)
			if recorder.Code != http.StatusOK || recorder.Body.String() != body {
				t.Fatalf("image was not forwarded: status=%d body=%q", recorder.Code, recorder.Body.String())
			}
			if contentType == "image/svg+xml" {
				policy := recorder.Header().Get("Content-Security-Policy")
				if !strings.Contains(policy, "sandbox") || !strings.Contains(policy, "default-src 'none'") {
					t.Fatalf("SVG is missing its sandbox policy: %q", policy)
				}
			}
			if recorder.Header().Get("X-Content-Type-Options") != "nosniff" {
				t.Fatal("proxied image is missing nosniff")
			}
		})
	}
}

func TestImgurCoverImage(t *testing.T) {
	cases := []struct{ name, page, want string }{
		{"cover", `<meta property="og:image" content="https://i.imgur.com/photo.jpeg?x=1&amp;y=2">`, "https://i.imgur.com/photo.jpeg?x=1&y=2"},
		{"secure cover", `<meta content="https://i.imgur.com/photo.png" property="og:image:secure_url"/>`, "https://i.imgur.com/photo.png"},
		{"other host", `<meta property="og:image" content="https://example.com/photo.png">`, ""},
		{"lookalike host", `<meta property="og:image" content="https://i.imgur.com.evil.example/photo.png">`, ""},
		{"private URL", `<meta property="og:image" content="https://127.0.0.1/photo.png">`, ""},
		{"credentials", `<meta property="og:image" content="https://user@i.imgur.com/photo.png">`, ""},
		{"missing", `<html><body>No image</body></html>`, ""},
		{"oversized page", strings.Repeat(" ", maxImgurPageBytes) + `<meta property="og:image" content="https://i.imgur.com/photo.png">`, ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			target, err := imgurCoverImage(strings.NewReader(tc.page))
			if tc.want == "" {
				if err == nil {
					t.Fatalf("unusable cover accepted: %s", target)
				}
			} else if err != nil || target.String() != tc.want {
				t.Fatalf("cover=%v error=%v, want %q", target, err, tc.want)
			}
		})
	}
}

func TestProxyArticleImageImgurAlbum(t *testing.T) {
	original := http.DefaultTransport
	t.Cleanup(func() { http.DefaultTransport = original })
	calls := 0
	http.DefaultTransport = imageRoundTripFunc(func(req *http.Request) (*http.Response, error) {
		calls++
		switch req.URL.Hostname() {
		case "imgur.com":
			return imageTestResponse(http.StatusOK, "text/html; charset=utf-8", `<meta property="og:image" content="https://i.imgur.com/photo.jpg">`), nil
		case "i.imgur.com":
			return imageTestResponse(http.StatusOK, "image/jpeg", "album cover bytes"), nil
		default:
			t.Fatalf("unexpected host: %s", req.URL.Hostname())
			return nil, errors.New("unexpected host")
		}
	})
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/images/proxy?url="+url.QueryEscape("https://imgur.com/a/album"), nil)
	(&Handler{}).proxyArticleImage(c)
	if recorder.Code != http.StatusOK || recorder.Body.String() != "album cover bytes" || calls != 2 {
		t.Fatalf("album not resolved: status=%d body=%q requests=%d", recorder.Code, recorder.Body.String(), calls)
	}
}

func TestProxyArticleImageRejectsOtherHTMLPages(t *testing.T) {
	original := http.DefaultTransport
	t.Cleanup(func() { http.DefaultTransport = original })
	calls := 0
	http.DefaultTransport = imageRoundTripFunc(func(*http.Request) (*http.Response, error) {
		calls++
		return imageTestResponse(http.StatusOK, "text/html", `<meta property="og:image" content="https://i.imgur.com/photo.jpg">`), nil
	})
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/images/proxy?url="+url.QueryEscape("https://example.com/a/album"), nil)
	(&Handler{}).proxyArticleImage(c)
	if recorder.Code != http.StatusBadGateway || calls != 1 {
		t.Fatalf("non-image HTML accepted: status=%d requests=%d", recorder.Code, calls)
	}
}

func TestRequestArticleImageRetriesDisconnects(t *testing.T) {
	calls := 0
	client := &http.Client{Transport: imageRoundTripFunc(func(*http.Request) (*http.Response, error) {
		calls++
		if calls < 3 {
			return nil, io.EOF
		}
		return imageTestResponse(http.StatusOK, "image/png", "image bytes"), nil
	})}
	target, _ := url.Parse("https://cdn.example.com/image.png")
	response, err := requestArticleImage(context.Background(), client, target)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK || calls != 3 {
		t.Fatalf("disconnect did not recover: status=%d requests=%d", response.StatusCode, calls)
	}
}

func TestRequestArticleImageCancellationStopsRetries(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	calls := 0
	client := &http.Client{Transport: imageRoundTripFunc(func(*http.Request) (*http.Response, error) {
		calls++
		cancel()
		return nil, io.EOF
	})}
	target, _ := url.Parse("https://cdn.example.com/image.png")
	_, err := requestArticleImage(ctx, client, target)
	if !errors.Is(err, context.Canceled) || calls != 1 {
		t.Fatalf("canceled request was retried: error=%v requests=%d", err, calls)
	}
}

func TestRequestArticleImageDoesNotRetryMissingImages(t *testing.T) {
	calls := 0
	client := &http.Client{Transport: imageRoundTripFunc(func(*http.Request) (*http.Response, error) {
		calls++
		return imageTestResponse(http.StatusNotFound, "text/plain", "Not Found"), nil
	})}
	target, _ := url.Parse("https://cdn.example.com/missing.png")
	response, err := requestArticleImage(context.Background(), client, target)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusNotFound || calls != 1 {
		t.Fatalf("missing image was retried: status=%d requests=%d", response.StatusCode, calls)
	}
}
