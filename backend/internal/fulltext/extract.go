// Package fulltext fetches and extracts readable article HTML on demand.
package fulltext

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/0x2E/fusion/internal/pkg/httpc"
	"github.com/PuerkitoBio/goquery"
)

const maxDocumentBytes = 6 << 20

var articleSelectors = []string{
	"article",
	"main",
	"[role=main]",
	".entry-content",
	".post-content",
	".article-content",
	".article-body",
	".post-body",
	".content-body",
	"#article-content",
	"#content",
}

// Fetch downloads an article and returns the most likely article body as HTML.
func Fetch(ctx context.Context, rawURL, proxyURL string, timeout time.Duration, allowPrivate bool) (string, error) {
	if err := httpc.ValidateRequestURL(ctx, rawURL, allowPrivate); err != nil {
		return "", fmt.Errorf("validate article URL: %w", err)
	}

	client, err := httpc.NewClient(timeout, proxyURL, allowPrivate)
	if err != nil {
		return "", fmt.Errorf("create article client: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return "", fmt.Errorf("create article request: %w", err)
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; FusionFeedReader/1.0)")
	req.Header.Set("Accept", "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8")

	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("fetch article: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return "", fmt.Errorf("article HTTP %d", resp.StatusCode)
	}
	if resp.ContentLength > maxDocumentBytes {
		return "", fmt.Errorf("article response is too large")
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, maxDocumentBytes+1))
	if err != nil {
		return "", fmt.Errorf("read article: %w", err)
	}
	if len(body) > maxDocumentBytes {
		return "", fmt.Errorf("article response is too large")
	}

	doc, err := goquery.NewDocumentFromReader(strings.NewReader(string(body)))
	if err != nil {
		return "", fmt.Errorf("parse article HTML: %w", err)
	}
	selection := bestArticleSelection(doc)
	if selection == nil || selection.Length() == 0 {
		return "", fmt.Errorf("article body not found")
	}
	cleanArticleSelection(selection)
	resolveRelativeURLs(selection, resp.Request.URL)
	html, err := selection.Html()
	if err != nil {
		return "", fmt.Errorf("render article HTML: %w", err)
	}
	if len(strings.TrimSpace(goquery.NewDocumentFromNode(selection.Get(0)).Text())) < 40 {
		return "", fmt.Errorf("article body is too short")
	}
	return strings.TrimSpace(html), nil
}

func bestArticleSelection(doc *goquery.Document) *goquery.Selection {
	var best *goquery.Selection
	bestScore := -1
	for _, selector := range articleSelectors {
		doc.Find(selector).Each(func(_ int, candidate *goquery.Selection) {
			score := len(strings.TrimSpace(candidate.Text())) + candidate.Find("p").Length()*80
			if score > bestScore {
				best = candidate
				bestScore = score
			}
		})
	}
	if best != nil {
		return best
	}
	return doc.Find("body").First()
}

func cleanArticleSelection(selection *goquery.Selection) {
	selection.Find("script, style, noscript, template, nav, header, footer, aside, form, iframe, svg, canvas").Remove()
	selection.Find("[hidden], [aria-hidden=true]").Remove()
	selection.Find("*").Each(func(_ int, element *goquery.Selection) {
		for _, attr := range element.Get(0).Attr {
			if strings.HasPrefix(strings.ToLower(attr.Key), "on") {
				element.RemoveAttr(attr.Key)
			}
		}
	})
}

func resolveRelativeURLs(selection *goquery.Selection, base *url.URL) {
	if base == nil {
		return
	}
	selection.Find("[href], [src]").Each(func(_ int, element *goquery.Selection) {
		for _, name := range []string{"href", "src"} {
			value, ok := element.Attr(name)
			if !ok || strings.TrimSpace(value) == "" || strings.HasPrefix(value, "#") || strings.HasPrefix(strings.ToLower(value), "data:") {
				continue
			}
			parsed, err := url.Parse(value)
			if err != nil {
				continue
			}
			element.SetAttr(name, base.ResolveReference(parsed).String())
		}
	})
}
