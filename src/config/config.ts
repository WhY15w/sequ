import dotenv from "dotenv";

dotenv.config();

interface Settings {
  game_server_host: string;
  game_server_port: number;

  service_account_id: number;
  service_account_password: string;
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

export const settings: Settings = {
  game_server_host: getEnvString("GAME_SERVER_HOST", "175.24.235.221"),
  game_server_port: getEnvNumber("GAME_SERVER_PORT", 1225),

  service_account_id: getEnvNumber("SERVICE_ACCOUNT_ID", 0),
  service_account_password: getEnvString("SERVICE_ACCOUNT_PASSWORD", ""),
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
