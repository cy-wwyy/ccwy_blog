import type { NextConfig } from "next";

// 后端地址与允许的开发跨域来源均可通过环境变量覆盖，避免硬编码
const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8080";
const allowedDevOrigins =
  process.env.ALLOWED_DEV_ORIGINS?.split(",")
    .map((s) => s.trim())
    .filter(Boolean) ?? [];

const nextConfig: NextConfig = {
  allowedDevOrigins,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
      {
        // 上传文件静态访问（后端 StaticFiles 挂载在 /uploads）
        source: "/uploads/:path*",
        destination: `${backendUrl}/uploads/:path*`,
      },
    ];
  },
};

export default nextConfig;
