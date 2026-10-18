import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CATEGORIES,
  createMarketSchema,
  MAX_OUTCOMES,
  RESOLVE_GRACE_DAYS,
  type MarketSummary,
} from '@watercooler/shared';
import clsx from 'clsx';
import { Gavel, Plus, Sparkles, X } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { MarketCard } from '../components/MarketCard';
import { Button, Card, Field, Input, Textarea } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { useMe } from '../lib/auth';
import { COPY } from '../lib/site';

/** datetime-local value (local time) for a timestamp. */
function toLocalInput(t: number): string {
  const d = new Date(t);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const QUICK_CLOSE = [
  { label: '明天', days: 1 },
  { label: '一周', days: 7 },
  { label: '一个月', days: 30 },
  { label: '三个月', days: 90 },
];

export default function CreateMarket() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { me } = useMe();
  const [question, setQuestion] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [kind, setKind] = useState<'binary' | 'multi'>('binary');
  const [options, setOptions] = useState<string[]>(['', '', '']);
  const [closeAt, setCloseAt] = useState(() => toLocalInput(Date.now() + 7 * 86_400_000));

  const outcomes = kind === 'binary' ? ['是', '否'] : options.map((o) => o.trim()).filter(Boolean);
  const closeTs = new Date(closeAt).getTime();

  const payload = {
    question: question.trim(),
    description: description.trim(),
    category,
    closeAt: closeTs,
    outcomes,
  };
  const validation = createMarketSchema.safeParse(payload);
  const firstError = validation.success ? null : validation.error.issues[0]?.message;

  const preview: MarketSummary = (() => {
    const labels = outcomes.length >= 2 ? outcomes : ['选项 A', '选项 B'];
    return {
      id: 0,
      question: question.trim() || '你的问题会显示在这里？',
      category,
      status: 'open',
      isBinary: labels.length === 2,
      pot: 0,
      closeAt: Number.isFinite(closeTs) ? closeTs : Date.now(),
      createdAt: Date.now(),
      resolvedOutcomeId: null,
      bettorCount: 0,
      commentCount: 0,
      creator: { id: me?.id ?? 0, username: me?.username ?? '', displayName: me?.displayName ?? '' },
      outcomes: labels.map((label, i) => ({
        id: -i - 1,
        index: i,
        label,
        pool: 0,
        probability: 1 / labels.length,
        change24h: null,
      })),
      spark: [],
    };
  })();

  const mutation = useMutation({
    mutationFn: () => api.createMarket(payload),
    onSuccess: ({ id }) => {
      toast.success('市场已创建');
      void qc.invalidateQueries({ queryKey: ['markets'] });
      void qc.invalidateQueries({ queryKey: ['stats'] });
      navigate(`/market/${id}`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="flex items-center gap-2 section-title">
        <Sparkles className="size-6 text-brand" /> 发起一个市场
      </h1>
      <p className="mt-2 text-dim">好问题的标准：答案明确、有截止时间、大家都关心。</p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="space-y-6 p-6">
          <Field label="问题" hint={`${question.trim().length}/200`}>
            <Input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={COPY.questionPlaceholder}
              maxLength={200}
              autoFocus
            />
          </Field>

          <div>
            <span className="text-sm font-medium text-dim">分类</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={clsx(
                    'rounded border px-3.5 py-1.5 text-sm transition',
                    category === c
                      ? 'border-brand bg-brand-light text-brand'
                      : 'border-line text-dim hover:border-brand hover:text-brand',
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="text-sm font-medium text-dim">类型</span>
            <div className="mt-2 grid grid-cols-2 gap-3">
              {(
                [
                  ['binary', '是 / 否', '经典二元问题'],
                  ['multi', '多选一', `2–${MAX_OUTCOMES} 个互斥选项`],
                ] as const
              ).map(([value, title, hint]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setKind(value)}
                  className={clsx(
                    'rounded-lg border p-4 text-left transition',
                    kind === value ? 'border-brand bg-brand-light' : 'border-line hover:border-brand',
                  )}
                >
                  <div className="font-semibold">{title}</div>
                  <div className="mt-0.5 text-xs text-faint">{hint}</div>
                </button>
              ))}
            </div>
          </div>

          {kind === 'multi' && (
            <div>
              <span className="text-sm font-medium text-dim">选项（只会有一个成真）</span>
              <div className="mt-2 space-y-2">
                {options.map((o, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      value={o}
                      maxLength={40}
                      placeholder={`选项 ${i + 1}`}
                      onChange={(e) => setOptions((xs) => xs.map((x, j) => (j === i ? e.target.value : x)))}
                    />
                    {options.length > 2 && (
                      <Button
                        variant="ghost"
                        className="h-11 w-11 shrink-0 px-0"
                        onClick={() => setOptions((xs) => xs.filter((_, j) => j !== i))}
                        aria-label="删除选项"
                      >
                        <X className="size-4" />
                      </Button>
                    )}
                  </div>
                ))}
                {options.length < MAX_OUTCOMES && (
                  <Button variant="outline" size="sm" onClick={() => setOptions((xs) => [...xs, ''])}>
                    <Plus className="size-4" /> 添加选项
                  </Button>
                )}
              </div>
            </div>
          )}

          <Field label="下注截止时间" hint={`截止后停止下注，你需要在之后 ${RESOLVE_GRACE_DAYS} 天内公布结果`}>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                type="datetime-local"
                value={closeAt}
                onChange={(e) => setCloseAt(e.target.value)}
                className="sm:max-w-64"
              />
              <div className="flex gap-1.5">
                {QUICK_CLOSE.map((q) => (
                  <button
                    key={q.label}
                    type="button"
                    onClick={() => {
                      const d = new Date(Date.now() + q.days * 86_400_000);
                      d.setHours(18, 0, 0, 0);
                      setCloseAt(toLocalInput(d.getTime()));
                    }}
                    className="rounded-lg border border-line px-2.5 text-xs text-dim transition hover:text-fg"
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            </div>
          </Field>

          <Field label="结算规则" hint="写清楚以什么为准、边界情况怎么算，避免扯皮">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={COPY.criteriaPlaceholder}
              rows={4}
              maxLength={5000}
            />
          </Field>
        </Card>

        <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="text-xs font-medium tracking-wider text-faint">预览</div>
          <MarketCard market={preview} preview />
          <Button
            size="lg"
            className="w-full"
            disabled={!validation.success}
            loading={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            发布市场
          </Button>
          <div className="flex gap-2.5 rounded bg-raised p-3.5 text-xs leading-relaxed text-dim">
            <Gavel className="mt-0.5 size-4 shrink-0 text-brand" />
            <span>
              结果由你来公布，你自己也可以下注。截止后 {RESOLVE_GRACE_DAYS} 天内没有公布，市场会自动取消并全额退款。
            </span>
          </div>
          {firstError && (question || options.some(Boolean)) && (
            <p className="text-center text-sm text-no">{firstError}</p>
          )}
        </div>
      </div>
    </div>
  );
}
