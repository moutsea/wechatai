import { useEffect, useRef } from "react";
import type { Connection, Snapshot } from "../shared/types";
import { trackFunnel } from "./analytics-client";

/** 工作台级观察器：页面切换不重置基线，选中的链接变化也不等于重新扫码。 */
export function useWechatConnectionTracker(data: Snapshot | null) {
  const previous = useRef(new Map<string, Connection["status"]>());
  useEffect(() => {
    if (!data) {
      previous.current.clear();
      return;
    }
    for (const link of data.connections) {
      const status = previous.current.get(link.id);
      if (
        !link.paused &&
        link.status === "connected" &&
        (status === "waiting" || status === "scanned")
      )
        trackFunnel("wechat_connected");
    }
    previous.current = new Map(data.connections.map((link) => [link.id, link.status]));
  }, [data]);
}
