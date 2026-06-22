import { afterEach, describe, expect, it } from "vitest";
import {
  getSearchProvider,
  isSearchConfigured,
  searchNotConfiguredMessage,
} from "./config";

const ENV_KEYS = [
  "SEARCH_PROVIDER",
  "SERPAPI_API_KEY",
  "GOOGLE_CSE_API_KEY",
  "GOOGLE_CSE_CX",
] as const;

function clearSearchEnv() {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
}

describe("getSearchProvider", () => {
  afterEach(clearSearchEnv);

  it("prefers serpapi when key is set", () => {
    process.env.SERPAPI_API_KEY = "test";
    expect(getSearchProvider()).toBe("serpapi");
  });

  it("uses google when configured and keys present", () => {
    process.env.SEARCH_PROVIDER = "google";
    process.env.GOOGLE_CSE_API_KEY = "key";
    process.env.GOOGLE_CSE_CX = "cx";
    expect(getSearchProvider()).toBe("google");
  });

  it("falls back to google when serpapi missing", () => {
    process.env.GOOGLE_CSE_API_KEY = "key";
    process.env.GOOGLE_CSE_CX = "cx";
    expect(getSearchProvider()).toBe("google");
  });

  it("defaults to serpapi when nothing configured", () => {
    expect(getSearchProvider()).toBe("serpapi");
    expect(isSearchConfigured()).toBe(false);
  });
});

describe("searchNotConfiguredMessage", () => {
  afterEach(clearSearchEnv);

  it("mentions serpapi by default", () => {
    expect(searchNotConfiguredMessage()).toContain("SERPAPI_API_KEY");
  });

  it("mentions google cse when provider is google", () => {
    process.env.SEARCH_PROVIDER = "google";
    expect(searchNotConfiguredMessage()).toContain("GOOGLE_CSE");
  });
});
