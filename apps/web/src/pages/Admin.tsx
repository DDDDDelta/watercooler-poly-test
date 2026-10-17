import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CURRENCY_NAME, type AdminUser } from '@watercooler/shared';
import { Gift, Hourglass, KeyRound, Shield, ShieldOff } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Avatar } from '../components/Avatar';
import { Money } from '../components/Money';
import { Button, buttonClass, Card, Empty, Field, Input, Modal, PageLoader } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { useMe } from '../lib/auth';
import { formatDate, formatDay } from '../lib/format';

type Action = { kind: 'grant' | 'password'; user: AdminUser } | null;

function PendingMarkets() {
  const { data } = useQuery({
    queryKey: ['markets', { filter: 'closed' }],
    queryFn: () => api.markets({ filter: 'closed', sort: 'closing' }),
  });
  return (
    <Card className="p-5">
      <h2 className="flex items-center gap-2 font-semibold">
        <Hourglass className="size-4 text-gold" /> 待结算市场{' '}
        {data && data.length > 0 && <span className="text-gold">({data.length})</span>}
      </h2>
      {data?.length === 0 ? (
        <p className="mt-3 text-sm text-faint">没有等待结算的市场 🎉</p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {data?.map((m) => (
            <li key={m.id} className="flex items-center gap-3 py-2.5 text-sm">
              <Link to={`/market/${m.id}`} className="min-w-0 flex-1 truncate hover:underline">
                {m.question}
              </Link>
              <span className="shrink-0 text-xs text-faint">{formatDate(m.closeAt)} 截止</span>
              <Link to={`/market/${m.id}`} className={buttonClass({ size: 'sm', variant: 'outline' })}>
                去结算
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default function Admin() {
  const { me } = useMe();
  const qc = useQueryClient();
  const { data: users } = useQuery({ queryKey: ['adminUsers'], queryFn: api.adminUsers });
  const [action, setAction] = useState<Action>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const close = () => {
    setAction(null);
    setAmount('');
    setNote('');
    setNewPassword('');
  };
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['adminUsers'] });
    void qc.invalidateQueries({ queryKey: ['me'] });
    void qc.invalidateQueries({ queryKey: ['leaderboard'] });
  };

  const grant = useMutation({
    mutationFn: () => api.grant(action!.user.id, Number(amount), note.trim() || undefined),
    onSuccess: () => {
      toast.success('已调整余额');
      refresh();
      close();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const reset = useMutation({
    mutationFn: () => api.resetPassword(action!.user.id, newPassword),
    onSuccess: () => {
      toast.success('密码已重置，对方需要重新登录');
      close();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const role = useMutation({
    mutationFn: (u: AdminUser) => api.setRole(u.id, u.role === 'admin' ? 'user' : 'admin'),
    onSuccess: () => {
      toast.success('权限已更新');
      refresh();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (!users) return <PageLoader />;

  return (
    <div className="space-y-6">
      <h1 className="flex items-center gap-2 section-title">
        <Shield className="size-7 text-gold" /> 管理后台
      </h1>
      <PendingMarkets />
      <Card className="p-5">
        <h2 className="font-semibold">用户（{users.length}）</h2>
        {users.length === 0 ? (
          <Empty title="还没有用户" />
        ) : (
          <div className="-mx-5 mt-3 overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-faint">
                  <th className="px-5 py-2.5 font-medium">用户</th>
                  <th className="px-3 py-2.5 text-right font-medium">余额</th>
                  <th className="px-3 py-2.5 text-right font-medium">总资产</th>
                  <th className="px-3 py-2.5 text-right font-medium">交易</th>
                  <th className="px-3 py-2.5 font-medium">注册</th>
                  <th className="px-5 py-2.5 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-line last:border-0 hover:bg-raised">
                    <td className="px-5 py-3">
                      <Link to={`/u/${u.id}`} className="flex items-center gap-2.5">
                        <Avatar id={u.id} name={u.displayName} size={30} />
                        <div>
                          <div className="font-medium">
                            {u.displayName}
                            {u.role === 'admin' && <Shield className="ml-1 inline size-3.5 text-gold" />}
                          </div>
                          <div className="text-xs text-faint">@{u.username}</div>
                        </div>
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Money value={u.balance} className="font-mono" />
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Money value={u.netWorth} className="font-mono" />
                    </td>
                    <td className="px-3 py-3 text-right font-mono">{u.tradeCount}</td>
                    <td className="px-3 py-3 text-xs text-faint">{formatDay(u.createdAt)}</td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          title={`发放${CURRENCY_NAME}`}
                          onClick={() => setAction({ kind: 'grant', user: u })}
                        >
                          <Gift className="size-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          title="重置密码"
                          onClick={() => setAction({ kind: 'password', user: u })}
                        >
                          <KeyRound className="size-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          title={u.role === 'admin' ? '取消管理员' : '设为管理员'}
                          disabled={u.id === me?.id}
                          onClick={() => {
                            if (
                              confirm(`确定要${u.role === 'admin' ? '取消' : '授予'} ${u.displayName} 的管理员权限吗？`)
                            )
                              role.mutate(u);
                          }}
                        >
                          {u.role === 'admin' ? <ShieldOff className="size-4" /> : <Shield className="size-4" />}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={action?.kind === 'grant'} onClose={close} title={`调整 ${action?.user.displayName ?? ''} 的余额`}>
        <div className="space-y-4">
          <Field label={`金额（${CURRENCY_NAME}）`} hint="正数为发放，负数为扣除">
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="例如 500"
              autoFocus
            />
          </Field>
          <Field label="备注">
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="例如：月度最佳预言家奖励"
              maxLength={200}
            />
          </Field>
          <Button
            className="w-full"
            disabled={!Number(amount)}
            loading={grant.isPending}
            onClick={() => grant.mutate()}
          >
            确认
          </Button>
        </div>
      </Modal>

      <Modal open={action?.kind === 'password'} onClose={close} title={`重置 ${action?.user.displayName ?? ''} 的密码`}>
        <div className="space-y-4">
          <Field label="新密码" hint="至少 6 位，重置后对方所有设备都会退出登录">
            <Input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoFocus />
          </Field>
          <Button
            className="w-full"
            disabled={newPassword.length < 6}
            loading={reset.isPending}
            onClick={() => reset.mutate()}
          >
            重置密码
          </Button>
        </div>
      </Modal>
    </div>
  );
}
