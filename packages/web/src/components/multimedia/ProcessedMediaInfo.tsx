import { CheckCircleIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { createIconWrapper } from "../ui/Icon";
import type { ProcessedMediaInfo as ProcessedMediaInfoModel } from "@nichijou/shared";

const SuccessIcon = createIconWrapper(CheckCircleIcon);
const ErrorIcon = createIconWrapper(ExclamationTriangleIcon);

const PROCESS_TYPE_LABELS: Record<ProcessedMediaInfoModel["processType"], string> = {
  transcription: "语音转录",
  analysis: "内容分析",
  thumbnail: "缩略图生成",
};

interface ProcessedMediaInfoProps {
  info: ProcessedMediaInfoModel;
}

export function ProcessedMediaInfo({ info }: ProcessedMediaInfoProps) {
  const label = PROCESS_TYPE_LABELS[info.processType] ?? info.processType;

  return (
    <div
      className={`rounded border p-2 text-xs ${
        info.success
          ? "border-green-200 bg-green-50 text-green-700"
          : "border-red-200 bg-red-50 text-red-700"
      }`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2">
        {info.success ? <SuccessIcon size="sm" aria-hidden /> : <ErrorIcon size="sm" aria-hidden />}
        <span className="font-medium">{label}</span>
      </div>
      {info.success ? (
        <p className="mt-1 whitespace-pre-wrap break-words">{info.result || "（无输出）"}</p>
      ) : (
        <p className="mt-1 opacity-90">{info.error?.trim() || "处理失败"}</p>
      )}
    </div>
  );
}
