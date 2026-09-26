"""Flask 应用工厂：create_app() 创建并配置整个后端应用"""
from flask import Flask, jsonify
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy

from app.config import Config

# 数据库实例（全项目共用，models 里都从这里 import）
db = SQLAlchemy()


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    # 数据库初始化
    db.init_app(app)

    # 允许跨域：前端(5173端口)才能正常请求后端(5000端口)
    CORS(app)

    # 注册路由
    from app.routes.auth import auth_bp
    app.register_blueprint(auth_bp)

    # 健康检查接口：用于确认后端是否活着
    @app.route("/api/health")
    def health():
        return jsonify({
            "code": 0,
            "msg": "success",
            "data": {"service": "FuturePath API", "status": "running"},
        })

    # 开发期便利：启动时自动建表（生产环境会换成迁移方案）
    with app.app_context():
        from app.models.user import User  # noqa: F401 确保模型已注册
        db.create_all()

    return app
