export function missingExpectedValues(expected, present) {
  return expected.filter((value) => !present.has(value));
}

export function isSha256Hex(value) {
  return /^[a-f0-9]{64}$/i.test(value ?? "");
}

export function isPositiveByteSize(value) {
  return Number.isInteger(value) && value > 0;
}

export function isUrlDerivedFromBase(url, baseUrl) {
  return url?.startsWith(`${baseUrl}/`);
}
