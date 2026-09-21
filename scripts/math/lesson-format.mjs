import katex from 'katex';
import { esc } from './notation.mjs';

// Typeset at build time: no browser-side library or external CDN.
export const tex = (source, displayMode = true) => katex.renderToString(source, {
  displayMode, throwOnError: true, strict: 'error', trust: false,
  output: 'htmlAndMathml',
});
export const formula = source => '<div class="derivation-math" tabindex="0" role="region" aria-label="推导公式，可横向滚动">' + tex(source) + '</div>';
export const inline = source => tex(source, false);
export const para = text => '<p>' + text + '</p>';
export const step = (title, why, source = '') => ({ title, why, source });
export const lesson = (kind, goal, prerequisites, steps, example, code, pitfall, question, answer) =>
  ({ kind, goal, prerequisites, steps, example, code, pitfall, question, answer });
export const codeLink = (id, explanation, symbols) => ({ id, explanation, symbols });
export const safe = esc;
