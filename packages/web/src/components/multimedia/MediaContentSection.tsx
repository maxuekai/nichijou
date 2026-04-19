import type { MediaContent } from "@nichijou/shared";
import { MediaPreviewCard } from "./MediaPreviewCard";

interface MediaContentSectionProps {
  mediaList: MediaContent[];
  logId: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onPreviewMedia?: (media: MediaContent) => void;
}

function mediaStableKey(media: MediaContent, index: number): string {
  const base = media.hash || media.filePath || `idx-${index}`;
  return `${base}-${index}`;
}

export function MediaContentSection({
  mediaList,
  logId,
  isExpanded,
  onToggleExpand,
  onPreviewMedia,
}: MediaContentSectionProps) {
  const shouldShowExpansion = mediaList.length > 3;
  const displayedMedia = isExpanded ? mediaList : mediaList.slice(0, 3);

  return (
    <section className="mt-2" aria-labelledby={`media-heading-${logId}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 id={`media-heading-${logId}`} className="text-xs font-medium text-stone-500">
          媒体内容 ({mediaList.length})
        </h3>
        {shouldShowExpansion ? (
          <button
            type="button"
            onClick={onToggleExpand}
            className="text-xs text-amber-600 transition-colors hover:text-amber-700 focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
            aria-expanded={isExpanded}
            aria-controls={`media-list-${logId}`}
          >
            {isExpanded ? "收起" : "查看全部"}
          </button>
        ) : null}
      </div>

      <div id={`media-list-${logId}`} className="space-y-2" role="list">
        {displayedMedia.map((media, index) => (
          <div key={mediaStableKey(media, index)} role="listitem">
            <MediaPreviewCard media={media} onPreview={onPreviewMedia} />
          </div>
        ))}
      </div>
    </section>
  );
}
