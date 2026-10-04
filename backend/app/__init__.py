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
    from app.routes.case import case_bp
    from app.routes.survey import survey_bp
    app.register_blueprint(auth_bp)
    app.register_blueprint(survey_bp)   # 第二阶段：问卷三接口
    app.register_blueprint(case_bp)     # 第二阶段：案例两接口

    # 健康检查接口：用于确认后端是否活着
    @app.route("/api/health")
    def health():
        return jsonify({
            "code": 0,
            "msg": "success",
            "data": {"service": "FuturePath API", "status": "running"},
        })

    # 全局兜底：任何未被代码捕获的异常（数据库断连、代码 bug 等）
    # 都会落到这里，返回统一的 JSON 格式，而不是 Flask 默认的 HTML 报错页。
    # 这样前端拦截器能读到 msg，用户看到的是人话提示而不是白屏乱码。
    # 注意：开发时 debug=True 会显示调试页面，这个 handler 只在
    # 生产模式（debug=False，正式部署时）才真正生效。
    @app.errorhandler(500)
    def internal_error(e):
        # 手动回滚：出错时这次操作的数据不完整，回滚防止"半截数据"留在会话里
        db.session.rollback()
        return jsonify({
            "code": 5000,
            "msg": "服务器内部错误，请检查数据库连接",
            "data": {},
        }), 500

    # 路径写错 / 请求方法不对时，Flask 默认吐一页 HTML。
    # 前端拦截器是按 JSON 解析的，拿到 HTML 会直接解析失败，
    # 用户只看到"请求失败"，排查时也分不清是"路径打错"还是"后端没起"。
    # 所以这两个也要统一成 JSON —— 前端一律按 code 判断。
    @app.errorhandler(404)
    def not_found(e):
        return jsonify({
            "code": 4040,
            "msg": "接口不存在，请检查请求路径",
            "data": {},
        }), 404

    @app.errorhandler(405)
    def method_not_allowed(e):
        return jsonify({
            "code": 4050,
            "msg": "请求方法不允许，请检查该接口要用 GET 还是 POST",
            "data": {},
        }), 405

    # 开发期便利：启动时自动建表（生产环境会换成迁移方案）
    # 注意：表已存在时 create_all 会跳过，所以表结构的最终依据是 backend/init.sql
    with app.app_context():
        from app.models.chat import ChatLog  # noqa: F401
        from app.models.case import Case, CaseStep  # noqa: F401
        from app.models.survey import Answer, Question  # noqa: F401
        from app.models.user import User  # noqa: F401
        db.create_all()

    return app
