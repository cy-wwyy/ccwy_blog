"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm, Controller, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Edit, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { AdminTable } from "@/components/admin/admin-table";
import { SlugInput, useAutoFillSlug } from "@/components/admin/slug-input";
import { PAGE_SIZE, SLUG_PATTERN } from "@/lib/constants";
import {
  fetchCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  fetchCategoryDeletionImpact,
  fetchTags,
  createTag,
  updateTag,
  deleteTag,
  type CategoryPublic,
  type CategoryDeletionImpact,
  type TagPublic,
} from "@/lib/api";

const itemSchema = z.object({
  name: z.string().min(1, "请输入名称"),
  slug: z
    .string()
    .min(1, "请输入 slug")
    .regex(SLUG_PATTERN, "slug 只能包含小写字母、数字和连字符"),
  description: z.string(),
  parentId: z.string(),
});

type ItemFormValues = z.infer<typeof itemSchema>;

const EMPTY_FORM: ItemFormValues = {
  name: "",
  slug: "",
  description: "",
  parentId: "",
};

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

export default function CategoriesPage() {
  const { token } = useAuth();
  const maybeFillSlug = useAutoFillSlug(token);
  const [tab, setTab] = useState("categories");
  const [categories, setCategories] = useState<CategoryPublic[]>([]);
  const [tags, setTags] = useState<TagPublic[]>([]);
  const [catPage, setCatPage] = useState(1);
  const [tagPage, setTagPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CategoryPublic | TagPublic | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteImpact, setDeleteImpact] = useState<
    (CategoryDeletionImpact & { catId: string }) | null
  >(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ItemFormValues>({
    resolver: zodResolver(itemSchema),
    defaultValues: EMPTY_FORM,
  });

  const itemName = useWatch({ control, name: "name" });

  useEffect(() => {
    if (!token) return;
    let active = true;
    (async () => {
      try {
        const [cats, tgs] = await Promise.all([
          fetchCategories(token),
          fetchTags(token),
        ]);
        if (active) {
          setCategories(cats);
          setTags(tgs);
        }
      } catch (e) {
        if (active) toast.error(errorMessage(e, "加载数据失败"));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [token]);

  const isCat = tab === "categories";
  const data = isCat ? categories : tags;
  const rawPage = isCat ? catPage : tagPage;
  const setPage = isCat ? setCatPage : setTagPage;
  const totalPages = Math.max(1, Math.ceil(data.length / PAGE_SIZE));
  // 渲染期直接夹取有效页码，数据缩减时自动回退，无需 effect 里 setState
  const page = Math.min(rawPage, totalPages);
  const catNameMap = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c.name])),
    [categories]
  );
  const paged = useMemo(
    () => data.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [data, page]
  );

  const parentItems = useMemo(
    () => [
      { label: "无（顶级分类）", value: "" },
      ...categories
        .filter((c) => c.id !== editing?.id)
        .map((c) => ({ label: c.name, value: c.id })),
    ],
    [categories, editing]
  );

  const openCreate = () => {
    setEditing(null);
    reset(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (item: CategoryPublic | TagPublic) => {
    setEditing(item);
    reset({
      name: item.name,
      slug: item.slug,
      description: "description" in item ? item.description || "" : "",
      parentId: "parent_id" in item ? item.parent_id || "" : "",
    });
    setDialogOpen(true);
  };

  const onSubmit = async (values: ItemFormValues) => {
    if (!token) return;
    const slug = await maybeFillSlug(values.name, values.slug);
    try {
      if (isCat) {
        const payload = {
          name: values.name,
          slug,
          description: values.description || null,
          parent_id: values.parentId || null,
        };
        if (editing) {
          const updated = await updateCategory(token, editing.id, payload);
          setCategories((prev) =>
            prev.map((c) => (c.id === updated.id ? updated : c))
          );
        } else {
          const created = await createCategory(token, payload);
          setCategories((prev) => [...prev, created]);
        }
      } else {
        const payload = { name: values.name, slug };
        if (editing) {
          const updated = await updateTag(token, editing.id, payload);
          setTags((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
        } else {
          const created = await createTag(token, payload);
          setTags((prev) => [...prev, created]);
        }
      }
      toast.success(editing ? "已保存" : "已创建");
      setDialogOpen(false);
    } catch (e) {
      toast.error(errorMessage(e, "保存失败"));
    }
  };

  const performCategoryDelete = async (catId: string) => {
    if (!token) return;
    setDeleteLoading(true);
    try {
      await deleteCategory(token, catId);
      setCategories(await fetchCategories(token));
      setDeleteImpact(null);
      toast.success("已删除");
    } catch (e) {
      toast.error(errorMessage(e, "删除失败"));
    } finally {
      setDeleteLoading(false);
    }
  };

  const requestDelete = async (item: CategoryPublic | TagPublic) => {
    if (!token) return;
    if (!isCat) {
      setDeleteTarget(item.id);
      return;
    }
    try {
      const impact = await fetchCategoryDeletionImpact(token, item.id);
      setDeleteImpact({ ...impact, catId: item.id });
    } catch (e) {
      toast.error(errorMessage(e, "获取删除影响失败"));
    }
  };

  const handleDeleteTag = async () => {
    if (!deleteTarget || !token) return;
    setDeleteLoading(true);
    try {
      await deleteTag(token, deleteTarget);
      setTags((prev) => prev.filter((t) => t.id !== deleteTarget));
      setDeleteTarget(null);
      toast.success("已删除");
    } catch (e) {
      toast.error(errorMessage(e, "删除失败"));
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SidebarTrigger className="-ml-1" />
          <Tabs value={tab} onValueChange={(val) => setTab(val ?? "categories")}>
            <TabsList>
              <TabsTrigger value="categories">分类</TabsTrigger>
              <TabsTrigger value="tags">标签</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus /> 新建{isCat ? "分类" : "标签"}
        </Button>
      </div>

      <AdminTable
        loading={loading}
        empty={paged.length === 0}
        emptyText="暂无数据"
        colSpan={isCat ? 5 : 3}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        header={
          <TableHeader>
            <TableRow className="border-b-2 h-12 bg-muted/30">
              <TableHead className="text-center w-[25%]">名称</TableHead>
              <TableHead className="text-center w-[15%]">slug</TableHead>
              {isCat && (
                <>
                  <TableHead className="text-center w-[12%]">归属</TableHead>
                  <TableHead className="text-center w-[28%]">描述</TableHead>
                </>
              )}
              <TableHead className="text-center w-24">操作</TableHead>
            </TableRow>
          </TableHeader>
        }
      >
        {paged.map((item) => (
          <TableRow key={item.id} className="border-b">
            <td className="text-center">
              {isCat ? (
                <span className="font-medium">{item.name}</span>
              ) : (
                <Badge variant="outline">{item.name}</Badge>
              )}
            </td>
            <td className="text-center text-muted-foreground">{item.slug}</td>
            {isCat && (
              <>
                <td className="text-center text-muted-foreground">
                  {(item as CategoryPublic).parent_id
                    ? (catNameMap[(item as CategoryPublic).parent_id!] || "-")
                    : "-"}
                </td>
                <td className="text-center text-muted-foreground">
                  {(item as CategoryPublic).description || "-"}
                </td>
              </>
            )}
            <td className="text-center">
              <div className="flex items-center justify-center gap-0">
                <Button variant="ghost" size="icon" aria-label="编辑" title="编辑" onClick={() => openEdit(item)}>
                  <Edit className="size-4" />
                </Button>
                <Button variant="ghost" size="icon" aria-label="删除" title="删除" onClick={() => requestDelete(item)}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            </td>
          </TableRow>
        ))}
      </AdminTable>

      {/* 新建/编辑弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "编辑" : "新建"}{isCat ? "分类" : "标签"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="name">名称</Label>
                <Input id="name" {...register("name")} placeholder="输入名称" aria-invalid={!!errors.name} />
                {errors.name && (
                  <p className="text-sm text-destructive">{errors.name.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="slug">slug</Label>
                <Controller
                  control={control}
                  name="slug"
                  render={({ field }) => (
                    <SlugInput
                      value={field.value}
                      onChange={field.onChange}
                      title={itemName}
                      error={errors.slug?.message}
                    />
                  )}
                />
              </div>
              {isCat && (
                <>
                  <div className="space-y-2">
                    <Label>归属</Label>
                    <Controller
                      control={control}
                      name="parentId"
                      render={({ field }) => (
                        <Select
                          items={parentItems}
                          value={field.value}
                          onValueChange={(val) => field.onChange(val ?? "")}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {parentItems.map((item) => (
                              <SelectItem key={item.value} value={item.value}>
                                {item.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">描述（可选）</Label>
                    <Input id="description" {...register("description")} placeholder="分类描述" />
                  </div>
                </>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
              <Button type="submit" disabled={isSubmitting}>保存</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 标签删除确认弹窗 */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">删除后无法恢复，确定要删除吗？</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>取消</Button>
            <Button variant="destructive" onClick={handleDeleteTag} disabled={deleteLoading}>删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 分类删除确认弹窗（含影响预览） */}
      <Dialog open={!!deleteImpact} onOpenChange={() => setDeleteImpact(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除分类</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            {deleteImpact && deleteImpact.category_count > 1 && (
              <p className="text-muted-foreground">
                将同时删除 {deleteImpact.category_count} 个分类（含子分类）。
              </p>
            )}
            {deleteImpact && deleteImpact.affected_posts.length > 0 ? (
              <>
                <p className="text-muted-foreground">
                  以下 {deleteImpact.affected_posts.length} 篇文章的分类将被重置为「无」：
                </p>
                <ul className="max-h-48 overflow-y-auto rounded-md border bg-muted/30 p-2 space-y-1">
                  {deleteImpact.affected_posts.map((p) => (
                    <li key={p.id} className="truncate" title={p.title}>· {p.title}</li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-muted-foreground">删除后无法恢复，确定要删除吗？</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteImpact(null)}>取消</Button>
            <Button
              variant="destructive"
              disabled={deleteLoading}
              onClick={() => deleteImpact && performCategoryDelete(deleteImpact.catId)}
            >
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
