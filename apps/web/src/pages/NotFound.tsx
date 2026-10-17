import { Link } from 'react-router';
import { buttonClass } from '../components/ui';

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <div className="text-8xl font-bold text-brand">404</div>
      <p className="text-dim">这个页面像茶水间的最后一块蛋糕一样，消失了。</p>
      <Link to="/" className={buttonClass({ variant: 'outline' })}>
        回到首页
      </Link>
    </div>
  );
}
