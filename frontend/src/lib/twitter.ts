/**
 * Parse Nitter RSS item content into structured tweet data.
 *
 * Nitter RSS returns content like:
 * <p>Tweet text here<br><br>More text</p>
 * <img src="http://nitter.net/pic/media%2F..." />
 * <hr/>
 * <blockquote><b>Author (@handle)</b><p>Quoted tweet text</p>...</blockquote>
 */

export interface TweetImage {
  url: string;
}

export interface TweetQuote {
  author: string;
  text: string;
  images: TweetImage[];
  link: string | null;
}

export interface TweetData {
  text: string;
  images: TweetImage[];
  quotes: TweetQuote[];
  link: string | null;
}

function proxyImageUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Proxy HTTPS images (standard case)
    if (
      parsed.protocol === "https:" &&
      !parsed.port &&
      !parsed.username &&
      !parsed.password &&
      parsed.hostname
    ) {
      return `/api/images/proxy?url=${encodeURIComponent(url)}`;
    }
    // Proxy HTTP images from local Nitter instance
    if (
      parsed.protocol === "http:" &&
      parsed.hostname === "172.17.0.1" &&
      parsed.port === "8082"
    ) {
      return `/api/images/proxy?url=${encodeURIComponent(url)}`;
    }
  } catch {
    return url;
  }
  return url;
}

/**
 * Rewrite nitter.net image URLs to point to the local self-hosted Nitter instance.
 * The local Nitter is accessible at http://172.17.0.1:8082 from within the Fusion container.
 * This avoids HTTPS/HTTP mixed content issues and nitter.net being unreachable.
 */
function fixNitterUrl(url: string): string {
  return url.replace(/^https?:\/\/nitter\.net\//, "http://172.17.0.1:8082/");
}

export function parseTweet(
  content: string,
  link: string,
): TweetData | null {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, "text/html");

    // Extract images (direct images, not inside blockquote)
    const allImages = Array.from(doc.querySelectorAll("img"));
    const directImages: TweetImage[] = [];
    for (const img of allImages) {
      // Skip images inside blockquotes (those belong to quoted tweets)
      if (img.closest("blockquote")) continue;
      const src = img.getAttribute("src");
      if (src) {
        const fixed = fixNitterUrl(src);
        directImages.push({ url: proxyImageUrl(fixed) });
      }
    }

    // Extract quotes
    const blockquotes = Array.from(doc.querySelectorAll("blockquote"));
    const quotes: TweetQuote[] = blockquotes.map((bq) => {
      const boldEl = bq.querySelector("b");
      const author = boldEl?.textContent?.trim() || "";

      // Get all text content, excluding footer
      const footer = bq.querySelector("footer");
      if (footer) footer.remove();

      // Get text from <p> elements
      const pElements = bq.querySelectorAll("p");
      const texts: string[] = [];
      pElements.forEach((p) => {
        const text = p.textContent?.trim();
        if (text) texts.push(text);
      });

      // Get images in quote
      const quoteImages: TweetImage[] = [];
      bq.querySelectorAll("img").forEach((img) => {
        const src = img.getAttribute("src");
        if (src) {
          const fixed = fixNitterUrl(src);
          quoteImages.push({ url: proxyImageUrl(fixed) });
        }
      });

      const quoteLinkEl = bq.querySelector("footer a, cite a");
      const quoteLink = quoteLinkEl?.getAttribute("href") || null;

      return {
        author,
        text: texts.join("\n"),
        images: quoteImages,
        link: quoteLink,
      };
    });

    // Extract main text: get text from top-level <p> elements (not inside blockquote)
    const topLevelPs = Array.from(doc.body.children).filter(
      (el) => el.tagName === "P" && !el.closest("blockquote"),
    );
    // Also handle case where content is just text nodes in body
    let text: string;
    if (topLevelPs.length > 0) {
      text = topLevelPs
        .map((p) => p.innerHTML)
        .join("\n\n")
        .replace(/<br\s*\/?>/g, "\n")
        .replace(/<[^>]+>/g, "")
        .trim();
    } else {
      // Fallback: get all text before the first blockquote or hr
      const bodyClone = doc.body.cloneNode(true) as HTMLElement;
      const bq = bodyClone.querySelector("blockquote, hr");
      if (bq) {
        // Get all text before the blockquote/hr
        text = "";
        let node = bodyClone.firstChild;
        while (node && node !== bq) {
          if (node.nodeType === Node.TEXT_NODE) {
            text += node.textContent;
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as Element;
            text += el.textContent;
          }
          node = node.nextSibling;
        }
      } else {
        text = doc.body.textContent?.trim() || "";
      }
      text = text.replace(/\n{3,}/g, "\n\n").trim();
    }

    return {
      text,
      images: directImages,
      quotes,
      link: link || null,
    };
  } catch {
    return null;
  }
}

export function isTwitterFeed(
  feedName: string | undefined,
  siteUrl: string | undefined,
): boolean {
  if (siteUrl && siteUrl.includes("nitter.net")) return true;
  if (siteUrl && siteUrl.includes("nitter")) return true;
  if (feedName && feedName.toLowerCase().includes("twitter")) return true;
  if (feedName && feedName.toLowerCase().includes("nitter")) return true;
  // Check if it looks like a Twitter/Nitter feed URL
  if (siteUrl && /\/\w+\/rss$/.test(siteUrl) && siteUrl.includes("8082"))
    return true;
  return false;
}
