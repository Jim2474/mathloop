import { describe, expect, it } from "vitest";
import { buildDesktopAssetPath } from "./desktopBridge";

describe("buildDesktopAssetPath", () => {
  it("uses forward slashes when the desktop data directory is a macOS path", () => {
    const result = buildDesktopAssetPath(
      "/Users/alice/Library/Application Support/MathLoop/books/book001",
      "questions/book001_ch01_p006_q001.png",
    );

    expect(result).toBe(
      "/Users/alice/Library/Application Support/MathLoop/books/book001/questions/book001_ch01_p006_q001.png",
    );
  });

  it("keeps Windows paths using backslashes", () => {
    const result = buildDesktopAssetPath(
      "C:\\Users\\alice\\AppData\\Roaming\\MathLoop\\books\\book001",
      "/answers/book001_ch01_p006_q001_answer.png",
    );

    expect(result).toBe(
      "C:\\Users\\alice\\AppData\\Roaming\\MathLoop\\books\\book001\\answers\\book001_ch01_p006_q001_answer.png",
    );
  });
});
