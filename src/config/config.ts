import dotenv from 'dotenv';
import fs from 'fs';

const envPath = fs.existsSync('.env.development') ? '.env.development' : '.env';
dotenv.config({ path: envPath });

const env = {
  string: (key: string, defaultVal: string) => process.env[key] || defaultVal,

  number: (key: string, defaultVal: number, min?: number, max?: number) => {
    const raw = process.env[key];
    if (!raw) return defaultVal;
    const num = Number(raw);
    if (isNaN(num)) return defaultVal;
    if (min !== undefined && num < min) return defaultVal;
    if (max !== undefined && num > max) return defaultVal;
    return num;
  },

  boolean: (key: string, defaultVal: boolean) => {
    const raw = process.env[key];
    if (!raw) return defaultVal;
    const lower = raw.toLowerCase();
    return lower === 'true' || lower === '1';
  },

  numberArray: (key: string, defaultVal: number[]) => {
    const raw = process.env[key];
    if (!raw) return defaultVal;
    return raw
      .split('|')
      .map((s) => Number(s.trim()))
      .filter((n) => !isNaN(n));
  },
};

interface Settings {
  game_server_host: string;
  game_server_port: number;

  service_account_id: number;
  service_account_password: string;

  http_port: number;
  log_callbacks: boolean;
  log_full_packet: boolean;
  ignored_cmd_ids: number[];

  feishu_webhook_url: string;
  feishu_webhook_secret: string;
}

export const settings: Settings = {
  game_server_host: env.string('GAME_SERVER_HOST', '175.24.235.221'),
  game_server_port: env.number('GAME_SERVER_PORT', 1225),

  service_account_id: env.number('SERVICE_ACCOUNT_ID', 0),
  service_account_password: env.string('SERVICE_ACCOUNT_PASSWORD', ''),

  http_port: env.number('PORT', 3000, 1, 65535),
  log_callbacks: env.boolean('LOG_CALLBACKS', true),
  log_full_packet: env.boolean('LOG_FULL_PACKET', false),
  ignored_cmd_ids: env.numberArray(
    'IGNORED_CMD_IDS',
    [8002, 3452, 2004, 2001, 41228, 1002, 2002],
  ),

  feishu_webhook_url: env.string('FEISHU_WEBHOOK_URL', ''),
  feishu_webhook_secret: env.string('FEISHU_WEBHOOK_SECRET', ''),
};

const warn = (key: string) =>
  console.warn(`Warning: ${key} is not set in environment variables`);

if (!settings.service_account_id) warn('SERVICE_ACCOUNT_ID');
if (!settings.service_account_password) warn('SERVICE_ACCOUNT_PASSWORD');
