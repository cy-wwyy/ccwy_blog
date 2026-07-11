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
