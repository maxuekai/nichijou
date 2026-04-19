import { SecurityChecker } from "./utils/security.js";
import type { Resource } from "./types.js";

const HEALTH_SCORE_THRESHOLD = 30;
const MIN_SEEDERS_THRESHOLD = 5;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class FormatValidator {
  static validateResource(resource: Resource): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 磁力链接格式检查
    if (!SecurityChecker.validateMagnetUrl(resource.magnetUrl)) {
      errors.push("无效的磁力链接格式");
    }

    // 文件格式检查：优先 format 字段；为空时回退到 title 中的扩展名
    const trimmedFormat = resource.format.trim();
    const formatValid =
      trimmedFormat.length > 0
        ? SecurityChecker.validateDeclaredFormat(trimmedFormat)
        : SecurityChecker.validateFileFormat(resource.title);
    if (!formatValid) {
      errors.push(
        trimmedFormat.length > 0
          ? `不支持的文件格式：${resource.format}`
          : "不支持的文件格式：title 不含受支持的视频扩展名",
      );
    }

    const minBytes =
      SecurityChecker.DEFAULT_MIN_FILE_SIZE_MB * 1024 * 1024;

    // 文件大小检查（分支阈值与 SecurityChecker 默认一致）
    if (!SecurityChecker.validateFileSize(resource.size)) {
      if (resource.size < minBytes) {
        errors.push("文件大小过小，可能不是完整电影");
      } else {
        errors.push("文件大小超过限制");
      }
    }

    // 健康度检查
    if (resource.healthScore < HEALTH_SCORE_THRESHOLD) {
      warnings.push("种子健康度较低，下载可能较慢");
    }

    // 种子数检查
    if (resource.seeders < MIN_SEEDERS_THRESHOLD) {
      warnings.push("种子数较少，建议选择其他资源");
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  static filterValidResources(resources: Resource[]): Resource[] {
    return resources.filter((resource) => {
      const result = this.validateResource(resource);
      return result.valid;
    });
  }
}
