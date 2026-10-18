#!/bin/bash
# ==============================================================
#  FuturePath 一键部署脚本（在服务器上跑，不是在自己电脑上）
#
#  用法：宝塔「终端」里粘贴这一行回车
#      bash /www/wwwroot/futurepath/deploy/setup-server.sh
#
#  它会依次做完：
#    1. 找到/安装 Python 3.9 以上
#    2. 建虚拟环境、装依赖（走清华镜像）
#    3. 生成 backend/.env（随机密钥，数据库用 SQLite）
#    4. 用 systemd 把后端跑起来（gunicorn，开机自启）
#    5. 装并配置 Nginx（监听 8080，/api 转给后端）
#    6. 自检一遍，最后打印访问地址
#
#  可以重复跑：已经做过的步骤会自动跳过，不会把数据搞坏。
# ==============================================================

set -uo pipefail

APP_DIR="${APP_DIR:-/www/wwwroot/futurepath}"
BACKEND="$APP_DIR/backend"
FRONTEND_DIST="$APP_DIR/dist"
SERVICE="futurepath"
PORT_WEB=8080
PORT_API=5000

info() { echo -e "\n\033[32m[$(date +%H:%M:%S)] $*\033[0m"; }
warn() { echo -e "\033[33m[注意] $*\033[0m"; }
fail() { echo -e "\033[31m[失败] $*\033[0m"; exit 1; }

# 注意：阿里云自带的宝塔镜像里，远程终端的默认用户是 admin 而不是 root，
# 直接 `bash xxx.sh` 会在这里被拦下来。加 sudo 即可。
[ "$(id -u)" = "0" ] || fail "需要 root 权限。请在前面加 sudo 再跑：sudo bash $0"
[ -d "$BACKEND" ] || fail "找不到 $BACKEND —— 代码还没解压到 /www/wwwroot/futurepath 吧？"

# --------------------------------------------------------------
# 1. Python
# --------------------------------------------------------------
info "1/6 检查 Python 版本"

pick_python() {
    for c in python3.12 python3.11 python3.10 python3.9 python3; do
        command -v "$c" >/dev/null 2>&1 || continue
        if "$c" -c 'import sys; sys.exit(0 if sys.version_info>=(3,9) else 1)' 2>/dev/null; then
            echo "$c"; return 0
        fi
    done
    return 1
}

PY="$(pick_python || true)"
if [ -z "$PY" ]; then
    warn "系统自带的 Python 版本太老（低于 3.9），尝试装一个 3.11"
    (dnf install -y python3.11 python3.11-pip 2>/dev/null || yum install -y python3.11 python3.11-pip) \
        || fail "装不上 python3.11。可以在宝塔「软件商店」装「Python项目管理器」，再回来跑本脚本"
    PY="$(pick_python || true)"
    [ -n "$PY" ] || fail "装完之后还是找不到 3.9+ 的 python3"
fi
echo "  使用 $PY（$($PY -V 2>&1)）"

# --------------------------------------------------------------
# 2. 虚拟环境 + 依赖
# --------------------------------------------------------------
info "2/6 准备虚拟环境并安装依赖（第一次大约 1~3 分钟）"

cd "$BACKEND" || fail "进不去 $BACKEND"
if [ ! -x "venv/bin/python" ]; then
    "$PY" -m venv venv || fail "建虚拟环境失败（可能缺 venv 模块：$PY -m ensurepip）"
    echo "  已建 venv"
else
    echo "  venv 已存在，跳过"
fi

./venv/bin/python -m pip install --upgrade pip -i https://pypi.tuna.tsinghua.edu.cn/simple >/dev/null 2>&1
./venv/bin/python -m pip install -r requirements-prod.txt -i https://pypi.tuna.tsinghua.edu.cn/simple \
    || fail "装依赖失败，把上面的报错发出来"
echo "  依赖装好了"

# --------------------------------------------------------------
# 3. .env
# --------------------------------------------------------------
info "3/6 写配置文件 backend/.env"

if [ -f .env ]; then
    echo "  .env 已存在，保留不动（防止覆盖你的 key）"
else
    SECRET="$(./venv/bin/python -c 'import secrets;print(secrets.token_hex(32))')"
    cat > .env <<EOF
# 由 deploy/setup-server.sh 生成
# 数据库：不填就用 SQLite（backend/instance/dev.db），课程演示够用
# DATABASE_URL=mysql+pymysql://root:密码@127.0.0.1:3306/futurepath?charset=utf8mb4

SECRET_KEY=$SECRET

# 大模型（不填就退化成固定文案，页面显示"演示模式"）
LLM_API_KEY=
LLM_BASE_URL=
LLM_MODEL=

# 每日提问上限：保持默认 20，公网上千万别设 0
# LLM_DAILY_LIMIT=20

# 上线不要开 debug
# FLASK_DEBUG=1
EOF
    echo "  已生成（LLM_API_KEY 还是空的，稍后自己填）"
fi

# --------------------------------------------------------------
# 4. systemd 守护后端
# --------------------------------------------------------------
info "4/6 把后端注册成系统服务"

cat > /etc/systemd/system/$SERVICE.service <<EOF
[Unit]
Description=FuturePath backend (gunicorn)
After=network.target

[Service]
Type=simple
WorkingDirectory=$BACKEND
ExecStart=$BACKEND/venv/bin/gunicorn -c $APP_DIR/deploy/gunicorn.conf.py run:app
Restart=always
RestartSec=3
User=root

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable $SERVICE >/dev/null 2>&1
systemctl restart $SERVICE
sleep 3

if ! systemctl is-active --quiet $SERVICE; then
    echo "--- 最近 30 行日志 ---"
    journalctl -u $SERVICE -n 30 --no-pager
    fail "后端没起来，把上面的日志发出来"
fi
echo "  后端已在 $PORT_API 端口运行"

# 直接问后端要一次健康检查，确认真的活着（进程在 != 服务可用）
HEALTH="$(curl -s -m 5 "http://127.0.0.1:$PORT_API/api/health" || true)"
echo "  健康检查返回：${HEALTH:-（空，可能还没启动完）}"
echo "$HEALTH" | grep -q '"status"' || warn "健康检查没返回预期内容，稍后看日志"

# --------------------------------------------------------------
# 5. Nginx
# --------------------------------------------------------------
info "5/6 配置 Nginx（监听 $PORT_WEB）"

NGINX_BIN=""
BT_NGINX=/www/server/nginx/sbin/nginx

# ⚠️ 判断顺序不能反。宝塔装完 nginx 会在 /bin/nginx 建一个软链指向自己的二进制，
#    如果先跑 `command -v nginx`，拿到的是 /bin/nginx，于是被误判成"系统 nginx"，
#    接着用 systemctl 去启停一个由宝塔托管的进程 —— 必然 `Job for nginx.service failed`。
#    （2026-10-19 真踩过，配置写得没错，纯粹是认错了 nginx。）
if [ -x "$BT_NGINX" ]; then
    NGINX_BIN="$BT_NGINX"
    warn "用的是宝塔自带的 nginx"
elif command -v nginx >/dev/null 2>&1; then
    NGINX_BIN="$(command -v nginx)"
else
    echo "  系统里没有 nginx，现在装"
    # Alinux 3 上 dnf 经常报 "All matches were filtered out by exclude filtering for argument: nginx"，
    # 这是仓库/模块过滤把候选全挡掉了，不是仓库里没有这个包。所以多试几招再放弃。
    (dnf install -y nginx 2>/dev/null) \
        || (dnf install -y --disableexcludes=all nginx 2>/dev/null) \
        || { dnf module enable nginx:main -y >/dev/null 2>&1 && dnf install -y nginx 2>/dev/null; } \
        || true
    if [ -x "$BT_NGINX" ]; then
        NGINX_BIN="$BT_NGINX"
        warn "用的是宝塔自带的 nginx"
    elif command -v nginx >/dev/null 2>&1; then
        NGINX_BIN="$(command -v nginx)"
    else
        fail "nginx 装不上（dnf 被仓库过滤挡掉了）。去宝塔「软件商店」搜 Nginx 点安装，装完再重跑本脚本即可"
    fi
fi
echo "  使用 $NGINX_BIN"

CONF_DIR=/etc/nginx/conf.d
LOG_DIR=/var/log/nginx
if [ "$NGINX_BIN" = "$BT_NGINX" ]; then
    # 宝塔的 nginx 把站点配置和日志放在自己的目录里；
    # 如果还往 /var/log/nginx 写，那个目录常常不存在，nginx -t 会直接报 open() failed
    CONF_DIR=/www/server/panel/vhost/nginx
    LOG_DIR=/www/wwwlogs
    # 清掉上一版脚本误写到系统目录里的那份，避免以后装系统 nginx 时 8080 冲突
    rm -f /etc/nginx/conf.d/futurepath.conf 2>/dev/null || true
fi
mkdir -p "$CONF_DIR" "$LOG_DIR"

cat > "$CONF_DIR/futurepath.conf" <<EOF
server {
    listen $PORT_WEB;
    server_name _;
    root $FRONTEND_DIST;
    index index.html;

    gzip on;
    gzip_min_length 1k;
    gzip_comp_level 5;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;
    gzip_vary on;

    location /api/ {
        proxy_pass http://127.0.0.1:$PORT_API;
        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_connect_timeout 10s;
        proxy_send_timeout    90s;
        proxy_read_timeout    90s;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location ~ /\.(env|git) { deny all; }

    access_log $LOG_DIR/futurepath.access.log;
    error_log  $LOG_DIR/futurepath.error.log;
}
EOF
echo "  已写 $CONF_DIR/futurepath.conf"

# SELinux 开着的话，nginx 转不到 127.0.0.1:5000（表现为 502），这个开关必须打开
if command -v getenforce >/dev/null 2>&1 && [ "$(getenforce)" != "Disabled" ]; then
    warn "SELinux 是开启状态，放行 nginx 的反向代理"
    setsebool -P httpd_can_network_connect 1 2>/dev/null || true
fi

"$NGINX_BIN" -t || fail "nginx 配置检查没过，把上面的报错发出来"

# 宝塔自带的 nginx 用 bt 管理，系统装的用 systemctl
if [ "$NGINX_BIN" = "$BT_NGINX" ]; then
    # 宝塔的 nginx 由 /etc/init.d/nginx 托管，系统里那个 nginx.service 管不了它
    if [ -x /etc/init.d/nginx ]; then
        /etc/init.d/nginx reload >/dev/null 2>&1 || /etc/init.d/nginx start >/dev/null 2>&1 || true
    else
        "$NGINX_BIN" -s reload >/dev/null 2>&1 || "$NGINX_BIN" >/dev/null 2>&1 || true
    fi
    sleep 1
    if ! "$NGINX_BIN" -s reload >/dev/null 2>&1 && ! pgrep -f "nginx: master" >/dev/null 2>&1; then
        fail "宝塔的 nginx 起不来。到宝塔「软件商店 → Nginx → 服务」点一下「启动」，再重跑本脚本"
    fi
else
    systemctl enable nginx >/dev/null 2>&1
    systemctl restart nginx || fail "nginx 起不来"
fi
echo "  nginx 已启动"

# 系统防火墙放行 8080（阿里云控制台的「防火墙」还得单独加，见最后提示）
if command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then
    firewall-cmd --permanent --add-port=$PORT_WEB/tcp >/dev/null 2>&1 || true
    firewall-cmd --reload >/dev/null 2>&1 || true
    echo "  firewalld 已放行 $PORT_WEB"
fi

# --------------------------------------------------------------
# 6. 自检
# --------------------------------------------------------------
info "6/6 自检"

CODE_API="$(curl -s -o /dev/null -w '%{http_code}' -m 5 "http://127.0.0.1:$PORT_WEB/api/health" || true)"
CODE_WEB="$(curl -s -o /dev/null -w '%{http_code}' -m 5 "http://127.0.0.1:$PORT_WEB/" || true)"
echo "  页面 /            -> HTTP $CODE_WEB"
echo "  接口 /api/health  -> HTTP $CODE_API"

[ -f "$FRONTEND_DIST/index.html" ] || warn "没找到 $FRONTEND_DIST/index.html —— 前端包是不是没解压到 dist？"

echo ""
echo "=============================================================="
if [ "$CODE_WEB" = "200" ] && [ "$CODE_API" = "200" ]; then
    echo "  部署完成 ✅"
else
    echo "  部署跑完了，但自检没全过 ⚠️"
    echo "  常见原因：前端包没解压到 dist（页面 403/404）、后端没起来（接口 502）"
    echo "  排查命令：journalctl -u $SERVICE -n 50 --no-pager"
fi
echo "=============================================================="
echo ""
echo "  还差最后一步（在浏览器里做，脚本做不了）："
echo "     阿里云控制台 -> 这台服务器 -> 防火墙 -> 添加规则 TCP $PORT_WEB"
echo ""
echo "  然后访问： http://$(curl -s -m 3 http://100.100.100.200/latest/meta-data/eipv4 2>/dev/null || echo '你的公网IP'):$PORT_WEB"
echo ""
echo "  AI 要用真模型的话：编辑 $BACKEND/.env 填 LLM_API_KEY，"
echo "  然后 systemctl restart $SERVICE"
echo ""
