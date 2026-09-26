"""注册 / 登录 / 个人资料接口——严格按照 README 接口约定表实现"""
import secrets

from flask import Blueprint, jsonify, request

from app import db
from app.models.user import User

auth_bp = Blueprint("auth", __name__, url_prefix="/api")

# 开发期用内存存 token（重启后端会失效，第二周换成更完善的方案）
TOKENS = {}


def fail(code, msg):
    """统一错误返回格式"""
    return jsonify({"code": code, "msg": msg, "data": {}})


@auth_bp.post("/register")
def register():
    body = request.get_json(silent=True) or {}
    username = (body.get("username") or "").strip()
    password = body.get("password") or ""
    name = (body.get("name") or "").strip()
    major = (body.get("major") or "").strip() or "未填写"
    grade = str(body.get("grade") or "").strip() or "未填写"

    # 1001 参数格式不对
    if not (3 <= len(username) <= 20 and username.isalnum()):
        return fail(1001, "用户名须为3-20位字母或数字")
    if not name:
        return fail(1001, "姓名不能为空")
    # 1002 密码太短
    if len(password) < 6:
        return fail(1002, "密码太短，至少6位")
    # 1003 用户名已存在
    if User.query.filter_by(username=username).first():
        return fail(1003, "用户名已存在")

    user = User(username=username, name=name, major=major, grade=grade)
    user.set_password(password)  # 密码加密后入库
    db.session.add(user)
    db.session.commit()

    token = secrets.token_hex(16)
    TOKENS[token] = username
    return jsonify({"code": 0, "msg": "注册成功", "data": {"token": token}})


@auth_bp.post("/login")
def login():
    body = request.get_json(silent=True) or {}
    username = (body.get("username") or "").strip()
    password = body.get("password") or ""

    user = User.query.filter_by(username=username).first()
    # 1004 用户名或密码错误（不区分是哪个错，防止试探）
    if not user or not user.check_password(password):
        return fail(1004, "用户名或密码错误")

    token = secrets.token_hex(16)
    TOKENS[token] = username
    return jsonify({"code": 0, "msg": "登录成功", "data": {"token": token}})


@auth_bp.get("/me")
def me():
    # 401 未登录 / 登录过期：请求头 Authorization: Bearer <token>
    token = request.headers.get("Authorization", "").replace("Bearer ", "").strip()
    if not token or token not in TOKENS:
        return fail(401, "未登录或登录过期")

    user = User.query.filter_by(username=TOKENS[token]).first()
    if not user:
        return fail(401, "未登录或登录过期")
    return jsonify({"code": 0, "msg": "success", "data": user.to_dict()})
