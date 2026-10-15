"""后端启动入口：python run.py —— 仅本地开发用。上线请用 gunicorn（见 docs 部署方案）"""
import os

from app import create_app

app = create_app()

if __name__ == "__main__":
    # debug 默认【关闭】。
    # 为什么改：debug=True 会打开 Werkzeug 调试器，那个页面可以在浏览器里
    # 执行任意代码。现在 host 绑的是 127.0.0.1（公网本来也访问不到），
    # 但这是最后一道防线，不该默认敞开 —— 万一有人把 host 改成 0.0.0.0 就直接暴露了。
    # 本地开发想要"改代码自动重启"，在 backend/.env 里加一行 FLASK_DEBUG=1 即可。
    debug = os.getenv("FLASK_DEBUG", "0") == "1"
    if not debug:
        print("[run] debug 已关闭（无自动重载）。本地开发请在 backend/.env 里加 FLASK_DEBUG=1")
    app.run(host="127.0.0.1", port=5000, debug=debug)
