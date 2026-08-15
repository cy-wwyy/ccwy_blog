/** 全站共享常量 — 集中管理魔法字符串，避免散落各处 */

/** url-friendly slug 格式：小写字母/数字，以单个连字符分隔 */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** localStorage 中存放 JWT 的键名 */
export const TOKEN_KEY = "ccwy_blog_token";

/** 后台列表分页大小 */
export const PAGE_SIZE = 10;

/** 文章发布状态 — 与后端 PostStatus 保持一致 */
export const POST_STATUS = {
  DRAFT: "draft",
  PUBLISHED: "published",
} as const;

export type PostStatus = (typeof POST_STATUS)[keyof typeof POST_STATUS];

/** 状态在后台表格中的展示文案与 Badge 样式 */
export const POST_STATUS_META: Record<
  string,
  { label: string; variant: "default" | "secondary" | "outline" }
> = {
  [POST_STATUS.PUBLISHED]: { label: "已发布", variant: "default" },
  [POST_STATUS.DRAFT]: { label: "草稿", variant: "secondary" },
};

/** 文章列表排序字段 */
export const SORT_FIELD = {
  CREATED_AT: "created_at",
  UPDATED_AT: "updated_at",
} as const;

export const SORT_ORDER = {
  ASC: "asc",
  DESC: "desc",
} as const;

/** 记录点类型 —— 与后端 trip/models.py 的 PointType Literal 保持一致 */
export const POINT_TYPE = {
  ACCOMMODATION: "accommodation",
  CAMPING: "camping",
  GAS: "gas",
  REPAIR: "repair",
  SUPPLIES: "supplies",
  LUNCH: "lunch",
  REST: "rest",
  VIEWPOINT: "viewpoint",
  LANDMARK: "landmark",
  PASS: "pass",
  ANCIENT_TOWN: "ancient_town",
  TOWN: "town",
  EVENT: "event",
  WAYPOINT: "waypoint",
  OTHER: "other",
} as const;

export type PointType = (typeof POINT_TYPE)[keyof typeof POINT_TYPE];

/** 单个类型的展示元数据 */
export interface PointTypeMeta {
  /** 中文标签 */
  label: string;
  /** 地图 marker / 悬停点的颜色 */
  color: string;
  /** 后台列表 Badge 样式 */
  variant: "default" | "secondary" | "outline";
}

/** 全部类型的展示元数据（含 waypoint，供地图/列表兜底显示） */
export const POINT_TYPE_META: Record<PointType, PointTypeMeta> = {
  accommodation: { label: "住宿", color: "#e74c3c", variant: "default" },
  camping: { label: "露营", color: "#27ae60", variant: "default" },
  gas: { label: "加油", color: "#3498db", variant: "outline" },
  repair: { label: "修车保养", color: "#95a5a6", variant: "outline" },
  supplies: { label: "补给采购", color: "#16a085", variant: "outline" },
  lunch: { label: "吃饭", color: "#f39c12", variant: "outline" },
  rest: { label: "休整", color: "#8e44ad", variant: "secondary" },
  viewpoint: { label: "风景", color: "#2ecc71", variant: "secondary" },
  landmark: { label: "地标", color: "#e84393", variant: "secondary" },
  pass: { label: "垭口", color: "#9b59b6", variant: "secondary" },
  ancient_town: { label: "古城", color: "#e67e22", variant: "default" },
  town: { label: "城镇", color: "#57606f", variant: "default" },
  event: { label: "路况事件", color: "#d63031", variant: "outline" },
  waypoint: { label: "途经点", color: "#b2bec3", variant: "outline" },
  other: { label: "其他", color: "#7f8c8d", variant: "outline" },
};

/** 表单下拉的分组顺序 */
export const POINT_TYPE_GROUPS: { label: string; types: PointType[] }[] = [
  { label: "过夜", types: ["accommodation", "camping"] },
  { label: "补给", types: ["gas", "repair", "supplies"] },
  { label: "休整", types: ["lunch", "rest"] },
  { label: "景观", types: ["viewpoint", "landmark", "pass", "ancient_town"] },
  { label: "途经", types: ["town", "event"] },
  { label: "路线", types: ["waypoint"] },
  { label: "其他", types: ["other"] },
];
