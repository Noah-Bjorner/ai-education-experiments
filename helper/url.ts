function isYouTubeUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      host === "youtu.be" ||
      host === "youtube.com" ||
      host === "www.youtube.com" ||
      host.endsWith(".youtube.com") ||
      host === "youtube-nocookie.com" ||
      host === "www.youtube-nocookie.com"
    );
  } catch {
    return false;
  }
}

async function getYouTubeTitle(url: string): Promise<string> {
  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
  const response = await fetch(oembedUrl);
  if (!response.ok) throw new Error(`Failed to fetch YouTube oEmbed for ${url}`);
  const data = (await response.json()) as { title?: string };
  if (!data.title?.trim()) throw new Error(`No title in YouTube oEmbed for ${url}`);
  return data.title.trim();
}

async function getHtmlPageTitle(url: string): Promise<string> {
  const controller = new AbortController();
  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: controller.signal,
  });
  if (!response.ok || !response.body) throw new Error(`Failed to fetch ${url}`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let html = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    html += decoder.decode(value, { stream: true });
    const ogTitle = html.match(
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
    )?.[1];
    const htmlTitle = html.match(/<title[^>]*>(.*?)<\/title>/is)?.[1];
    if (ogTitle || htmlTitle || /<\/head>/i.test(html)) {
      controller.abort();
      return (ogTitle ?? htmlTitle ?? new URL(url).hostname).trim();
    }
    // Safety: don't buffer huge pages if head never closes
    if (html.length > 64_000) break;
  }
  return new URL(url).hostname;
}

export function getPageTitle(url: string): Promise<string> {
  if (isYouTubeUrl(url)) return getYouTubeTitle(url);
  return getHtmlPageTitle(url);
}