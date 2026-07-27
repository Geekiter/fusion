import DOMPurify from "dompurify";
import { resolveSafeExternalUrl, toSafeExternalUrl } from "@/lib/safe-url";

const purify = DOMPurify(window);

const ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "em",
  "u",
  "s",
  "a",
  "img",
  "picture",
  "source",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "blockquote",
  "code",
  "pre",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "div",
  "span",
  "hr",
  "figure",
  "figcaption",
];

const ALLOWED_ATTR = [
  "href",
  "src",
  "srcset",
  "sizes",
  "type",
  "media",
  "alt",
  "title",
  "class",
  "target",
  "rel",
  "width",
  "height",
  "loading",
  "decoding",
  "data-src",
  "data-lazy-src",
  "data-original",
  "data-srcset",
];

// Tags that are meaningful even when empty
const SELF_CLOSING_TAGS = new Set([
  "br",
  "hr",
  "img",
  "source",
  "td",
  "th",
  "li",
]);

const TRACKER_PATTERNS = [
  /feedburner/i,
  /doubleclick/i,
  /\/pixel[./]/i,
  /\/beacon[./]/i,
  /\/track[./]/i,
  /\/open[./]/i,
  /mail\.google\.com\/.*\/pixel/i,
  /emailtracking/i,
];

function isTrackingPixel(img: HTMLImageElement): boolean {
  const width = img.getAttribute("width");
  const height = img.getAttribute("height");
  if ((width === "1" || width === "0") && (height === "1" || height === "0")) {
    return true;
  }

  const src = img.getAttribute("src") || "";
  return TRACKER_PATTERNS.some((pattern) => pattern.test(src));
}

function isEmptyElement(el: Element): boolean {
  if (SELF_CLOSING_TAGS.has(el.tagName.toLowerCase())) return false;
  if (el.querySelector("img")) return false;
  const text = el.textContent || "";
  return text.trim().length === 0;
}

function sanitizeAnchors(root: DocumentFragment, articleUrl: string | null): void {
  for (const node of root.querySelectorAll("a")) {
    const href = node.getAttribute("href");
    const safeHref = resolveSafeExternalUrl(href, articleUrl);
    if (!safeHref) {
      node.removeAttribute("href");
      node.removeAttribute("target");
      node.removeAttribute("rel");
      continue;
    }

    node.setAttribute("href", safeHref);
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  }
}

function sanitizeImages(root: DocumentFragment, articleUrl: string | null): void {
  for (const node of root.querySelectorAll("img")) {
    const img = node as HTMLImageElement;
    const rawSrc =
      node.getAttribute("src") ||
      node.getAttribute("data-src") ||
      node.getAttribute("data-lazy-src") ||
      node.getAttribute("data-original");
    const resolvedSrc = resolveSafeExternalUrl(rawSrc, articleUrl);
    const safeSrc = resolvedSrc ? proxyArticleImageUrl(resolvedSrc) : null;
    const safeSrcset = sanitizeSrcset(
      node.getAttribute("srcset") || node.getAttribute("data-srcset"),
      articleUrl,
    );
    if (!safeSrc && !safeSrcset) {
      img.remove();
      continue;
    }

    if (safeSrc) img.setAttribute("src", safeSrc);
    else img.removeAttribute("src");
    if (safeSrcset) img.setAttribute("srcset", safeSrcset);
    else img.removeAttribute("srcset");
    for (const attr of ["data-src", "data-lazy-src", "data-original", "data-srcset"]) {
      img.removeAttribute(attr);
    }
    img.setAttribute("loading", "lazy");
    img.setAttribute("decoding", "async");
    if (isTrackingPixel(img)) {
      img.remove();
    }
  }

  for (const node of root.querySelectorAll("source")) {
    const safeSrcset = sanitizeSrcset(
      node.getAttribute("srcset") || node.getAttribute("data-srcset"),
      articleUrl,
    );
    if (!safeSrcset) {
      node.remove();
      continue;
    }
    node.setAttribute("srcset", safeSrcset);
    node.removeAttribute("data-srcset");
  }
}

function sanitizeSrcset(
  raw: string | null,
  articleUrl: string | null,
): string | null {
  if (!raw) return null;

  const candidates = raw
    .split(",")
    .map((candidate) => candidate.trim())
    .filter(Boolean)
    .map((candidate) => {
      const [url, descriptor, ...rest] = candidate.split(/\s+/);
      if (!url || rest.length > 0) return null;
      const resolvedUrl = resolveSafeExternalUrl(url, articleUrl);
      if (!resolvedUrl) return null;
      const safeUrl = proxyArticleImageUrl(resolvedUrl);
      if (
        descriptor &&
        !/^\d+w$/.test(descriptor) &&
        !/^\d+(?:\.\d+)?x$/.test(descriptor)
      ) {
        return null;
      }
      return descriptor ? `${safeUrl} ${descriptor}` : safeUrl;
    })
    .filter((candidate): candidate is string => candidate !== null);

  return candidates.length > 0 ? candidates.join(", ") : null;
}

export function proxyArticleImageUrl(url: string): string {
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

function removeEmptyWrappers(root: DocumentFragment): void {
  const elements = Array.from(root.querySelectorAll("*")).reverse();
  for (const element of elements) {
    if (isEmptyElement(element)) {
      element.remove();
    }
  }
}

export function processArticleContent(
  html: string,
  articleUrl?: string,
): string {
  const safeArticleUrl = toSafeExternalUrl(articleUrl);
  const fragment = purify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    RETURN_DOM_FRAGMENT: true,
  }) as DocumentFragment;

  sanitizeAnchors(fragment, safeArticleUrl);
  sanitizeImages(fragment, safeArticleUrl);
  removeEmptyWrappers(fragment);

  const container = document.createElement("div");
  container.appendChild(fragment);
  return container.innerHTML;
}
