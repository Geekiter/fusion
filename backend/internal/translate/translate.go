// Package translate provides LLM-based translation via an OpenAI-compatible API.
package translate

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	stdhtml "html"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
	"unicode"
	"unicode/utf8"

	xhtml "golang.org/x/net/html"
	"golang.org/x/sync/errgroup"
)

// Config holds translation service configuration.
type Config struct {
	Enabled     bool
	APIKey      string
	APIURL      string // e.g. "https://openrouter.ai/api/v1"
	Model       string // e.g. "openai/gpt-oss-20b:free"
	Models      []string
	FallbackURL string // MyMemory-compatible endpoint used only after HTTP 429
	Prompts     PromptConfig
}

type PromptConfig struct {
	Title   string `json:"title"`
	Preview string `json:"preview"`
	Content string `json:"content"`
	Summary string `json:"summary"`
}

func DefaultPrompts() PromptConfig {
	return PromptConfig{
		Title:   "将以下标题翻译成简体中文。品牌名、产品名、人名、型号和缩写保持原文；如果只是专有名称则原样输出。只输出结果，不要添加解释、引号或前缀：\n\n{{input}}",
		Preview: "翻译以下 JSON 中的非空英文 title 和 summary 为简体中文。品牌名、产品名、人名、型号、URL 和缩写保持原文；空字段保持空字符串。只输出同结构的合法 JSON，不要代码块或解释：\n{{input}}",
		Content: "将以下文章片段翻译成简体中文，保留品牌、人名、型号、URL、段落和列表结构，只输出译文：\n\n{{input}}",
		Summary: "用简体中文总结以下文章。先用一句话概括核心结论，再列出 3 至 6 个关键要点；保留重要数字、产品名、人名和结论，不要添加原文中没有的信息：\n\n{{input}}",
	}
}

var ErrRateLimited = errors.New("translation API rate limited")
var errModelRateLimited = errors.New("translation model rate limited")

// Translator translates text using an OpenAI-compatible chat completions API.
type Translator struct {
	cfg              Config
	client           *http.Client
	logger           *slog.Logger
	mu               sync.RWMutex
	rateLimitedUntil time.Time
}

// New creates a new Translator.
func New(cfg Config) *Translator {
	cfg.Prompts = normalizePrompts(cfg.Prompts)
	return &Translator{
		cfg: cfg,
		client: &http.Client{
			Timeout: 90 * time.Second,
		},
		logger: slog.Default(),
	}
}

func (t *Translator) UpdateConfig(cfg Config) {
	cfg.Prompts = normalizePrompts(cfg.Prompts)
	t.mu.Lock()
	t.cfg = cfg
	t.rateLimitedUntil = time.Time{}
	t.mu.Unlock()
}

func (t *Translator) config() Config {
	t.mu.RLock()
	defer t.mu.RUnlock()
	cfg := t.cfg
	cfg.Models = append([]string(nil), cfg.Models...)
	return cfg
}

// NeedTranslation checks if text appears to be primarily English (needs translation to Chinese).
// Returns false for text that is already mostly CJK characters.
func NeedTranslation(text string) bool {
	trimmed := strings.TrimSpace(text)
	if trimmed == "" {
		return false
	}
	// A single token is commonly a product, project, or person name. Translating
	// it tends to corrupt the name rather than improve readability.
	if len(strings.Fields(trimmed)) == 1 {
		return false
	}

	total := 0
	cjk := 0
	for _, r := range text {
		if unicode.IsLetter(r) {
			total++
			if unicode.Is(unicode.Han, r) ||
				unicode.Is(unicode.Katakana, r) ||
				unicode.Is(unicode.Hiragana, r) ||
				unicode.Is(unicode.Hangul, r) {
				cjk++
			}
		}
	}

	if total == 0 {
		return false
	}

	// If more than 30% of letters are CJK, consider it already in an Asian language.
	return float64(cjk)/float64(total) < 0.3
}

type chatRequest struct {
	Model       string        `json:"model"`
	Messages    []chatMessage `json:"messages"`
	Temperature float64       `json:"temperature"`
	MaxTokens   int           `json:"max_tokens"`
}

type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type chatResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error"`
}

// TranslateTitle translates a single title from English to Chinese.
// Returns the translated text, or an error if translation fails.
// Returns empty string with nil error when translation is not needed.
func (t *Translator) TranslateTitle(ctx context.Context, title string) (string, error) {
	cfg := t.config()
	if !cfg.Enabled {
		return "", nil
	}

	if !NeedTranslation(title) {
		return "", nil // empty means "no translation needed"
	}

	prompt := renderPrompt(cfg.Prompts.Title, title)
	translated, err := t.complete(
		ctx,
		"你是专业的英译中助手。准确翻译描述性文字，同时严格保留品牌、产品、人名、型号和缩写。只输出最终标题。",
		prompt,
		200,
	)
	if err != nil {
		if !errors.Is(err, ErrRateLimited) {
			return "", err
		}
		translated, err = t.fallbackTranslate(ctx, title)
		if err != nil {
			return "", err
		}
	}
	translated, err = cleanTranslation(translated)
	if err != nil {
		return "", err
	}
	if strings.EqualFold(translated, strings.TrimSpace(title)) {
		return "", nil
	}

	return translated, nil
}

type PreviewTranslation struct {
	Title   string `json:"title"`
	Summary string `json:"summary"`
}

// TranslatePreview translates a title and summary in one request. Empty input
// fields remain empty, allowing callers to skip translations already stored.
func (t *Translator) TranslatePreview(ctx context.Context, title, summary string) (PreviewTranslation, error) {
	result := PreviewTranslation{}
	cfg := t.config()
	if !cfg.Enabled {
		return result, nil
	}
	if !NeedTranslation(title) {
		title = ""
	}
	if !NeedTranslation(summary) {
		summary = ""
	}
	if title == "" && summary == "" {
		return result, nil
	}

	input, err := json.Marshal(PreviewTranslation{Title: title, Summary: summary})
	if err != nil {
		return result, fmt.Errorf("marshal preview: %w", err)
	}
	prompt := renderPrompt(cfg.Prompts.Preview, string(input))
	output, err := t.complete(ctx, "你是专业英译中助手，只输出合法 JSON。", prompt, 1000)
	if err != nil {
		if !errors.Is(err, ErrRateLimited) {
			return result, err
		}
		if title != "" {
			result.Title, err = t.fallbackTranslate(ctx, title)
			if err != nil {
				return PreviewTranslation{}, err
			}
		}
		if summary != "" {
			result.Summary, err = t.fallbackTranslate(ctx, summary)
			if err != nil {
				return PreviewTranslation{}, err
			}
		}
		return cleanPreviewTranslation(result, title, summary)
	}
	output = stripCodeFence(output)
	if err := json.Unmarshal([]byte(output), &result); err != nil {
		return PreviewTranslation{}, fmt.Errorf("unmarshal preview translation: %w", err)
	}
	return cleanPreviewTranslation(result, title, summary)
}

func cleanPreviewTranslation(result PreviewTranslation, title, summary string) (PreviewTranslation, error) {
	var err error
	if result.Title != "" {
		result.Title, err = cleanTranslation(result.Title)
		if err != nil {
			return PreviewTranslation{}, err
		}
		if strings.EqualFold(result.Title, strings.TrimSpace(title)) {
			result.Title = ""
		}
	}
	if result.Summary != "" {
		result.Summary, err = cleanTranslation(result.Summary)
		if err != nil {
			return PreviewTranslation{}, err
		}
		if strings.EqualFold(result.Summary, strings.TrimSpace(summary)) {
			result.Summary = ""
		}
	}
	return result, nil
}

// TranslateContent translates extracted article text in bounded chunks. The
// result is plain text with paragraph breaks, so the frontend can render it
// without trusting model-generated HTML.
func (t *Translator) TranslateContent(ctx context.Context, text string) (string, error) {
	text = strings.TrimSpace(text)
	cfg := t.config()
	if !cfg.Enabled || !NeedTranslation(text) {
		return "", nil
	}

	chunks := splitText(text, 3500)
	translated := make([]string, len(chunks))
	var group errgroup.Group
	group.SetLimit(3)
	for index, chunk := range chunks {
		if !NeedTranslation(chunk) {
			translated[index] = chunk
			continue
		}
		index, chunk := index, chunk
		group.Go(func() error {
			output, err := t.complete(
				ctx,
				"你是专业英译中助手。保留品牌、人名、型号、URL、段落和列表结构，只输出简体中文译文。",
				renderPrompt(cfg.Prompts.Content, chunk),
				4096,
			)
			if err != nil {
				if !errors.Is(err, ErrRateLimited) {
					return err
				}
				output, err = t.fallbackTranslate(ctx, chunk)
				if err != nil {
					return err
				}
			}
			output, err = cleanTranslation(output)
			if err != nil {
				return err
			}
			translated[index] = output
			return nil
		})
	}
	if err := group.Wait(); err != nil {
		return "", err
	}
	changed := false
	for index, output := range translated {
		if !strings.EqualFold(output, strings.TrimSpace(chunks[index])) {
			changed = true
			break
		}
	}
	if !changed {
		return "", nil
	}
	return strings.Join(translated, "\n\n"), nil
}

func (t *Translator) Summarize(ctx context.Context, text string) (string, error) {
	text = strings.TrimSpace(text)
	cfg := t.config()
	if !cfg.Enabled || text == "" {
		return "", nil
	}
	// Keep summaries within common free-model context limits while preserving
	// the start and end, where RSS articles often place conclusions and links.
	const maxSummaryRunes = 14000
	runes := []rune(text)
	if len(runes) > maxSummaryRunes {
		half := maxSummaryRunes / 2
		text = string(runes[:half]) + "\n\n[中间内容已截断]\n\n" + string(runes[len(runes)-half:])
	}
	output, err := t.complete(
		ctx,
		"你是严谨的文章分析助手。总结必须忠于原文、简洁、结构清晰，并使用简体中文。",
		renderPrompt(cfg.Prompts.Summary, text),
		1200,
	)
	if err != nil {
		if !errors.Is(err, ErrRateLimited) {
			return "", err
		}
		excerpt := summarizeExcerpt(text, 1200)
		translated, fallbackErr := t.fallbackTranslate(ctx, excerpt)
		if fallbackErr != nil {
			return "", err
		}
		return "核心内容（降级摘要）：\n" + translated, nil
	}
	return cleanTranslation(output)
}

func summarizeExcerpt(text string, maxRunes int) string {
	paragraphs := strings.Split(normalizeText(text), "\n")
	var builder strings.Builder
	for _, paragraph := range paragraphs {
		paragraph = strings.TrimSpace(paragraph)
		if paragraph == "" {
			continue
		}
		remaining := maxRunes - utf8.RuneCountInString(builder.String())
		if remaining <= 0 {
			break
		}
		runes := []rune(paragraph)
		if len(runes) > remaining {
			paragraph = string(runes[:remaining])
		}
		if builder.Len() > 0 {
			builder.WriteString("\n")
		}
		builder.WriteString(paragraph)
	}
	return strings.TrimSpace(builder.String())
}

func (t *Translator) complete(ctx context.Context, system, prompt string, maxTokens int) (string, error) {
	if t.isRateLimited() {
		return "", ErrRateLimited
	}
	cfg := t.config()
	models := append([]string(nil), cfg.Models...)
	if len(models) == 0 && strings.TrimSpace(cfg.Model) != "" {
		models = []string{cfg.Model}
	}
	if len(models) == 0 {
		return "", fmt.Errorf("no translation models configured")
	}
	var lastErr error
	sawModelRateLimit := false
	for _, model := range models {
		output, err := t.completeModel(ctx, cfg, strings.TrimSpace(model), system, prompt, maxTokens)
		if err == nil {
			return output, nil
		}
		if errors.Is(err, ErrRateLimited) {
			return "", err
		}
		if errors.Is(err, errModelRateLimited) {
			sawModelRateLimit = true
		}
		lastErr = err
		t.logger.Warn("translation model failed; trying next model", "model", model, "error", err)
	}
	if sawModelRateLimit {
		return "", fmt.Errorf("%w: all configured models were rate limited", ErrRateLimited)
	}
	return "", fmt.Errorf("all translation models failed: %w", lastErr)
}

func (t *Translator) completeModel(ctx context.Context, cfg Config, model, system, prompt string, maxTokens int) (string, error) {
	req := chatRequest{
		Model: model,
		Messages: []chatMessage{
			{Role: "system", Content: system},
			{Role: "user", Content: prompt},
		},
		Temperature: 0.2,
		MaxTokens:   maxTokens,
	}
	body, err := json.Marshal(req)
	if err != nil {
		return "", fmt.Errorf("marshal request: %w", err)
	}
	url := strings.TrimSuffix(cfg.APIURL, "/") + "/chat/completions"
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+cfg.APIKey)

	resp, err := t.client.Do(httpReq)
	if err != nil {
		return "", fmt.Errorf("do request: %w", err)
	}
	defer resp.Body.Close()
	respBody, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return "", fmt.Errorf("read response: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.logger.Warn("translation API error", "status", resp.StatusCode, "body", string(respBody))
		if resp.StatusCode == http.StatusTooManyRequests {
			if bytes.Contains(bytes.ToLower(respBody), []byte("free-models-per-day")) {
				t.markRateLimited()
				return "", fmt.Errorf("%w: API returned account daily limit", ErrRateLimited)
			}
			return "", fmt.Errorf("%w: API returned status %d", errModelRateLimited, resp.StatusCode)
		}
		return "", fmt.Errorf("API returned status %d", resp.StatusCode)
	}

	var chatResp chatResponse
	if err := json.Unmarshal(respBody, &chatResp); err != nil {
		return "", fmt.Errorf("unmarshal response: %w", err)
	}
	if chatResp.Error != nil {
		return "", fmt.Errorf("API error: %s", chatResp.Error.Message)
	}
	if len(chatResp.Choices) == 0 {
		return "", fmt.Errorf("no choices in response")
	}
	return strings.TrimSpace(chatResp.Choices[0].Message.Content), nil
}

func (t *Translator) isRateLimited() bool {
	t.mu.RLock()
	defer t.mu.RUnlock()
	return time.Now().Before(t.rateLimitedUntil)
}

func (t *Translator) markRateLimited() {
	now := time.Now().UTC()
	until := now.Truncate(24 * time.Hour).Add(24 * time.Hour)
	t.mu.Lock()
	if until.After(t.rateLimitedUntil) {
		t.rateLimitedUntil = until
	}
	t.mu.Unlock()
}

type fallbackResponse struct {
	ResponseData struct {
		TranslatedText string `json:"translatedText"`
	} `json:"responseData"`
	ResponseStatus  int    `json:"responseStatus"`
	ResponseDetails string `json:"responseDetails"`
}

func (t *Translator) fallbackTranslate(ctx context.Context, text string) (string, error) {
	cfg := t.config()
	if strings.TrimSpace(cfg.FallbackURL) == "" {
		return "", ErrRateLimited
	}

	chunks := splitText(text, 450)
	translated := make([]string, 0, len(chunks))
	for _, chunk := range chunks {
		endpoint, err := url.Parse(cfg.FallbackURL)
		if err != nil {
			return "", fmt.Errorf("parse fallback URL: %w", err)
		}
		query := endpoint.Query()
		query.Set("q", chunk)
		query.Set("langpair", "en|zh-CN")
		endpoint.RawQuery = query.Encode()

		req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint.String(), nil)
		if err != nil {
			return "", fmt.Errorf("create fallback request: %w", err)
		}
		resp, err := t.client.Do(req)
		if err != nil {
			return "", fmt.Errorf("do fallback request: %w", err)
		}
		body, readErr := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
		resp.Body.Close()
		if readErr != nil {
			return "", fmt.Errorf("read fallback response: %w", readErr)
		}
		if resp.StatusCode != http.StatusOK {
			return "", fmt.Errorf("fallback API returned status %d", resp.StatusCode)
		}
		var result fallbackResponse
		if err := json.Unmarshal(body, &result); err != nil {
			return "", fmt.Errorf("unmarshal fallback response: %w", err)
		}
		if result.ResponseStatus != http.StatusOK || strings.TrimSpace(result.ResponseData.TranslatedText) == "" {
			return "", fmt.Errorf("fallback API error: %s", result.ResponseDetails)
		}
		translated = append(translated, stdhtml.UnescapeString(strings.TrimSpace(result.ResponseData.TranslatedText)))
	}
	separator := " "
	if strings.Contains(text, "\n") {
		separator = "\n\n"
	}
	return strings.Join(translated, separator), nil
}

func normalizePrompts(prompts PromptConfig) PromptConfig {
	defaults := DefaultPrompts()
	if strings.TrimSpace(prompts.Title) == "" {
		prompts.Title = defaults.Title
	}
	if strings.TrimSpace(prompts.Preview) == "" {
		prompts.Preview = defaults.Preview
	}
	if strings.TrimSpace(prompts.Content) == "" {
		prompts.Content = defaults.Content
	}
	if strings.TrimSpace(prompts.Summary) == "" {
		prompts.Summary = defaults.Summary
	}
	return prompts
}

func renderPrompt(template, input string) string {
	if strings.Contains(template, "{{input}}") {
		return strings.ReplaceAll(template, "{{input}}", input)
	}
	return strings.TrimSpace(template) + "\n\n" + input
}

func cleanTranslation(text string) (string, error) {
	text = strings.TrimSpace(text)
	text = strings.Trim(text, "\"'“”‘’")
	if text == "" || strings.Contains(strings.ToLower(text), "<unk>") {
		return "", fmt.Errorf("bad translation output: %q", text)
	}
	return text, nil
}

func stripCodeFence(text string) string {
	text = strings.TrimSpace(text)
	if !strings.HasPrefix(text, "```") {
		return text
	}
	if firstNewline := strings.IndexByte(text, '\n'); firstNewline >= 0 {
		text = text[firstNewline+1:]
	}
	text = strings.TrimSuffix(strings.TrimSpace(text), "```")
	return strings.TrimSpace(text)
}

// ExtractText converts RSS HTML into readable plain text with paragraph breaks.
func ExtractText(rawHTML string) string {
	tokenizer := xhtml.NewTokenizer(strings.NewReader(rawHTML))
	var builder strings.Builder
	skipDepth := 0
	for {
		tokenType := tokenizer.Next()
		switch tokenType {
		case xhtml.ErrorToken:
			return normalizeText(builder.String())
		case xhtml.StartTagToken:
			token := tokenizer.Token()
			name := strings.ToLower(token.Data)
			if name == "script" || name == "style" || name == "noscript" || name == "svg" {
				skipDepth++
			}
			if skipDepth == 0 && isBlockTag(name) {
				builder.WriteByte('\n')
			}
		case xhtml.SelfClosingTagToken:
			token := tokenizer.Token()
			if skipDepth == 0 && (token.Data == "br" || token.Data == "hr") {
				builder.WriteByte('\n')
			}
		case xhtml.EndTagToken:
			token := tokenizer.Token()
			name := strings.ToLower(token.Data)
			if skipDepth > 0 && (name == "script" || name == "style" || name == "noscript" || name == "svg") {
				skipDepth--
				continue
			}
			if skipDepth == 0 && isBlockTag(name) {
				builder.WriteByte('\n')
			}
		case xhtml.TextToken:
			if skipDepth == 0 {
				builder.WriteString(stdhtml.UnescapeString(string(tokenizer.Text())))
			}
		}
	}
}

func ExtractSummary(rawHTML string, maxRunes int) string {
	text := strings.ReplaceAll(ExtractText(rawHTML), "\n", " ")
	text = strings.Join(strings.Fields(text), " ")
	if maxRunes <= 0 || utf8.RuneCountInString(text) <= maxRunes {
		return text
	}
	runes := []rune(text)
	return strings.TrimSpace(string(runes[:maxRunes])) + "…"
}

func isBlockTag(name string) bool {
	switch name {
	case "p", "div", "section", "article", "header", "footer", "main", "aside", "blockquote", "pre", "li", "ul", "ol", "table", "tr", "h1", "h2", "h3", "h4", "h5", "h6", "br", "hr":
		return true
	default:
		return false
	}
}

func normalizeText(text string) string {
	lines := strings.Split(strings.ReplaceAll(text, "\r", ""), "\n")
	normalized := make([]string, 0, len(lines))
	blank := true
	for _, line := range lines {
		line = strings.Join(strings.Fields(line), " ")
		if line == "" {
			if !blank {
				normalized = append(normalized, "")
				blank = true
			}
			continue
		}
		normalized = append(normalized, line)
		blank = false
	}
	return strings.TrimSpace(strings.Join(normalized, "\n"))
}

func splitText(text string, maxRunes int) []string {
	if maxRunes <= 0 || utf8.RuneCountInString(text) <= maxRunes {
		return []string{text}
	}
	runes := []rune(text)
	chunks := make([]string, 0, (len(runes)+maxRunes-1)/maxRunes)
	for len(runes) > 0 {
		end := min(maxRunes, len(runes))
		if end < len(runes) {
			for i := end; i > maxRunes/2; i-- {
				if unicode.IsSpace(runes[i-1]) {
					end = i
					break
				}
			}
		}
		chunk := strings.TrimSpace(string(runes[:end]))
		if chunk != "" {
			chunks = append(chunks, chunk)
		}
		runes = runes[end:]
	}
	return chunks
}

// TranslateTitles batch-translates a slice of titles. Returns a map from
// original index to translated title. Only English titles are translated;
// entries that don't need translation are omitted from the result.
func (t *Translator) TranslateTitles(ctx context.Context, titles []string) map[int]string {
	result := make(map[int]string)

	for i, title := range titles {
		if !NeedTranslation(title) {
			continue
		}

		translated, err := t.TranslateTitle(ctx, title)
		if err != nil {
			t.logger.Warn("title translation failed", "title", title, "error", err)
			continue
		}

		if translated != "" {
			result[i] = translated
		}
	}

	return result
}
