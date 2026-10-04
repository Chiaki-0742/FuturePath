"""跨模块公用的返回格式与鉴权工具。

为什么单独建这个文件？
    第一周只有 auth.py 一个路由文件，fail() 和 current_user() 写在它里面没问题。
    第二阶段问卷、案例、对话接口都要用同一套东西，如果每个文件都从 auth.py 里
    import，就会变成"改 auth 影响所有人"的乱麻。抽到这里后：
      - 谁需要就 import 谁，模块之间不再互相依赖
      - 返回格式只有一份代码，绝不会出现"有的接口返回 code 有的返回 success"
"""
import json
from datetime import datetime

from flask import jsonify, request

# 开发期用内存存 token（重启后端会失效，第二周换成更完善的方案）
#   { token字符串 : username }
TOKENS = {}


def fail(code, msg):
    """统一失败返回：{code, msg, data}"""
    return jsonify({"code": code, "msg": msg, "data": {}})


def ok(data=None, msg="success"):
    """统一成功返回。data 为空时给 {}，前端解构不会拿到 undefined。"""
    return jsonify({"code": 0, "msg": msg, "data": {} if data is None else data})


def current_user():
    """从请求头 Authorization: Bearer <token> 里认人。

    认得出来返回 User 对象；认不出来返回 None（调用方自己决定报什么错）。
    这里延迟 import User，避免 utils ←→ models 循环引用。
    """
    from app.models.user import User

    token = request.headers.get("Authorization", "").replace("Bearer ", "").strip()
    if not token or token not in TOKENS:
        return None
    return User.query.filter_by(username=TOKENS[token]).first()


def loads(raw, default):
    """数据库里的 JSON 字符串安全转回 Python 对象。

    解析失败不抛异常而是给默认值 —— 宁可少显示一个字段，也不能让整个
    接口 500 挂掉（这是 C 在对接说明里反复强调的"接口要抗脏数据"）。
    """
    if not raw:
        return default
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        return default


def text(value):
    """把请求入参安全地转成"去掉首尾空白的字符串"。

    为什么需要它？前端（或者随手 curl 的人）可能把字段传成数字、null、
    甚至数组：{'major': 123}、{'name': ['a','b']}。这时直接写
    (body.get('major') or '').strip() 会抛 AttributeError → 接口 500。

    规则：
      - 字符串 → 去首尾空白
      - 数字   → 转成字符串（'123'）
      - 其他（null / 数组 / 对象 / 布尔）→ 空字符串，
        让上层的"必填校验"去拒绝它，而不是把 [a, b] 当成姓名存进库
    """
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return str(value)
    return ""


def dumps(obj):
    """Python 对象转 JSON 字符串存库。

    ensure_ascii=False 是关键：不然中文会被存成 \\u8003\\u7814 这种转义，
    在数据库里没法直接看懂（排查问题时很痛苦）。
    """
    return json.dumps(obj, ensure_ascii=False)


def now():
    """全项目唯一的「当前时间」来源。

    ★ 为什么不能用 datetime.now(timezone.utc)？
      MySQL 的 DATETIME 类型【不存时区】，代码里传什么它就原样存什么。
      之前写成 UTC，而本机 MySQL 用的是本地时区（SELECT NOW() 返回北京时间），
      两边差 8 小时 —— 实测：本地 22:27 提交问卷，接口返回的 created_at 是 14:27，
      用户看到"填写时间"就会以为系统坏了。

    我们三台开发机都在国内、数据库和代码跑在同一台机器上，所以统一取本机时间：
    与 MySQL 的 NOW()/CURRENT_TIMESTAMP 口径一致，也不会出现"同一个页面两个时间标准"。

    （将来真部署到海外服务器，再统一改成 UTC 存储 + 返回时带时区，
       那是第二周之后的事，现在不要提前复杂化。）
    """
    return datetime.now()
