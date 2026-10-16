import clsx from 'clsx';
import { Loader2, X } from 'lucide-react';
import {
  useEffect,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';

type Variant = 'primary' | 'ghost' | 'outline' | 'yes' | 'no' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-aurora text-white shadow-[0_0_24px_-6px_rgb(139_92_246/0.8)] hover:shadow-[0_0_32px_-4px_rgb(139_92_246/0.9)] hover:brightness-110',
  ghost: 'text-dim hover:text-fg hover:bg-white/5',
  outline: 'border border-line-strong text-fg hover:bg-white/5 hover:border-white/25',
  yes: 'bg-yes text-canvas hover:brightness-110 shadow-[0_0_24px_-8px_var(--color-yes)]',
  no: 'bg-no text-white hover:brightness-110 shadow-[0_0_24px_-8px_var(--color-no)]',
  danger: 'border border-no/40 text-no hover:bg-no/10',
};

type Size = 'sm' | 'md' | 'lg';

/** Button styling, also usable on links (`<Link className={buttonClass()}>`). */
export function buttonClass({
  variant = 'primary',
  size = 'md',
  className,
}: { variant?: Variant; size?: Size; className?: string } = {}) {
  return clsx(
    'inline-flex items-center justify-center gap-2 rounded-xl font-medium whitespace-nowrap transition-all duration-200 select-none',
    'disabled:pointer-events-none disabled:opacity-45 active:scale-[0.98]',
    size === 'sm' && 'h-8 px-3 text-sm',
    size === 'md' && 'h-10 px-4 text-sm',
    size === 'lg' && 'h-12 px-6 text-base',
    VARIANTS[variant],
    className,
  );
}

export function Button({
  variant,
  size,
  loading,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean }) {
  return (
    <button className={buttonClass({ variant, size, className })} disabled={disabled || loading} {...rest}>
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

const fieldClass =
  'w-full rounded-xl border border-line bg-white/[0.03] px-3.5 text-fg placeholder:text-faint transition-colors outline-none focus:border-brand-2/60 focus:bg-white/[0.05] focus:shadow-[0_0_0_3px_rgb(34_211_238/0.12)]';

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={clsx(fieldClass, 'h-11', className)} {...rest} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={clsx(fieldClass, 'min-h-24 py-2.5 leading-relaxed', className)} {...rest} />;
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-dim">{label}</span>
      {children}
      {hint && <span className="block text-xs text-faint">{hint}</span>}
    </label>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx('glass rounded-2xl', className)}>{children}</div>;
}

export function Badge({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-xs font-medium text-dim',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = 'md',
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  className?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div className={clsx('inline-flex rounded-xl border border-line bg-white/[0.02] p-1', className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            'rounded-lg font-medium whitespace-nowrap transition-all',
            size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm',
            value === o.value ? 'bg-white/10 text-fg shadow-inner' : 'text-dim hover:text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx('size-5 animate-spin text-dim', className)} />;
}

export function PageLoader() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Spinner className="size-7" />
    </div>
  );
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
      {icon && <div className="mb-1 text-faint">{icon}</div>}
      <div className="font-medium text-dim">{title}</div>
      {children && <div className="text-sm text-faint">{children}</div>}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center" role="dialog" aria-modal>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-line-strong bg-panel p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-dim hover:bg-white/5 hover:text-fg"
            aria-label="关闭"
          >
            <X className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Small "stat" tile: label above a big number. */
export function Stat({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={clsx('glass rounded-2xl px-5 py-4', className)}>
      <div className="text-xs font-medium tracking-wide text-faint">{label}</div>
      <div className="mt-1.5 font-display text-2xl font-semibold tabular">{children}</div>
    </div>
  );
}
