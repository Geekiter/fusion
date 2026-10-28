package auth

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"golang.org/x/oauth2"
)

// OAuthAuthenticator handles a standard OAuth2 authorization-code flow for
// providers that expose a user-info endpoint instead of an OIDC id_token.
type OAuthAuthenticator struct {
	oauth2Config oauth2.Config
	userInfoURL  string
	allowedUser  string

	mu     sync.Mutex
	states map[string]oauthState
}

type oauthState struct {
	createdAt time.Time
}

const oauthStateMaxAge = 10 * time.Minute

// NewOAuth creates an OAuth2 authenticator. The token endpoint is configured
// to receive client credentials in the request body, as required by
// Mattermost's OAuth2 provider.
func NewOAuth(authorizeURL, tokenURL, userInfoURL, clientID, clientSecret, redirectURI string, scopes []string) (*OAuthAuthenticator, error) {
	if strings.TrimSpace(authorizeURL) == "" || strings.TrimSpace(tokenURL) == "" || strings.TrimSpace(userInfoURL) == "" {
		return nil, fmt.Errorf("oauth authorize, token, and user-info URLs are required")
	}
	if strings.TrimSpace(clientID) == "" || strings.TrimSpace(clientSecret) == "" {
		return nil, fmt.Errorf("oauth client ID and secret are required")
	}
	if strings.TrimSpace(redirectURI) == "" {
		return nil, fmt.Errorf("oauth redirect URI is required")
	}

	return &OAuthAuthenticator{
		oauth2Config: oauth2.Config{
			ClientID:     clientID,
			ClientSecret: clientSecret,
			RedirectURL:  redirectURI,
			Endpoint: oauth2.Endpoint{
				AuthURL:   authorizeURL,
				TokenURL:  tokenURL,
				AuthStyle: oauth2.AuthStyleInParams,
			},
			Scopes: scopes,
		},
		userInfoURL: userInfoURL,
		states:      make(map[string]oauthState),
	}, nil
}

// SetAllowedUser restricts login to a specific provider identity.
func (a *OAuthAuthenticator) SetAllowedUser(user string) {
	a.allowedUser = strings.TrimSpace(user)
}

// AuthURL generates an authorization URL with a CSRF state value.
func (a *OAuthAuthenticator) AuthURL() (string, error) {
	state, err := randomString(32)
	if err != nil {
		return "", fmt.Errorf("generate state: %w", err)
	}

	a.mu.Lock()
	a.cleanExpiredStates()
	a.states[state] = oauthState{createdAt: time.Now()}
	a.mu.Unlock()

	return a.oauth2Config.AuthCodeURL(state), nil
}

// Callback exchanges the authorization code and resolves the provider user
// through the configured user-info endpoint.
func (a *OAuthAuthenticator) Callback(ctx context.Context, state, code string) (string, error) {
	a.mu.Lock()
	entry, ok := a.states[state]
	if ok {
		delete(a.states, state)
	}
	a.mu.Unlock()

	if !ok {
		return "", fmt.Errorf("invalid or expired state")
	}
	if time.Since(entry.createdAt) > oauthStateMaxAge {
		return "", fmt.Errorf("state expired")
	}

	token, err := a.oauth2Config.Exchange(ctx, code)
	if err != nil {
		return "", fmt.Errorf("token exchange: %w", err)
	}

	client := oauth2.NewClient(ctx, oauth2.StaticTokenSource(token))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, a.userInfoURL, nil)
	if err != nil {
		return "", fmt.Errorf("create user-info request: %w", err)
	}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("request user info: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4<<10))
		return "", fmt.Errorf("user-info endpoint returned %s: %s", resp.Status, strings.TrimSpace(string(body)))
	}

	var user struct {
		ID       string `json:"id"`
		Username string `json:"username"`
		Email    string `json:"email"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&user); err != nil {
		return "", fmt.Errorf("decode user info: %w", err)
	}

	userID := strings.TrimSpace(user.Email)
	if userID == "" {
		userID = strings.TrimSpace(user.Username)
	}
	if userID == "" {
		userID = strings.TrimSpace(user.ID)
	}
	if userID == "" {
		return "", fmt.Errorf("user-info response does not contain an identity")
	}
	if a.allowedUser != "" && a.allowedUser != userID && a.allowedUser != strings.TrimSpace(user.ID) && a.allowedUser != strings.TrimSpace(user.Username) {
		return "", fmt.Errorf("user %q is not allowed", userID)
	}

	return userID, nil
}

func (a *OAuthAuthenticator) cleanExpiredStates() {
	now := time.Now()
	for state, entry := range a.states {
		if now.Sub(entry.createdAt) > oauthStateMaxAge {
			delete(a.states, state)
		}
	}
}
