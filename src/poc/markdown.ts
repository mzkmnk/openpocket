import type { MarkdownBlock } from "./types";

export function parseMarkdownBlocks(value: string): MarkdownBlock[] {
  const lines = value.split("\n");
  const blocks: MarkdownBlock[] = [];
  let textBuf: string[] = [];
  let codeBuf: string[] | null = null;
  let language = "";

  const flushText = () => {
    if (textBuf.length > 0) {
      blocks.push({ kind: "text", text: textBuf.join("\n") });
      textBuf = [];
    }
  };

  const flushCode = () => {
    if (codeBuf !== null) {
      blocks.push({
        kind: "code",
        language: language || undefined,
        code: codeBuf.join("\n"),
      });
      codeBuf = null;
      language = "";
    }
  };

  for (const line of lines) {
    if (line.startsWith("```")) {
      if (codeBuf === null) {
        flushText();
        codeBuf = [];
        language = line.slice(3).trim();
      } else {
        flushCode();
      }
      continue;
    }

    if (codeBuf !== null) {
      codeBuf.push(line);
    } else {
      textBuf.push(line);
    }
  }

  flushText();
  flushCode();

  if (blocks.length === 0) {
    return [{ kind: "text", text: value }];
  }

  return blocks;
}
