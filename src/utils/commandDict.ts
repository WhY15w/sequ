import CommandData from "../config/Command.json";

/** 命令 ID → 命令名称映射表（从 Command.json 加载，懒加载单例） */
let _commandDict: Record<string, string> | null = null;

export function getCommandDict(): Record<string, string> {
  if (_commandDict) return _commandDict;

  const parsed: Record<string, unknown> = CommandData;
  const dict: Record<string, string> = {};
  for (const key in parsed) {
    const val = parsed[key];
    if (Array.isArray(val)) {
      dict[key] = typeof val[0] === "string" ? val[0] : String(val[0]);
    } else if (typeof val === "string") {
      dict[key] = val;
    }
  }
  _commandDict = dict;
  return dict;
}

export function getCommandName(cmdId: number): string {
  return getCommandDict()[cmdId.toString()] ?? "Unknown Command";
}
