#!/usr/bin/env node

import * as readline from "node:readline";
import { ButlerService } from "./butler.js";
import { NichijouServer } from "./server.js";
import type { AgentEvent } from "@nichijou/agent";

const args = process.argv.slice(2);
const command = args[0];

if (command === "start" || !command) {
  startServer().catch(console.error);
} else if (command === "repl") {
  startREPL().catch(console.error);
} else {
  console.log(`Usage: nichijou [command]`);
  console.log(`  start   Start the server (default)`);
  console.log(`  repl    Start interactive REPL mode`);
}

async function startServer(): Promise<void> {
  console.log("🏠 Nichijou Loop - 家庭 AI 管家");
  console.log("================================\n");

  const butler = new ButlerService();
  const config = butler.config.get();

  let family = butler.familyManager.getFamily();
  if (!family) {
    family = butler.familyManager.createFamily("我的家");
    console.log(`创建了默认家庭「${family.name}」`);
  }

  await butler.initWeChatChannel();

  const server = new NichijouServer(butler);
  await server.start(config.port);

  console.log(`\n管家已就绪！`);
  if (!config.setupCompleted) {
    console.log(`首次使用请访问 http://localhost:${config.port} 完成设置`);
  }

  process.on("SIGINT", async () => {
    console.log("\n正在关闭...");
    await butler.shutdown();
    process.exit(0);
  });
}

async function startREPL(): Promise<void> {
  console.log("🏠 Nichijou Loop - 家庭 AI 管家 (REPL)");
  console.log("=======================================");

  const butler = new ButlerService();
  const config = butler.config.get();

  let family = butler.familyManager.getFamily();
  if (!family) {
    family = butler.familyManager.createFamily("我的家");
    console.log(`\n创建了家庭「${family.name}」`);
  }

  let members = butler.familyManager.getMembers();
  let currentMember = members[0];
  if (!currentMember) {
    currentMember = butler.familyManager.addMember("用户");
    console.log(`创建了成员「${currentMember.name}」(管理员)`);
  }

  console.log(`\n当前家庭：${family.name}`);
  console.log(`当前成员：${currentMember.name}`);
  console.log(`LLM: ${config.llm.baseUrl} (${config.llm.model})`);
  console.log(`\n输入消息与管家对话，输入 /quit 退出\n`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = () => {
    rl.question(`${currentMember!.name}> `, async (input) => {
      const trimmed = input.trim();
      if (!trimmed) {
        prompt();
        return;
      }

      if (trimmed === "/quit" || trimmed === "/exit") {
        console.log("\n再见！👋");
        await butler.shutdown();
        rl.close();
        process.exit(0);
      }

      if (trimmed === "/members") {
        members = butler.familyManager.getMembers();
        console.log("\n家庭成员：");
        for (const m of members) {
          const marker = m.id === currentMember!.id ? " ← 当前" : "";
          console.log(`  - ${m.name} (${m.role})${marker}`);
        }
        console.log();
        prompt();
        return;
      }

      if (trimmed === "/status") {
        const usage = butler.db.getTokenUsage(new Date().toISOString().slice(0, 10));
        console.log(`\nToken 用量(今日): prompt=${usage.promptTokens} completion=${usage.completionTokens}`);
        console.log();
        prompt();
        return;
      }

      try {
        process.stdout.write("\n管家: ");
        const onEvent = (event: AgentEvent) => {
          if (event.type === "text_delta") {
            process.stdout.write(event.delta);
          } else if (event.type === "tool_start") {
            process.stdout.write(`\n  [调用工具: ${event.toolName}]`);
          } else if (event.type === "tool_end") {
            process.stdout.write(` → ${event.isError ? "❌" : "✅"}\n`);
          }
        };

        await butler.chat(currentMember!.id, trimmed, onEvent);
        console.log("\n");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`\n错误: ${msg}\n`);
      }

      prompt();
    });
  };

  prompt();
}
