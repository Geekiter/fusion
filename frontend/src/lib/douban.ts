/**
 * Parse douban movie RSS item content into structured data.
 *
 * RSSHub returns content like:
 * <p>八仙！</p><p>8.3</p><p>2026 / 中国大陆 / 喜剧 动画 奇幻 冒险 / 牟正洋 / 陈浩 李绍哲</p><img src="https://img9.doubanio.com/view/photo/m_ratio_poster/public/p2934074566.webp" referrerpolicy="no-referrer">
 */

export interface DoubanMovie {
  title: string;
  rating: number | null;
  year: string;
  countries: string;
  genres: string;
  director: string;
  cast: string;
  posterUrl: string | null;
  doubanLink: string | null;
}

function proxyImageUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol === "https:" &&
      !parsed.port &&
      !parsed.username &&
      !parsed.password &&
      parsed.hostname
    ) {
      return `/api/images/proxy?url=${encodeURIComponent(url)}`;
    }
  } catch {
    return url;
  }
  return url;
}

export function parseDoubanMovie(
  content: string,
  title: string,
  link: string,
): DoubanMovie | null {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, "text/html");
    const paragraphs = doc.querySelectorAll("p");
    const img = doc.querySelector("img");

    const movieTitle = paragraphs[0]?.textContent?.trim() || title;

    // RSSHub returns 3 <p> tags when there is a rating (title, rating, info),
    // but only 2 <p> tags when there is no rating (title, info).
    // Detect by checking whether the second <p> looks like a short numeric rating.
    const secondText = paragraphs[1]?.textContent?.trim() || "";
    const isSecondRating = secondText !== "" && /^\d+(\.\d+)?$/.test(secondText);

    let rating: number | null = null;
    let infoText: string;
    if (isSecondRating) {
      rating = parseFloat(secondText);
      if (isNaN(rating)) rating = null;
      infoText = paragraphs[2]?.textContent?.trim() || "";
    } else {
      infoText = secondText;
    }

    // Parse info: "2026 / 中国大陆 / 喜剧 动画 奇幻 冒险 / 牟正洋 / 陈浩 李绍哲"
    const infoParts = infoText.split(" / ").map((s) => s.trim());
    const year = infoParts[0] || "";
    const countries = infoParts[1] || "";
    const genres = infoParts[2] || "";
    const director = infoParts[3] || "";
    const cast = infoParts.slice(4).join(" / ");

    const posterSrc =
      img?.getAttribute("src") ||
      img?.getAttribute("data-src") ||
      img?.getAttribute("data-original") ||
      null;

    return {
      title: movieTitle,
      rating,
      year,
      countries,
      genres,
      director,
      cast,
      posterUrl: posterSrc ? proxyImageUrl(posterSrc) : null,
      doubanLink: link || null,
    };
  } catch {
    return null;
  }
}

export function isDoubanMovieFeed(
  feedName: string | undefined,
  siteUrl: string | undefined,
): boolean {
  if (siteUrl && siteUrl.includes("movie_showing")) return true;
  if (siteUrl && siteUrl.includes("movie")) return true;
  if (feedName && feedName.includes("影院热映")) return true;
  if (feedName && feedName.includes("豆瓣") && feedName.includes("电影"))
    return true;
  return false;
}

export function ratingColor(rating: number | null): string {
  if (rating === null) return "text-muted-foreground";
  if (rating >= 8.5) return "text-green-500";
  if (rating >= 8) return "text-emerald-500";
  if (rating >= 7) return "text-yellow-500";
  if (rating >= 6) return "text-orange-500";
  return "text-red-500";
}

export function ratingBgColor(rating: number | null): string {
  if (rating === null) return "bg-muted/80";
  if (rating >= 8.5) return "bg-green-500/90";
  if (rating >= 8) return "bg-emerald-500/90";
  if (rating >= 7) return "bg-yellow-500/90";
  if (rating >= 6) return "bg-orange-500/90";
  return "bg-red-500/90";
}
