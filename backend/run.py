"""后端启动入口：python run.py"""
from app import create_app

app = create_app()

if __name__ == "__main__":
    # debug=True：改代码后自动重启，报错时网页显示详细信息（仅开发阶段用）
    app.run(host="127.0.0.1", port=5000, debug=True)
