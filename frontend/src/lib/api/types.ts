// Core data models (matching backend/internal/model/model.go)
export interface Group {
  id: number;
  name: string;
  created_at: number;
  updated_at: number;
}

export interface Feed {
  id: number;
  group_id: number;
  name: string;
  link: string;
  site_url?: string;
  suspended: boolean;
  proxy?: string;
  created_at: number;
  updated_at: number;
  fetch_state: FeedFetchState;
  unread_count: number;
  item_count: number;
}

export interface FeedFetchState {
  etag?: string;
  last_modified?: string;
  cache_control?: string;
  expires_at: number;
  last_checked_at: number;
  next_check_at: number;
  last_http_status: number;
  retry_after_until: number;
  last_success_at: number;
  last_error_at: number;
  last_error?: string;
  consecutive_failures: number;
}

export interface Item {
  id: number;
  feed_id: number;
  guid: string;
  title: string;
  link: string;
  content: string;
  pub_date: number;
  unread: boolean;
  created_at: number;
  translated_title?: string;
  translated_summary?: string;
  translated_content?: string;
  ai_summary?: string;
  // Full article HTML fetched from the item's original link on demand.
  extracted_content?: string;
}

export interface Bookmark {
  id: number;
  item_id: number | null;
  link: string;
  title: string;
  content: string;
  pub_date: number;
  feed_name: string;
  feed_id: number | null;
  unread: boolean;
  created_at: number;
  translated_title?: string;
  translated_summary?: string;
  translated_content?: string;
  ai_summary?: string;
}

// API response wrappers
export interface APIResponse<T> {
  data?: T;
  error?: string;
}

export interface ListAPIResponse<T> {
  data: T[];
  total: number;
  next_cursor: string | null;
}

// Request types
export interface LoginRequest {
  password: string;
}

export interface CreateGroupRequest {
  name: string;
}

export interface UpdateGroupRequest {
  name: string;
}

export interface CreateFeedRequest {
  group_id: number;
  name: string;
  link: string;
  site_url?: string;
  proxy?: string;
}

export interface UpdateFeedRequest {
  group_id?: number;
  name?: string;
  link?: string;
  site_url?: string;
  suspended?: boolean;
  proxy?: string;
}

export interface ValidateFeedRequest {
  url: string;
}

export interface DiscoveredFeed {
  title: string;
  link: string;
}

export interface ValidateFeedResponse {
  feeds: DiscoveredFeed[];
}

export interface CreateBookmarkRequest {
  item_id?: number;
  link: string;
  title: string;
  content: string;
  pub_date: number;
  feed_name: string;
}

export interface MarkItemsReadRequest {
  ids: number[];
}

export interface TranslateItemsRequest {
  ids: number[];
}

export interface TranslateItemsResponse {
  items: Item[];
  translated: number;
  failed: number;
}

export interface TranslationPrompts {
  title: string;
  preview: string;
  content: string;
  summary: string;
}

export interface TranslationSettings {
  enabled: boolean;
  auto_translate_new_items: boolean;
  api_url: string;
  api_key?: string;
  api_key_configured: boolean;
  models: string[];
  fallback_url: string;
  prompts: TranslationPrompts;
}

export interface ListItemsParams {
  feed_id?: number;
  group_id?: number;
  unread?: boolean;
  limit?: number;
  before?: string;
  order_by?: string;
}

export interface ListBookmarksParams {
  feed_id?: number;
  group_id?: number;
  limit?: number;
  before?: string;
}

export interface BatchCreateFeedsRequest {
  feeds: Array<{
    group_id: number;
    name: string;
    link: string;
    site_url?: string;
  }>;
}

export interface SearchFeed {
  id: number;
  name: string;
  link: string;
  site_url: string;
}

export interface SearchItem {
  id: number;
  feed_id: number;
  title: string;
  pub_date: number;
}

export interface SearchResponse {
  feeds: SearchFeed[];
  items: SearchItem[];
}

export interface BatchCreateFeedsResponse {
  created: number;
  failed: number;
  errors?: string[];
}

// OIDC
export interface OIDCStatusResponse {
  enabled: boolean;
}

export interface OIDCLoginResponse {
  auth_url: string;
}
