"""问卷接口（第二阶段 · 第一层）—— 严格按 docs/接口文档-第二阶段.md 第 3 节实现

    GET  /api/questions   获取问卷题目        （不需登录）
    POST /api/answers     提交问卷答案        （需登录，有则覆盖）
    GET  /api/answers     查询我的问卷结果    （需登录）

三条约定上的关键点（都是文档里点名的，写错前端就白干）：
  1. options 必须以【数组】返回，不能是数据库里那串 JSON 字符串
  2. POST 的 user_id 只能从 token 反查，绝不接受前端传（否则能改别人的问卷）
  3. GET 没填过不报错，返回 filled:false —— 这是正常流程，不是错误
"""
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request
from sqlalchemy import case as sql_case

from app import db
from app.models.survey import Answer, Question
from app.utils import current_user, dumps, fail, loads, ok, text

survey_bp = Blueprint("survey", __name__, url_prefix="/api")

# 题目的分组顺序（对应 C 在《数据库对接说明》里给的
# ORDER BY FIELD(group_name, 'direction', 'status', 'interest')）
GROUP_ORDER = {"direction": 0, "status": 1, "interest": 2}


def _allowed_options(group_name):
    """从题库里取出某个分组允许的选项值。

    为什么不把选项硬编码在代码里？因为选项的"唯一真相"在 C 的题库表里。
    将来 C 改题库（比如加一个方向），后端不用改一行代码，校验自动跟上 ——
    这就是"数据驱动校验"比"写死 if 列表"好的地方。
    """
    q = Question.query.filter_by(group_name=group_name).first()
    if not q:
        return None   # 题库没初始化，返回 None 表示"这次不校验"，避免全盘拦截
    opts = loads(q.options, [])
    return opts if isinstance(opts, list) else None


@survey_bp.get("/questions")
def get_questions():
    """获取全部题目。

    排序严格照 C 给的 SQL（数据库对接说明 4.1）：
      主序 = 分组固定顺序（方向 → 现状 → 想了解），次序 = 组内 order_no。
    ★ 为什么不能只按 order_no 全局排？因为 order_no 是【组内编号】
      （三组都从 1 开始），全局排出来会是 1,1,1,2,2,2... 三组交错。
      前端的 groupQuestions() 虽然会自己重新分组，但接口输出的顺序本身
      也是契约的一部分，按文档来才不会被下一个接手的人当成 bug。
    """
    group_order = sql_case(
        (Question.group_name == "direction", 0),
        (Question.group_name == "status", 1),
        (Question.group_name == "interest", 2),
        else_=99,   # 将来加分组的兜底：排到最后，不至于乱插
    )
    questions = (Question.query
                 .order_by(group_order, Question.order_no, Question.id).all())
    return ok({"list": [q.to_dict() for q in questions]})


@survey_bp.post("/answers")
def submit_answers():
    """提交问卷。一个用户只有一份，重复提交 = 覆盖，不新增记录。"""
    user = current_user()
    if not user:
        return fail(401, "请先登录")

    body = request.get_json(silent=True) or {}

    direction = text(body.get("direction"))
    grade = text(body.get("grade"))
    status = body.get("status")
    interest = body.get("interest")
    extra_note = text(body.get("extra_note"))

    # ---- 校验：统一用 1006（问卷格式不对）----
    allowed = _allowed_options("direction")
    if not direction or (allowed and direction not in allowed):
        return fail(1006, "请选择未来方向")
    if not grade:
        return fail(1006, "请选择当前年级")
    if not isinstance(status, dict):
        return fail(1006, "问卷格式不正确")
    if not isinstance(interest, list):
        return fail(1006, "问卷格式不正确")
    if len(interest) > 3:
        return fail(1006, "最多选 3 项")

    # ---- 存入：先查再改，没有就插（user_id 上有 UNIQUE 索引，直接 add 会撞键）----
    ans = Answer.query.filter_by(user_id=user.id).first()
    if ans is None:
        ans = Answer(user_id=user.id)
        db.session.add(ans)

    ans.direction = direction
    ans.grade = grade
    ans.status_json = dumps(status)        # 中文不转义，库里能直接读懂
    ans.interest_json = dumps(interest)
    ans.extra_note = extra_note
    # created_at 在表注释里的定义是「填写时间」，所以覆盖提交要一起刷新，
    # 否则用户改完问卷，回来看到的时间还是第一次填的，会以为没保存成功。
    ans.created_at = datetime.now(timezone.utc)

    db.session.commit()
    return ok({"id": ans.id}, "提交成功")


@survey_bp.get("/answers")
def get_answers():
    """查询我的问卷结果。没填过返回 filled:false，而不是抛错。"""
    user = current_user()
    if not user:
        return fail(401, "请先登录")

    ans = Answer.query.filter_by(user_id=user.id).first()
    if ans is None:
        # msg 用"未填写"是文档里写死的，前端不解析 msg 但要能看懂日志
        return jsonify({"code": 0, "msg": "未填写",
                        "data": {"filled": False, "answer": None}})
    return ok({"filled": True, "answer": ans.to_dict()})
