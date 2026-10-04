"""跨模块公用的返回格式与鉴权工具。

为什么单独建这个文件？
    第一周只有 auth.py 一个路由文件，fail() 和 current_user() 写在它里面没问题。
    第二阶段问卷、案例、对话接口都要用同一套东西，如果每个文件都从 auth.py 里
    import，就会变成"改 auth 影响所有人"的乱麻。抽到这里后：
      - 谁需要就 import 谁，模块之间不再互相依赖
      - 返回格式只有一份代码，绝不会出现"有的接口返回 code 有的返回 success"
"""
import json

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
