package handler

import (
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

const maxProxiedImageBytes = 20 << 20

var allowedArticleImageTypes = map[string]bool{
	"image/avif": true,
	"image/gif":  true,
	"image/jpeg": true,
	"image/png":  true,
	"image/webp": true,
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
	req, err := http.NewRequestWithContext(c.Request.Context(), http.MethodGet, target.String(), nil)
	if err != nil {
		internalError(c, err, "create article image request")
		return
	}
	req.Header.Set("Referer", articleImageReferer(target.Hostname(), target.String()))
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; FusionFeedReader/1.0)")
	req.Header.Set("Accept", "image/avif,image/webp,image/apng,image/*,*/*;q=0.8")

	resp, err := client.Do(req)
	if err != nil {
		internalError(c, err, "fetch article image")
		return
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

	c.Header("Cache-Control", "private, max-age=604800")
	c.Header("X-Content-Type-Options", "nosniff")
	c.Data(http.StatusOK, contentType, body)
}
