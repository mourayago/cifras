// ============================================================
//  MOTOR DE ACORDES — transposição e detecção
// ============================================================

const SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT  = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

// Mapa de qualquer nota (sustenido ou bemol) para índice 0-11
const NOTE_INDEX = {
  "C": 0, "B#": 0,
  "C#": 1, "Db": 1,
  "D": 2,
  "D#": 3, "Eb": 3,
  "E": 4, "Fb": 4,
  "F": 5, "E#": 5,
  "F#": 6, "Gb": 6,
  "G": 7,
  "G#": 8, "Ab": 8,
  "A": 9,
  "A#": 10, "Bb": 10,
  "B": 11, "Cb": 11
};

// Reconhece um token de acorde isolado (notação brasileira inclusa).
// Ex.: D, Bm, F#m7, A/C#, E9, E4, Dsus4, Cadd9, G7M, C7+, Bm7(b5), C6/9, C#m7(b5)/E
const CHORD_RE = /^[A-G][#b]?(?:maj|min|m|M|dim|aug|sus|add|°|º|ø|\+|-|[#b]?\d+|\([^)]*\))*(?:\/(?:[A-G][#b]?|\d+))?$/;

function isChordToken(tok) {
  return CHORD_RE.test(tok);
}

function isMarkerToken(tok) {
  return tok.startsWith("[") || tok.endsWith("]") || tok.startsWith("(") && tok.endsWith(")") && !isChordToken(tok);
}

// Decide se a LINHA inteira é uma linha de acordes
// (apenas acordes e/ou marcadores tipo [Intro], aceitando parênteses, sem palavras de letra).
function isChordLine(line) {
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  let hasChord = false;
  for (const tok of tokens) {
    // remove parênteses/vírgulas nas pontas: "(D", "G2)", "(", ")", "D,"
    const core = tok.replace(/^[(),|]+|[(),|]+$/g, "");
    if (core === "") continue;                                // pontuação pura ( )
    if (isChordToken(core)) { hasChord = true; continue; }
    if (tok.startsWith("[") || tok.endsWith("]")) continue;   // marcador [..]
    return false;                                             // achou palavra de letra
  }
  return hasChord;
}

// Transpõe um único token (se for acorde). n = semitons.
function transposeToken(tok, n, useFlat) {
  const scale = useFlat ? FLAT : SHARP;
  const shift = (s) => s.replace(/[A-G][#b]?/g, (note) => {
    const idx = NOTE_INDEX[note];
    return idx === undefined ? note : scale[((idx + n) % 12 + 12) % 12];
  });
  // 1) token inteiro é acorde (inclui acordes com parênteses, ex.: Bm7(b5))
  if (isChordToken(tok)) return shift(tok);
  // 2) acorde com pontuação nas pontas, ex.: "(D", "G2)", "|A|"
  const m = tok.match(/^([(|]*)(.*?)([)|,]*)$/);
  if (m && isChordToken(m[2])) return m[1] + shift(m[2]) + m[3];
  return tok;
}

// Transpõe uma linha de acordes preservando o alinhamento
// com a letra abaixo (compensa mudança de largura nos espaços).
function transposeChordLine(line, n, useFlat) {
  let result = "";
  let carry = 0;
  const re = /(\s+)|(\S+)/g;
  let m;
  while ((m = re.exec(line)) !== null) {
    if (m[1] !== undefined) {
      let sp = m[1];
      if (carry > 0) {
        const remove = Math.min(carry, sp.length - 1);
        sp = sp.slice(0, sp.length - remove);
        carry -= remove;
      } else if (carry < 0) {
        sp = sp + " ".repeat(-carry);
        carry = 0;
      }
      result += sp;
    } else {
      const tok = m[2];
      const t = transposeToken(tok, n, useFlat);
      carry += t.length - tok.length;
      result += t;
    }
  }
  return result;
}

// Transpõe um texto livre de intro (ex.: "E | C#m | A   2x"),
// mexendo só nos tokens que são notas/acordes e mantendo palavras e "|".
function transposeIntroText(text, n, useFlat) {
  if (!n || !text) return text;
  return text.split(/(\s+)/).map(t =>
    /^\s+$/.test(t) ? t : transposeToken(t, n, useFlat)
  ).join("");
}

// Linha de "dedilhado/intro" escrita no corpo: tem prosa + notas separadas
// por "|" (ex.: "Mão esquerda: E | C#m | A"). Transpõe só as notas.
function isFingeringLine(line) {
  if (line.indexOf("|") === -1) return false;
  return line.trim().split(/\s+/).some(t => {
    const core = t.replace(/^[(),|]+|[(),|]+$/g, "");
    return core && isChordToken(core);
  });
}

// Transpõe a cifra inteira.
function transposeCifra(content, n, useFlat) {
  if (n === 0) return content;
  return content
    .split("\n")
    .map((line) => {
      if (isChordLine(line)) return transposeChordLine(line, n, useFlat);
      if (isFingeringLine(line)) return transposeIntroText(line, n, useFlat);
      return line;
    })
    .join("\n");
}

// Nome da nota a partir de um tom base + deslocamento em semitons.
function transposeKeyName(key, n, useFlat) {
  // separa parte menor (m) se houver: "Am" -> "A" + "m"
  const match = key.match(/^([A-G][#b]?)(.*)$/);
  if (!match) return key;
  const idx = NOTE_INDEX[match[1]];
  if (idx === undefined) return key;
  const scale = useFlat ? FLAT : SHARP;
  return scale[((idx + n) % 12 + 12) % 12] + match[2];
}

// Lista de todos os tons possíveis para o seletor.
function allKeys(useFlat) {
  return useFlat ? FLAT.slice() : SHARP.slice();
}
