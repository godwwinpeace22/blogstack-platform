import { parseDocument } from "@blogstack/core";
export function validContent(content: string): boolean {
  try {
    parseDocument(content);
    return true;
  } catch {
    return false;
  }
}
