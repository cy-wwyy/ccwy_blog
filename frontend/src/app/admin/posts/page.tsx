"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { VditorPreview } from "@/components/editor/vditor-preview";
import {
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AdminTable } from "@/components/admin/admin-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Plus,
  Edit,
  Eye,
  Trash2,
  ChevronDown,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Clock,
} from "lucide-react";
import {
  fetchAdminPosts,
  deletePost as apiDeletePost,
  fetchCategories,
  getPost,
  type PostPublic,
  type PostDetail,
  type CategoryPublic,
} from "@/lib/api";
import {
  PAGE_SIZE,
  POST_STATUS,
  POST_STATUS_META,
  SORT_FIELD,
  SORT_ORDER,
} from "@/lib/constants";

export default function PostsPage() {
  const router = useRouter();
  const { token } = useAuth();
  const [posts, setPosts] = useState<PostPublic[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [categories, setCategories] = useState<CategoryPublic[]>([]);
  const [filterCategory, setFilterCategory] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [sortBy, setSortBy] = useState<string>(SORT_FIELD.CREATED_AT);
  const [sortOrder, setSortOrder] = useState<string>(SORT_ORDER.DESC);

  const catNameMap = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c.name])),
    [categories]
  );

  const [reload, setReload] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewPost, setPreviewPost] = useState<PostDetail | null>(null);

  useEffect(() => {
    if (!token) return;
    let active = true;
    (async () => {
      try {
        const res = await fetchAdminPosts(token, {
          skip: (page - 1) * PAGE_SIZE,
          limit: PAGE_SIZE,
          status: filterStatus || undefined,
          category_id: filterCategory || undefined,
          sort_by: sortBy,
          sort_order: sortOrder,
        });
        if (active) {
          setPosts(res.data);
          setTotal(res.count);
        }
      } catch (err) {
        if (active) toast.error(err instanceof Error ? err.message : "加载文章失败");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [token, page, filterCategory, filterStatus, sortBy, sortOrder, reload]);

  useEffect(() => {
    if (!token) return;
    fetchCategories(token)
      .then(setCategories)
      .catch((err) =>
        toast.error(err instanceof Error ? err.message : "加载分类失败")
      );
  }, [token]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    if (!token) return;
    try {
      await apiDeletePost(token, deleteTarget);
      setDeleteTarget(null);
      toast.success("已删除");
      if (posts.length === 1 && page > 1) {
        setPage(page - 1);
      } else {
        setReload((r) => r + 1);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "删除失败");
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const handlePreview = async (id: string) => {
    if (!token) return;
    setPreviewPost(null);
    setPreviewOpen(true);
    try {
      const detail = await getPost(token, id);
      setPreviewPost(detail);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加载预览失败");
      setPreviewOpen(false);
    }
  };

  const formatDate = (d: string | null) => {
    if (!d) return "-";
    return new Date(d).toLocaleDateString("zh-CN");
  };

  return (
    <div className="flex flex-1 flex-col space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SidebarTrigger className="-ml-1" />
          <h1 className="text-2xl font-bold">文章管理</h1>
        </div>
        <Button size="sm" onClick={() => router.push("/admin/posts/new")}>
          <Plus /> 新建文章
        </Button>
      </div>

      <AdminTable
        loading={loading}
        empty={posts.length === 0}
        emptyText="暂无文章"
        colSpan={6}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        header={
          <TableHeader>
            <TableRow className="border-b-2 h-12 bg-muted/30">
              <TableHead className="text-center w-[46%] max-w-0 min-w-[200px]">标题</TableHead>
              <TableHead className="text-center w-[12%]">
                <DropdownMenu>
                  <DropdownMenuTrigger className="inline-flex items-center gap-1 hover:text-foreground">
                    分类 <ChevronDown className="size-3" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onClick={() => { setFilterCategory(""); setPage(1); }}>全部</DropdownMenuItem>
                    {categories.map((c) => (
                      <DropdownMenuItem key={c.id} onClick={() => { setFilterCategory(c.id); setPage(1); }}>
                        {c.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableHead>
              <TableHead className="text-center w-[10%]">
                <DropdownMenu>
                  <DropdownMenuTrigger className="inline-flex items-center gap-1 hover:text-foreground">
                    状态 <ChevronDown className="size-3" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onClick={() => { setFilterStatus(""); setPage(1); }}>全部</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { setFilterStatus(POST_STATUS.PUBLISHED); setPage(1); }}>已发布</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { setFilterStatus(POST_STATUS.DRAFT); setPage(1); }}>草稿</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableHead>
              <TableHead className="text-center w-[12%]">
                <button
                  className="inline-flex items-center gap-1 hover:text-foreground"
                  onClick={() => {
                    if (sortBy === SORT_FIELD.UPDATED_AT) setSortOrder(sortOrder === SORT_ORDER.DESC ? SORT_ORDER.ASC : SORT_ORDER.DESC);
                    else { setSortBy(SORT_FIELD.UPDATED_AT); setSortOrder(SORT_ORDER.DESC); }
                  }}
                >
                  更新时间
                  {sortBy === SORT_FIELD.UPDATED_AT ? (
                    sortOrder === SORT_ORDER.ASC ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />
                  ) : (
                    <ArrowUpDown className="size-3" />
                  )}
                </button>
              </TableHead>
              <TableHead className="text-center w-[12%]">
                <button
                  className="inline-flex items-center gap-1 hover:text-foreground"
                  onClick={() => {
                    if (sortBy === SORT_FIELD.CREATED_AT) setSortOrder(sortOrder === SORT_ORDER.DESC ? SORT_ORDER.ASC : SORT_ORDER.DESC);
                    else { setSortBy(SORT_FIELD.CREATED_AT); setSortOrder(SORT_ORDER.DESC); }
                  }}
                >
                  创建时间
                  {sortBy === SORT_FIELD.CREATED_AT ? (
                    sortOrder === SORT_ORDER.ASC ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />
                  ) : (
                    <ArrowUpDown className="size-3" />
                  )}
                </button>
              </TableHead>
              <TableHead className="text-center w-24">操作</TableHead>
            </TableRow>
          </TableHeader>
        }
      >
        {posts.map((post) => (
          <TableRow key={post.id} className="border-b">
            <td className="text-center font-medium max-w-0 pl-3.5">
              {post.status === POST_STATUS.PUBLISHED && post.is_public ? (
                <Link
                  href={`/blog/${post.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate hover:text-primary hover:underline underline-offset-4 transition-colors"
                  title={`前往前台查看：${post.title}`}
                >
                  {post.title}
                </Link>
              ) : (
                <p
                  className="truncate cursor-default"
                  title={`${post.title}（未发布，前台暂不可见）`}
                >
                  {post.title}
                </p>
              )}
            </td>
            <td className="text-center pl-3.5">
              <Badge variant="outline">{post.category_id ? (catNameMap[post.category_id] || "-") : "-"}</Badge>
            </td>
            <td className="text-center pl-3.5">
              <Badge variant={POST_STATUS_META[post.status]?.variant ?? "outline"}>
                {POST_STATUS_META[post.status]?.label ?? post.status}
              </Badge>
            </td>
            <td className="text-center pl-3.5 text-muted-foreground">
              {formatDate(post.updated_at)}
            </td>
            <td className="text-center pl-3.5 text-muted-foreground">
              {formatDate(post.created_at)}
            </td>
            <td className="text-center pl-3.5">
              <div className="flex items-center justify-center gap-0">
                <Button variant="ghost" size="icon" aria-label="编辑" title="编辑" onClick={() => router.push(`/admin/posts/${post.slug}`)}>
                  <Edit className="size-4" />
                </Button>
                <Button variant="ghost" size="icon" aria-label="预览" title="预览" onClick={() => handlePreview(post.id)}>
                  <Eye className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="删除"
                  title="删除"
                  onClick={() => setDeleteTarget(post.id)}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            </td>
          </TableRow>
        ))}
      </AdminTable>

      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              删除后无法恢复，确定要删除这篇文章吗？
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 预览弹窗：复用前台 VditorPreview 渲染，草稿也可预览 */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl leading-tight text-left">
              {previewPost?.title ?? "预览"}
            </DialogTitle>
            <DialogDescription className="sr-only">文章预览</DialogDescription>
          </DialogHeader>
          {previewPost ? (
            <>
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground -mt-1 mb-2">
                <Badge variant={POST_STATUS_META[previewPost.status]?.variant ?? "outline"}>
                  {POST_STATUS_META[previewPost.status]?.label ?? previewPost.status}
                </Badge>
                <span className="inline-flex items-center gap-1">
                  <Clock size={13} />
                  {formatDate(previewPost.published_at ?? previewPost.created_at)}
                </span>
                {previewPost.category && <span>{previewPost.category.name}</span>}
                {previewPost.tags.map((t) => (
                  <Badge key={t.id} variant="outline" className="text-[11px]">
                    {t.name}
                  </Badge>
                ))}
              </div>
              <VditorPreview content={previewPost.content} />
            </>
          ) : (
            <div className="py-16 text-center text-sm text-muted-foreground">
              加载中...
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
