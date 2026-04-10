import axios from "axios";

async function getUnityNoticeInfo(
  url: string = "http://unity-notice.61.com/unity_notice/",
) {
  const { data } = await axios.get(url + `?t=${Date.now()}`);
  if (!Array.isArray(data)) {
    throw new Error("notice 数据格式错误");
  }
  return data;
}

function parseUnityNotice(noticeList: any[]) {
  const maintenanceNotice = noticeList.find((n) => n.type === 3);

  if (maintenanceNotice) {
    return {
      status: "维护",
      info: maintenanceNotice.text || "当前有维护公告，但未提供具体信息",
    };
  }

  return {
    status: "开服",
    info: "当前unity已开服",
  };
}

export { getUnityNoticeInfo, parseUnityNotice };
