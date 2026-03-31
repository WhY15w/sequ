import dotenv from "dotenv";

dotenv.config();

interface Settings {
  game_server_host: string;
  game_server_port: number;

  service_account_id: number;
  service_account_password: string;

  http_port: number;
  log_callbacks: boolean;
  log_full_packet: boolean;
  ignored_cmd_ids: number[];
}

function getEnvNumber(
  key: string,
  defaultValue: number,
  min?: number,
  max?: number
): number {
  const value = process.env[key];
  if (!value) return defaultValue;

  const num = parseInt(value, 10);
  if (isNaN(num)) return defaultValue;

  if (min !== undefined && num < min) return defaultValue;
  if (max !== undefined && num > max) return defaultValue;

  return num;
}

function getEnvString(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

function getEnvBoolean(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value.toLowerCase() === "true" || value === "1";
}

function getEnvNumberArray(key: string, defaultValue: number[]): number[] {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value
    .split("|")
    .map((item) => parseInt(item.trim(), 10))
    .filter((num) => !isNaN(num));
}

export const settings: Settings = {
  game_server_host: getEnvString("GAME_SERVER_HOST", "175.24.235.221"),
  game_server_port: getEnvNumber("GAME_SERVER_PORT", 1225),

  service_account_id: getEnvNumber("SERVICE_ACCOUNT_ID", 0),
  service_account_password: getEnvString("SERVICE_ACCOUNT_PASSWORD", ""),

  http_port: getEnvNumber("PORT", 3000, 1, 65535),
  log_callbacks: getEnvBoolean("LOG_CALLBACKS", true),
  log_full_packet: getEnvBoolean("LOG_FULL_PACKET", false),
  ignored_cmd_ids: getEnvNumberArray(
    "IGNORED_CMD_IDS",
    [8002, 3452, 2004, 2001, 41228, 1002, 2002]
  ),
};

if (!settings.service_account_id) {
  console.warn(
    "Warning: SERVICE_ACCOUNT_ID is not set in environment variables"
  );
}

if (!settings.service_account_password) {
  console.warn(
    "Warning: SERVICE_ACCOUNT_PASSWORD is not set in environment variables"
  );
}
