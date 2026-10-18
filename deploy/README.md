# 部署到服务器（GitHub Actions）

同一份代码在服务器上跑成多个**互相独立的实例**，每个实例有自己的目录、端口、访问路径和数据库（账号、市场、水滴都不互通）：

| 实例          | 访问地址                        | 服务器目录      | 端口   | 站点名称      | 文案                    |
| ------------- | ------------------------------- | --------------- | ------ | ------------- | ----------------------- |
| `watercooler` | `https://ky-z.com/watercooler/` | `~/watercooler` | `3000` | `Watercooler` | `watercooler`（茶水间） |
| `gang-bet`    | `https://ky-z.com/gang-bet/`    | `~/gang-bet`    | `3001` | `gang-bet`    | `neutral`（中性）       |

实例列表写在 [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) 的 `matrix.include` 里。推送到 `main` 分支，或者在 GitHub 的 **Actions → Deploy → Run workflow** 手动触发，每个实例各跑一个部署任务（一个失败不影响另一个）：

1. 在 GitHub 上安装依赖、跑类型检查和测试，用这个实例的 `BASE_PATH`（如 `/gang-bet`）、`SITE_NAME` 和 `SITE_COPY` 构建前后端
2. 通过 SSH 上传到服务器上部署用户家目录下的 `~/<实例>/releases/<时间>-<commit>/`
3. 在服务器上安装生产依赖（用 nvm 的 Node；`better-sqlite3` 是原生模块，在服务器上安装才能和服务器的 Node 版本匹配）
4. 把 `~/<实例>/current` 指向新版本，用 `~/<实例>/<实例>.sh restart` 在后台重启
5. 检查 `http://127.0.0.1:<端口>/api/config`；如果没起来，**自动切回上一个版本**并让这个任务失败

不用 systemd，也不需要 sudo：进程由控制脚本用 `nohup` 在后台运行，pid 和日志放在 `shared/` 里。

服务器上的目录结构（`~` 是 `DEPLOY_USER` 的家目录），以 `gang-bet` 为例：

```
~/gang-bet/
  gang-bet.sh                   启动/停止/重启脚本（每次部署自动更新）
  current -> releases/20261017093000-1a2b3c4   正在运行的版本
  releases/                     最近 5 个版本
  shared/data/gang-bet.db       数据库（部署不会动它）
  shared/logs/gang-bet.log      日志（超过 10 MB 自动轮转）
  shared/gang-bet.pid           进程号
  shared/.env                   可选配置（邀请码等）
```

`~/watercooler/` 完全一样，文件名换成 `watercooler`。

每个版本里有一个部署时生成的 `instance.env`（`INSTANCE`、`PORT`、`BASE_PATH`），控制脚本 [`deploy/watercooler.sh`](watercooler.sh) 从这里读端口和路径，所以运行参数总是和构建时一致。另外固定 `HOST=127.0.0.1`（只监听本机，必须经过 nginx）。

## 一、服务器一次性准备

全部以**部署用户**（`DEPLOY_USER`）身份执行，不需要 root：

```bash
# 1. 用 nvm 装 Node 22，并设为默认版本（部署脚本和控制脚本会自动加载 ~/.nvm/nvm.sh）
nvm install 22
nvm alias default 22

# 2. 服务器重启后自动拉起（每个实例一行；第一次部署之前加也没关系）
(crontab -l 2>/dev/null; echo '@reboot $HOME/watercooler/watercooler.sh start') | crontab -
(crontab -l 2>/dev/null; echo '@reboot $HOME/gang-bet/gang-bet.sh start') | crontab -

# 3. 可选：额外配置，比如邀请码（每个实例单独一份）
mkdir -p ~/gang-bet/shared
tee ~/gang-bet/shared/.env <<'CONF'
INVITE_CODE=换成你的邀请码
# PRIVATE_MODE=true
CONF
```

改完 `.env` 后执行 `~/<实例>/<实例>.sh restart` 生效。`HOST`、`PORT`、`BASE_PATH`、数据库路径由控制脚本决定，不会被 `.env` 覆盖。

注意：

- nvm 是按用户安装的，必须装在 `DEPLOY_USER` 这个账号下。
- 服务器要能访问 npm 仓库来安装依赖。`better-sqlite3` 会从 GitHub 下载预编译文件，下载失败时会从源码编译，需要 `python3`、`make`、`g++`（`sudo apt install -y build-essential python3`）。
- 每个实例的端口（3000、3001）不能被别的程序占用。
- 网站里没有管理员：市场由发起人自己公布结果。忘记密码只能由站长在服务器上重置（见下面的日常运维）。
- 如果发现 SSH 断开后进程被杀（`/etc/systemd/logind.conf` 里 `KillUserProcesses=yes`），执行 `sudo loginctl enable-linger <部署用户>`。Ubuntu 默认不会杀。

## 二、SSH 密钥

在自己电脑上生成一对**专门用于部署**的密钥（不设密码）：

```bash
ssh-keygen -t ed25519 -N '' -C github-actions-deploy -f watercooler_deploy

# 公钥加到服务器 deploy 用户的 authorized_keys
ssh-copy-id -i watercooler_deploy.pub deploy@ky-z.com

# 记下服务器的主机公钥，用于 DEPLOY_KNOWN_HOSTS（防止中间人攻击）
ssh-keyscan -p 22 ky-z.com
```

所有实例共用这一套密钥和 Secrets。

## 三、GitHub 配置

仓库 **Settings → Secrets and variables → Actions**。

**Secrets**

| 名称                 | 内容                                 |
| -------------------- | ------------------------------------ |
| `DEPLOY_HOST`        | 服务器域名或 IP，如 `ky-z.com`       |
| `DEPLOY_USER`        | `deploy`                             |
| `DEPLOY_SSH_KEY`     | 私钥 `watercooler_deploy` 的完整内容 |
| `DEPLOY_KNOWN_HOSTS` | 上面 `ssh-keyscan` 的完整输出        |
| `DEPLOY_PORT`        | 可选，SSH 端口，默认 `22`            |

**Variables**（可选）

| 名称      | 说明                                                                                    |
| --------- | --------------------------------------------------------------------------------------- |
| `APP_URL` | 站点地址，如 `https://ky-z.com`，设置后部署完会从公网访问每个实例的子路径一次做冒烟测试 |

`DEPLOY_KNOWN_HOSTS` 直接粘贴 `ssh-keyscan` 的全部输出即可（`ssh-rsa`、`ecdsa-sha2-nistp256`、`ssh-ed25519` 几行都要，`#` 开头的注释行留着也没关系）。

workflow 使用名为 `production` 的 environment（第一次运行时 GitHub 会自动创建）。Secrets 放在仓库级别或这个 environment 里都可以；放在 environment 里还可以设置「需要审批才能部署」之类的保护规则。

## 四、nginx

nginx 负责 HTTPS，并在转发时去掉子路径前缀。每个实例一组 `location`：

```nginx
location = /watercooler {
    return 301 /watercooler/;
}

location /watercooler/ {
    proxy_pass http://127.0.0.1:3000/;   # 末尾的 / 会把 /watercooler 前缀去掉
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location = /gang-bet {
    return 301 /gang-bet/;
}

location /gang-bet/ {
    proxy_pass http://127.0.0.1:3001/;   # 末尾的 / 会把 /gang-bet 前缀去掉
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

`X-Forwarded-Proto` 让登录 Cookie 在 HTTPS 下带上 `Secure` 标记，`X-Forwarded-For` 用于按 IP 限制注册频率。登录 Cookie 的 path 是各自的子路径，所以两个实例的登录状态互不影响。

## 五、再加一个实例

1. 在 `deploy.yml` 的 `matrix.include` 里加一项：`instance`（目录名）、`base_path`、`port`（没被占用的端口）、`site_name`、`site_copy`（[`site-copy.ts`](../apps/web/src/lib/site-copy.ts) 里的一套文案，也可以在那里新加一套）
2. 服务器上：nginx 加一组 `location`（同上），crontab 加一行 `@reboot $HOME/<实例>/<实例>.sh start`
3. 推送到 `main`

## 六、日常运维

以部署用户身份（把 `gang-bet` 换成要操作的实例）：

```bash
~/gang-bet/gang-bet.sh status      # 是否在运行
~/gang-bet/gang-bet.sh logs        # 跟踪日志
~/gang-bet/gang-bet.sh restart     # 重启（也有 start / stop）
ls ~/gang-bet/releases             # 已部署的版本

# 有人忘记密码：重置后这个账号会在所有设备上退出登录
~/gang-bet/gang-bet.sh reset-password <用户名> <新密码>

# 手动回滚到某个版本（注意：数据库结构升级过的话，不能回滚到升级之前的版本，
# 比如改成奖池模式之前的版本）
ln -sfn ~/gang-bet/releases/<版本> ~/gang-bet/current
~/gang-bet/gang-bet.sh restart

# 备份数据库（WAL 模式，不要直接复制 db 文件）
sqlite3 ~/gang-bet/shared/data/gang-bet.db ".backup '$HOME/gang-bet/shared/backup-$(date +%F).db'"
```
