import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Save, TestTube2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { settingsAPI, type TranslationSettings } from "@/lib/api";

const emptySettings: TranslationSettings = {
  enabled: false,
  api_url: "",
  api_key: "",
  api_key_configured: false,
  models: [],
  fallback_url: "",
  prompts: { title: "", preview: "", content: "", summary: "" },
};

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

export function TranslationSettingsContent() {
  const [settings, setSettings] = useState<TranslationSettings>(emptySettings);
  const [models, setModels] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    let active = true;
    settingsAPI
      .getTranslation()
      .then((response) => {
        if (!active || !response.data) return;
        setSettings({ ...response.data, api_key: "" });
        setModels(response.data.models.join("\n"));
      })
      .catch((error) => {
        console.error("Failed to load translation settings:", error);
        toast.error("加载翻译设置失败");
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const updatePrompt = (
    key: keyof TranslationSettings["prompts"],
    value: string,
  ) => setSettings((current) => ({
    ...current,
    prompts: { ...current.prompts, [key]: value },
  }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await settingsAPI.updateTranslation({
        ...settings,
        models: models
          .split("\n")
          .map((model) => model.trim())
          .filter(Boolean),
      });
      if (response.data) {
        setSettings({ ...response.data, api_key: "" });
        setModels(response.data.models.join("\n"));
      }
      toast.success("翻译设置已保存并立即生效");
    } catch (error) {
      console.error("Failed to save translation settings:", error);
      toast.error(error instanceof Error ? error.message : "保存翻译设置失败");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const response = await settingsAPI.testTranslation();
      toast.success(`连接成功：${response.data?.result || "已返回结果"}`);
    } catch (error) {
      console.error("Translation test failed:", error);
      toast.error(error instanceof Error ? error.message : "翻译连接测试失败");
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-2">
      <div className="flex items-center justify-between rounded-lg border p-3">
        <div>
          <p className="text-sm font-medium">启用翻译与总结</p>
          <p className="text-xs text-muted-foreground">保存后无需重启容器</p>
        </div>
        <Switch
          checked={settings.enabled}
          onCheckedChange={(checked) =>
            setSettings((current) => ({ ...current, enabled: checked }))
          }
        />
      </div>

      <div className="space-y-4 rounded-lg border p-4">
        <h3 className="text-sm font-semibold">接口与模型兜底</h3>
        <Field label="OpenAI 兼容 API 地址">
          <Input
            value={settings.api_url}
            onChange={(event) => setSettings({ ...settings, api_url: event.target.value })}
            placeholder="https://openrouter.ai/api/v1"
          />
        </Field>
        <Field
          label="API Key"
          hint={settings.api_key_configured ? "密钥已配置；留空表示保持不变" : "密钥只保存于服务器并加密存储"}
        >
          <Input
            type="password"
            value={settings.api_key || ""}
            onChange={(event) => setSettings({ ...settings, api_key: event.target.value })}
            placeholder={settings.api_key_configured ? "••••••••••••" : "输入 API Key"}
            autoComplete="new-password"
          />
        </Field>
        <Field label="模型顺序" hint="每行一个；非 429 错误时按从上到下尝试，最多 10 个">
          <Textarea
            value={models}
            onChange={(event) => setModels(event.target.value)}
            className="min-h-28 font-mono text-xs"
            placeholder={"openai/gpt-oss-20b:free\n其他免费模型"}
          />
        </Field>
        <Field label="最终翻译降级接口" hint="主接口 429 时用于标题、摘要和正文翻译">
          <Input
            value={settings.fallback_url}
            onChange={(event) => setSettings({ ...settings, fallback_url: event.target.value })}
            placeholder="https://api.mymemory.translated.net/get"
          />
        </Field>
      </div>

      <div className="space-y-4 rounded-lg border p-4">
        <div>
          <h3 className="text-sm font-semibold">提示词</h3>
          <p className="text-xs text-muted-foreground">使用 {"{{input}}"} 表示待处理内容；省略时内容会自动追加</p>
        </div>
        {([
          ["title", "标题翻译提示词"],
          ["preview", "标题与摘要翻译提示词"],
          ["content", "正文翻译提示词"],
          ["summary", "文章总结提示词"],
        ] as const).map(([key, label]) => (
          <Field key={key} label={label}>
            <Textarea
              value={settings.prompts[key]}
              onChange={(event) => updatePrompt(key, event.target.value)}
              className="min-h-28 text-xs leading-5"
            />
          </Field>
        ))}
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={handleTest} disabled={testing || saving || !settings.enabled}>
          {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <TestTube2 className="h-4 w-4" />}
          测试已保存配置
        </Button>
        <Button onClick={handleSave} disabled={saving || testing}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          保存并生效
        </Button>
      </div>
      {settings.api_key_configured && (
        <p className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> API Key 已配置
        </p>
      )}
    </div>
  );
}
