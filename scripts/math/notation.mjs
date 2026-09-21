// Native MathML: typeset fractions, matrices, integrals and derivatives offline.
export const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
export const row = (...items) => '<mrow>' + items.flat().join('') + '</mrow>';
// MathML Core supports mathvariant="normal" only. Use the actual Unicode
// mathematical bold codepoints for vectors/matrices, including in Chromium.
const boldGreek = { 'μ': '𝛍', 'Σ': '𝚺', 'ω': '𝛚', 'Δ': '𝚫' };
const boldSymbol = name => [...name].map(char => {
  const code = char.codePointAt(0);
  if (code >= 65 && code <= 90) return String.fromCodePoint(0x1d400 + code - 65);
  if (code >= 97 && code <= 122) return String.fromCodePoint(0x1d41a + code - 97);
  return boldGreek[char] || char;
}).join('');
export const id = (name, bold = false) => '<mi' + (bold ? ' mathvariant="normal"' : '') + '>' + esc(bold ? boldSymbol(name) : name) + '</mi>';
export const accent = (base, symbol) => '<mover accent="true">' + base + '<mo>' + esc(symbol) + '</mo></mover>';
export const num = value => '<mn>' + esc(value) + '</mn>';
export const op = value => '<mo>' + esc(value) + '</mo>';
export const txt = value => '<mtext>' + esc(value) + '</mtext>';
export const sub = (base, index) => '<msub>' + base + index + '</msub>';
export const sup = (base, exponent) => '<msup>' + base + exponent + '</msup>';
export const subsup = (base, index, exponent) => '<msubsup>' + base + index + exponent + '</msubsup>';
export const frac = (top, bottom) => '<mfrac>' + top + bottom + '</mfrac>';
export const sqrt = value => '<msqrt>' + value + '</msqrt>';
export const par = value => row(op('('), value, op(')'));
export const bracket = value => row(op('['), value, op(']'));
export const norm = value => row(op('‖'), value, op('‖'));
export const fn = (name, value) => row('<mi mathvariant="normal">' + esc(name) + '</mi>', op('⁡'), par(value));
export const matrix = rows => bracket('<mtable class="matrix">' + rows.map(cells => '<mtr>' + cells.map(cell => '<mtd>' + cell + '</mtd>').join('') + '</mtr>').join('') + '</mtable>');
export const align = rows => {
  if (rows.some(cells => cells.length !== 3)) throw new Error('Aligned equation requires lhs / relation / rhs cells: ' + JSON.stringify(rows));
  return '<mtable class="aligned-equation">' + rows.map(cells => '<mtr>' + cells.map(cell => '<mtd>' + cell + '</mtd>').join('') + '</mtr>').join('') + '</mtable>';
};
export const sum = (lower, upper, value) => row('<munderover>' + op('∑') + lower + upper + '</munderover>', value);
export const prod = (lower, upper, value) => row('<munderover>' + op('∏') + lower + upper + '</munderover>', value);
export const integral = (lower, upper, value) => row('<msubsup>' + op('∫') + lower + upper + '</msubsup>', value);
export const exp = value => sup(id('e'), value);
export const eq = op('=');
export const plus = op('+');
export const minus = op('−');
export const trans = value => sup(value, txt('T'));
export const inv = value => sup(value, row(minus, num(1)));
export const partial = (top, bottom) => frac(row(op('∂'), top), row(op('∂'), bottom));
export const derivative = (top, bottom) => frac(row(id('d'), top), row(id('d'), bottom));
export const math = (body, display = false, label = '') => '<math xmlns="http://www.w3.org/1998/Math/MathML"' + (display ? ' display="block"' : '') + (label ? ' aria-label="' + esc(label) + '"' : '') + '>' + body + '</math>';
