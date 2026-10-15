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

    # 每人每天能问几次；0 或负数 = 不限制。
    # 为什么默认是 20：接口文档 3.6 节点名要求做「每日次数上限」（验收表上也有
    # 打勾的一项），所以仓库里的默认行为必须保留它。
    # 开发、调试、演示时如果嫌 20 次不够，在 backend/.env 里加一行
    # LLM_DAILY_LIMIT=0 就解开了 —— 只影响本机，不会改掉别人的默认值。
    # （这里的 `or "20"` 是安全的：环境变量读出来永远是字符串，
    #   "0" 是非空字符串、不会被 or 吃掉；真正要小心的是下游把它当数字用的时候。）
    LLM_DAILY_LIMIT = int(os.getenv("LLM_DAILY_LIMIT") or "20")
