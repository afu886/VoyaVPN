const TEST_ATTRIBUTE = "#[cfg(test)]";

export function splitRustProduction(source) {
  const match = /^#\[cfg\(test\)\][ \t]*$/mu.exec(source);
  if (!match) {
    return { layoutError: null, production: source };
  }

  let cursor = match.index;
  const productionEnd = cursor;

  while (cursor < source.length) {
    cursor = skipTrivia(source, cursor);
    if (cursor === source.length) break;
    if (!source.startsWith(TEST_ATTRIBUTE, cursor)) {
      return invalidLayout(source);
    }

    cursor += TEST_ATTRIBUTE.length;
    cursor = skipTrivia(source, cursor);
    const module = /^(?:pub(?:\s*\([^)]*\))?\s+)?mod\s+[A-Za-z_][A-Za-z0-9_]*\s*/u.exec(source.slice(cursor));
    if (!module) {
      return invalidLayout(source);
    }

    cursor += module[0].length;
    if (source[cursor] === ";") {
      cursor += 1;
      continue;
    }
    if (source[cursor] !== "{") {
      return invalidLayout(source);
    }

    const moduleEnd = findMatchingBrace(source, cursor);
    if (moduleEnd === -1) {
      return invalidLayout(source);
    }
    cursor = moduleEnd + 1;
  }

  return { layoutError: null, production: source.slice(0, productionEnd) };
}

export function productionLineCount(source) {
  if (source.length === 0) return 0;
  return source.split(/\r?\n/u).length;
}

function invalidLayout(source) {
  return {
    layoutError: "top-level #[cfg(test)] items must be terminal test modules",
    production: source,
  };
}

function findMatchingBrace(source, openingBrace) {
  let cursor = openingBrace;
  let depth = 0;
  while (cursor < source.length) {
    if (source.startsWith("//", cursor)) {
      cursor = skipLineComment(source, cursor);
      continue;
    }
    if (source.startsWith("/*", cursor)) {
      cursor = skipBlockComment(source, cursor);
      continue;
    }

    const rawStringEnd = skipRawString(source, cursor);
    if (rawStringEnd !== cursor) {
      cursor = rawStringEnd;
      continue;
    }
    if (source[cursor] === '"') {
      cursor = skipQuoted(source, cursor, '"');
      continue;
    }
    if (source[cursor] === "'" && isCharacterLiteral(source, cursor)) {
      cursor = skipQuoted(source, cursor, "'");
      continue;
    }

    if (source[cursor] === "{") depth += 1;
    if (source[cursor] === "}") {
      depth -= 1;
      if (depth === 0) return cursor;
    }
    cursor += 1;
  }
  return -1;
}

function isCharacterLiteral(source, cursor) {
  if (source[cursor + 1] === "\\") return source.indexOf("'", cursor + 2) !== -1;
  return source[cursor + 2] === "'";
}

function skipBlockComment(source, start) {
  let cursor = start;
  let depth = 0;
  while (cursor < source.length) {
    if (source.startsWith("/*", cursor)) {
      depth += 1;
      cursor += 2;
    } else if (source.startsWith("*/", cursor)) {
      depth -= 1;
      cursor += 2;
      if (depth === 0) return cursor;
    } else {
      cursor += 1;
    }
  }
  return source.length;
}

function skipLineComment(source, start) {
  const newline = source.indexOf("\n", start + 2);
  return newline === -1 ? source.length : newline + 1;
}

function skipQuoted(source, start, quote) {
  let cursor = start + 1;
  while (cursor < source.length) {
    if (source[cursor] === "\\") {
      cursor += 2;
    } else if (source[cursor] === quote) {
      return cursor + 1;
    } else {
      cursor += 1;
    }
  }
  return source.length;
}

function skipRawString(source, start) {
  const match = /^(?:br|r)(?<hashes>#+)?"/u.exec(source.slice(start));
  if (!match) return start;
  const hashes = match.groups?.hashes ?? "";
  const close = `"${hashes}`;
  const end = source.indexOf(close, start + match[0].length);
  return end === -1 ? source.length : end + close.length;
}

function skipTrivia(source, start) {
  let cursor = start;
  while (cursor < source.length) {
    const whitespace = /^\s+/u.exec(source.slice(cursor));
    if (whitespace) {
      cursor += whitespace[0].length;
      continue;
    }
    if (source.startsWith("//", cursor)) {
      cursor = skipLineComment(source, cursor);
      continue;
    }
    if (source.startsWith("/*", cursor)) {
      cursor = skipBlockComment(source, cursor);
      continue;
    }
    break;
  }
  return cursor;
}
