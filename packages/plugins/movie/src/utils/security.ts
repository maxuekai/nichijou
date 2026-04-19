export class SecurityChecker {
  static readonly DEFAULT_MIN_FILE_SIZE_MB = 10;
  static readonly DEFAULT_MAX_FILE_SIZE_GB = 20;

  private static readonly ALLOWED_EXTENSIONS = [
    ".mp4",
    ".mkv",
    ".avi",
    ".mov",
    ".wmv",
    ".flv",
    ".webm",
    ".m4v",
    ".mpg",
    ".mpeg",
  ];

  /** Aligned with ALLOWED_EXTENSIONS for consistent MIME checks. */
  private static readonly ALLOWED_MIMETYPES = [
    "video/mp4",
    "video/x-m4v",
    "video/x-matroska",
    "video/x-msvideo",
    "video/quicktime",
    "video/x-ms-wmv",
    "video/x-flv",
    "video/webm",
    "video/mpeg",
  ];

  static validateFileFormat(filename: string): boolean {
    const ext = filename.toLowerCase().match(/\.[^.]+$/)?.[0];
    return ext ? this.ALLOWED_EXTENSIONS.includes(ext) : false;
  }

  /**
   * Validates a declared container/extension (e.g. `mkv`, `.MP4`, `release.mkv`),
   * aligned with {@link validateFileFormat}.
   */
  static validateDeclaredFormat(format: string): boolean {
    const raw = format.trim();
    if (!raw) return false;
    const lastSegment = raw.includes(".")
      ? (raw.split(".").pop() ?? "")
      : raw;
    const normalized = lastSegment.replace(/^\./, "").toLowerCase();
    if (!normalized) return false;
    const ext = `.${normalized}`;
    return this.ALLOWED_EXTENSIONS.includes(ext);
  }

  static validateMimeType(mimeType: string): boolean {
    const base = mimeType.split(";")[0].trim().toLowerCase();
    return this.ALLOWED_MIMETYPES.includes(base);
  }

  static validateMagnetUrl(magnetUrl: string): boolean {
    return /^magnet:\?xt=urn:btih:([a-fA-F0-9]{40}|[A-Za-z2-7]{32}|[a-fA-F0-9]{64})/.test(
      magnetUrl,
    );
  }

  static validateFileSize(
    sizeBytes: number,
    minMB: number = this.DEFAULT_MIN_FILE_SIZE_MB,
    maxGB: number = this.DEFAULT_MAX_FILE_SIZE_GB,
  ): boolean {
    const minBytes = minMB * 1024 * 1024;
    const maxBytes = maxGB * 1024 * 1024 * 1024;
    return sizeBytes >= minBytes && sizeBytes <= maxBytes;
  }

  static sanitizePath(path: string): string {
    return path.replace(/[<>:"|?*]/g, "_").replace(/\.\./g, "_");
  }
}
