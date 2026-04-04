import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import type { StorageManager } from "../storage/storage.js";

export interface LoadedSkill {
  name: string;
  description: string;
  version?: string;
  instructions: string;
  metadata: {
    requires?: {
      env?: string[];
      bins?: string[];
      anyBins?: string[];
    };
    os?: string[];
  };
  dir: string;
}

export interface DependencyCheckResult {
  satisfied: boolean;
  missing: string[];
}

export class SkillLoader {
  private storage: StorageManager;

  constructor(storage: StorageManager) {
    this.storage = storage;
  }

  loadAllSkills(): LoadedSkill[] {
    const skillsDir = this.storage.resolve("skills");
    if (!existsSync(skillsDir)) return [];

    const dirs = readdirSync(skillsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    const skills: LoadedSkill[] = [];
    for (const dir of dirs) {
      const skill = this.loadSkill(join(skillsDir, dir));
      if (skill) skills.push(skill);
    }
    return skills;
  }

  loadSkill(dir: string): LoadedSkill | null {
    const skillPath = join(dir, "SKILL.md");
    if (!existsSync(skillPath)) return null;

    const content = readFileSync(skillPath, "utf-8");
    const { frontmatter, body } = this.parseFrontmatter(content);

    return {
      name: (frontmatter.name as string) ?? dir.split("/").pop() ?? "unknown",
      description: (frontmatter.description as string) ?? "",
      version: frontmatter.version as string | undefined,
      instructions: body,
      metadata: {
        requires: frontmatter.requires as LoadedSkill["metadata"]["requires"],
        os: frontmatter.os as string[] | undefined,
      },
      dir,
    };
  }

  checkDependencies(skill: LoadedSkill): DependencyCheckResult {
    const missing: string[] = [];
    const req = skill.metadata.requires;

    if (req?.env) {
      for (const envVar of req.env) {
        if (!process.env[envVar]) {
          missing.push(`env:${envVar}`);
        }
      }
    }

    if (req?.bins) {
      for (const bin of req.bins) {
        if (!this.hasBinary(bin)) {
          missing.push(`bin:${bin}`);
        }
      }
    }

    if (req?.anyBins && req.anyBins.length > 0) {
      const hasAny = req.anyBins.some((bin) => this.hasBinary(bin));
      if (!hasAny) {
        missing.push(`anyBin:[${req.anyBins.join(",")}]`);
      }
    }

    if (skill.metadata.os && skill.metadata.os.length > 0) {
      if (!skill.metadata.os.includes(process.platform)) {
        missing.push(`os:${process.platform} not in [${skill.metadata.os.join(",")}]`);
      }
    }

    return { satisfied: missing.length === 0, missing };
  }

  injectIntoContext(skill: LoadedSkill): string {
    return `\n---\n\n# Skill: ${skill.name}\n\n${skill.instructions}\n`;
  }

  private hasBinary(name: string): boolean {
    try {
      execSync(`which ${name}`, { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  }

  private parseFrontmatter(content: string): {
    frontmatter: Record<string, unknown>;
    body: string;
  } {
    const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) {
      return { frontmatter: {}, body: content };
    }

    try {
      // Simple YAML parser for frontmatter (key: value pairs)
      const lines = match[1]!.split("\n");
      const fm: Record<string, unknown> = {};
      for (const line of lines) {
        const kvMatch = line.match(/^(\w+):\s*(.+)$/);
        if (kvMatch) {
          fm[kvMatch[1]!] = kvMatch[2]!.trim();
        }
      }
      return { frontmatter: fm, body: match[2]!.trim() };
    } catch {
      return { frontmatter: {}, body: content };
    }
  }
}
