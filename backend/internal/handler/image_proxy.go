package handler

import (
	"fmt"
	"io"
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
	if parsed.Scheme != "https" || articleImageReferer(parsed.Hostname()) == "" || parsed.Port() != "" || parsed.User != nil {
		return nil, fmt.Errorf("image host is not allowed")
	}
	return parsed, nil
}

func articleImageReferer(host string) string {
	host = strings.ToLower(host)
	if host == "cdnfile.sspai.com" {
		return "https://sspai.com/"
	}
	const doubanSuffix = ".doubanio.com"
	if len(host) == len("img9"+doubanSuffix) && strings.HasPrefix(host, "img") && strings.HasSuffix(host, doubanSuffix) && host[3] >= '1' && host[3] <= '9' {
		return "https://www.douban.com/"
	}
	return ""
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
			_, err := validateArticleImageURL(req.URL.String())
			return err
		},
	}
	req, err := http.NewRequestWithContext(c.Request.Context(), http.MethodGet, target.String(), nil)
	if err != nil {
		internalError(c, err, "create article image request")
		return
	}
	req.Header.Set("Referer", articleImageReferer(target.Hostname()))
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
