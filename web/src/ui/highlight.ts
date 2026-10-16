import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import diff from 'highlight.js/lib/languages/diff';
import go from 'highlight.js/lib/languages/go';
import ini from 'highlight.js/lib/languages/ini';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import python from 'highlight.js/lib/languages/python';
import rust from 'highlight.js/lib/languages/rust';
import shell from 'highlight.js/lib/languages/shell';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import x86asm from 'highlight.js/lib/languages/x86asm';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';

const LANGUAGES = { bash, c, cpp, diff, go, ini, java, javascript, json, python, rust, shell, sql, typescript, x86asm, xml, yaml };
for (const [name, language] of Object.entries(LANGUAGES)) hljs.registerLanguage(name, language);

// Untagged fences are guessed only when highlight.js is fairly sure; a weak guess paints prose as code.
const MIN_AUTO_RELEVANCE = 5;

/** Returns highlighted HTML (highlight.js escapes the source), or null to render the code as plain text. */
export function highlight(code: string, language: string): string | null {
  const lang = language.trim().toLowerCase();
  if (lang && hljs.getLanguage(lang)) return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
  if (lang) return null;
  const guess = hljs.highlightAuto(code);
  return guess.relevance >= MIN_AUTO_RELEVANCE ? guess.value : null;
}
