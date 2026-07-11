const API_BASE = "/api/v1";

/** 携带 HTTP 状态码的 API 错误，便于调用方区分认证失败与网络故障 */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * 401/403 全局兜底：由 use-auth 注册，任意请求遇到认证失效时统一清理会话，
 * 避免每个调用点各自处理 token 过期。
 */
type UnauthorizedHandler = () => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;
export function setUnauthorizedHandler(fn: UnauthorizedHandler | null): void {
  unauthorizedHandler = fn;
}

/** 从后端响应体中提取可读的错误信息，兼容 FastAPI 的字符串 detail 与 422 数组 detail */
function extractDetail(body: unknown, status: number): string {
  if (body && typeof body === "object" && "detail" in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0];
      if (first && typeof first === "object" && "msg" in first) {
        return String((first as { msg: unknown }).msg);
      }
    }
  }
  return `请求失败 (${status})`;
}

/** 统一的请求封装：非 2xx 一律抛出携带状态码与后端 detail 的 ApiError */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message = extractDetail(body, res.status);
    if ((res.status === 401 || res.status === 403) && unauthorizedHandler) {
      unauthorizedHandler();
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

// ── Auth ───────────────────────────────────────────

export interface LoginResponse {
  access_token: string;
  token_type: string;
}

export interface UserPublic {
  id: string;
  username: string;
  email: string;
  avatar: string | null;
  bio: string | null;
}

export async function login(
  username: string,
  password: string
): Promise<LoginResponse> {
  const formData = new URLSearchParams();
  formData.append("username", username);
  formData.append("password", password);

  return request<LoginResponse>("/login/access-token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData.toString(),
  });
}

export async function getMe(token: string): Promise<UserPublic> {
  return request<UserPublic>("/login/test-token", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

// ── Posts ──────────────────────────────────────────

export interface PostPublic {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  cover: string | null;
  status: string;
  is_public: boolean;
  allow_comments: boolean;
  author_id: string;
  category_id: string | null;
  published_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  views: number;
}

export interface PostsListResponse {
  data: PostPublic[];
  count: number;
}

export interface PostWritePayload {
  title: string;
  slug: string;
  content: string;
  excerpt?: string | null;
  cover?: string | null;
  status?: string;
  category_id?: string | null;
  tag_ids?: string[];
}

export async function fetchAdminPosts(
  token: string,
  params?: { skip?: number; limit?: number; status?: string; category_id?: string; sort_by?: string; sort_order?: string }
): Promise<PostsListResponse> {
  const qs = new URLSearchParams();
  if (params?.skip) qs.set("skip", String(params.skip));
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.status) qs.set("status", params.status);
  if (params?.category_id) qs.set("category_id", params.category_id);
  if (params?.sort_by) qs.set("sort_by", params.sort_by);
  if (params?.sort_order) qs.set("sort_order", params.sort_order);
  const q = qs.toString();
  return request<PostsListResponse>(
    `/admin/posts${q ? "?" + q : ""}`,
    { headers: authHeaders(token) }
  );
}

export async function createPost(
  token: string,
  data: PostWritePayload
): Promise<PostPublic> {
  return request<PostPublic>("/admin/posts", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(data),
  });
}

export interface PostDetail extends PostPublic {
  content: string;
  tags: TagPublic[];
  category: CategoryPublic | null;
}

export async function getPost(token: string, id: string): Promise<PostDetail> {
  return request<PostDetail>(`/admin/posts/${id}`, {
    headers: authHeaders(token),
  });
}

export async function getPostBySlug(
  token: string,
  slug: string
): Promise<PostDetail> {
  return request<PostDetail>(
    `/admin/posts/by-slug/${encodeURIComponent(slug)}`,
    { headers: authHeaders(token) }
  );
}

export async function updatePost(
  token: string,
  id: string,
  data: PostWritePayload
): Promise<PostDetail> {
  return request<PostDetail>(`/admin/posts/${id}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(data),
  });
}

export async function deletePost(token: string, id: string): Promise<void> {
  await request<{ message: string }>(`/admin/posts/${id}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
}

// ── Categories ─────────────────────────────────────

export interface CategoryPublic {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parent_id: string | null;
  sort_order: number;
}

export interface CategoryWritePayload {
  name: string;
  slug: string;
  description?: string | null;
  parent_id?: string | null;
}

export async function fetchCategories(token: string): Promise<CategoryPublic[]> {
  return request<CategoryPublic[]>("/admin/categories", {
    headers: authHeaders(token),
  });
}

export async function createCategory(
  token: string,
  data: CategoryWritePayload
): Promise<CategoryPublic> {
  return request<CategoryPublic>("/admin/categories", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(data),
  });
}

export async function updateCategory(
  token: string,
  id: string,
  data: CategoryWritePayload
): Promise<CategoryPublic> {
  return request<CategoryPublic>(`/admin/categories/${id}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(data),
  });
}

export async function deleteCategory(token: string, id: string): Promise<void> {
  await request<{ message: string }>(`/admin/categories/${id}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
}

export interface AffectedPost {
  id: string;
  title: string;
}

export interface CategoryDeletionImpact {
  affected_posts: AffectedPost[];
  category_count: number;
}

export async function fetchCategoryDeletionImpact(
  token: string,
  id: string
): Promise<CategoryDeletionImpact> {
  return request<CategoryDeletionImpact>(
    `/admin/categories/${id}/deletion-impact`,
    { headers: authHeaders(token) }
  );
}

// ── Tags ───────────────────────────────────────────

export interface TagPublic {
  id: string;
  name: string;
  slug: string;
}

export interface TagWritePayload {
  name: string;
  slug: string;
}

export async function fetchTags(token: string): Promise<TagPublic[]> {
  return request<TagPublic[]>("/admin/tags", { headers: authHeaders(token) });
}

export async function createTag(
  token: string,
  data: TagWritePayload
): Promise<TagPublic> {
  return request<TagPublic>("/admin/tags", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(data),
  });
}

export async function updateTag(
  token: string,
  id: string,
  data: TagWritePayload
): Promise<TagPublic> {
  return request<TagPublic>(`/admin/tags/${id}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(data),
  });
}

export async function deleteTag(token: string, id: string): Promise<void> {
  await request<{ message: string }>(`/admin/tags/${id}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
}

// ── Public（无鉴权前台）─────────────────────────────

export async function fetchPublicPosts(params?: {
  skip?: number;
  limit?: number;
  category_id?: string;
  search?: string;
}): Promise<PostsListResponse> {
  const qs = new URLSearchParams();
  if (params?.skip) qs.set("skip", String(params.skip));
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.category_id) qs.set("category_id", params.category_id);
  if (params?.search) qs.set("search", params.search);
  const q = qs.toString();
  return request<PostsListResponse>(`/posts${q ? "?" + q : ""}`);
}

export async function fetchPublicCategories(): Promise<CategoryPublic[]> {
  return request<CategoryPublic[]>("/categories");
}

export async function fetchPublicPost(slug: string): Promise<PostDetail> {
  return request<PostDetail>(`/posts/${encodeURIComponent(slug)}`);
}

// ── Media（上传）────────────────────────────────────

export interface MediaUploadResult {
  id: string;
  filename: string;
  url: string;
  thumb_url: string | null;
  mime_type: string;
  size: number;
  module: string;
  synced_to_oss: boolean;
  created_at: string | null;
}

export async function uploadMedia(
  token: string,
  file: File,
  module: string = "media"
): Promise<MediaUploadResult> {
  const form = new FormData();
  form.append("file", file);
  // 不手动设 Content-Type，交给浏览器带上 multipart boundary
  return request<MediaUploadResult>(
    `/admin/media?module=${encodeURIComponent(module)}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    }
  );
}

// ── Album（相册）────────────────────────────────────

export interface AlbumPhotoPublic {
  id: string;
  media_id: string;
  url: string;
  thumb_url: string | null;
  caption: string | null;
  sort_order: number;
}

export interface AlbumPublic {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  cover_media_id: string | null;
  is_public: boolean;
  sort_order: number;
  cover_url: string | null;
  photo_count: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface AlbumDetail extends AlbumPublic {
  photos: AlbumPhotoPublic[];
}

export interface AlbumsListResponse {
  data: AlbumPublic[];
  count: number;
}

export interface AlbumWritePayload {
  title: string;
  slug: string;
  description?: string | null;
  cover_media_id?: string | null;
  is_public?: boolean;
  sort_order?: number;
}

export async function fetchAlbums(
  token: string,
  params?: { skip?: number; limit?: number; search?: string }
): Promise<AlbumsListResponse> {
  const q = new URLSearchParams();
  if (params?.skip != null) q.set("skip", String(params.skip));
  if (params?.limit != null) q.set("limit", String(params.limit));
  if (params?.search) q.set("search", params.search);
  const qs = q.toString();
  return request<AlbumsListResponse>(`/admin/albums${qs ? `?${qs}` : ""}`, {
    headers: authHeaders(token),
  });
}

export async function getAlbum(
  token: string,
  id: string
): Promise<AlbumDetail> {
  return request<AlbumDetail>(`/admin/albums/${id}`, {
    headers: authHeaders(token),
  });
}

export async function getAlbumBySlug(
  token: string,
  slug: string
): Promise<AlbumDetail> {
  return request<AlbumDetail>(
    `/admin/albums/by-slug/${encodeURIComponent(slug)}`,
    { headers: authHeaders(token) }
  );
}

export async function createAlbum(
  token: string,
  payload: AlbumWritePayload
): Promise<AlbumDetail> {
  return request<AlbumDetail>("/admin/albums", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
}

export async function updateAlbum(
  token: string,
  id: string,
  payload: Partial<AlbumWritePayload>
): Promise<AlbumDetail> {
  return request<AlbumDetail>(`/admin/albums/${id}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
}

export async function deleteAlbum(token: string, id: string): Promise<void> {
  await request<unknown>(`/admin/albums/${id}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
}

export async function addAlbumPhoto(
  token: string,
  albumId: string,
  payload: { media_id: string; caption?: string | null; sort_order?: number }
): Promise<AlbumPhotoPublic> {
  return request<AlbumPhotoPublic>(`/admin/albums/${albumId}/photos`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
}

export async function updateAlbumPhoto(
  token: string,
  albumId: string,
  photoId: string,
  payload: { caption?: string | null; sort_order?: number }
): Promise<AlbumPhotoPublic> {
  return request<AlbumPhotoPublic>(
    `/admin/albums/${albumId}/photos/${photoId}`,
    {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(payload),
    }
  );
}

export async function deleteAlbumPhoto(
  token: string,
  albumId: string,
  photoId: string
): Promise<void> {
  await request<unknown>(`/admin/albums/${albumId}/photos/${photoId}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
}

// ── Album（前台公开浏览）────────────────────────────
// 公开视图收敛了字段：不含 cover_media_id/is_public/sort_order/media_id

export interface PublicAlbumPhoto {
  id: string;
  url: string;
  thumb_url: string | null;
  caption: string | null;
}

export interface PublicAlbumCard {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  cover_url: string | null;
  photo_count: number;
  views: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface PublicAlbumView extends PublicAlbumCard {
  photos: PublicAlbumPhoto[];
}

export interface PublicAlbumsResponse {
  data: PublicAlbumCard[];
  count: number;
}

export async function fetchPublicAlbums(params?: {
  skip?: number;
  limit?: number;
}): Promise<PublicAlbumsResponse> {
  const q = new URLSearchParams();
  if (params?.skip != null) q.set("skip", String(params.skip));
  if (params?.limit != null) q.set("limit", String(params.limit));
  const qs = q.toString();
  return request<PublicAlbumsResponse>(`/albums${qs ? `?${qs}` : ""}`);
}

export async function fetchPublicAlbum(
  slug: string
): Promise<PublicAlbumView> {
  return request<PublicAlbumView>(`/albums/${encodeURIComponent(slug)}`);
}

// ── Settings（设置）─────────────────────────────────

export interface ProfileSettings {
  display_name: string;
  avatar: string | null;
  bio: string | null;
  github: string | null;
  website: string | null;
  is_owner: boolean;
}

export interface SiteSettings {
  site_title: string;
  site_subtitle: string;
  footer_text: string;
  icp: string;
}

export async function getProfileSettings(
  token: string
): Promise<ProfileSettings> {
  return request<ProfileSettings>("/admin/settings/profile", {
    headers: authHeaders(token),
  });
}

export async function updateProfileSettings(
  token: string,
  data: Partial<ProfileSettings>
): Promise<ProfileSettings> {
  return request<ProfileSettings>("/admin/settings/profile", {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(data),
  });
}

export async function getSiteSettings(token: string): Promise<SiteSettings> {
  return request<SiteSettings>("/admin/settings/site", {
    headers: authHeaders(token),
  });
}

export async function updateSiteSettings(
  token: string,
  data: Partial<SiteSettings>
): Promise<SiteSettings> {
  return request<SiteSettings>("/admin/settings/site", {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(data),
  });
}

// ── Settings（前台公开：站点信息 + 博主公开信息）────────

export interface PublicAuthor {
  display_name: string;
  bio: string | null;
  avatar: string | null;
  github: string | null;
  website: string | null;
}

export interface PublicSiteInfo extends SiteSettings {
  author: PublicAuthor;
}

export async function fetchPublicSiteInfo(): Promise<PublicSiteInfo> {
  return request<PublicSiteInfo>("/site-settings");
}

// ── Stats（访问统计）────────────────────────────────

export type TrackKind = "site" | "post" | "album";

/** 埋点上报（fire-and-forget）：后端半小时内同一人同一目标只计一次，失败静默。 */
export function trackView(kind: TrackKind, slug?: string): void {
  fetch(`${API_BASE}/track`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, slug }),
    keepalive: true,
  }).catch(() => {});
}

export interface StatsOverview {
  visitors_today: number;
  visitors_total: number;
}

export interface PostViewStat {
  id: string;
  title: string;
  slug: string;
  views: number;
}

export async function fetchStatsOverview(
  token: string
): Promise<StatsOverview> {
  return request<StatsOverview>("/admin/stats/overview", {
    headers: authHeaders(token),
  });
}

/** 公开：整站访客量（今日/累计），供前台右栏展示。 */
export async function fetchSiteStats(): Promise<StatsOverview> {
  return request<StatsOverview>("/site-stats");
}

// ── Tools（个人工具：2FA 验证码）─────────────────────

export interface TotpCode {
  code: string;
  expires_in: number;
  period: number;
}

export async function fetchTotp(
  token: string,
  body: { passphrase?: string; secret?: string }
): Promise<TotpCode> {
  return request<TotpCode>("/admin/tools/totp", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function fetchPostStats(
  token: string,
  limit = 10
): Promise<PostViewStat[]> {
  const r = await request<{ data: PostViewStat[] }>(
    `/admin/stats/posts?limit=${limit}`,
    { headers: authHeaders(token) }
  );
  return r.data;
}

