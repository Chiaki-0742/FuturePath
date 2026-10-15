"""对话接口（第二阶段 · 第三层）—— 严格按 docs/接口文档-第二阶段.md 3.6 节实现

    POST /api/chat        向大模型提问（需登录，且必须先填过问卷）
    GET  /api/chat/logs   我的提问记录（需登录）

★ 这一层和前面两层最大的区别：前 5 个接口都不依赖任何外部服务、不花钱，
  这个接口要用大模型 API。现在接的是【智谱 GLM】（open.bigmodel.cn）。

【两种模式，靠 .env 自动切换 —— 这是刻意留的降级】
  配了 LLM_API_KEY  → 真的去调模型，返回里 data.mock = false
  没配 key（比如组员本地没建 .env）→ 退回骨架的固定文案，data.mock = true
  这样"手上没 key 的组员"也能把整条链路跑通、能跑自检脚本，
  不会因为一个人没 key 就卡住全队的联调。

【为什么一定要把问卷拼进 prompt】（文档 3.6 节反复强调的点）
  如果只是把用户的问题原样转发给模型，那所有人问"我该考研还是就业"，
  得到的答案是一样的 —— 这不叫"根据用户需求对答如流"。
  只有带上年级、专业、学校层次、成绩、英语、想搞清楚的问题，
  模型给出的建议才是针对这个人的。build_system_prompt() 就是干这件事的。

【四个必须做的成本/安全措施】（文档点名，老师强调过两遍）
  1. API key 只写在 backend/.env（已在 .gitignore 里），绝不进代码
  2. 每日提问次数上限（查当天 chat_logs 条数），超了返回 1007
  3. 每次调用都落库（含 tokens_used），否则事后没法算成本
  4. 模型异常统一返回 2001，不把异常堆栈透给前端
"""
import json
import urllib.error
import urllib.request
from datetime import datetime

from flask import Blueprint, current_app, request

from app import db
from app.models.chat import ChatLog
from app.models.survey import Answer
from app.models.user import User
from app.utils import current_user, fail, loads, now, ok, text

chat_bp = Blueprint("chat", __name__, url_prefix="/api")

# ---- 四个可调参数（放在文件顶部，改的时候不用满地找）----
QUESTION_MAX = 500         # 问题长度上限。question 是 TEXT 列，不封顶会撞
                            # MySQL 严格模式 → DataError 1406 → 接口 500（踩过）
DAILY_LIMIT = 20            # 每日提问次数上限，超了返回 1007（文档建议值）
LOG_PAGE_SIZE = 20          # GET /chat/logs 默认返回条数
LOG_MAX_SIZE = 50           # GET /chat/logs 上限，防一次拉太多

# ---- 大模型相关（真正会花钱的部分，参数都放这里）----
LLM_TIMEOUT = 45            # 单次请求最多等几秒。超时按"AI 暂时不可用"处理，
                            # 不能让一个卡住的请求把后端线程一直占着
LLM_MAX_TOKENS = 800        # 回答长度上限。system prompt 里要求"300 字以内"，
                            # 中文 300 字约 400-500 token，留一倍余量。
                            # 不封顶的后果：模型偶尔会"展开讲讲"，一次几千 token
DEFAULT_BASE_URL = "https://open.bigmodel.cn/api/paas/v4"
DEFAULT_MODEL = "glm-4.5-air"       # .env 里没写 LLM_MODEL 时的兜底。
                                    # ⚠️ 别随手换成 glm-5.3-flash / glm-4.7 这类"先想再答"的
                                    # 推理模型：它们会把 800 token 全花在思考上，正文一个字
                                    # 都没写就结束了，接口拿到的是空字符串（2026-10-14 实测）。
                                    # 要用它们得把 LLM_MAX_TOKENS 提到 3000 以上。

# 直连，不走系统代理。
# 本机的终端环境里可能被注入 http_proxy / https_proxy（端口每次会话都变），
# urllib 默认会读这两个变量，实测反而容易把国内接口的请求卡住 ——
# 所以这里显式声明"不要代理"。
_llm_opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def build_system_prompt(user, ans, status, interest):
    """把用户的问卷结果拼成 System Prompt —— 这个接口的灵魂所在。

    拼进去的每一项都对应问卷里的一道题（键名与前端 utils/survey.js 约定一致）：
      grade        B 组第 1 题「你现在大几」      —— 注意它不在 status 里
      major_type   B 组第 2 题 专业类别
      school_level B 组第 3 题 学校层次
      score        B 组第 4 题 专业排名
      english      B 组第 5 题 英语水平
      experience   B 组第 6 题 已有经历（数组）
      direction    A 组     未来方向
      interest     C 组     最想搞清楚的问题（数组）

    为什么要逐个判空、还带"未填写"兜底？
      问卷里这些题都可能被跳过（用户直接回车），status 里就少了某个 key。
      如果直接 f"{status.get('english')}"，模型会看到字面量 "None"，
      然后一本正经地基于"你英语水平 None"给建议 —— 这种 bug 极难发现。
    """
    def field(value, fallback="未填写"):
        """数组/空值都归一到能直接读懂的文字。"""
        if value is None:
            return fallback
        if isinstance(value, (list, tuple)):
            return "、".join(str(v) for v in value) if value else fallback
        if isinstance(value, str):
            v = value.strip()
            return v if v else fallback
        return str(value)

    return f"""你是一个大学生未来规划助手，正在为一位学生提供建议。

这位学生的问卷信息：
- 年级：{field(ans.grade)}
- 专业类别：{field(status.get('major_type'))}
- 学校层次：{field(status.get('school_level'))}
- 专业排名：{field(status.get('score'))}
- 英语水平：{field(status.get('english'))}
- 已有经历：{field(status.get('experience'), '暂无特别经历')}
- 未来方向：{field(ans.direction)}
- 最想搞清楚：{field(interest, '尚未填写')}

回答要求：
1. 必须针对上面这个人的具体情况，不要给"要努力学习"这类放之四海皆准的空话。
2. 给具体、可执行的建议，最好带时间节点或可量化的标准。
3. 篇幅控制在 300 字以内，学生是在手机上看。
4. 不要编造事实性数据（比如某校分数线、某岗位薪资），不确定就说明这是估算。
5. 用平实的口吻，像一位学长在讲经验，不要像官方公告。"""


def fake_answer(question, ans, status, interest):
    """骨架回答 —— 固定文案，只把用户的画像填进去。

    ★ 它现在的身份是【降级方案】，不再是"等 key 的占位"：
      没配 LLM_API_KEY（例如组员本地没建 .env）时，接口回落到这里，
      整条链路（鉴权 → 校验 → 拼 prompt → 落库 → 前端展示）照样跑得通，
      返回里 mock = true，前端会显示"演示模式"。
      这样"手上没 key 的人"不会卡住全队的联调、自检和截图。

    ★ 有一点要留意：它没有真实调用，所以 tokens_used 固定为 0。
      不要写成 -1 之类的"特殊值"——那样在成本统计里会跟
      "真的调了模型但没记录"混淆。
    """
    grade = ans.grade or "大学阶段"
    direction = ans.direction or "还没想好"
    return (
        f"（骨架模式：尚未接入大模型，以下是固定文案 + 你的画像回显）\n\n"
        f"你已经选了「{direction}」，现在是{grade}。"
        f"想搞清楚的是：{'、'.join(interest) if interest else '还没填'}。\n\n"
        f"真正接上模型后，这里会根据你的年级、专业类别、"
        f"学校层次、专业排名、英语水平和已有经历，"
        f"针对你问的「{question}」给出具体建议。\n\n"
        f"可以先做的一件事：把你打算走的这条路拆成"
        f"「需要准备什么」「什么时候开始」「怎么检验进度」三栏，"
        f"每栏填 2-3 条，贴在桌前。"
    )


class LLMError(Exception):
    """大模型这一侧出问题：网络不通 / key 失效 / 余额不足 / 超时 / 返回结构异常。

    ★ 为什么要单独定义一个异常类型，而不是 catch Exception？
      如果 `except Exception` 一把抓，那么代码 bug（比如变量名写错、
      少了个参数）也会被当成"AI 不可用"，然后在页面上显示一句
      "AI 暂时不可用，请稍后再试" —— 你永远查不到真正的原因。
      只接住这一类，其余异常该 500 就 500，日志里能看到堆栈。
    """


def llm_config():
    """读出 .env 里的三项配置，返回 (key, base_url, model)。

    key 为空 = 没配（组员本地没建 .env），调用方据此退回骨架模式。
    base_url / model 没写就用默认值，省得组员只填了 key 结果报 404。
    """
    key = (current_app.config.get("LLM_API_KEY") or "").strip()
    base_url = (current_app.config.get("LLM_BASE_URL") or "").strip().rstrip("/")
    model = (current_app.config.get("LLM_MODEL") or "").strip()
    return key, base_url or DEFAULT_BASE_URL, model or DEFAULT_MODEL


def call_real_model(system_prompt, question):
    """真的去问大模型，返回 (回答文字, 消耗的 token 数)。

    ★ 为什么用标准库 urllib，而不是requests？
      后端 venv 里没有装 requests（只有 Flask / flask-cors / PyMySQL /
      python-dotenv）。为了调一个 HTTP 接口就让全体组员重跑一次
      pip install，成本比收益大；urllib 是 Python 自带的，够用。

    ★ 为什么 system prompt 要单独发，而不是拼进用户那句话里？
      模型的角色设定放在 system 里更"压得住"：用户后面再怎么问，
      那套"针对这个人的画像、300 字以内、别编数据"的要求都还在。
      拼成一句话发过去，用户一句"忽略前面"就可能把它带跑。
    """
    key, base_url, model = llm_config()

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": question},
        ],
        "temperature": 0.6,          # 略低于默认：要的是稳定、可复现的建议
        "max_tokens": LLM_MAX_TOKENS,
    }

    req = urllib.request.Request(
        base_url + "/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
    )
    req.add_header("Authorization", "Bearer " + key)
    req.add_header("Content-Type", "application/json")

    try:
        with _llm_opener.open(req, timeout=LLM_TIMEOUT) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        # 平台明确回了个错误（401 key 失效 / 429 限流 / 402 余额不足…）
        # 原文只写进后端日志，不给前端 —— 前端只该看到一句人话。
        detail = e.read().decode("utf-8", "replace")[:300]
        current_app.logger.warning("大模型返回 HTTP %s：%s", e.code, detail)
        raise LLMError("AI 暂时不可用，请稍后再试")
    except Exception as e:
        # 超时、DNS 不通、连接被断等，都归到这一类
        current_app.logger.warning("大模型调用失败：%s: %s", type(e).__name__, e)
        raise LLMError("AI 暂时不可用，请稍后再试")

    # 解析要防御性写：平台偶发抖动时可能返回结构不全的 JSON。
    # 直接 data["choices"][0]... 一旦 KeyError，报出来的错会让人以为是代码 bug。
    try:
        choice = data["choices"][0]
        answer = (choice["message"].get("content") or "").strip()
        tokens = int(data.get("usage", {}).get("total_tokens") or 0)
    except (KeyError, IndexError, TypeError, ValueError):
        current_app.logger.warning("大模型返回结构异常：%s", str(data)[:300])
        raise LLMError("AI 返回内容异常，请稍后再试")

    if not answer:
        # ★ 这个分支 2026-10-14 踩过，原因很反直觉，日志里写清楚省得下次再查：
        #   智谱的部分型号（glm-5.3-flash / glm-4.7 / glm-4.6 / glm-5-turbo）
        #   是"先想再答"的推理模型 —— 它先把思考过程写进 reasoning_content，
        #   思考本身就吃掉了几百上千 token。LLM_MAX_TOKENS 只给 800 的话，
        #   额度在"想"的阶段就用完了（finish_reason=length），
        #   正式答案一个字都没写，content 是空的。
        #   实测：同一个问题 glm-4.5-air 3.7 秒 / 350 token 直接给答案，
        #         glm-4.7 想了 800 token 还是空。
        #   → 换 .env 里的 LLM_MODEL 为 glm-4.5-air，或把 LLM_MAX_TOKENS 提到 3000+。
        detail = data.get("usage", {}).get("completion_tokens_details", {})
        current_app.logger.warning(
            "大模型没返回正文：finish_reason=%s，思考用了 %s token（当前上限 %s）。"
            "多为推理模型额度被思考耗尽，建议换 LLM_MODEL 或调大 LLM_MAX_TOKENS。",
            choice.get("finish_reason"), detail.get("reasoning_tokens"), LLM_MAX_TOKENS)
        raise LLMError("AI 没有返回内容，换个问法再试试")

    return answer, tokens


def _today_count(user_id):
    """今天（本地日历日）该用户已经提问了几次。

    只读、给 GET /chat/logs 显示"今天还能问几次"用，所以不需要加锁 ——
    它读到的是"此刻已提交的数量"，差一两条在展示场景下无所谓。
    ★ 真正把关额度的是 _reserve_quota()，那里才需要锁。

    用 created_at 的日期范围来数，而不是把全部记录拉出来在 Python 里数 ——
    记录多了以后（每天 20 条，一个学期就是几千条）那种写法会明显变慢。
    """
    current = now()
    start = datetime(current.year, current.month, current.day)
    return ChatLog.query.filter(
        ChatLog.user_id == user_id,
        ChatLog.created_at >= start,
    ).count()


def _reserve_quota(user_id, question):
    """原子地占用一次提问额度。

    返回 ChatLog 对象 = 额度已占，把它的 answer / tokens_used 补上即可；
    返回 None = 已经超额，调用方该返回 1007。

    ★ 为什么不能写成"先 count 一下、再 insert"？
      那两步之间有時間差，并发时会互相穿插。
      实测（2026-10-09）：同时发 25 个请求，25 个都返回"提问成功"，
      但库里只有 20 条 —— 剩下 5 次白问了：答案没进历史，用户刷新看不到，
      额度也被白占。真实调用模型时，这 5 次就是真金白银的浪费。

    ★ 这里的做法是【锁 users 表那一行】，而不是锁 chat_logs：
      MySQL 的行锁（SELECT ... FOR UPDATE）只能锁【已存在的行】。
      chat_logs 里的行是各自请求刚插的，彼此看不见，所以锁它没用；
      而 users 表里这个用户一定存在，锁住它就等于给"这个用户的额度检查"
      排了个队，并发的请求只能一个个进来。

      为什么不锁完就 commit？因为后面还要生成回答。锁的持有时间覆盖
      "检查额度 → 生成回答 → 落库"整个过程，这个窗口在骨架阶段是毫秒级；
      接上真实模型后会是几秒到几十秒（网络等待）—— 那时可以考虑改成
      "先扣额度再异步补答案"的写法，但那是优化，不是现在该做的事。
    """
    # with_for_update() 在同一个事务里生效，所以必须先 begin。
    # SQLAlchemy 2.x 会自动开启事务，这里显式写出来是为了让读代码的人
    # 一眼看到"锁的边界到哪"。
    db.session.begin_nested()

    # 锁住这个用户行：并发请求在这里排队
    db.session.execute(
        db.select(User).where(User.id == user_id).with_for_update()
    ).scalar_one()

    current = now()
    start = datetime(current.year, current.month, current.day)
    used = (ChatLog.query
            .filter(ChatLog.user_id == user_id,
                    ChatLog.created_at >= start)
            .count())

    if used >= DAILY_LIMIT:
        db.session.rollback()
        return None

    # 占位记录：answer 先留空，等真回答生成后再补上。
    # 先插占位的好处是 —— 如果后面的模型调用抛异常，这一行会跟着回滚，
    # 用户的额度不会被扣掉（"没得到答案就不该扣费"）。
    #
    # ★ 直接把对象返回给调用方，不要让调用方回头"找最新一条 answer=None 的记录"
    #   —— 同一个用户并发提问时，那样的写法会取到别人的那一行。
    placeholder = ChatLog(
        user_id=user_id,
        question=question,
        answer=None,
        tokens_used=None,
        created_at=current,
    )
    db.session.add(placeholder)
    db.session.commit()
    return placeholder


@chat_bp.post("/chat")
def post_chat():
    """向大模型提问。骨架阶段：校验全做、落库全做，只是不真的调模型。"""
    user = current_user()
    if not user:
        return fail(401, "请先登录")

    body = request.get_json(silent=True) or {}
    question = text(body.get("question"))

    # ---- 校验顺序有讲究：先问有没有登录，再问有没有问卷，最后才看问题本身 ----
    # 理由：用户没填问卷时，页面上的"提问框"通常是灰的，前端不该让他走到这一步；
    # 但万一路径写错直接打过来，我们要先给出最该先解决的那个问题（去填问卷）。
    ans = Answer.query.filter_by(user_id=user.id).first()
    if ans is None:
        return fail(1005, "请先完成问卷，我才能针对你的情况回答")

    if not question:
        return fail(1001, "请输入你的问题")

    # 长度校验：question 是 TEXT（65535 字节），超长会直接撞 MySQL 报 1406 变 500。
    # 中文一字约 3 字节，按字符封顶留足余量。
    if len(question) > QUESTION_MAX:
        return fail(1001, f"问题不能超过{QUESTION_MAX}字")

    # 每日次数上限（成本控制）。放在最后校验，这样"没填问卷"的提示更优先。
    # _reserve_quota 内部会锁住 users 那一行，并发请求不会同时通过这一关
    # （见该函数注释里的实测数据）。
    log = _reserve_quota(user.id, question)
    if log is None:
        return fail(1007, "今日提问次数已用完，明天再来")

    status = loads(ans.status_json, {})
    if not isinstance(status, dict):
        status = {}          # 脏数据兜底：库里被手改成数组/字符串时也别 500
    interest = loads(ans.interest_json, [])
    if not isinstance(interest, list):
        interest = []

    # ---- 拼 prompt（真接模型时这个字符串直接发给模型）----
    system_prompt = build_system_prompt(user, ans, status, interest)

    # ---- 生成回答 ----
    # 两种模式在这里分岔（见文件开头的说明）：配了 key 就真调，没配就走骨架。
    api_key, _base_url, model = llm_config()

    if not api_key:
        # 骨架模式：入参、校验、落库全都一样，只是回答是固定文案。
        # 组员本地没配 .env 时走这条，前端靠 data.mock 显示"演示模式"。
        answer_text = fake_answer(question, ans, status, interest)
        tokens_used = 0        # 没有真实调用就固定 0（不要用 -1 之类的怪值，
                               # 免得成本统计把它当成"调用过但没记上"）
        is_mock = True
    else:
        try:
            answer_text, tokens_used = call_real_model(system_prompt, question)
        except LLMError as e:
            # ★ 失败时必须【显式删掉】那条占位记录，不能只 db.session.rollback()：
            #   _reserve_quota() 内部已经 commit 过一次（"先占额度"是为了防并发超发），
            #   那次提交已经把事务结束掉了 —— 现在再 rollback 撤的是当前这个空事务，
            #   占位记录照样躺在库里，结果是：用户额度被白扣一次，
            #   历史列表里还会多出一条没有答案的空记录。
            #   （2026-10-09 那次 25 并发留下 5 条"白问"，就是这个毛病。）
            db.session.delete(log)
            db.session.commit()
            return fail(2001, str(e))     # 只给一句人话，不透堆栈给前端
        is_mock = False

    # ---- 补完整刚才 _reserve_quota 插入的占位记录 ----
    # 直接改那一个对象，不新增 —— 否则一次提问会在库里留两行（占位 + 完整），
    # 历史列表会重复，明天算额度也会多算一次。
    log.answer = answer_text
    log.tokens_used = tokens_used
    db.session.commit()

    return ok({
        "answer": answer_text,
        "tokens_used": tokens_used,
        # mock 现在是真实值了：配了 key 走了模型 = false，没配 = true。
        # 前端拿它显示一小行灰字（如"演示模式"），前端代码不用改。
        "mock": is_mock,
        # 模型名给页面用，可以在角落显示"由 glm-5.3-flash 生成"；
        # 骨架模式下是空串。文档里没有这个字段，是附加的，不影响老前端。
        "model": "" if is_mock else model,
        "system_prompt": system_prompt,
    })


@chat_bp.get("/chat/logs")
def get_chat_logs():
    """我的提问记录，按时间倒序（最近的在最前面）。

    文档 3.6 只要求 POST /api/chat，但 chat_logs 落了库却查不出来，
    等于没法验证"有没有真的记进去"，也没法给页面做历史列表 ——
    所以顺手加上这个只读接口。分页参数与案例接口保持同样的风格。
    """
    user = current_user()
    if not user:
        return fail(401, "请先登录")

    limit = request.args.get("limit", default=LOG_PAGE_SIZE, type=int) or LOG_PAGE_SIZE
    limit = max(1, min(limit, LOG_MAX_SIZE))

    rows = (ChatLog.query
            .filter_by(user_id=user.id)
            .order_by(ChatLog.created_at.desc(), ChatLog.id.desc())
            .limit(limit).all())

    # used 字段告诉前端"今天还能问几次"，避免用户点了 20 次才被告知用完了。
    used = _today_count(user.id)
    return ok({
        "list": [r.to_dict() for r in rows],
        "total": used,
        "daily_limit": DAILY_LIMIT,
        "remaining": max(0, DAILY_LIMIT - used),
    })
