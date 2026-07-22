package handler

import (
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"sync"

	"github.com/0x2E/fusion/internal/model"
	"github.com/0x2E/fusion/internal/store"
	"github.com/0x2E/fusion/internal/translate"
	"github.com/gin-gonic/gin"
)

const maxListLimit = 100
const maxBatchUpdateIDs = 1000

type markItemsReadRequest struct {
	IDs []int64 `json:"ids" binding:"required"`
}

type translateItemsRequest struct {
	IDs []int64 `json:"ids" binding:"required"`
}

type translateItemsResponse struct {
	Items      []*model.Item `json:"items"`
	Translated int           `json:"translated"`
	Failed     int           `json:"failed"`
}

func (h *Handler) listItems(c *gin.Context) {
	params := store.ListItemsParams{}

	if feedID := c.Query("feed_id"); feedID != "" {
		id, err := strconv.ParseInt(feedID, 10, 64)
		if err != nil {
			badRequestError(c, "invalid feed_id")
			return
		}
		params.FeedID = &id
	}

	if groupID := c.Query("group_id"); groupID != "" {
		id, err := strconv.ParseInt(groupID, 10, 64)
		if err != nil {
			badRequestError(c, "invalid group_id")
			return
		}
		params.GroupID = &id
	}

	if unread := c.Query("unread"); unread != "" {
		val, err := strconv.ParseBool(unread)
		if err != nil {
			badRequestError(c, "invalid unread")
			return
		}
		params.Unread = &val
	}

	if limit := c.Query("limit"); limit != "" {
		val, err := strconv.Atoi(limit)
		if err != nil || val <= 0 {
			badRequestError(c, "invalid limit")
			return
		}
		if val > maxListLimit {
			val = maxListLimit
		}
		params.Limit = val
	} else {
		params.Limit = 10
	}

	if before := c.Query("before"); before != "" {
		pubDate, id, err := parseCursor(before)
		if err != nil {
			badRequestError(c, "invalid before")
			return
		}
		params.BeforePubDate = &pubDate
		params.BeforeID = &id
	}

	if orderBy := c.Query("order_by"); orderBy != "" {
		params.OrderBy = orderBy
	} else {
		params.OrderBy = "pub_date"
	}

	// The cursor is keyed on pub_date, so it is only valid with the default ordering.
	if params.BeforePubDate != nil && params.OrderBy == "created_at" {
		badRequestError(c, "before cursor is only supported with default ordering (pub_date)")
		return
	}

	items, err := h.store.ListItems(params)
	if err != nil {
		internalError(c, err, "list items")
		return
	}

	total, err := h.store.CountItems(params)
	if err != nil {
		internalError(c, err, "count items")
		return
	}

	// A non-null next_cursor signals the client may request another full page.
	var nextCursor *string
	if params.Limit > 0 && len(items) >= params.Limit {
		last := items[len(items)-1]
		nc := fmt.Sprintf("%d_%d", last.PubDate, last.ID)
		nextCursor = &nc
	}
	paginatedListResponse(c, items, total, nextCursor)
}

func (h *Handler) getItem(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		badRequestError(c, "invalid id")
		return
	}

	item, err := h.store.GetItem(id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			notFoundError(c, "item")
			return
		}
		internalError(c, err, "get item")
		return
	}

	dataResponse(c, item)
}

func (h *Handler) markItemsRead(c *gin.Context) {
	var req markItemsReadRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		badRequestError(c, "invalid request")
		return
	}
	if len(req.IDs) == 0 || len(req.IDs) > maxBatchUpdateIDs {
		badRequestError(c, "invalid ids")
		return
	}

	if err := h.store.BatchUpdateItemsUnread(req.IDs, false); err != nil {
		internalError(c, err, "mark items as read")
		return
	}

	c.Status(http.StatusNoContent)
}

func (h *Handler) markItemsUnread(c *gin.Context) {
	var req markItemsReadRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		badRequestError(c, "invalid request")
		return
	}
	if len(req.IDs) == 0 || len(req.IDs) > maxBatchUpdateIDs {
		badRequestError(c, "invalid ids")
		return
	}

	if err := h.store.BatchUpdateItemsUnread(req.IDs, true); err != nil {
		internalError(c, err, "mark items as unread")
		return
	}

	c.Status(http.StatusNoContent)
}

func (h *Handler) translateItemPreviews(c *gin.Context) {
	var req translateItemsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		badRequestError(c, "invalid request")
		return
	}
	if len(req.IDs) == 0 || len(req.IDs) > maxListLimit {
		badRequestError(c, "invalid ids")
		return
	}
	if h.translator == nil {
		internalError(c, errors.New("translator unavailable"), "translate item previews")
		return
	}

	items, err := h.store.GetItemsByIDs(req.IDs)
	if err != nil {
		internalError(c, err, "get items for translation")
		return
	}

	type result struct {
		item    *model.Item
		changed bool
		err     error
	}
	jobs := make(chan *model.Item)
	results := make(chan result, len(items))
	workerCount := min(3, len(items))
	var workers sync.WaitGroup
	for range workerCount {
		workers.Add(1)
		go func() {
			defer workers.Done()
			for item := range jobs {
				title := ""
				if item.TranslatedTitle == nil {
					title = item.Title
				}
				summary := ""
				if item.TranslatedSummary == nil {
					summary = translate.ExtractSummary(item.Content, 150)
				}
				translated, err := h.translator.TranslatePreview(c.Request.Context(), title, summary)
				if err != nil {
					results <- result{item: item, err: err}
					continue
				}
				var translatedTitle, translatedSummary *string
				if translated.Title != "" {
					translatedTitle = &translated.Title
				}
				if translated.Summary != "" {
					translatedSummary = &translated.Summary
				}
				changed := translatedTitle != nil || translatedSummary != nil
				if changed {
					if err := h.store.UpdateItemTranslations(item.ID, translatedTitle, translatedSummary, nil); err != nil {
						results <- result{item: item, err: err}
						continue
					}
					item, err = h.store.GetItem(item.ID)
					if err != nil {
						results <- result{item: item, err: err}
						continue
					}
				}
				results <- result{item: item, changed: changed}
			}
		}()
	}
	go func() {
		for _, item := range items {
			jobs <- item
		}
		close(jobs)
		workers.Wait()
		close(results)
	}()

	response := translateItemsResponse{Items: make([]*model.Item, 0, len(items))}
	byID := make(map[int64]*model.Item, len(items))
	for translatedResult := range results {
		if translatedResult.err != nil {
			response.Failed++
			slog.Warn("item preview translation failed", "item_id", translatedResult.item.ID, "error", translatedResult.err)
		} else if translatedResult.changed {
			response.Translated++
		}
		byID[translatedResult.item.ID] = translatedResult.item
	}
	for _, item := range items {
		response.Items = append(response.Items, byID[item.ID])
	}
	dataResponse(c, response)
}

func (h *Handler) translateItemContent(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		badRequestError(c, "invalid id")
		return
	}
	if h.translator == nil {
		internalError(c, errors.New("translator unavailable"), "translate item content")
		return
	}
	item, err := h.store.GetItem(id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			notFoundError(c, "item")
			return
		}
		internalError(c, err, "get item for content translation")
		return
	}
	if item.TranslatedContent == nil {
		plainText := translate.ExtractText(item.Content)
		translatedContent, err := h.translator.TranslateContent(c.Request.Context(), plainText)
		if err != nil {
			slog.Warn("item content translation failed", "item_id", id, "error", err)
			c.JSON(http.StatusBadGateway, gin.H{"error": "content translation failed"})
			return
		}
		if translatedContent != "" {
			if err := h.store.UpdateItemTranslations(id, nil, nil, &translatedContent); err != nil {
				internalError(c, err, "save item content translation")
				return
			}
			item, err = h.store.GetItem(id)
			if err != nil {
				internalError(c, err, "get translated item")
				return
			}
		}
	}
	dataResponse(c, item)
}

func (h *Handler) summarizeItem(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		badRequestError(c, "invalid id")
		return
	}
	item, err := h.store.GetItem(id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			notFoundError(c, "item")
			return
		}
		internalError(c, err, "get item for summary")
		return
	}
	if item.AISummary == nil {
		plainText := translate.ExtractText(item.Content)
		if item.TranslatedContent != nil && strings.TrimSpace(*item.TranslatedContent) != "" {
			plainText = *item.TranslatedContent
		}
		summary, err := h.translator.Summarize(c.Request.Context(), plainText)
		if err != nil {
			slog.Warn("item summary failed", "item_id", id, "error", err)
			c.JSON(http.StatusBadGateway, gin.H{"error": "article summary failed"})
			return
		}
		if summary != "" {
			if err := h.store.UpdateItemAISummary(id, summary); err != nil {
				internalError(c, err, "save item summary")
				return
			}
			item, err = h.store.GetItem(id)
			if err != nil {
				internalError(c, err, "get summarized item")
				return
			}
		}
	}
	dataResponse(c, item)
}
