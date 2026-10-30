package handler

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/net/html"
)

const (
	maxProxiedImageBytes    = 20 << 20
	maxImgurPageBytes       = 1 << 20
	maxImageRequestAttempts = 3
)

const proxiedSVGPolicy = "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:"

var allowedArticleImageTypes = map[string]bool{
	"image/avif":               true,
	"image/gif":                true,
	"image/jpeg":               true,
	"image/png":                true,
	"image/svg+xml":            true,
	"image/x-icon":             true,
	"image/vnd.microsoft.icon": true,
	"image/webp":               true,
}

func validateArticleImageURL(raw string) (*url.URL, error) {
	parsed, err := url.Parse(raw)
	if err != nil {
		return nil, fmt.Errorf("invalid image URL: %w", err)
	}

	// Allow local Nitter instance over HTTP (for self-hosted Nitter image proxying)
	if parsed.Scheme == "http" && parsed.Hostname() == "172.17.0.1" && parsed.Port() == "8082" {
		return parsed, nil
	}

	if parsed.Scheme != "https" || parsed.Port() != "" || parsed.User != nil {
		return nil, fmt.Errorf("image URL must be HTTPS without port or userinfo")
	}
	host := parsed.Hostname()
	if host == "" {
		return nil, fmt.Errorf("image host is not allowed")
	}
	// Reject literal IP addresses to prevent SSRF to internal services
	if ip := net.ParseIP(host); ip != nil {
		return nil, fmt.Errorf("image host must be a domain name, not an IP address")
	}
	return parsed, nil
}

// articleImageReferer derives the Referer header value for a given image host.
// Known special cases use a parent domain; all other hosts use their own origin.
func articleImageReferer(host string, rawURL string) string {
	host = strings.ToLower(host)
	// Local Nitter instance - use its own URL as referer
	if strings.Contains(rawURL, "172.17.0.1:8082") {
		return "http://172.17.0.1:8082/"
	}
	// Known special cases where the Referer must be a parent domain
	if host == "cdnfile.sspai.com" {
		return "https://sspai.com/"
	}
	if strings.HasSuffix(host, ".doubanio.com") {
		return "https://www.douban.com/"
	}
	// General case: use the image's own origin as Referer
	return "https://" + host + "/"
}

// Feed authors sometimes embed an Imgur album page in an image element.
func isImgurImagePage(target *url.URL) bool {
	host := strings.ToLower(target.Hostname())
	return (host == "imgur.com" || host == "www.imgur.com") &&
		(strings.HasPrefix(target.Path, "/a/") || strings.HasPrefix(target.Path, "/gallery/"))
}

func imgurCoverImage(reader io.Reader) (*url.URL, error) {
	tokenizer := html.NewTokenizer(io.LimitReader(reader, maxImgurPageBytes))
	for {
		switch tokenizer.Next() {
		case html.ErrorToken:
			return nil, fmt.Errorf("Imgur page does not contain a usable cover image")
		case html.StartTagToken, html.SelfClosingTagToken:
			token := tokenizer.Token()
			if token.Data != "meta" {
				continue
			}
			var property, content string
			for _, attr := range token.Attr {
				switch attr.Key {
				case "property":
					property = attr.Val
				case "content":
					content = attr.Val
				}
			}
			if !strings.EqualFold(property, "og:image") && !strings.EqualFold(property, "og:image:secure_url") {
				continue
			}
			target, err := validateArticleImageURL(content)
			if err == nil && strings.EqualFold(target.Hostname(), "i.imgur.com") {
				return target, nil
			}
		}
	}
}

func requestArticleImage(ctx context.Context, client *http.Client, target *url.URL) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target.String(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Referer", articleImageReferer(target.Hostname(), target.String()))
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; FusionFeedReader/1.0)")
	req.Header.Set("Accept", "image/avif,image/webp,image/apng,image/*,*/*;q=0.8")

	for attempt := 0; ; attempt++ {
		resp, err := client.Do(req.Clone(ctx))
		retryable := errors.Is(err, io.EOF) || errors.Is(err, io.ErrUnexpectedEOF) || errors.Is(err, syscall.ECONNRESET)
		if err == nil || !retryable || attempt+1 >= maxImageRequestAttempts {
			return resp, err
		}
		if resp != nil && resp.Body != nil {
			resp.Body.Close()
		}
		timer := time.NewTimer(time.Duration(attempt+1) * 150 * time.Millisecond)
		select {
		case <-ctx.Done():
			timer.Stop()
			return nil, ctx.Err()
		case <-timer.C:
		}
	}
}

func (h *Handler) proxyArticleImage(c *gin.Context) {
	target, err := validateArticleImageURL(c.Query("url"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	client := &http.Client{
		Timeout: 30 * time.Second,
		CheckRedirect: func(req *http.Request, _ []*http.Request) error {
			if _, err := validateArticleImageURL(req.URL.String()); err != nil {
				return err
			}
			req.Header.Set("Referer", articleImageReferer(req.URL.Hostname(), req.URL.String()))
			return nil
		},
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()
	resp, err := requestArticleImage(ctx, client, target)
	if err != nil {
		internalError(c, err, "fetch article image")
		return
	}
	if isImgurImagePage(target) && resp.StatusCode == http.StatusOK &&
		strings.HasPrefix(strings.ToLower(resp.Header.Get("Content-Type")), "text/html") {
		cover, coverErr := imgurCoverImage(resp.Body)
		resp.Body.Close()
		if coverErr != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": "Imgur album does not contain a usable cover image"})
			return
		}
		resp, err = requestArticleImage(ctx, client, cover)
		if err != nil {
			internalError(c, err, "fetch Imgur cover image")
			return
		}
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		c.JSON(http.StatusBadGateway, gin.H{"error": "upstream image request failed"})
		return
	}
	contentType := strings.ToLower(strings.TrimSpace(strings.Split(resp.Header.Get("Content-Type"), ";")[0]))
	if !allowedArticleImageTypes[contentType] {
		c.JSON(http.StatusBadGateway, gin.H{"error": "upstream did not return a supported image"})
		return
	}
	if resp.ContentLength > maxProxiedImageBytes {
		c.JSON(http.StatusBadGateway, gin.H{"error": "upstream image is too large"})
		return
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, maxProxiedImageBytes+1))
	if err != nil {
		internalError(c, err, "read article image")
		return
	}
	if len(body) > maxProxiedImageBytes {
		c.JSON(http.StatusBadGateway, gin.H{"error": "upstream image is too large"})
		return
	}

	if contentType == "image/svg+xml" {
		// Keep SVGs inert even when their proxy URL is opened as a document.
		c.Header("Content-Security-Policy", proxiedSVGPolicy)
	}
	c.Header("Cache-Control", "private, max-age=604800")
	c.Header("X-Content-Type-Options", "nosniff")
	c.Data(http.StatusOK, contentType, body)
}
