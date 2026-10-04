"""案例域模型：cases 案例主表 + case_steps 步骤明细表（第二阶段 · 第二层）

对应 MySQL 表结构见 backend/init.sql。
一条案例（Case）对应多条步骤（CaseStep），1:N 关系。
"""
from app import db


class Case(db.Model):
    """案例主表。一条 = 一个真实感的人物画像 + 他走过的路。"""

    __tablename__ = "cases"

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(128), nullable=False)
    direction = db.Column(db.String(32), nullable=False)    # 考研/就业/考公/保研/留学
    school_level = db.Column(db.String(32))                 # 学校层次
    major_type = db.Column(db.String(32))                   # 专业类型
    grade = db.Column(db.String(16))                        # 起始年级
    score_level = db.Column(db.String(32))                  # 成绩水平
    summary = db.Column(db.Text)                            # 一句话概述（列表页）
    experience = db.Column(db.Text)                         # 经验教训（详情页）
    result = db.Column(db.String(255))                      # 最终结果
    created_at = db.Column(db.DateTime)

    def to_dict(self, detail=False):
        """detail=False → 列表页用（故意不带 experience，字段大、拖慢查询）
        detail=True  → 详情页用（带 experience 和 steps，steps 由接口另行查）
        """
        data = {
            "id": self.id,
            "title": self.title,
            "direction": self.direction,
            "school_level": self.school_level,
            "major_type": self.major_type,
            "grade": self.grade,
            "score_level": self.score_level,
            "summary": self.summary,
            "result": self.result,
        }
        if detail:
            data["experience"] = self.experience
        return data


class CaseStep(db.Model):
    """案例步骤明细。is_key=1 表示关键节点（报名、考试这类），前端要高亮。"""

    __tablename__ = "case_steps"

    id = db.Column(db.Integer, primary_key=True)
    case_id = db.Column(db.Integer, nullable=False, index=True)
    phase = db.Column(db.String(64), nullable=False)        # 阶段，如"大三上""暑假"
    content = db.Column(db.Text, nullable=False)            # 该阶段做了什么
    is_key = db.Column(db.Integer, nullable=False, default=0)   # 1=关键节点
    order_no = db.Column(db.Integer, nullable=False)        # 展示顺序

    def to_dict(self):
        return {
            "phase": self.phase,
            "content": self.content,
            "is_key": self.is_key,
            "order_no": self.order_no,
        }
