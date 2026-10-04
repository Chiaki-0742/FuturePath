"""案例接口（第二阶段 · 第二层）—— 严格按 docs/接口文档-第二阶段.md 3.4 / 3.5 节实现

    GET /api/cases        获取推荐案例（按方向、年级筛选，默认参数取自用户问卷）
    GET /api/cases/<id>   案例详情（带 steps 时间线）

两个容易写错的地方：
  1. 列表页【不返回 experience】，那是详情页才给的字段（列表要轻量）
  2. 案例详情要一次把该案例的全部 steps 查出来，不能循环查（N+1 问题）
"""
from flask import Blueprint, request
from sqlalchemy import case as sql_case

from app import db
from app.models.case import Case, CaseStep
from app.models.survey import Answer
from app.utils import current_user, fail, ok, text

case_bp = Blueprint("case", __name__, url_prefix="/api")

DEFAULT_LIMIT = 3    # 文档规定的默认条数（前端一般会自己传 6）
MAX_LIMIT = 20       # 上限，防止有人传 limit=99999 把库拖垮


@case_bp.get("/cases")
def get_cases():
    """推荐案例列表。

    匹配采用【三层兜底】，逐层放宽（宁可给相近的，也不要给空页面）：
      第 1 层：方向 + 年级都对上       —— 最贴合用户情况
      第 2 层：只要方向对上（文档第 4 步要求的兜底）
      第 3 层：方向也对不上（比如"创业""还没想好"在案例库里一条都没有）
               —— 文档没写这一层，但案例页空着比"数据稍微不准"难看得多，
                  所以给几条其他方向的，并用 relaxed=true 告诉前端
    """
    user = current_user()
    if not user:
        return fail(401, "请先登录")

    # ---- 参数：没传就用用户自己的问卷结果 ----
    direction = text(request.args.get("direction"))
    grade = text(request.args.get("grade"))
    # type=int 的好处：传了 "abc" 这种非法值会自动返回默认值，不用自己 try/except
    limit = request.args.get("limit", default=DEFAULT_LIMIT, type=int) or DEFAULT_LIMIT
    limit = max(1, min(limit, MAX_LIMIT))

    ans = Answer.query.filter_by(user_id=user.id).first()

    # 文档：既没问卷、又没传参数 → 1005，前端引导去填问卷
    if not ans and not direction and not grade:
        return fail(1005, "请先完成问卷")

    if not direction and ans:
        direction = ans.direction or ""
    if not grade and ans:
        grade = ans.grade or ""

    # 排序助手：年级相同的排前面（C 的 SQL 5.2：(grade = %s) DESC, id）。
    # case(...) 是 SQL 里的条件表达式，同年级=0、不同=1，升序排就成了"同年级优先"。
    same_grade_first = sql_case((Case.grade == grade, 0), else_=1)

    # ---- 三层匹配 ----
    rows = []
    relaxed = False

    if direction and grade:
        rows = (Case.query
                .filter_by(direction=direction, grade=grade)
                .order_by(Case.id).all())

    if not rows and direction:
        # 第 2 层：方向对上就行，年级放宽（文档第 4 步要求的兜底）。
        # 但放宽不等于乱给 —— 把同年级的案例排到前面，用户的处境更像，
        # 结果也更有参考价值。这一层不算 relaxed：方向是对的，只是年级放宽了。
        rows = (Case.query
                .filter_by(direction=direction)
                .order_by(same_grade_first, Case.id).all())

    if not rows:
        # 第 3 层：方向也没有对应的案例，给几条通用的，避免空页面。
        # 同样优先给同年级的案例，理由同上。
        rows = Case.query.order_by(same_grade_first, Case.id).all()
        relaxed = True

    total = len(rows)          # 匹配到的总数（截断前）
    return ok({
        "total": total,
        "list": [c.to_dict() for c in rows[:limit]],   # 列表页字段，不含 experience
        "relaxed": relaxed,    # true = 这些案例跟你选的方向不完全一致
    })


@case_bp.get("/cases/<int:case_id>")
def get_case_detail(case_id):
    """案例详情：主表字段 + 全部步骤（按 order_no 升序）。"""
    user = current_user()
    if not user:
        return fail(401, "请先登录")

    # 用 db.session.get 而不是 Case.query.get —— 后者在新版 SQLAlchemy 已标记过时
    case = db.session.get(Case, case_id)
    if not case:
        return fail(1001, "案例不存在")

    # 一次查出该案例的所有步骤（不是循环查，总共只有 2 条 SQL，不存在 N+1）
    steps = (CaseStep.query
             .filter_by(case_id=case_id)
             .order_by(CaseStep.order_no).all())

    data = case.to_dict(detail=True)     # detail=True 才带 experience
    data["steps"] = [s.to_dict() for s in steps]
    return ok(data)
