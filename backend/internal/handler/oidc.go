package handler

import (
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"
)

func (h *Handler) oidcEnabled(c *gin.Context) {
	dataResponse(c, gin.H{"enabled": h.loginAuth != nil})
}

func (h *Handler) oidcLogin(c *gin.Context) {
	if h.loginAuth == nil {
		badRequestError(c, "external login is not configured")
		return
	}

	authURL, err := h.loginAuth.AuthURL()
	if err != nil {
		internalError(c, err, "oidc auth url")
		return
	}

	dataResponse(c, gin.H{"auth_url": authURL})
}

func (h *Handler) oidcCallback(c *gin.Context) {
	if h.loginAuth == nil {
		badRequestError(c, "external login is not configured")
		return
	}

	state := c.Query("state")
	code := c.Query("code")
	if state == "" || code == "" {
		c.Redirect(http.StatusTemporaryRedirect, "/login?error=oidc_failed")
		return
	}

	userID, err := h.loginAuth.Callback(c.Request.Context(), state, code)
	if err != nil {
		slog.Error("external login callback failed", "error", err)
		c.Redirect(http.StatusTemporaryRedirect, "/login?error=oidc_failed")
		return
	}

	slog.Info("OIDC login successful", "user", userID)
	h.createSession(c)
	c.Redirect(http.StatusTemporaryRedirect, "/")
}
