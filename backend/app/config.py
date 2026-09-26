"""应用配置：从 .env 读取数据库地址等敏感信息（密码不写进代码、不进 Git）"""
import os

from dotenv import load_dotenv

load_dotenv()  # 加载 backend/.env 文件


class Config:
    # 数据库连接串，格式：mysql+pymysql://用户名:密码@地址:端口/库名
    SQLALCHEMY_DATABASE_URI = os.getenv("DATABASE_URL", "sqlite:///dev.db")
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    # 用于生成 token 的密钥
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret")
