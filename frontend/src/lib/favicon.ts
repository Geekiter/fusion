let baseIconPromise: Promise<HTMLImageElement> | null = null;
let latestUpdate = 0;

function loadBaseIcon(): Promise<HTMLImageElement> {
  if (baseIconPromise) return baseIconPromise;

  baseIconPromise = new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load Fusion icon"));
    image.src = "/icon-96.png";
  });

  return baseIconPromise;
}

function getDynamicFaviconLink(): HTMLLinkElement {
  const existing = document.querySelector<HTMLLinkElement>(
    "#fusion-dynamic-favicon",
  );
  if (existing) return existing;

  const link = document.createElement("link");
  link.id = "fusion-dynamic-favicon";
  link.rel = "icon";
  link.type = "image/png";
  document.head.appendChild(link);
  return link;
}

export function updateFaviconBadge(unreadCount: number): void {
  if (typeof document === "undefined") return;

  const updateId = ++latestUpdate;
  void loadBaseIcon()
    .then((image) => {
      if (updateId !== latestUpdate) return;

      const canvas = document.createElement("canvas");
      canvas.width = 96;
      canvas.height = 96;
      const context = canvas.getContext("2d");
      if (!context) return;

      context.drawImage(image, 0, 0, 96, 96);
      if (unreadCount > 0) {
        const label = unreadCount > 99 ? "99+" : String(unreadCount);
        const radius = 29;

        context.fillStyle = "#ef4444";
        context.beginPath();
        context.arc(67, 28, radius, 0, Math.PI * 2);
        context.fill();

        context.fillStyle = "#ffffff";
        context.font = `700 ${label.length > 2 ? 17 : 22}px Inter, Arial, sans-serif`;
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(label, 67, 28);
      }

      getDynamicFaviconLink().href = canvas.toDataURL("image/png");
    })
    .catch(() => {
      // Keep the static favicon if the browser blocks canvas or image loading.
    });
}
