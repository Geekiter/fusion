import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export const supportedLocales = [
  "en",
  "zh",
  "de",
  "fr",
  "es",
  "ru",
  "pt",
  "sv",
] as const;
export type AppLocale = (typeof supportedLocales)[number];

export const articlePageSizeOptions = [10, 20, 30, 50, 100] as const;
export type ArticlePageSize = (typeof articlePageSizeOptions)[number];
export const articleListDensityOptions = ["comfortable", "compact"] as const;
export type ArticleListDensity = (typeof articleListDensityOptions)[number];
export const articleTextSizeOptions = [15, 17, 19] as const;
export type ArticleTextSize = (typeof articleTextSizeOptions)[number];

const localeSet = new Set<AppLocale>(supportedLocales);
const articlePageSizeSet = new Set<number>(articlePageSizeOptions);
const articleListDensitySet = new Set<ArticleListDensity>(
  articleListDensityOptions,
);
const articleTextSizeSet = new Set<number>(articleTextSizeOptions);

function resolveSupportedLocale(locale: string): AppLocale | null {
  const normalized = locale.toLowerCase().replace("_", "-");

  if (localeSet.has(normalized as AppLocale)) {
    return normalized as AppLocale;
  }

  const languageCode = normalized.split("-")[0];
  if (localeSet.has(languageCode as AppLocale)) {
    return languageCode as AppLocale;
  }

  return null;
}

const defaultLocale: AppLocale =
  (typeof navigator !== "undefined" &&
    resolveSupportedLocale(navigator.language)) ||
  "en";
const defaultArticlePageSize: ArticlePageSize = 10;
const defaultArticleListDensity: ArticleListDensity = "comfortable";
const defaultArticleTextSize: ArticleTextSize = 15;

function normalizeLocale(locale: string): AppLocale {
  const supportedLocale = resolveSupportedLocale(locale);
  if (supportedLocale) {
    return supportedLocale;
  }

  return defaultLocale;
}

function normalizeArticlePageSize(size: number): ArticlePageSize {
  if (articlePageSizeSet.has(size)) {
    return size as ArticlePageSize;
  }

  return defaultArticlePageSize;
}

function normalizeArticleListDensity(density: string): ArticleListDensity {
  if (articleListDensitySet.has(density as ArticleListDensity)) {
    return density as ArticleListDensity;
  }

  return defaultArticleListDensity;
}

function normalizeArticleTextSize(size: number): ArticleTextSize {
  if (articleTextSizeSet.has(size)) {
    return size as ArticleTextSize;
  }

  return defaultArticleTextSize;
}

export interface PreferencesState {
  locale: AppLocale;
  articlePageSize: ArticlePageSize;
  articleListDensity: ArticleListDensity;
  articleTextSize: ArticleTextSize;
  markArticleReadOnOpen: boolean;
  setLocale: (locale: string) => void;
  setArticlePageSize: (size: number) => void;
  setArticleListDensity: (density: string) => void;
  setArticleTextSize: (size: number) => void;
  setMarkArticleReadOnOpen: (enabled: boolean) => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      locale: defaultLocale,
      articlePageSize: defaultArticlePageSize,
      articleListDensity: defaultArticleListDensity,
      articleTextSize: defaultArticleTextSize,
      markArticleReadOnOpen: false,
      setLocale: (locale) => set({ locale: normalizeLocale(locale) }),
      setArticlePageSize: (size) =>
        set({ articlePageSize: normalizeArticlePageSize(size) }),
      setArticleListDensity: (density) =>
        set({ articleListDensity: normalizeArticleListDensity(density) }),
      setArticleTextSize: (size) =>
        set({ articleTextSize: normalizeArticleTextSize(size) }),
      setMarkArticleReadOnOpen: (enabled) =>
        set({ markArticleReadOnOpen: enabled }),
    }),
    {
      name: "fusion-preferences",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        locale: state.locale,
        articlePageSize: state.articlePageSize,
        articleListDensity: state.articleListDensity,
        articleTextSize: state.articleTextSize,
        markArticleReadOnOpen: state.markArticleReadOnOpen,
      }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<PreferencesState> | undefined;

        return {
          ...currentState,
          locale: normalizeLocale(persisted?.locale ?? currentState.locale),
          articlePageSize: normalizeArticlePageSize(
            persisted?.articlePageSize ?? currentState.articlePageSize,
          ),
          articleListDensity: normalizeArticleListDensity(
            persisted?.articleListDensity ?? currentState.articleListDensity,
          ),
          articleTextSize: normalizeArticleTextSize(
            persisted?.articleTextSize ?? currentState.articleTextSize,
          ),
          markArticleReadOnOpen:
            persisted?.markArticleReadOnOpen ?? currentState.markArticleReadOnOpen,
        };
      },
    },
  ),
);

export function getPreferredLocale(): AppLocale {
  return usePreferencesStore.getState().locale;
}
