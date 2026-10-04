"""注册 / 登录 / 个人资料接口——严格按照 README 接口约定表实现"""
import re
import secrets

from flask import Blueprint, jsonify, request

from app import db
from app.models.user import User
# 公共能力统一放在 app/utils.py（第二阶段多个路由文件都要用，见该文件注释）
from app.utils import TOKENS, current_user, fail, text

auth_bp = Blueprint("auth", __name__, url_prefix="/api")

# 用户名规则：3-20 位【半角字母或数字】，和前端注册页的正则保持一致。
# ★ 这里不能用 str.isalnum()：它是 Unicode 语义，"张三".isalnum() 也返回 True，
#   中文用户名就会被放进来。前端有正则拦得住，但绕过页面直接调接口就能注册出
#   前端显示不了的账号——所以后端必须自己把关，不能依赖前端。
USERNAME_RE = re.compile(r"^[a-zA-Z0-9]{3,20}$")

# 各字段的数据库列宽上限（对应 init.sql 里的 VARCHAR）。
# ★ 超长不拦的话，MySQL 严格模式会直接抛异常 → 接口 500，
#   而 debug 模式下返回的是一整页 HTML 报错，前端解析不了，用户只看到"请求失败"。
NAME_MAX = 64
MAJOR_MAX = 64
GRADE_MAX = 16
PASSWORD_MIN = 6
PASSWORD_MAX = 64


def check_lengths(name, major, grade):
    """校验三个文本字段的长度，超了返回错误响应，否则返回 None。

    只校验"这次提交进来的内容"——没传的字段是空字符串，长度 0 自然通过。
    """
    if len(name) > NAME_MAX:
        return fail(1001, f"姓名不能超过{NAME_MAX}个字符")
    if len(major) > MAJOR_MAX:
        return fail(1001, f"专业不能超过{MAJOR_MAX}个字符")
    if len(grade) > GRADE_MAX:
        return fail(1001, f"年级不能超过{GRADE_MAX}个字符")
    return None


@auth_bp.post("/register")
def register():
    body = request.get_json(silent=True) or {}
    # text() 保证字段是"干净字符串"：前端把 major 传成数字 123 也不会让接口崩
    username = text(body.get("username"))
    # 密码不做 strip（密码里的空格是有效字符），只用 str() 兜住数字等脏类型
    password = str(body.get("password") or "")
    name = text(body.get("name"))
    major = text(body.get("major")) or "未填写"
    grade = text(body.get("grade")) or "未填写"

    # 1001 参数格式不对
    if not USERNAME_RE.match(username):
        return fail(1001, "用户名须为3-20位字母或数字")
    if not name:
        return fail(1001, "姓名不能为空")
    err = check_lengths(name, major, grade)
    if err:
        return err
    # 1002 密码长度不对
    if not (PASSWORD_MIN <= len(password) <= PASSWORD_MAX):
        return fail(1002, f"密码长度需为{PASSWORD_MIN}-{PASSWORD_MAX}位")
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
    username = text(body.get("username"))
    password = str(body.get("password") or "")

    user = User.query.filter_by(username=username).first()
    # 1004 用户名或密码错误（不区分是哪个错，防止试探）
    if not user or not user.check_password(password):
        return fail(1004, "用户名或密码错误")

    token = secrets.token_hex(16)
    TOKENS[token] = username
    return jsonify({"code": 0, "msg": "登录成功", "data": {"token": token}})


@auth_bp.get("/me")
def me():
    # 401 未登录 / 登录过期
    user = current_user()
    if not user:
        return fail(401, "未登录或登录过期")
    return jsonify({"code": 0, "msg": "success", "data": user.to_dict()})


@auth_bp.put("/me")
def update_me():
    """修改个人资料（个人中心「保存修改」调用）。
    只允许改 name / major / grade —— username 是账号、密码另有流程，
    都从入参里彻底忽略，防止前端（或恶意请求）越权改账号。
    """
    user = current_user()
    if not user:
        return fail(401, "未登录或登录过期")

    body = request.get_json(silent=True) or {}
    name = text(body.get("name"))
    if not name:
        return fail(1001, "姓名不能为空")
    # 长度校验（同样是为了别撞上 MySQL 列宽 → 500）
    err = check_lengths(name, text(body.get("major")), text(body.get("grade")))
    if err:
        return err

    user.name = name
    # 没传的字段保持原值（只改用户真正填了的），空字符串视为"清空"→ 存默认值
    if "major" in body:
        user.major = text(body.get("major")) or "未填写"
    if "grade" in body:
        user.grade = text(body.get("grade")) or "未填写"

    db.session.commit()
    return jsonify({"code": 0, "msg": "保存成功", "data": user.to_dict()})
