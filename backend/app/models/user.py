"""users 表模型：一个 User 对象对应数据库 users 表里的一行"""
from werkzeug.security import check_password_hash, generate_password_hash

from app import db
from app.utils import now


def normalize_answer(raw):
    """把密保答案归一化，再拿去比对。

    为什么不能直接比对原文：
      用户设置时写的是「毛毛」，找回时可能手滑打成「毛毛 」或者「Maomao」，
      严格比对会让他觉得"我明明答对了却说我错"，然后跑去重注册账号。
      所以统一做三步：去掉首尾空白 → 中间连续空白压成一个 → 全转小写。
    中文不受大小写影响，这一步主要是为了照顾英文和数字答案。
    """
    return " ".join(str(raw or "").split()).lower()


class User(db.Model):
    """一个用户。对应 users 表。"""

    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)                # 主键，自增编号
    username = db.Column(db.String(20), unique=True, nullable=False, index=True)  # 账号，全表唯一
    password_hash = db.Column(db.String(256), nullable=False)   # 加密后的密码（绝不存明文）
    name = db.Column(db.String(64), nullable=False)             # 姓名
    major = db.Column(db.String(64), nullable=False, default="未填写")  # 专业
    grade = db.Column(db.String(16), nullable=False, default="未填写")  # 年级
    created_at = db.Column(db.DateTime, default=now)  # 注册时间（本机时间，见 utils.now 注释）

    # ---- 密保问题（忘记密码时用来自助重置密码）----
    # 两个都可为空：老账号、或者注册时没填的人就是 NULL —— 他们走不了自助找回，
    # 所以查询接口要先判这两列是不是空的（见 auth.py 的 1008）。
    # ★ 答案同样只存哈希，不存明文：密保答案往往就是"妈妈的名字"这种真实信息，
    #   一旦拖库，明文答案的危害不比明文密码小。
    security_question = db.Column(db.String(64))
    security_answer_hash = db.Column(db.String(256))

    def set_password(self, raw_password):
        """把明文密码加密后保存"""
        self.password_hash = generate_password_hash(raw_password)

    def check_password(self, raw_password):
        """校验密码：加密后与库里存的对比"""
        return check_password_hash(self.password_hash, raw_password)

    def set_security_answer(self, raw_answer):
        """保存密保答案（先归一化再哈希）"""
        self.security_answer_hash = generate_password_hash(normalize_answer(raw_answer))

    def check_security_answer(self, raw_answer):
        """校验密保答案。没设过密保的一律返回 False（不要抛异常）"""
        if not self.security_answer_hash:
            return False
        return check_password_hash(self.security_answer_hash, normalize_answer(raw_answer))

    def has_security(self):
        """这个人能不能走自助找回？问题和答案都在才算数"""
        return bool(self.security_question and self.security_answer_hash)

    def to_dict(self):
        """转成接口要返回的字典（注意：不含密码，也不含密保答案）"""
        return {
            "username": self.username,
            "name": self.name,
            "major": self.major,
            "grade": self.grade,
        }
