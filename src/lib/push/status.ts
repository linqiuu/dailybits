export const DELIVERY_STATUS_LABELS: Record<string, string> = {
  PENDING: "待处理", PROCESSING: "发送中", ACCEPTED: "上游已接收",
  FAILED: "发送失败", CANCELLED: "已取消", UNKNOWN: "发送结果待确认",
};

export function deliveryErrorLabel(code: string | null): string {
  if (!code) return "";
  if (code.includes("NOT_CONFIGURED") || code.includes("KEY_MISSING")) return "推送服务尚未配置";
  if (code.includes("UNCERTAIN")) return "发送结果无法确认，已暂停自动重发";
  if (code.includes("UNAVAILABLE") || code.includes("NETWORK")) return "上游服务暂时不可用";
  if (code === "DELIVERY_EXPIRED") return "已超过补发时间窗口";
  if (code === "SUBSCRIPTION_UNAVAILABLE") return "订阅已停止或内容不可访问";
  if (code === "LOCAL_RECORDING_RETRY") return "卡片已接收，正在同步本地记录";
  if (code.includes("429") || code.includes("LIMIT") || code.includes("PROGRESS")) return "等待上游额度或处理中任务恢复";
  if (code.includes("401") || code.includes("403")) return "推送服务凭据或权限需要检查";
  return "处理失败，需要检查服务日志";
}
