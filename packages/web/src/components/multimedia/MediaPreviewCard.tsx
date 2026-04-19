import type { KeyboardEvent, MouseEvent } from "react";
import {
  PhotoIcon,
  SpeakerWaveIcon,
  DocumentIcon,
  VideoCameraIcon,
  ArrowDownTrayIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ClockIcon,
} from "@heroicons/react/24/outline";
import { createIconWrapper } from "../ui/Icon";
import type { MediaContent, MediaDownloadStatus } from "@nichijou/shared";
import { api } from "../../api";

const ImageIcon = createIconWrapper(PhotoIcon);
const VoiceIcon = createIconWrapper(SpeakerWaveIcon);
const FileIcon = createIconWrapper(DocumentIcon);
const VideoIcon = createIconWrapper(VideoCameraIcon);
const DownloadIcon = createIconWrapper(ArrowDownTrayIcon);
const ErrorIcon = createIconWrapper(ExclamationTriangleIcon);
const SuccessIcon = createIconWrapper(CheckCircleIcon);
const ProcessingIcon = createIconWrapper(ClockIcon);

const MEDIA_ICONS = {
  image: ImageIcon,
  voice: VoiceIcon,
  file: FileIcon,
  video: VideoIcon,
};

const STATUS_CONFIG: Record<
  MediaDownloadStatus,
  { icon: ReturnType<typeof createIconWrapper>; style: string }
> = {
  completed: {
    icon: SuccessIcon,
    style: "bg-green-50 text-green-700 border-green-200",
  },
  failed: {
    icon: ErrorIcon,
    style: "bg-red-50 text-red-700 border-red-200",
  },
  processing: {
    icon: ProcessingIcon,
    style: "bg-amber-50 text-amber-700 border-amber-200",
  },
};

interface MediaPreviewCardProps {
  media: MediaContent;
  onPreview?: (media: MediaContent) => void;
}

function formatFileSize(bytes?: number): string {
  if (bytes == null || Number.isNaN(bytes)) return "未知大小";
  const sizes = ["B", "KB", "MB", "GB"];
  if (bytes === 0) return "0 B";
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${Math.round((bytes / Math.pow(1024, i)) * 100) / 100} ${sizes[i]}`;
}

function formatDuration(seconds?: number): string {
  if (seconds == null || seconds < 0 || Number.isNaN(seconds)) return "";
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function resolveDownloadStatus(media: MediaContent): MediaDownloadStatus {
  return media.downloadStatus ?? "completed";
}

export function MediaPreviewCard({ media, onPreview }: MediaPreviewCardProps) {
  const MediaIcon = MEDIA_ICONS[media.type];
  const status = resolveDownloadStatus(media);
  const statusConfig = STATUS_CONFIG[status];
  const StatusIcon = statusConfig.icon;
  const interactive = Boolean(onPreview);

  const handleDownload = async (e: MouseEvent) => {
    e.stopPropagation();
    try {
      await api.downloadMedia(media.filePath, media.originalName);
    } catch (error) {
      console.error("Download failed:", error);
      alert("下载失败，请重试");
    }
  };

  const handlePreview = () => {
    onPreview?.(media);
  };

  const handleCardKeyDown = (e: KeyboardEvent) => {
    if (!interactive) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handlePreview();
    }
  };

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${statusConfig.style} ${
        interactive ? "cursor-pointer hover:bg-stone-50/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500" : ""
      }`}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? handlePreview : undefined}
      onKeyDown={interactive ? handleCardKeyDown : undefined}
      aria-label={
        interactive
          ? `预览 ${media.originalName || "媒体文件"}，${formatFileSize(media.size)}`
          : undefined
      }
    >
      <MediaIcon size="md" className="flex-shrink-0" aria-hidden />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {media.originalName?.trim() || "未知文件"}
        </p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs opacity-75">
          <span>{formatFileSize(media.size)}</span>
          {formatDuration(media.duration) ? (
            <span>• {formatDuration(media.duration)}</span>
          ) : null}
          {media.mimeType ? <span>• {media.mimeType}</span> : null}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <StatusIcon size="sm" aria-hidden />
        {status === "completed" ? (
          <button
            type="button"
            className="rounded p-0.5 text-stone-400 transition-colors hover:text-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-500"
            onClick={handleDownload}
            aria-label={`下载 ${media.originalName?.trim() || "文件"}`}
          >
            <DownloadIcon size="sm" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
