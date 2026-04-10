import axios from "axios";
import crypto from "crypto";
import { settings } from "../../config/config.js";

const webhookUrl: string = settings.feishu_webhook_url;
const secret: string = settings.feishu_webhook_secret;

interface WebhookResult {
  success: boolean;
  data?: any;
  error?: string;
}

/**
 * 生成签名
 */
function genSign(secret: string): { timestamp: number; sign: string } {
  const timestamp = Math.floor(Date.now() / 1000);
  const key = Buffer.from(`${timestamp}\n${secret}`, "utf8");

  const sign = crypto
    .createHmac("sha256", key)
    .update(Buffer.alloc(0))
    .digest("base64");

  return { timestamp, sign };
}

/**
 * 发送 webhook
 */
async function sendWebhook(body: Record<string, any>): Promise<WebhookResult> {
  try {
    if (!webhookUrl || !secret) {
      console.warn("Feishu webhook not configured");
      return { success: false };
    }

    const { timestamp, sign } = genSign(secret);

    const payload = {
      timestamp,
      sign,
      ...body,
    };

    const { data } = await axios.post(webhookUrl, payload);

    if (data.code !== 0) {
      console.error("Feishu error:", data);
      return { success: false, data };
    }

    return { success: true, data };
  } catch (err: any) {
    console.error("Feishu request error:", err.message);
    return { success: false, error: err.message };
  }
}

/**
 * 文本
 */
export function sendTextMessage(text: string) {
  if (!text) return;

  return sendWebhook({
    msg_type: "text",
    content: {
      text,
    },
  });
}

/**
 * markdown
 */
export function sendMarkdown(title: string, text: string) {
  return sendWebhook({
    msg_type: "post",
    content: {
      post: {
        zh_cn: {
          title,
          content: [
            [
              {
                tag: "text",
                text,
              },
            ],
          ],
        },
      },
    },
  });
}

/**
 * 富文本
 */
export function sendPost(
  title: string,
  contentArr: Array<Array<Record<string, any>>>,
) {
  return sendWebhook({
    msg_type: "post",
    content: {
      post: {
        zh_cn: {
          title,
          content: contentArr,
        },
      },
    },
  });
}

/**
 * 图片
 */
export function sendImage(imageKey: string) {
  return sendWebhook({
    msg_type: "image",
    content: {
      image_key: imageKey,
    },
  });
}

/**
 * 卡片消息
 */
export function sendCard(card: Record<string, any>) {
  return sendWebhook({
    msg_type: "interactive",
    card,
  });
}
