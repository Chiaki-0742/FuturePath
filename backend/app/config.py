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

    # ---- 大模型配置（第三层 /api/chat 用）----
    # 已接入智谱 GLM（见 routes/chat.py 的 call_real_model）。
    # key 为空时自动降级为固定文案并返回 data.mock = true，所以留空也能跑通整条链路。
    # ★ key 只填进 backend/.env，不要填进这个文件（.env 已进 .gitignore）
    LLM_API_KEY = os.getenv("LLM_API_KEY", "")
    LLM_BASE_URL = os.getenv("LLM_BASE_URL", "")
    LLM_MODEL = os.getenv("LLM_MODEL", "")
