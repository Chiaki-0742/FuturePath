"""注册 / 登录 / 个人资料 / 密保问题——严格按照 README 接口约定表实现"""
import re
import secrets
from datetime import datetime, timedelta

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

# 密保问题相关上限（对应 users 表的 security_question / security_answer_hash）
SECURITY_QUESTION_MAX = 64
SECURITY_ANSWER_MIN = 2      # 「1」「a」这种一猜就中的答案太危险，且用户自己也会写错
SECURITY_ANSWER_MAX = 64


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
    # 密保问题：选填（原因见下面校验处的注释）
    security_question = text(body.get("security_question"))
    security_answer = text(body.get("security_answer"))

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

    # ---- 密保问题（选填，但填了就要成对、长度要合规）----
    # ★ 为什么后端做成"选填"：自检脚本、截图脚本都会直接调这个接口注册账号，
    #   它们不带这两个字段；这里若强制必填，那些脚本会全部挂掉。
    #   所以"必须填"这件事交给前端表单去要求（见 Register.vue），
    #   后端只负责保证"填了的话数据是干净的"。
    if security_question and not security_answer:
        return fail(1001, "设了密保问题就要填答案")
    if security_answer and not security_question:
        return fail(1001, "填了密保答案就要选一个问题")
    if len(security_question) > SECURITY_QUESTION_MAX:
        return fail(1001, f"密保问题不能超过{SECURITY_QUESTION_MAX}个字符")
    if security_answer and not (
        SECURITY_ANSWER_MIN <= len(security_answer) <= SECURITY_ANSWER_MAX
    ):
        return fail(1001, f"密保答案长度需为{SECURITY_ANSWER_MIN}-{SECURITY_ANSWER_MAX}位")

    user = User(username=username, name=name, major=major, grade=grade)
    user.set_password(password)  # 密码加密后入库
    if security_question and security_answer:
        user.security_question = security_question
        user.set_security_answer(security_answer)   # 只存哈希，不存明文
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


# ===============================================================
# 密保问题 / 忘记密码
#
# 先摆清楚一件事：密码是哈希存的，所以「找回原密码」天生做不到，
# 也不该做（能做到就说明是明文存的）。这里做的是「重置」：
# 让用户答对他自己设的问题，换一次设置新密码的机会。
#
# 三步（前端也是照这个顺序做成三屏的）：
#   1. GET  /api/security/question?username=xxx   拿到这个人设的问题
#   2. POST /api/security/verify                 答对 → 换一张「重置凭证」
#   3. POST /api/security/reset                  拿凭证设新密码
#
# 为什么中间要发一张凭证，而不是"答对了就直接让我改密码"：
#   把「验证身份」和「改密码」拆成两次请求，前端才能做成两步界面
#   （先看到"答对了"，再去设新密码）；而且凭证一次性、10 分钟过期，
#   万一被截获，可用的窗口也很短。
#
# ⚠️ 凭证和登录 token 一样存在【进程内存】里 —— 后端一重启就全失效。
#    开发期无所谓（大不了重新答一次密保），但真要上线必须换成 Redis 或库表。
# ===============================================================

RESET_TOKENS = {}            # {重置凭证: {"username": 用户名, "expire_at": 过期时间}}
RESET_TTL_SECONDS = 600      # 凭证有效期：10 分钟

# 防暴力猜答案：同一个人连续答错就锁一段时间。
# 存内存而不是库表，理由同上 —— 它只是"挡一挡"，不是审计数据。
_ANSWER_FAILS = {}           # {用户名: {"count": 连错次数, "locked_until": 解锁时间}}
MAX_ANSWER_FAILS = 5         # 连错几次就锁
LOCK_MINUTES = 15            # 锁多少分钟


def _lock_state(username):
    """这个人现在被锁着吗？返回 (是否锁定, 还要等几分钟)"""
    rec = _ANSWER_FAILS.get(username)
    if not rec or not rec.get("locked_until"):
        return False, 0
    left = rec["locked_until"] - datetime.now()
    if left.total_seconds() <= 0:
        _ANSWER_FAILS.pop(username, None)   # 锁过期了，清掉记录让他重新试
        return False, 0
    return True, max(1, int(left.total_seconds() // 60) + 1)


def _record_fail(username):
    """记一次答错；到达上限就锁一段时间"""
    rec = _ANSWER_FAILS.setdefault(username, {"count": 0, "locked_until": None})
    rec["count"] += 1
    if rec["count"] >= MAX_ANSWER_FAILS:
        rec["locked_until"] = datetime.now() + timedelta(minutes=LOCK_MINUTES)
    return rec["count"]


@auth_bp.get("/security/question")
def security_question():
    """第一步：按用户名取回他设的密保问题。

    ★ 注意「用户不存在」和「没设过密保」返回的是【同一个】1008。
      不分开说"这个账号不存在"，是为了不让人拿这个接口去试探
      "哪些用户名已经被注册了"——那属于信息泄露。
    """
    username = text(request.args.get("username"))
    user = User.query.filter_by(username=username).first()
    if not user or not user.has_security():
        return fail(1008, "这个账号没有设置密保问题，没法自助找回")

    # 只返回问题本身，【绝不返回值、也不返回答案的任何线索】
    return jsonify({"code": 0, "msg": "success",
                    "data": {"question": user.security_question}})


@auth_bp.post("/security/verify")
def security_verify():
    """第二步：回答问题。答对就给一张一次性重置凭证。"""
    body = request.get_json(silent=True) or {}
    username = text(body.get("username"))
    answer = text(body.get("answer"))

    # 先看锁没锁。这一步要放在"查用户"之前 ——
    # 否则攻击者能从返回差异里反推出账号是否存在。
    locked, minutes = _lock_state(username)
    if locked:
        return fail(1011, f"答错次数太多了，请 {minutes} 分钟后再试")

    if not answer:
        return fail(1001, "请填写答案")

    user = User.query.filter_by(username=username).first()
    if not user or not user.has_security():
        return fail(1008, "这个账号没有设置密保问题，没法自助找回")

    if not user.check_security_answer(answer):
        used = _record_fail(username)
        remain = MAX_ANSWER_FAILS - used
        if remain <= 0:
            return fail(1011, f"答错次数太多了，请 {LOCK_MINUTES} 分钟后再试")
        # 把剩余次数告诉用户，比只说"答案不对"友好得多
        return fail(1009, f"答案不对，还可以试 {remain} 次")

    _ANSWER_FAILS.pop(username, None)   # 答对就清空连错记录

    token = secrets.token_hex(16)
    RESET_TOKENS[token] = {
        "username": user.username,
        "expire_at": datetime.now() + timedelta(seconds=RESET_TTL_SECONDS),
    }
    return jsonify({"code": 0, "msg": "验证通过",
                    "data": {"reset_token": token, "expires_in": RESET_TTL_SECONDS}})


@auth_bp.post("/security/reset")
def security_reset():
    """第三步：拿着凭证设置新密码。"""
    body = request.get_json(silent=True) or {}
    token = text(body.get("reset_token"))
    new_password = str(body.get("new_password") or "")

    rec = RESET_TOKENS.get(token)
    if not rec:
        return fail(1010, "重置凭证无效，请重新验证密保问题")
    if rec["expire_at"] < datetime.now():
        RESET_TOKENS.pop(token, None)
        return fail(1010, "重置凭证已过期，请重新验证密保问题")

    # 长度规则和注册时一模一样（复用同一组常量，避免两边规则漂移）
    if not (PASSWORD_MIN <= len(new_password) <= PASSWORD_MAX):
        return fail(1002, f"密码长度需为{PASSWORD_MIN}-{PASSWORD_MAX}位")

    user = User.query.filter_by(username=rec["username"]).first()
    if not user:
        RESET_TOKENS.pop(token, None)
        return fail(1010, "重置凭证无效，请重新验证密保问题")

    user.set_password(new_password)
    db.session.commit()

    RESET_TOKENS.pop(token, None)   # 一次性：用掉即作废

    # ★ 把这个账号已经登录的 token 全部踢掉，强制重新登录。
    #   理由：能走到"重置密码"这一步，本身就说明账号可能已经被人碰过。
    #   如果旧 token 还有效，那这密码等于白改 —— 拿着旧 token 的人照样进得来。
    kicked = [t for t, name in TOKENS.items() if name == user.username]
    for t in kicked:
        TOKENS.pop(t, None)

    return jsonify({"code": 0, "msg": "密码已重置，请用新密码登录",
                    "data": {"username": user.username,
                             "kicked_sessions": len(kicked)}})
