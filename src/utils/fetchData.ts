import axios from "axios";

async function getSeerServerInfo(
  url: string = "https://seerh5login.61.com/seer_notice"
): Promise<{ status: string; info: any }> {
  try {
    const { data } = await axios.get(url + `?t=${Date.now()}`);

    let jsonData = data;
    if (typeof data === "string") {
      try {
        jsonData = JSON.parse(data);
      } catch (parseError) {
        console.error("Failed to parse data:", parseError);
        return { status: "错误", info: "数据解析失败" };
      }
    }

    // jsonData 是否为空对象
    if (
      typeof jsonData === "object" &&
      jsonData !== null &&
      Object.keys(jsonData).length === 0
    ) {
      return { status: "开服", info: jsonData };
    }

    // jsonData 是否为数组且第一个元素的 type 为 1
    if (
      Array.isArray(jsonData) &&
      jsonData.length > 0 &&
      jsonData[0].type === 1
    ) {
      return { status: "开服", info: jsonData };
    } else {
      return { status: "未开服", info: null };
    }
  } catch (error) {
    return { status: "错误", info: "请求失败" };
  }
}

export { getSeerServerInfo };
