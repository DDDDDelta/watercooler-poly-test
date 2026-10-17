import { AlertTriangle } from 'lucide-react';
import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { buttonClass } from './ui';

/** Shown instead of React Router's developer error page when rendering a route throws. */
export function RouteError() {
  const error = useRouteError();
  const detail = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : String(error);
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-canvas px-4 text-center text-fg">
      <AlertTriangle className="size-12 text-gold" />
      <h1 className="font-display text-2xl font-bold">页面出错了</h1>
      <p className="max-w-md text-sm text-dim">刷新一下通常就好了。如果一直出现，把下面这行错误信息发给管理员。</p>
      <code className="max-w-full overflow-x-auto rounded-lg border border-line bg-panel px-3 py-2 text-xs text-faint">
        {detail}
      </code>
      <div className="mt-2 flex gap-3">
        <button onClick={() => window.location.reload()} className={buttonClass()}>
          刷新页面
        </button>
        <Link to="/" reloadDocument className={buttonClass({ variant: 'outline' })}>
          回到首页
        </Link>
      </div>
    </div>
  );
}
