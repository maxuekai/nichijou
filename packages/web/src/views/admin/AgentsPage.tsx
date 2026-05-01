import { useEffect, useState } from "react";
import {
  api,
  type AgentCapability,
  type AgentConfig,
  type MediaUnderstandingConfig,
  type MediaUnderstandingImageModelConfig,
} from "../../api";
import { Select } from "../../components/ui/Select";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  CpuChipIcon,
  EyeIcon,
  PencilIcon,
  PlusIcon,
  SparklesIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { createIconWrapper } from "../../components/ui/Icon";

const AddIcon = createIconWrapper(PlusIcon);
const SaveIcon = createIconWrapper(CheckIcon);
const CancelIcon = createIconWrapper(XMarkIcon);
const EditIcon = createIconWrapper(PencilIcon);
const DeleteIcon = createIconWrapper(TrashIcon);
const ModelIcon = createIconWrapper(CpuChipIcon);
const VisionIcon = createIconWrapper(EyeIcon);
const ImageIcon = createIconWrapper(SparklesIcon);
const MoveUpIcon = createIconWrapper(ArrowUpIcon);
const MoveDownIcon = createIconWrapper(ArrowDownIcon);

interface LLMModelSummary {
  id: string;
  name: string;
  provider: string;
  model: string;
  enabled: boolean;
}

type AgentFormData = Omit<AgentConfig, "id">;

type ImageUnderstandingConfig = NonNullable<MediaUnderstandingConfig["image"]>;

const DEFAULT_IMAGE_UNDERSTANDING: Required<ImageUnderstandingConfig> = {
  enabled: true,
  maxBytes: 10 * 1024 * 1024,
  maxChars: 500,
  timeoutSeconds: 60,
  models: [],
};

const CAPABILITY_OPTIONS: Array<{ value: AgentCapability; label: string; description: string }> = [
  { value: "vision", label: "图片理解", description: "自动分析用户发送的图片" },
  { value: "image_generation", label: "生图", description: "为 generate_image 工具生成图片" },
];

function emptyAgentForm(modelId = ""): AgentFormData {
  return {
    name: "",
    description: "",
    modelId,
    enabled: true,
    capabilities: [],
  };
}

function capabilityLabel(capability: AgentCapability): string {
  return CAPABILITY_OPTIONS.find((item) => item.value === capability)?.label ?? capability;
}

function capabilityIcon(capability: AgentCapability) {
  return capability === "vision" ? <VisionIcon size="sm" /> : <ImageIcon size="sm" />;
}

function normalizeMediaUnderstanding(config?: MediaUnderstandingConfig): MediaUnderstandingConfig {
  return {
    ...config,
    image: {
      ...DEFAULT_IMAGE_UNDERSTANDING,
      ...(config?.image ?? {}),
      models: config?.image?.models ?? [],
    },
  };
}

function optionalPositiveNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function AgentsPage() {
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [models, setModels] = useState<LLMModelSummary[]>([]);
  const [mediaUnderstanding, setMediaUnderstanding] = useState<MediaUnderstandingConfig>(() => normalizeMediaUnderstanding());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [newAgent, setNewAgent] = useState<AgentFormData>(() => emptyAgentForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingAgent, setEditingAgent] = useState<AgentFormData>(() => emptyAgentForm());
  const [saving, setSaving] = useState(false);
  const [savingMediaUnderstanding, setSavingMediaUnderstanding] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    setLoadError(null);
    try {
      const [agentData, modelData, configData] = await Promise.all([
        api.getAgents(),
        api.getModels(),
        api.getConfig(),
      ]);
      setAgents(agentData.agents);
      setModels(modelData.models);
      setMediaUnderstanding(normalizeMediaUnderstanding(configData.mediaUnderstanding as MediaUnderstandingConfig | undefined));
      const firstModelId = modelData.models[0]?.id ?? "";
      setNewAgent((prev) => ({ ...prev, modelId: prev.modelId || firstModelId }));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "加载 Agent 配置失败");
    }
  }

  function toggleCapability(
    data: AgentFormData,
    capability: AgentCapability,
    update: (next: AgentFormData) => void,
  ) {
    const exists = data.capabilities.includes(capability);
    update({
      ...data,
      capabilities: exists
        ? data.capabilities.filter((item) => item !== capability)
        : [...data.capabilities, capability],
    });
  }

  async function handleAddAgent() {
    setSaving(true);
    setActionError(null);
    try {
      const result = await api.addAgent(newAgent);
      if (!result.ok) throw new Error(result.error ?? "添加 Agent 失败");
      await loadData();
      setIsAdding(false);
      setNewAgent(emptyAgentForm(models[0]?.id ?? ""));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "添加 Agent 失败");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(agent: AgentConfig) {
    setEditingId(agent.id);
    setEditingAgent({
      name: agent.name,
      description: agent.description,
      modelId: agent.modelId,
      enabled: agent.enabled,
      capabilities: agent.capabilities,
    });
    setActionError(null);
  }

  async function handleUpdateAgent() {
    if (!editingId) return;
    setSaving(true);
    setActionError(null);
    try {
      const result = await api.updateAgent(editingId, editingAgent);
      if (!result.ok) throw new Error(result.error ?? "更新 Agent 失败");
      await loadData();
      setEditingId(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "更新 Agent 失败");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteAgent(agent: AgentConfig) {
    if (!confirm(`确定要删除 Agent「${agent.name}」吗？`)) return;
    setDeleting(agent.id);
    setActionError(null);
    try {
      const result = await api.deleteAgent(agent.id);
      if (!result.ok) throw new Error(result.error ?? "删除 Agent 失败");
      await loadData();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "删除 Agent 失败");
    } finally {
      setDeleting(null);
    }
  }

  function updateImageUnderstanding(updates: Partial<ImageUnderstandingConfig>) {
    setMediaUnderstanding((prev) => ({
      ...prev,
      image: {
        ...DEFAULT_IMAGE_UNDERSTANDING,
        ...(prev.image ?? {}),
        ...updates,
        models: updates.models ?? prev.image?.models ?? [],
      },
    }));
  }

  function updateImageUnderstandingModel(index: number, updates: Partial<MediaUnderstandingImageModelConfig>) {
    const modelsConfig = mediaUnderstanding.image?.models ?? [];
    updateImageUnderstanding({
      models: modelsConfig.map((item, itemIndex) => (
        itemIndex === index ? { ...item, ...updates } : item
      )),
    });
  }

  function addImageUnderstandingModel() {
    const modelsConfig = mediaUnderstanding.image?.models ?? [];
    const usedAgentIds = new Set(modelsConfig.map((item) => item.agentId));
    const agent = agents.find((item) => item.capabilities.includes("vision") && !usedAgentIds.has(item.id))
      ?? agents.find((item) => item.capabilities.includes("vision"));
    if (!agent) return;
    updateImageUnderstanding({
      models: [...modelsConfig, { agentId: agent.id, enabled: true }],
    });
  }

  function removeImageUnderstandingModel(index: number) {
    const modelsConfig = mediaUnderstanding.image?.models ?? [];
    updateImageUnderstanding({
      models: modelsConfig.filter((_, itemIndex) => itemIndex !== index),
    });
  }

  function moveImageUnderstandingModel(index: number, direction: -1 | 1) {
    const modelsConfig = [...(mediaUnderstanding.image?.models ?? [])];
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= modelsConfig.length) return;
    const [item] = modelsConfig.splice(index, 1);
    if (!item) return;
    modelsConfig.splice(nextIndex, 0, item);
    updateImageUnderstanding({ models: modelsConfig });
  }

  async function handleSaveMediaUnderstanding() {
    setSavingMediaUnderstanding(true);
    setActionError(null);
    try {
      const normalized = normalizeMediaUnderstanding(mediaUnderstanding);
      await api.updateConfig({ mediaUnderstanding: normalized });
      setMediaUnderstanding(normalized);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "保存图片理解链路失败");
    } finally {
      setSavingMediaUnderstanding(false);
    }
  }

  const modelOptions = models.map((model) => ({
    value: model.id,
    label: `${model.name || model.model} · ${model.model}${model.enabled ? "" : "（已禁用）"}`,
  }));

  const imageUnderstanding = normalizeMediaUnderstanding(mediaUnderstanding).image!;
  const imageUnderstandingModels = imageUnderstanding.models ?? [];
  const visionAgents = agents.filter((agent) => agent.capabilities.includes("vision"));
  const visionAgentOptions = visionAgents.map((agent) => ({
    value: agent.id,
    label: `${agent.name}${agent.enabled ? "" : "（已禁用）"}`,
  }));

  function renderForm(data: AgentFormData, update: (next: AgentFormData) => void, submitLabel: string, onSubmit: () => void, onCancel: () => void) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-2">Agent 名称</label>
            <input
              type="text"
              value={data.name}
              onChange={(event) => update({ ...data, name: event.target.value })}
              placeholder="例如：图片理解助手"
              className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-2">绑定模型</label>
            <Select
              value={data.modelId}
              onChange={(next) => update({ ...data, modelId: next })}
              options={modelOptions}
              placeholder={models.length === 0 ? "请先添加模型" : "选择模型"}
              disabled={models.length === 0}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-stone-700 mb-2">描述</label>
          <textarea
            value={data.description}
            onChange={(event) => update({ ...data, description: event.target.value })}
            placeholder="说明这个 Agent 的用途"
            rows={3}
            className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
          />
        </div>

        <div>
          <p className="block text-sm font-medium text-stone-700 mb-2">能力</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {CAPABILITY_OPTIONS.map((option) => (
              <label
                key={option.value}
                className="flex items-start gap-3 rounded-lg border border-stone-200 bg-white px-3 py-3 cursor-pointer hover:border-amber-300"
              >
                <input
                  type="checkbox"
                  checked={data.capabilities.includes(option.value)}
                  onChange={() => toggleCapability(data, option.value, update)}
                  className="mt-0.5 w-4 h-4 text-amber-600 border-stone-300 rounded focus:ring-amber-500"
                />
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-stone-800">
                    {capabilityIcon(option.value)}
                    {option.label}
                  </span>
                  <span className="block text-xs text-stone-500 mt-1">{option.description}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={data.enabled}
            onChange={(event) => update({ ...data, enabled: event.target.checked })}
            className="w-4 h-4 text-amber-600 border-stone-300 rounded focus:ring-amber-500"
          />
          <span className="text-sm text-stone-700">启用此 Agent</span>
        </label>

        <div className="flex justify-end gap-3 pt-4 border-t border-stone-100">
          <button
            onClick={onCancel}
            disabled={saving}
            className="px-4 py-2 text-stone-600 border border-stone-300 rounded-lg hover:bg-stone-50 transition-colors"
          >
            取消
          </button>
          <button
            onClick={onSubmit}
            disabled={saving || !data.name.trim() || !data.modelId || data.capabilities.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving && <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />}
            <SaveIcon size="sm" />
            {submitLabel}
          </button>
        </div>
      </div>
    );
  }

  function renderImageUnderstandingPanel() {
    return (
      <div className="bg-white rounded-xl border border-stone-200 p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-stone-800">图片理解链路</h2>
            <p className="text-sm text-stone-500 mt-1">主模型不支持图片输入时，按这里的顺序调用 vision Agent。</p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={imageUnderstanding.enabled !== false}
                onChange={(event) => updateImageUnderstanding({ enabled: event.target.checked })}
                className="w-4 h-4 text-amber-600 border-stone-300 rounded focus:ring-amber-500"
              />
              <span className="text-sm text-stone-700">启用</span>
            </label>
            <button
              onClick={() => { void handleSaveMediaUnderstanding(); }}
              disabled={savingMediaUnderstanding}
              className="flex items-center gap-2 px-3 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {savingMediaUnderstanding && <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />}
              <SaveIcon size="sm" />
              保存链路
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-5">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-2">单图最大字节</label>
            <input
              type="number"
              min={1}
              value={imageUnderstanding.maxBytes ?? ""}
              onChange={(event) => updateImageUnderstanding({ maxBytes: optionalPositiveNumber(event.target.value) })}
              placeholder={String(DEFAULT_IMAGE_UNDERSTANDING.maxBytes)}
              className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-2">结果最大字符</label>
            <input
              type="number"
              min={1}
              value={imageUnderstanding.maxChars ?? ""}
              onChange={(event) => updateImageUnderstanding({ maxChars: optionalPositiveNumber(event.target.value) })}
              placeholder={String(DEFAULT_IMAGE_UNDERSTANDING.maxChars)}
              className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-2">超时秒数</label>
            <input
              type="number"
              min={1}
              value={imageUnderstanding.timeoutSeconds ?? ""}
              onChange={(event) => updateImageUnderstanding({ timeoutSeconds: optionalPositiveNumber(event.target.value) })}
              placeholder={String(DEFAULT_IMAGE_UNDERSTANDING.timeoutSeconds)}
              className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
            />
          </div>
        </div>

        <div className="mt-5 pt-5 border-t border-stone-100">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className="text-sm font-semibold text-stone-800">Fallback 顺序</h3>
            <button
              onClick={addImageUnderstandingModel}
              disabled={visionAgents.length === 0}
              className="flex items-center gap-2 px-3 py-2 text-sm border border-stone-300 text-stone-700 rounded-lg hover:bg-stone-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <AddIcon size="sm" />
              添加
            </button>
          </div>

          {visionAgents.length === 0 ? (
            <div className="bg-stone-50 border border-stone-200 rounded-lg p-4 text-sm text-stone-500">
              还没有配置 vision 能力的 Agent。
            </div>
          ) : imageUnderstandingModels.length === 0 ? (
            <div className="bg-stone-50 border border-stone-200 rounded-lg p-4 text-sm text-stone-500">
              未指定顺序时，将按已启用 vision Agent 的配置顺序尝试。
            </div>
          ) : (
            <div className="space-y-3">
              {imageUnderstandingModels.map((item, index) => {
                const agent = agents.find((candidate) => candidate.id === item.agentId);
                return (
                  <div key={`${item.agentId}-${index}`} className="rounded-lg border border-stone-200 p-4">
                    <div className="grid grid-cols-1 lg:grid-cols-[minmax(220px,1fr)_150px_140px_130px_auto] gap-3 items-end">
                      <div>
                        <label className="block text-xs font-medium text-stone-500 mb-1">Agent</label>
                        <Select
                          value={item.agentId}
                          onChange={(next) => updateImageUnderstandingModel(index, { agentId: next })}
                          options={visionAgentOptions}
                          placeholder="选择 vision Agent"
                          disabled={visionAgentOptions.length === 0}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-stone-500 mb-1">最大字节</label>
                        <input
                          type="number"
                          min={1}
                          value={item.maxBytes ?? ""}
                          onChange={(event) => updateImageUnderstandingModel(index, { maxBytes: optionalPositiveNumber(event.target.value) })}
                          placeholder="使用全局"
                          className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-stone-500 mb-1">最大字符</label>
                        <input
                          type="number"
                          min={1}
                          value={item.maxChars ?? ""}
                          onChange={(event) => updateImageUnderstandingModel(index, { maxChars: optionalPositiveNumber(event.target.value) })}
                          placeholder="使用全局"
                          className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-stone-500 mb-1">超时秒</label>
                        <input
                          type="number"
                          min={1}
                          value={item.timeoutSeconds ?? ""}
                          onChange={(event) => updateImageUnderstandingModel(index, { timeoutSeconds: optionalPositiveNumber(event.target.value) })}
                          placeholder="使用全局"
                          className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                        />
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => moveImageUnderstandingModel(index, -1)}
                          disabled={index === 0}
                          className="p-2 text-stone-500 hover:text-stone-800 hover:bg-stone-100 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
                          title="上移"
                        >
                          <MoveUpIcon size="sm" />
                        </button>
                        <button
                          onClick={() => moveImageUnderstandingModel(index, 1)}
                          disabled={index === imageUnderstandingModels.length - 1}
                          className="p-2 text-stone-500 hover:text-stone-800 hover:bg-stone-100 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
                          title="下移"
                        >
                          <MoveDownIcon size="sm" />
                        </button>
                        <button
                          onClick={() => removeImageUnderstandingModel(index)}
                          className="p-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg"
                          title="删除"
                        >
                          <DeleteIcon size="sm" />
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 mt-3">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={item.enabled !== false}
                          onChange={(event) => updateImageUnderstandingModel(index, { enabled: event.target.checked })}
                          className="w-4 h-4 text-amber-600 border-stone-300 rounded focus:ring-amber-500"
                        />
                        <span className="text-sm text-stone-700">启用此项</span>
                      </label>
                      {agent && !agent.enabled && (
                        <span className="text-xs text-red-600">该 Agent 已禁用，运行时会跳过。</span>
                      )}
                      {!agent && (
                        <span className="text-xs text-red-600">该 Agent 不存在，请重新选择。</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-800">Agent 管理</h1>
          <p className="text-sm text-stone-500 mt-1">为图片理解和生图能力绑定专用模型</p>
        </div>
        <button
          onClick={() => setIsAdding(true)}
          disabled={isAdding || models.length === 0}
          className="flex items-center gap-2 px-3 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <AddIcon size="sm" />
          添加 Agent
        </button>
      </div>

      {loadError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800">{loadError}</div>
      )}

      {actionError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800">
          <div className="flex items-center justify-between gap-3">
            <p>{actionError}</p>
            <button onClick={() => setActionError(null)} className="text-red-600 hover:text-red-800">
              <CancelIcon size="sm" />
            </button>
          </div>
        </div>
      )}

      {models.length === 0 && !loadError && (
        <div className="bg-stone-50 border border-stone-200 rounded-xl p-6 text-sm text-stone-500">
          请先在模型管理中添加模型，再创建 Agent。
        </div>
      )}

      {isAdding && (
        <div className="bg-white rounded-xl border border-stone-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-stone-800">添加 Agent</h2>
            <button onClick={() => setIsAdding(false)} className="text-stone-400 hover:text-stone-600">
              <CancelIcon size="md" />
            </button>
          </div>
          {renderForm(newAgent, setNewAgent, "添加 Agent", () => { void handleAddAgent(); }, () => setIsAdding(false))}
        </div>
      )}

      {!loadError && models.length > 0 && renderImageUnderstandingPanel()}

      {!loadError && agents.length === 0 && !isAdding && models.length > 0 && (
        <div className="bg-stone-50 border border-stone-200 rounded-xl p-8 text-center">
          <p className="text-sm text-stone-500">暂无 Agent 配置</p>
          <p className="text-xs text-stone-400 mt-2">添加图片理解或生图 Agent 后，对应能力会自动启用</p>
        </div>
      )}

      <div className="space-y-4">
        {agents.map((agent) => {
          const model = models.find((item) => item.id === agent.modelId);
          const isEditing = editingId === agent.id;

          return (
            <div key={agent.id} className="bg-white rounded-xl border border-stone-200 overflow-hidden">
              <div className="p-5">
                {!isEditing ? (
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h2 className="text-base font-semibold text-stone-800 truncate">{agent.name}</h2>
                          <span className={`px-2 py-0.5 text-xs rounded-full ${agent.enabled ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                            {agent.enabled ? "已启用" : "已禁用"}
                          </span>
                        </div>
                        <p className="text-sm text-stone-500 mt-1 whitespace-pre-wrap">{agent.description || "无描述"}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => startEdit(agent)}
                          className="flex items-center gap-1 px-2 py-1 text-xs text-stone-600 hover:text-stone-800 hover:bg-stone-100 rounded transition-colors"
                        >
                          <EditIcon size="sm" />
                          编辑
                        </button>
                        <button
                          onClick={() => { void handleDeleteAgent(agent); }}
                          disabled={deleting === agent.id}
                          className="flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                        >
                          {deleting === agent.id ? (
                            <div className="w-3 h-3 border border-red-600 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <DeleteIcon size="sm" />
                          )}
                          删除
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div>
                        <h3 className="text-xs font-medium text-stone-500 mb-1">绑定模型</h3>
                        <p className="flex items-center gap-2 text-sm text-stone-800 bg-stone-100 px-2 py-1 rounded">
                          <ModelIcon size="sm" />
                          <span className="truncate">{model ? `${model.name || model.model} · ${model.model}` : agent.modelId}</span>
                        </p>
                      </div>
                      <div>
                        <h3 className="text-xs font-medium text-stone-500 mb-1">能力</h3>
                        <div className="flex flex-wrap gap-2">
                          {agent.capabilities.map((capability) => (
                            <span key={capability} className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-amber-50 text-amber-700 rounded-full">
                              {capabilityIcon(capability)}
                              {capabilityLabel(capability)}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  renderForm(editingAgent, setEditingAgent, "保存更改", () => { void handleUpdateAgent(); }, () => setEditingId(null))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
