"""Flask 应用工厂：create_app() 创建并配置整个后端应用"""
from flask import Flask, jsonify
from flask_cors import CORS


def create_app():
    app = Flask(__name__)

    # 允许跨域：前端(5173端口)才能正常请求后端(5000端口)
    CORS(app)

    # 健康检查接口：用于确认后端是否活着
    @app.route("/api/health")
    def health():
        return jsonify({
            "code": 0,
            "msg": "success",
            "data": {"service": "FuturePath API", "status": "running"},
        })

    return app
