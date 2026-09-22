import type { Item } from "@/lib/api";
import { extractSummary, needsTranslation } from "@/lib/utils";
import { useAISettingsStore } from "@/store";

interface ChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string } | string;
}

interface TranslationOutput {
  id: number;
  translated_title?: string;
  translated_summary?: string;
}

interface TranslationResponse {
  items?: TranslationOutput[];
}

type LoopbackRequestInit = RequestInit & {
  targetAddressSpace?: "loopback";
};

function completionURL(apiURL: string): string {
  const trimmed = apiURL.trim().replace(/\/$/, "");
  if (!trimmed) throw new Error("请输入前端请求 API 地址");
  return trimmed.endsWith("/chat/completions")
    ? trimmed
    : `${trimmed}/chat/completions`;
}

function cleanJSON(value: string): string {
  return value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

function errorMessage(data: ChatResponse, status: number): string {
  if (typeof data.error === "string") return data.error;
  return data.error?.message || `HTTP ${status}`;
}

async function complete(
  system: string,
  user: string,
  json = false,
): Promise<string> {
  const { apiURL, model, apiKey } = useAISettingsStore.getState();
  if (!model.trim()) throw new Error("请输入前端请求模型");

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  let response: Response;
  try {
    const request: LoopbackRequestInit = {
      method: "POST",
      credentials: "omit",
      targetAddressSpace: apiURL.includes("127.0.0.1") ? "loopback" : undefined,
      headers,
      body: JSON.stringify({
        model: model.trim(),
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.1,
        ...(json ? { response_format: { type: "json_object" } } : {}),
      }),
    };
    response = await fetch(completionURL(apiURL), request);
  } catch (error) {
    throw new Error(
      `前端请求失败；请确认 Mac App 已启动，或远程接口允许浏览器跨域。${
        error instanceof Error ? ` ${error.message}` : ""
      }`,
    );
  }

  const data = (await response.json().catch(() => ({}))) as ChatResponse;
  if (!response.ok) throw new Error(errorMessage(data, response.status));
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error(errorMessage(data, response.status) || "模型返回为空");
  return content;
}

function chunk<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < values.length; start += size) {
    chunks.push(values.slice(start, start + size));
  }
  return chunks;
}

function validateTranslationOutput(
  input: Item[],
  output: TranslationOutput[],
): void {
  const expected = new Set(input.map((item) => item.id));
  const actual = new Set(output.map((item) => item.id));
  if (
    actual.size !== output.length ||
    expected.size !== actual.size ||
    [...expected].some((id) => !actual.has(id))
  ) {
    throw new Error("批量翻译返回的文章 ID 不完整或重复");
  }
}

export async function translatePreviewsInFrontend(
  items: Item[],
): Promise<Item[]> {
  const prompt = useAISettingsStore.getState().translationPrompt.trim();
  if (!prompt) throw new Error("翻译提示词不能为空");

  const translated: Item[] = [];
  for (const batch of chunk(items, 25)) {
    const input = batch.map((item) => ({
      id: item.id,
      title: item.title,
      summary: extractSummary(item.content, 300),
    }));
    const content = await complete(prompt, JSON.stringify({ items: input }), true);
    let response: TranslationResponse;
    try {
      response = JSON.parse(cleanJSON(content)) as TranslationResponse;
    } catch {
      throw new Error("批量翻译未返回合法 JSON");
    }
    const output = response.items ?? [];
    validateTranslationOutput(batch, output);
    const byID = new Map(output.map((item) => [item.id, item]));

    for (const item of batch) {
      const result = byID.get(item.id)!;
      const title = result.translated_title?.trim() ?? "";
      const summary = result.translated_summary?.trim() ?? "";
      translated.push({
        ...item,
        translated_title:
          title && title.toLocaleLowerCase() !== item.title.trim().toLocaleLowerCase()
            ? title
            : item.translated_title,
        translated_summary:
          summary && needsTranslation(extractSummary(item.content, 300))
            ? summary
            : item.translated_summary,
      });
    }
  }
  return translated;
}

function splitText(value: string, maxLength: number): string[] {
  const chunks: string[] = [];
  let remaining = value.trim();
  while (remaining.length > maxLength) {
    let end = remaining.lastIndexOf("\n", maxLength);
    if (end < maxLength / 2) end = remaining.lastIndexOf(" ", maxLength);
    if (end < maxLength / 2) end = maxLength;
    chunks.push(remaining.slice(0, end).trim());
    remaining = remaining.slice(end).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

export async function translateContentInFrontend(item: Item): Promise<Item> {
  const prompt = useAISettingsStore.getState().contentPrompt.trim();
  if (!prompt) throw new Error("正文翻译提示词不能为空");
  const text = extractSummary(item.extracted_content || item.content, 50_000);
  if (!text || !needsTranslation(text)) return item;

  const outputs: string[] = [];
  for (const part of splitText(text, 12_000)) {
    outputs.push(await complete(prompt, part));
  }
  const translatedContent = outputs.join("\n\n").trim();
  return translatedContent && translatedContent !== text
    ? { ...item, translated_content: translatedContent }
    : item;
}

export async function summarizeInFrontend(item: Item): Promise<Item> {
  const prompt = useAISettingsStore.getState().summaryPrompt.trim();
  if (!prompt) throw new Error("总结提示词不能为空");
  const text = extractSummary(item.extracted_content || item.content, 40_000);
  if (!text) throw new Error("文章正文为空，无法总结");
  const summary = await complete(prompt, `标题：${item.title}\n\n正文：${text}`);
  return { ...item, ai_summary: summary };
}

export async function testFrontendAI(): Promise<string> {
  return complete("你是连接测试助手。", "只回复 OK");
}
