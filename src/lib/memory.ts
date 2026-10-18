import type { MemoryItem } from './types.ts';

export function redactSecretsAndPII(text: string): { redactedText: string; redactedCount: number } {
  let count = 0;
  let result = text;

  // Redact API Keys (e.g. sk-..., AIzaSy..., ghp_..., etc.)
  const apiKeyRegex = /\b(sk-[a-zA-Z0-9]{20,}|AIzaSy[a-zA-Z0-9_-]{33}|ghp_[a-zA-Z0-9]{36}|Bearer\s+[a-zA-Z0-9._-]{20,})\b/g;
  result = result.replace(apiKeyRegex, () => {
    count++;
    return '[REDACTED_API_KEY]';
  });

  // Redact Emails
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  result = result.replace(emailRegex, () => {
    count++;
    return '[REDACTED_EMAIL]';
  });

  // Redact passwords or secrets in key-value formats
  const secretPattern = /(password|passwd|secret|token|private_key)\s*[:=]\s*["']?([^\s"',;]+)["']?/gi;
  result = result.replace(secretPattern, (_, key) => {
    count++;
    return `${key}: [REDACTED_SECRET]`;
  });

  // Redact IP addresses
  const ipRegex = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g;
  result = result.replace(ipRegex, () => {
    count++;
    return '[REDACTED_IP]';
  });

  return { redactedText: result, redactedCount: count };
}

export function searchMemories(query: string, memories: MemoryItem[]): MemoryItem[] {
  if (!query.trim()) return memories;
  const q = query.toLowerCase();
  const terms = q.split(/\s+/).filter(Boolean);

  return memories
    .map(mem => {
      let score = 0;
      const contentLower = mem.content.toLowerCase();
      
      // Exact substring match
      if (contentLower.includes(q)) score += 50;

      // Term matches
      for (const term of terms) {
        if (contentLower.includes(term)) score += 15;
        if (mem.tags.some(t => t.toLowerCase().includes(term))) score += 20;
        if (mem.category.toLowerCase().includes(term)) score += 10;
      }

      // Importance bonus
      score += mem.importance * 2;

      return { mem, score };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(item => item.mem);
}

export const INITIAL_MEMORIES: MemoryItem[] = [];
