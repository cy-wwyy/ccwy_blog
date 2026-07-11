"use client";

import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Copy, Lock, KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/use-auth";
import { fetchTotp } from "@/lib/api";

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

export default function TotpToolPage() {
  const { token } = useAuth();
  const [passphrase, setPassphrase] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [period, setPeriod] = useState(30);
  const [remaining, setRemaining] = useState(0);
  const [expiresAt, setExpiresAt] = useState(0); // 当前码失效的 epoch 秒

  const { register, handleSubmit, reset } = useForm<{ passphrase: string }>({
    defaultValues: { passphrase: "" },
  });

  // 用给定/当前口令取一次码；失败则回到锁定态
  const roll = useCallback(
    async (pass?: string) => {
      const pp = pass ?? passphrase;
      if (!token || !pp) return;
      // 乐观推后到期时间，避免慢请求期间倒计时反复触发重取
      setExpiresAt(Math.floor(Date.now() / 1000) + period);
      try {
        const r = await fetchTotp(token, { passphrase: pp });
        setCode(r.code);
        setPeriod(r.period);
        setRemaining(r.expires_in);
        setExpiresAt(Math.floor(Date.now() / 1000) + r.expires_in);
      } catch (e) {
        toast.error(errorMessage(e, "取码失败"));
        setPassphrase(null);
        setCode("");
      }
    },
    [token, passphrase, period]
  );

  // 每秒按绝对到期时间刷新倒计时，归零自动滚下一个
  useEffect(() => {
    if (!passphrase) return;
    const id = setInterval(() => {
      const rem = expiresAt - Math.floor(Date.now() / 1000);
      if (rem <= 0) roll();
      else setRemaining(rem);
    }, 1000);
    return () => clearInterval(id);
  }, [passphrase, expiresAt, roll]);

  const unlock = ({ passphrase: p }: { passphrase: string }) => {
    if (!p) return;
    setPassphrase(p);
    roll(p); // 首次取码放在事件处理里，避免 effect 内 setState
    reset({ passphrase: "" }); // 不把口令留在表单里
  };

  const lock = () => {
    setPassphrase(null);
    setCode("");
    setRemaining(0);
  };

  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      toast.success("验证码已复制");
    } catch {
      toast.error("复制失败");
    }
  };

  const pct = period > 0 ? (remaining / period) * 100 : 0;
  const urgent = remaining <= 5;

  return (
    <div className="flex flex-1 flex-col space-y-4">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="-ml-1" />
        <h1 className="text-lg font-semibold">2FA 验证码</h1>
      </div>

      <Card className="max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="size-4" /> GitHub 两步验证
          </CardTitle>
          <CardDescription>
            输入解密口令生成当前验证码；口令仅留在本页内存，刷新即清空。
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!passphrase ? (
            <form
              onSubmit={handleSubmit(unlock)}
              className="flex items-end gap-2"
            >
              <div className="flex-1 space-y-2">
                <Label htmlFor="passphrase">解密口令</Label>
                <Input
                  id="passphrase"
                  type="password"
                  autoComplete="off"
                  placeholder="解密口令（可用登录密码）"
                  {...register("passphrase")}
                />
              </div>
              <Button type="submit">生成</Button>
            </form>
          ) : (
            <div className="space-y-4">
              {/* 验证码 —— 点击复制 */}
              <button
                type="button"
                onClick={copy}
                disabled={!code}
                title="点击复制"
                className="group flex w-full items-center justify-center gap-2 rounded-lg border border-border/60 bg-muted/30 py-5 transition-colors hover:bg-muted"
              >
                {code ? (
                  <span className="font-mono text-4xl font-bold tracking-[0.3em] tabular-nums">
                    {code.slice(0, 3)} {code.slice(3)}
                  </span>
                ) : (
                  <Loader2 className="size-6 animate-spin text-muted-foreground" />
                )}
                <Copy className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </button>

              {/* 倒计时条 */}
              <div className="space-y-1">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full transition-all duration-1000 ease-linear ${
                      urgent ? "bg-destructive" : "bg-primary"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-right text-xs text-muted-foreground tabular-nums">
                  {remaining}s 后刷新
                </p>
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={lock}
                className="w-full"
              >
                <Lock className="size-3.5" /> 锁定 / 清除口令
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
