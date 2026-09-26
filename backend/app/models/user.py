"""users 表模型：一个 User 对象对应数据库 users 表里的一行"""
from datetime import datetime, timezone

from werkzeug.security import check_password_hash, generate_password_hash

from app import db


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)                # 主键，自增编号
    username = db.Column(db.String(20), unique=True, nullable=False, index=True)  # 账号，全表唯一
    password_hash = db.Column(db.String(256), nullable=False)   # 加密后的密码（绝不存明文）
    name = db.Column(db.String(64), nullable=False)             # 姓名
    major = db.Column(db.String(64), nullable=False, default="未填写")  # 专业
    grade = db.Column(db.String(16), nullable=False, default="未填写")  # 年级
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))  # 注册时间

    def set_password(self, raw_password):
        """把明文密码加密后保存"""
        self.password_hash = generate_password_hash(raw_password)

    def check_password(self, raw_password):
        """校验密码：加密后与库里存的对比"""
        return check_password_hash(self.password_hash, raw_password)

    def to_dict(self):
        """转成接口要返回的字典（注意：不含密码）"""
        return {
            "username": self.username,
            "name": self.name,
            "major": self.major,
            "grade": self.grade,
        }
