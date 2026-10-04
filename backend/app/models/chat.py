"""对话域模型：chat_logs 大模型对话记录表（第二阶段 · 第三层）

节后接大模型时使用。现在先把模型和表准备好，接口可以先返回假数据。
tokens_used 用于成本监控——能看出谁用得多、花了多少。
"""
from app import db
from app.utils import now


class ChatLog(db.Model):
    """一条对话记录。对应 chat_logs 表。"""

    __tablename__ = "chat_logs"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, nullable=False, index=True)
    question = db.Column(db.Text, nullable=False)   # 用户问的
    answer = db.Column(db.Text)                     # 模型答的
    tokens_used = db.Column(db.Integer)             # 消耗 token 数（成本监控）
    created_at = db.Column(db.DateTime, default=now, index=True)   # 提问时间（本机时间）

    def to_dict(self):
        return {
            "id": self.id,
            "question": self.question,
            "answer": self.answer,
            "tokens_used": self.tokens_used,
            "created_at": self.created_at.strftime("%Y-%m-%d %H:%M:%S") if self.created_at else None,
        }
