/**
 * Bump this whenever the tokenizer changes so existing libraries rebuild their
 * search tokens on the next launch instead of silently keeping stale ones.
 */
export const SEARCH_TOKENIZER_VERSION = "2";

const QUERY_STOPWORDS = [
  "有哪几种",
  "哪几种",
  "有几种",
  "是哪些",
  "包括哪些",
  "有什么",
  "有哪",
  "哪几",
  "几种",
  "几个",
  "多少种",
  "多少个",
  "多少",
  "几类",
  "哪种",
  "怎么",
  "如何",
  "怎样",
  "什么",
  "哪些",
  "哪个",
  "为什么",
  "请问",
  "一下",
  "是否",
  "能否",
  "可以",
  "应该",
  "区别",
  "关系",
  "吗",
  "呢",
  "吧",
  "的"
];

/**
 * Chinese needs CJK bigrams: single characters such as 低/功/模/式 appear in
 * almost every chunk and drown the BM25 ranking in noise, so the index keeps
 * bigrams (plus latin identifiers) only.
 */
export function searchTerms(input: string): string[] {
  const normalized = input.normalize("NFKC").toUpperCase();
  const tokens: string[] = [];

  for (const token of normalized.match(/[A-Z0-9_]+/g) ?? []) {
    if (token.length > 1 || /[0-9]/.test(token)) {
      tokens.push(token);
    }
  }

  for (const run of normalized.match(/[\u3400-\u9FFF]+/g) ?? []) {
    if (run.length === 1) {
      tokens.push(run);
    }
    for (let index = 0; index + 1 < run.length; index += 1) {
      tokens.push(run.slice(index, index + 2));
    }
  }

  return [...new Set(tokens.filter(Boolean))];
}

export function tokenizeForSearch(input: string): string {
  return searchTerms(input).join(" ");
}

/** Drops interrogatives that would otherwise match random chunks. */
export function stripQueryStopwords(input: string): string {
  let result = input;
  // Longest first so "有哪几种" is removed before "有哪".
  for (const word of [...QUERY_STOPWORDS].sort((left, right) => right.length - left.length)) {
    result = result.split(word).join(" ");
  }
  return result.replace(/\s+/g, " ").trim();
}

const META_WORDS = [
  "设置",
  "配置",
  "初始化",
  "使用",
  "说明",
  "介绍",
  "方法",
  "步骤",
  "功能",
  "作用",
  "需要",
  "如果",
  "以及",
  "还有",
  "相关",
  "内容",
  "时候",
  "情况"
];

const CLAUSE_SPLIT = /[\s,，、;；:：!！?？。.()（）\[\]【】/]+|的|和|与|及|或|是/g;

/**
 * Pulls the searchable keywords out of a natural-language question: drop the
 * interrogatives, then keep the technical terms (latin identifiers and CJK
 * phrases) that can actually be matched against the manuals.
 */
export function extractQueryKeywords(input: string): string[] {
  let text = stripQueryStopwords(input.normalize("NFKC").toUpperCase());
  for (const word of META_WORDS) {
    text = text.split(word).join(" ");
  }

  const keywords: string[] = [];
  for (const segment of text.split(CLAUSE_SPLIT)) {
    const value = segment.trim();
    if (!value) {
      continue;
    }
    for (const token of value.match(/[A-Z0-9_]+/g) ?? []) {
      if (token.length >= 2) {
        keywords.push(token);
      }
    }
    for (const run of value.match(/[\u3400-\u9FFF]+/g) ?? []) {
      if (run.length >= 2) {
        keywords.push(run);
      }
    }
  }

  return [...new Set(keywords)];
}

export function extractEntityTokens(input: string): string[] {
  const normalized = input.normalize("NFKC").toUpperCase();
  const identifiers =
    normalized.match(/\b(?:STM32[A-Z0-9]+|[A-Z]{1,8}\d{0,3}(?:_[A-Z0-9]+)?|P[A-G]\d{1,2})\b/g) ??
    [];
  return [...new Set(identifiers)];
}
