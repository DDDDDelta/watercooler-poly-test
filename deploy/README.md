# 部署到服务器（GitHub Actions）

推送到 `main` 分支，或者在 GitHub 的 **Actions → Deploy → Run workflow** 手动触发，就会自动部署：

1. 在 GitHub 上安装依赖、跑类型检查和测试，用 `BASE_PATH=/watercooler` 构建前后端
2. 通过 SSH 上传到服务器上部署用户家目录下的 `~/watercooler/releases/<时间>-<commit>/`
3. 在服务器上安装生产依赖（用 nvm 的 Node；`better-sqlite3` 是原生模块，在服务器上安装才能和服务器的 Node 版本匹配）
4. 把 `~/watercooler/current` 指向新版本，用 `~/watercooler/watercooler.sh restart` 在后台重启
5. 检查 `http://127.0.0.1:3000/api/config`；如果没起来，**自动切回上一个版本**并让 workflow 失败

不用 systemd，也不需要 sudo：进程由 `watercooler.sh` 用 `nohup` 在后台运行，pid 和日志放在 `shared/` 里。

服务器上的目录结构（`~` 是 `DEPLOY_USER` 的家目录）：

```
~/watercooler/
  watercooler.sh                启动/停止/重启脚本（每次部署自动更新）
  current -> releases/20261017093000-1a2b3c4   正在运行的版本
  releases/                     最近 5 个版本
  shared/data/watercooler.db    数据库（部署不会动它）
  shared/logs/watercooler.log   日志（超过 10 MB 自动轮转）
  shared/watercooler.pid        进程号
  shared/.env                   可选配置（邀请码等）
```

运行参数写在 [`deploy/watercooler.sh`](watercooler.sh) 顶部：`HOST=127.0.0.1`（只监听本机，必须经过 nginx）、`PORT=3000`、`BASE_PATH=/watercooler`、数据库路径。

## 一、服务器一次性准备

全部以**部署用户**（`DEPLOY_USER`）身份执行，不需要 root：

```bash
# 1. 用 nvm 装 Node 22，并设为默认版本（部署脚本和 watercooler.sh 会自动加载 ~/.nvm/nvm.sh）
nvm install 22
nvm alias default 22

# 2. 服务器重启后自动拉起（第一次部署之前加也没关系）
(crontab -l 2>/dev/null; echo '@reboot $HOME/watercooler/watercooler.sh start') | crontab -

# 3. 可选：额外配置，比如邀请码
mkdir -p ~/watercooler/shared
tee ~/watercooler/shared/.env <<'CONF'
INVITE_CODE=换成你的邀请码
# ADMIN_USERNAMES=你的用户名
# PRIVATE_MODE=true
CONF
```

改完 `.env` 后执行 `~/watercooler/watercooler.sh restart` 生效。`watercooler.sh` 里写死的 `HOST`、`PORT` 等不会被 `.env` 覆盖。

注意：

- nvm 是按用户安装的，必须装在 `DEPLOY_USER` 这个账号下。
- 服务器要能访问 npm 仓库来安装依赖。`better-sqlite3` 会从 GitHub 下载预编译文件，下载失败时会从源码编译，需要 `python3`、`make`、`g++`（`sudo apt install -y build-essential python3`）。
- 本机 3000 端口不能被别的程序占用。
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

| 名称      | 说明                                                                       |
| --------- | -------------------------------------------------------------------------- |
| `APP_URL` | 如 `https://ky-z.com/watercooler/`，设置后部署完会从公网访问一次做冒烟测试 |

部署目录和子路径直接写在 `.github/workflows/deploy.yml` 顶部：`DEPLOY_DIR: ~/watercooler`、`BASE_PATH: /watercooler`。要改的话，`deploy/watercooler.sh` 里的 `BASE_PATH`（以及 nginx）要一起改。

`DEPLOY_KNOWN_HOSTS` 直接粘贴 `ssh-keyscan` 的全部输出即可（`ssh-rsa`、`ecdsa-sha2-nistp256`、`ssh-ed25519` 几行都要，`#` 开头的注释行留着也没关系）。

workflow 使用名为 `production` 的 environment（第一次运行时 GitHub 会自动创建）。Secrets 放在仓库级别或这个 environment 里都可以；放在 environment 里还可以设置「需要审批才能部署」之类的保护规则。

## 四、nginx

nginx 负责 HTTPS，并在转发时去掉 `/watercooler` 前缀：

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
```

`X-Forwarded-Proto` 让登录 Cookie 在 HTTPS 下带上 `Secure` 标记，`X-Forwarded-For` 用于按 IP 限制注册频率。

## 五、日常运维

以部署用户身份：

```bash
~/watercooler/watercooler.sh status      # 是否在运行
~/watercooler/watercooler.sh logs        # 跟踪日志
~/watercooler/watercooler.sh restart     # 重启（也有 start / stop）
ls ~/watercooler/releases                # 已部署的版本

# 手动回滚到某个版本
ln -sfn ~/watercooler/releases/<版本> ~/watercooler/current
~/watercooler/watercooler.sh restart

# 备份数据库（WAL 模式，不要直接复制 db 文件）
sqlite3 ~/watercooler/shared/data/watercooler.db ".backup '$HOME/watercooler/shared/backup-$(date +%F).db'"
```

第一个注册的用户自动成为管理员；也可以在 `shared/.env` 里用 `ADMIN_USERNAMES` 指定。
