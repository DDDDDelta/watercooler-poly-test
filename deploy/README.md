# 部署到服务器（GitHub Actions）

推送到 `main` 分支，或者在 GitHub 的 **Actions → Deploy → Run workflow** 手动触发，就会自动部署：

1. 在 GitHub 上安装依赖、跑类型检查和测试，用 `BASE_PATH=/watercooler` 构建前后端
2. 打包上传到服务器的 `/opt/watercooler/releases/<时间>-<commit>/`
3. 在服务器上安装生产依赖（`better-sqlite3` 是原生模块，在服务器上安装才能和服务器的 Node 版本匹配）
4. 把 `/opt/watercooler/current` 指向新版本，重启 systemd 服务
5. 检查 `http://127.0.0.1:3000/api/config`；如果 30 秒内没起来，**自动切回上一个版本**并让 workflow 失败

服务器上的目录结构：

```
/opt/watercooler/
  current -> releases/20261017093000-1a2b3c4   正在运行的版本
  releases/                                     最近 5 个版本
  shared/data/watercooler.db                    数据库（部署不会动它）
  shared/.env                                   可选配置（邀请码等）
```

## 一、服务器一次性准备

要求：Linux + systemd，**系统级**安装的 Node.js ≥ 20.19（推荐 22）。只在某个用户的 shell 里用 nvm 装的 Node 不行，systemd 和 GitHub Actions 的 SSH 会话都找不到它。

用 root 或有 sudo 权限的账号执行：

```bash
# 1. 部署用户（也可以用已有的用户，把下面所有的 deploy 换成它）
sudo useradd --create-home --shell /bin/bash deploy

# 2. 目录
sudo mkdir -p /opt/watercooler/shared/data
sudo chown -R deploy:deploy /opt/watercooler

# 3. systemd 服务：把仓库里的 deploy/watercooler.service 复制过去。
#    先用 `command -v node` 确认 node 的路径，和文件里 ExecStart 的 /usr/bin/node 不一致就改掉。
sudo cp watercooler.service /etc/systemd/system/watercooler.service
sudo systemctl daemon-reload
sudo systemctl enable watercooler    # 先不用 start，第一次部署时会自动启动

# 4. 允许 deploy 用户免密重启这个服务（只授权这一条命令）
echo "deploy ALL=(root) NOPASSWD: $(command -v systemctl) restart watercooler" | sudo tee /etc/sudoers.d/watercooler
sudo chmod 440 /etc/sudoers.d/watercooler
sudo visudo -cf /etc/sudoers.d/watercooler

# 5. 可选：让 deploy 用户能看服务日志（部署失败时会把日志打印到 Actions 里）
sudo usermod -aG systemd-journal deploy
```

服务的运行参数都写在 `watercooler.service` 里：`HOST=127.0.0.1`（只监听本机，必须经过 nginx）、`PORT=3000`、`BASE_PATH=/watercooler`、数据库路径。其他配置写到 `/opt/watercooler/shared/.env`，比如：

```bash
sudo -u deploy tee /opt/watercooler/shared/.env <<'CONF'
INVITE_CODE=换成你的邀请码
# ADMIN_USERNAMES=你的用户名
# PRIVATE_MODE=true
CONF
```

改完 `.env` 后执行 `sudo systemctl restart watercooler` 生效。

> 服务器上要能访问 npm 仓库来安装依赖。`better-sqlite3` 会从 GitHub 下载预编译文件，下载失败时会从源码编译，这时需要 `python3`、`make` 和 `g++`（Debian/Ubuntu：`sudo apt install -y build-essential python3`）。

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
| `DEPLOY_KNOWN_HOSTS` | 上面 `ssh-keyscan` 的输出            |
| `DEPLOY_PORT`        | 可选，SSH 端口，默认 `22`            |

**Variables**（都是可选的）

| 名称          | 默认值             | 说明                                                                       |
| ------------- | ------------------ | -------------------------------------------------------------------------- |
| `BASE_PATH`   | `/watercooler`     | 网站所在的子路径，要和 nginx、`watercooler.service` 里的一致               |
| `DEPLOY_PATH` | `/opt/watercooler` | 服务器上的部署目录                                                         |
| `APP_URL`     | 无                 | 如 `https://ky-z.com/watercooler/`，设置后部署完会从公网访问一次做冒烟测试 |

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

```bash
journalctl -u watercooler -f                     # 看日志
ls /opt/watercooler/releases                     # 已部署的版本

# 手动回滚到某个版本
ln -sfn /opt/watercooler/releases/<版本> /opt/watercooler/current
sudo systemctl restart watercooler

# 备份数据库（WAL 模式，不要直接复制 db 文件）
sqlite3 /opt/watercooler/shared/data/watercooler.db ".backup '/opt/watercooler/shared/backup-$(date +%F).db'"
```

第一个注册的用户自动成为管理员；也可以在 `shared/.env` 里用 `ADMIN_USERNAMES` 指定。

如果不用 systemd（比如用 pm2），把 `.github/workflows/deploy.yml` 里 `Activate release` 步骤的命令改成用 `RESTART_CMD` 指定重启方式：

```bash
ssh server "RESTART_CMD='pm2 restart watercooler' bash -l -s -- '$DEPLOY_PATH' '$RELEASE'" < deploy/remote-deploy.sh
```
