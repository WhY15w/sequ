/**
 * 十六进制格式化工具函数
 */
export class HexFormatter {
  /**
   * 格式化为8位大写十六进制
   * @param number 要格式化的数字
   * @returns 8位大写十六进制字符串，例如 "0000ABCD"
   */
  static format08X(number: number): string {
    return number.toString(16).toUpperCase().padStart(8, '0');
  }

  /**
   * 格式化为指定位数的大写十六进制
   * @param number 要格式化的数字
   * @param width 宽度（位数）
   * @returns 指定位数的大写十六进制字符串
   */
  static formatHex(number: number, width: number): string {
    return number.toString(16).toUpperCase().padStart(width, '0');
  }

  /**
   * 格式化为2位大写十六进制（1字节）
   */
  static format02X(number: number): string {
    return number.toString(16).toUpperCase().padStart(2, '0');
  }

  /**
   * 格式化为4位大写十六进制（2字节）
   */
  static format04X(number: number): string {
    return number.toString(16).toUpperCase().padStart(4, '0');
  }

  /**
   * 将 Buffer 格式化为分组的十六进制字符串
   * @param buffer Buffer对象
   * @param groupSize 每组的字节数，默认4（对应8位十六进制字符）
   * @param separator 分隔符，默认空格
   */
  static formatBuffer(
    buffer: Buffer,
    groupSize: number = 4,
    separator: string = ' ',
  ): string {
    const hex = buffer.toString('hex').toUpperCase();
    const groups: string[] = [];

    for (let i = 0; i < hex.length; i += groupSize * 2) {
      groups.push(hex.substring(i, i + groupSize * 2));
    }

    return groups.join(separator);
  }

  /**
   * 将数字数组格式化为十六进制字符串
   * @param numbers 数字数组
   * @param width 每个数字的宽度
   */
  static formatArray(numbers: number[], width: number = 8): string {
    return numbers.map((num) => this.formatHex(num, width)).join('');
  }
}
