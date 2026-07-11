"use client";

import Link from "next/link";
import Image from "next/image";
import { Clock, Eye } from "lucide-react";
import { CardContainer, CardBody, CardItem } from "@/components/ui/3d-card";
import { formatDate, cn } from "@/lib/utils";
import type { PostPublic } from "@/lib/api";

interface PostCardProps {
  post: PostPublic;
  categoryName?: string;
}

export function PostCard({ post, categoryName }: PostCardProps) {
  return (
    <CardContainer containerClassName="!py-0 w-[90%] mx-auto" className="!w-full">
      <CardBody className="!h-auto !w-full rounded-xl border border-border/50 bg-card/80 backdrop-blur-md overflow-hidden transition-shadow hover:shadow-lg hover:border-border">
        <Link href={`/blog/${post.slug}`} className="group flex flex-row h-[120px]">
          {/* 文字区 */}
          <div className="flex-1 min-w-0 p-4 flex flex-col">
            <div className={cn("flex-1 flex flex-col", !post.excerpt && "justify-center")}>
              <CardItem translateZ={30}>
                <h2 className="text-base font-bold leading-snug group-hover:text-primary transition-colors line-clamp-1">
                  {post.title}
                </h2>
              </CardItem>
              {post.excerpt && (
                <CardItem translateZ={20}>
                  <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2 mt-0.5">
                    {post.excerpt}
                  </p>
                </CardItem>
              )}
            </div>
            <CardItem translateZ={25}>
              <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                <span className="flex items-center gap-1">
                  <Clock size={14} />
                  {formatDate(post.published_at ?? post.created_at ?? "")}
                </span>
                <span className="flex items-center gap-1">
                  <Eye size={14} />
                  {post.views}
                </span>
                {categoryName && <span>{categoryName}</span>}
              </div>
            </CardItem>
          </div>
          {/* 封面图 120x120 */}
          {post.cover && (
            <CardItem translateZ={50} className="w-[120px] h-[120px] shrink-0 overflow-hidden rounded-l-xl">
              <Image
                src={post.cover}
                alt={post.title}
                width={120}
                height={120}
                unoptimized
                className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
              />
            </CardItem>
          )}
        </Link>
      </CardBody>
    </CardContainer>
  );
}
