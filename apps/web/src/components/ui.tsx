import clsx from 'clsx';
import { CalendarDays, Loader2, X } from 'lucide-react';
import {
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';

type Variant = 'primary' | 'ghost' | 'outline' | 'yes' | 'no' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-hover active:bg-brand-active',
  ghost: 'text-dim hover:bg-fill hover:text-fg',
  outline: 'border border-line-strong bg-panel text-fg hover:border-brand hover:text-brand',
  yes: 'bg-yes text-white hover:brightness-110',
  no: 'bg-no text-white hover:brightness-110',
  danger: 'border border-no/50 bg-panel text-no hover:bg-no/5',
};

type Size = 'sm' | 'md' | 'lg';

/** Button styling, also usable on links (`<Link className={buttonClass()}>`). */
export function buttonClass({
  variant = 'primary',
  size = 'md',
  pill,
  className,
}: { variant?: Variant; size?: Size; pill?: boolean; className?: string } = {}) {
  return clsx(
    'inline-flex items-center justify-center gap-1.5 font-normal tracking-wider whitespace-nowrap transition-colors duration-150 select-none',
    'disabled:pointer-events-none',
    pill ? 'rounded-full' : 'rounded',
    variant === 'primary' || variant === 'yes' || variant === 'no'
      ? 'disabled:bg-fill disabled:text-faint'
      : 'disabled:opacity-50',
    size === 'sm' && 'h-8 px-3.5 text-sm',
    size === 'md' && 'h-10 px-5 text-sm',
    size === 'lg' && 'h-11 px-7 text-base',
    VARIANTS[variant],
    className,
  );
}

export function Button({
  variant,
  size,
  pill,
  loading,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; pill?: boolean; loading?: boolean }) {
  return (
    <button className={buttonClass({ variant, size, pill, className })} disabled={disabled || loading} {...rest}>
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

const fieldClass =
  'w-full rounded border border-line bg-panel px-3 text-fg placeholder:text-faint transition-colors outline-none hover:border-line-strong focus:border-brand focus:shadow-[0_0_0_3px_rgb(28_85_251/0.12)]';

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={clsx(fieldClass, 'h-10', className)} {...rest} />;
}

/** Keep the browser's date picker, with a consistent 24-hour display. */
export function DateTimeInput({
  label,
  value,
  min,
  onChange,
}: {
  label: string;
  value: string;
  min?: string;
  onChange: (value: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="relative w-full sm:max-w-72">
      <input
        ref={input}
        type="datetime-local"
        value={value}
        min={min}
        onChange={(e) => onChange(e.target.value)}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />
      <button
        type="button"
        aria-label={`${label}：${value.replace('T', ' ') || '请选择时间'}`}
        onClick={() => input.current?.showPicker()}
        className={clsx(fieldClass, 'flex h-10 items-center justify-between gap-3 text-left text-sm tabular-nums')}
      >
        <span>{value.replace('T', ' ') || '请选择时间'}</span>
        <CalendarDays className="size-4 shrink-0 text-faint" />
      </button>
    </div>
  );
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={clsx(fieldClass, 'min-h-24 py-2 leading-relaxed', className)} {...rest} />;
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-sm text-fg">{label}</span>
      {children}
      {hint && <span className="block text-xs text-faint">{hint}</span>}
    </label>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx('surface rounded-lg', className)}>{children}</div>;
}

export function Badge({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded bg-fill px-2 py-0.5 text-xs text-dim', className)}>
      {children}
    </span>
  );
}

/**
 * Option switcher. `pills` is a compact segmented control for filters; `tabs` is the ft.tech
 * style tab strip: blue bold label with a 2px blue underline on the active tab.
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = 'md',
  variant = 'pills',
  underline = true,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  className?: string;
  size?: 'sm' | 'md';
  variant?: 'pills' | 'tabs';
  /** Draw the full-width baseline under `tabs`. */
  underline?: boolean;
}) {
  if (variant === 'tabs') {
    return (
      <div className={clsx('flex gap-8', underline && 'border-b border-line', className)} role="tablist">
        {options.map((o) => {
          const active = value === o.value;
          return (
            <button
              key={o.value}
              role="tab"
              aria-selected={active}
              onClick={() => onChange(o.value)}
              className={clsx(
                'relative -mb-px pt-1 pb-3 text-[15px] whitespace-nowrap transition-colors',
                active ? 'font-semibold text-brand' : 'text-dim hover:text-fg',
              )}
            >
              {o.label}
              {active && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-brand" />}
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <div className={clsx('inline-flex rounded bg-fill p-0.5', className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            'rounded-sm whitespace-nowrap transition-colors',
            size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm',
            value === o.value
              ? 'bg-panel font-medium text-brand shadow-[0_1px_2px_rgb(29_33_41/0.08)]'
              : 'text-dim hover:text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx('size-5 animate-spin text-faint', className)} />;
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
      {icon && <div className="mb-1 text-line-strong">{icon}</div>}
      <div className="text-dim">{title}</div>
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
      <div className="absolute inset-0 bg-black/45" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-lg bg-panel p-6 shadow-[0_12px_40px_rgb(29_33_41/0.18)]">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="rounded p-1 text-faint hover:bg-fill hover:text-fg" aria-label="关闭">
            <X className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Stat tile: small grey label above a large number, like the figures on ft.tech. */
export function Stat({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={clsx('surface rounded-lg px-5 py-4', className)}>
      <div className="text-sm text-faint">{label}</div>
      <div className="mt-2 text-2xl font-semibold tabular">{children}</div>
    </div>
  );
}
