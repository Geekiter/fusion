package translate

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

func TestNeedTranslation(t *testing.T) {
	tests := []struct {
		name string
		text string
		want bool
	}{
		{name: "english", text: "OpenAI launches a new model", want: true},
		{name: "chinese", text: "OpenAI 发布新模型", want: false},
		{name: "japanese", text: "新しいモデルを発表", want: false},
		{name: "empty", text: "  ", want: false},
		{name: "symbols only", text: "123 / 456", want: false},
		{name: "single product name", text: "Buzzy", want: false},
		{name: "single lowercase name", text: "box", want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := NeedTranslation(tt.text); got != tt.want {
				t.Fatalf("NeedTranslation(%q) = %v, want %v", tt.text, got, tt.want)
			}
		})
	}
}

func TestExtractTextAndSummary(t *testing.T) {
	raw := `<article><h1>Hello &amp; welcome</h1><p>First paragraph.</p><script>bad()</script><p>Second <strong>paragraph</strong>.</p></article>`
	text := ExtractText(raw)
	if strings.Contains(text, "bad()") {
		t.Fatalf("script content leaked into text: %q", text)
	}
	for _, want := range []string{"Hello & welcome", "First paragraph.", "Second paragraph."} {
		if !strings.Contains(text, want) {
			t.Errorf("expected extracted text to contain %q, got %q", want, text)
		}
	}
	if got := ExtractSummary(raw, 12); got != "Hello & welc…" {
		t.Fatalf("unexpected summary: %q", got)
	}
}

func TestTranslatePreview(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Authorization"); got != "Bearer test-key" {
			t.Fatalf("unexpected authorization header: %q", got)
		}
		var request chatRequest
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		if !strings.Contains(request.Messages[1].Content, `"title":"OpenAI launches a model"`) {
			t.Fatalf("unexpected prompt: %q", request.Messages[1].Content)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []any{map[string]any{
				"message": map[string]any{"content": "```json\n{\"title\":\"OpenAI 发布新模型\",\"summary\":\"这是中文摘要\"}\n```"},
			}},
		})
	}))
	defer server.Close()

	translator := New(Config{Enabled: true, APIKey: "test-key", APIURL: server.URL, Model: "test"})
	result, err := translator.TranslatePreview(context.Background(), "OpenAI launches a model", "This is a useful English summary")
	if err != nil {
		t.Fatalf("TranslatePreview() failed: %v", err)
	}
	if result.Title != "OpenAI 发布新模型" || result.Summary != "这是中文摘要" {
		t.Fatalf("unexpected preview translation: %+v", result)
	}
}

func TestTranslateContent(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []any{map[string]any{
				"message": map[string]any{"content": "这是翻译后的正文。"},
			}},
		})
	}))
	defer server.Close()

	translator := New(Config{Enabled: true, APIKey: "test-key", APIURL: server.URL, Model: "test"})
	result, err := translator.TranslateContent(context.Background(), "This is the full English article content.")
	if err != nil {
		t.Fatalf("TranslateContent() failed: %v", err)
	}
	if result != "这是翻译后的正文。" {
		t.Fatalf("unexpected content translation: %q", result)
	}
}

func TestRateLimitFallsBackAndOpensCircuit(t *testing.T) {
	var primaryCalls atomic.Int32
	primary := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		primaryCalls.Add(1)
		w.WriteHeader(http.StatusTooManyRequests)
		_, _ = w.Write([]byte(`{"error":{"message":"free-models-per-day limit reached"}}`))
	}))
	defer primary.Close()

	fallback := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		translations := map[string]string{
			"OpenAI launches a model":            "OpenAI 发布新模型",
			"This is a useful English summary":   "这是一段有用的英文摘要",
			"Another English article title":      "另一篇英文文章标题",
			"Another useful English description": "另一段有用的英文描述",
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"responseData":   map[string]any{"translatedText": translations[r.URL.Query().Get("q")]},
			"responseStatus": http.StatusOK,
		})
	}))
	defer fallback.Close()

	translator := New(Config{
		Enabled: true, APIKey: "test-key", APIURL: primary.URL,
		Model: "test", FallbackURL: fallback.URL,
	})
	first, err := translator.TranslatePreview(context.Background(), "OpenAI launches a model", "This is a useful English summary")
	if err != nil {
		t.Fatalf("first fallback translation failed: %v", err)
	}
	if first.Title != "OpenAI 发布新模型" || first.Summary != "这是一段有用的英文摘要" {
		t.Fatalf("unexpected first fallback translation: %+v", first)
	}
	second, err := translator.TranslatePreview(context.Background(), "Another English article title", "Another useful English description")
	if err != nil {
		t.Fatalf("second fallback translation failed: %v", err)
	}
	if second.Title != "另一篇英文文章标题" || second.Summary != "另一段有用的英文描述" {
		t.Fatalf("unexpected second fallback translation: %+v", second)
	}
	if got := primaryCalls.Load(); got != 1 {
		t.Fatalf("primary API called %d times after circuit opened, want 1", got)
	}
}

func TestModelChainFallsBackInOrder(t *testing.T) {
	var models []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var request chatRequest
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		models = append(models, request.Model)
		if request.Model == "model-a" {
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []any{map[string]any{
				"message": map[string]any{"content": "OpenAI 发布了一个实用的新模型"},
			}},
		})
	}))
	defer server.Close()

	translator := New(Config{
		Enabled: true, APIKey: "test-key", APIURL: server.URL,
		Models: []string{"model-a", "model-b"}, Prompts: DefaultPrompts(),
	})
	result, err := translator.TranslateTitle(context.Background(), "OpenAI launches a useful new model")
	if err != nil {
		t.Fatalf("TranslateTitle() failed: %v", err)
	}
	if result == "" {
		t.Fatal("expected translated title")
	}
	if strings.Join(models, ",") != "model-a,model-b" {
		t.Fatalf("unexpected model order: %v", models)
	}
}

func TestSummarizeUsesConfiguredPrompt(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var request chatRequest
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		if !strings.Contains(request.Messages[1].Content, "CUSTOM: Article body") {
			t.Fatalf("custom prompt not rendered: %q", request.Messages[1].Content)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []any{map[string]any{
				"message": map[string]any{"content": "核心结论。\n- 要点一"},
			}},
		})
	}))
	defer server.Close()

	translator := New(Config{
		Enabled: true, APIKey: "test-key", APIURL: server.URL, Model: "test",
		Prompts: PromptConfig{Summary: "CUSTOM: {{input}}"},
	})
	result, err := translator.Summarize(context.Background(), "Article body with useful details.")
	if err != nil || !strings.Contains(result, "核心结论") {
		t.Fatalf("unexpected summary result=%q err=%v", result, err)
	}
}
