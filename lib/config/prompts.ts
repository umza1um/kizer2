import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

export type PromptsConfig = {
  questions: {
    systemPrompt: string;
    userPromptTemplate: string;
  };
  photo: {
    systemPrompt: string;
  };
  settings: {
    defaultTone: "scientific" | "balanced" | "entertainment";
    defaultAudience: "adult" | "child";
  };
};

const CONFIG_PATH = join(process.cwd(), "config", "kizer.prompts.json");

export function loadPrompts(): PromptsConfig {
  try {
    const content = readFileSync(CONFIG_PATH, "utf-8");
    return JSON.parse(content) as PromptsConfig;
  } catch (error) {
    console.error("Failed to load prompts config:", error);
    throw new Error("Failed to load prompts configuration");
  }
}

export function savePrompts(config: PromptsConfig): void {
  try {
    writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
  } catch (error) {
    console.error("Failed to save prompts config:", error);
    throw new Error("Failed to save prompts configuration");
  }
}

