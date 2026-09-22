import { create } from "zustand";

export type AIRequestMode = "server" | "frontend";

export const defaultFrontendTranslationPrompt =
  '你是批量翻译 API。将每项非空英文 title 和 summary 翻译成简体中文。保留品牌、人名、模型名、缩写、数字和 URL；纯专有名称原样返回。必须覆盖全部输入项并保持 id 不变；只返回合法 JSON，结构严格为 {"items":[{"id":数字,"translated_title":"译文或空字符串","translated_summary":"译文或空字符串"}]}，不要 Markdown 或解释。';

export const defaultFrontendContentPrompt =
  "将文章正文翻译成简体中文。保留品牌、人名、型号、URL、段落和列表结构，不添加原文没有的信息，只输出译文。";

export const defaultFrontendSummaryPrompt =
  "用简体中文总结文章。先用一句话给出核心结论，再列出 3—6 个关键要点；保留重要数字、产品名、人名和结论，不得添加原文没有的信息。只输出总结。";

interface AISettingsState {
  mode: AIRequestMode;
  apiURL: string;
  model: string;
  apiKey: string;
  translationPrompt: string;
  contentPrompt: string;
  summaryPrompt: string;
  setMode: (mode: AIRequestMode) => void;
  setAPIURL: (apiURL: string) => void;
  setModel: (model: string) => void;
  setAPIKey: (apiKey: string) => void;
  setTranslationPrompt: (translationPrompt: string) => void;
  setContentPrompt: (contentPrompt: string) => void;
  setSummaryPrompt: (summaryPrompt: string) => void;
}

export const useAISettingsStore = create<AISettingsState>((set) => ({
  mode: "server",
  apiURL: "http://127.0.0.1:32180/v1",
  model: "glm-5.2",
  apiKey: "",
  translationPrompt: defaultFrontendTranslationPrompt,
  contentPrompt: defaultFrontendContentPrompt,
  summaryPrompt: defaultFrontendSummaryPrompt,
  setMode: (mode) => set({ mode }),
  setAPIURL: (apiURL) => set({ apiURL }),
  setModel: (model) => set({ model }),
  setAPIKey: (apiKey) => set({ apiKey }),
  setTranslationPrompt: (translationPrompt) => set({ translationPrompt }),
  setContentPrompt: (contentPrompt) => set({ contentPrompt }),
  setSummaryPrompt: (summaryPrompt) => set({ summaryPrompt }),
}));
