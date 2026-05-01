export function format08X(n: number): string {
  return n.toString(16).toUpperCase().padStart(8, '0');
}

export function formatHex(n: number, width: number): string {
  return n.toString(16).toUpperCase().padStart(width, '0');
}

export function format02X(n: number): string {
  return n.toString(16).toUpperCase().padStart(2, '0');
}

export function format04X(n: number): string {
  return n.toString(16).toUpperCase().padStart(4, '0');
}

export function formatBuffer(
  buffer: Buffer,
  groupSize = 4,
  separator = ' ',
): string {
  const hex = buffer.toString('hex').toUpperCase();
  const groups: string[] = [];

  for (let i = 0; i < hex.length; i += groupSize * 2) {
    groups.push(hex.substring(i, i + groupSize * 2));
  }

  return groups.join(separator);
}

export function formatArray(numbers: number[], width = 8): string {
  return numbers.map((num) => formatHex(num, width)).join('');
}
