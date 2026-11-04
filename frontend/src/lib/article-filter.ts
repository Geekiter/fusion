export const articleFilters = ["all", "unread", "today", "read", "starred"] as const;

export type ArticleFilter = (typeof articleFilters)[number];

export const defaultArticleFilter: ArticleFilter = "unread";

export function isArticleFilter(value: string): value is ArticleFilter {
  return articleFilters.includes(value as ArticleFilter);
}
