import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background">
      {/* 博客名 + 门槛线 */}
      <div className="mb-10 flex flex-col items-center gap-4">
        <h1 className="select-none text-sm font-normal uppercase tracking-[0.3em] text-foreground">
          ccwy&nbsp;&middot;&nbsp;blog
        </h1>
        <div className="h-px w-10 bg-border" />
      </div>

      <LoginForm />

      <p className="mt-6 font-mono text-xs text-muted-foreground">
        通过命令行注册管理员
      </p>
    </div>
  );
}
