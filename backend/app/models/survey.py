"""问卷域模型：questions 题库表 + answers 用户答案表（第二阶段 · 第一层）

对应 MySQL 表结构见 backend/init.sql，字段必须与之一一对应。
改任何一边都要同步另一边——这是第一周 user/users 不一致踩过的坑。
"""
import json
from datetime import datetime, timezone

from app import db


class Question(db.Model):
    """问卷题目，对应 questions 表。

    ★ options 在数据库里存的是 JSON 字符串（如 '["考研","就业"]'），
    给前端之前必须 json.loads 成数组，否则前端拿到字符串渲染不出选项。
    """

    __tablename__ = "questions"

    id = db.Column(db.Integer, primary_key=True)
    group_name = db.Column(db.String(32), nullable=False)   # direction / status / interest
    content = db.Column(db.String(255), nullable=False)     # 题干
    q_type = db.Column(db.String(16), nullable=False)       # single / multi / text
    options = db.Column(db.Text, nullable=False)            # JSON 数组字符串
    order_no = db.Column(db.Integer, nullable=False)        # 组内排序号
    created_at = db.Column(db.DateTime)

    def to_dict(self):
        """转成接口返回的字典。options 已解析成数组（接口文档硬性要求）。"""
        try:
            opts = json.loads(self.options or "[]")
        except (TypeError, ValueError):
            opts = []   # 数据脏了也不让接口崩，兜底成空数组
        return {
            "id": self.id,
            "group_name": self.group_name,
            "content": self.content,
            "q_type": self.q_type,
            "options": opts,
            "order_no": self.order_no,
        }


class Answer(db.Model):
    """用户问卷答案，对应 answers 表。

    ★ user_id 有 UNIQUE 约束 —— 一个用户只有一份问卷，重复提交要覆盖而不是新增。
    """

    __tablename__ = "answers"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, nullable=False, unique=True, index=True)
    direction = db.Column(db.String(32), nullable=False)    # 主方向
    grade = db.Column(db.String(16))                        # 年级（冗余，方便筛案例）
    status_json = db.Column(db.Text)                        # B 组现状答案，JSON
    interest_json = db.Column(db.Text)                      # C 组想了解什么，JSON
    extra_note = db.Column(db.Text)                         # 补充说明
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def _loads(self, raw, default):
        """JSON 字符串安全转回 Python 对象，解析失败给兜底值"""
        try:
            return json.loads(raw) if raw else default
        except (TypeError, ValueError):
            return default

    def to_dict(self):
        """返回给前端的形状：status/interest 已解析回对象和数组"""
        return {
            "id": self.id,
            "direction": self.direction,
            "grade": self.grade,
            "status": self._loads(self.status_json, {}),
            "interest": self._loads(self.interest_json, []),
            "extra_note": self.extra_note,
            "created_at": self.created_at.strftime("%Y-%m-%d %H:%M:%S") if self.created_at else None,
        }
