# 数据库对接说明（C → B）

> **版本**：v2.0 　|　**日期**：2026-10-01 　|　**适用**：第二阶段
>
> ⚠️ **这份文档替换了第一周的旧版**。旧版写的是 `user` 单数表、`VARCHAR(50)`，**已经过时**，
> 现在表名是 `users`、共有 **6 张表**，字段类型也变了。以本文件为准。
>
> 这份文档是 C（数据库）写给 B（后端）的。你写连数据库的代码时照着来就行，
> 表名、字段名、返回格式都对齐好了。

---

## 〇、先做这 4 步（不通就别写代码）

**数据库在每台电脑上是独立的**，你的 MySQL 不会自动和我的同步。
所以 clone 完代码后，你必须自己做一遍下面 4 步：

### 第 1 步：建库建表 + 导入种子数据

```bash
# 在 D:\FuturePath 根目录执行
mysql -u root -p < backend/init.sql
```

> ⚠️ **PowerShell 不认 `<` 符号**，先在 CMD 里执行（`Win+R` → 输入 `cmd`）。
>
> **或者用 DataGrip**（推荐，你们已经在用）：
> 打开 `backend/init.sql` → **Ctrl+A 全选** → **Ctrl+Enter** 执行。
> ★ 一定要全选，否则只会执行光标所在那一句。

**执行成功的标志**：最后看到「6 张表」「题库题数 9」「案例数 10」。

### 第 2 步：装依赖

```bash
cd backend
pip install -r requirements.txt
```

**`cryptography` 千万别漏** —— MySQL 8 的默认认证方式（caching_sha2_password）需要它，
少了会报 `RuntimeError: cryptography package is required`。`requirements.txt` 里已经包含了。

### 第 3 步：建 `.env` 文件（最容易漏的一步）

`backend/.env` **不在 Git 里**（里面是密码，不能上传）。所以 `git pull` 下来是**没有**这个文件的，你自己建。

在 `backend/` 目录下新建文件 `.env`（用 VSCode 或 `notepad .env`），内容**就一行**：

```
DATABASE_URL=mysql+pymysql://root:你的MySQL密码@localhost:3306/futurepath?charset=utf8mb4
```

把 `你的MySQL密码` 换成**你自己电脑上 MySQL 的 root 密码**。

**示例**（假设密码是 `abc123`）：

```
DATABASE_URL=mysql+pymysql://root:abc123@localhost:3306/futurepath?charset=utf8mb4
```

> **密码里如果有特殊字符**（如 `@` `#` `%`），需要 URL 编码，否则解析会出错。
> 常见：`@` → `%40`，`#` → `%23`，`%` → `%25`。
> 密码简单的话不用管这条。

### 第 4 步：启动后端验证

```bash
python run.py
```

**成功的样子**：

```
 * Running on http://127.0.0.1:5000
 * Debugger is active!
```

**没有数据库报错 = 连上了。**

### ✅ 验证是否真的连上

打开 `http://localhost:5173` 注册一个账号，然后在 DataGrip 里查：

```sql
USE futurepath;
SELECT * FROM users;
```

**能看到你刚注册的账号**（`password_hash` 是 `scrypt:32768:8:1$...` 这种长字符串）
就说明浏览器 → 后端 → MySQL 全程打通了。

### 🔧 常见报错速查

| 报错 | 原因 | 解决 |
|------|------|------|
| `Access denied for user 'root'` | `.env` 里密码写错 | 检查密码（含特殊字符） |
| `Unknown database 'futurepath'` | 没跑 `init.sql` | 回去做第 1 步 |
| `cryptography package is required` | 驱动没装 | `pip install cryptography` |
| `Can't connect to MySQL server on 'localhost'` | MySQL 服务没启动 | Windows 服务里找 `MySQL80`，右键启动 |
| 表里查不到数据但页面说注册成功 | 前端走了 Mock | 检查 `frontend/.env` 是不是 `VITE_USE_MOCK=false`，改完**重启** `npm run dev` |

---

## 一、连接信息

```
数据库名：futurepath
主机：localhost
端口：3306
用户名：root
密码：你自己的本地 MySQL 密码（每台机器不一样，别抄我的）
字符集：utf8mb4
```

---

## 二、表结构（6 张表）

### 关系图

```
users (用户，第一阶段已有)
  │
  ├──1:1── answers      一份问卷（user_id 是 UNIQUE）
  └──1:N── chat_logs    多条对话记录

cases (案例)
  │
  └──1:N── case_steps   多条步骤明细

questions (题库，独立表，不被外键引用)
```

### 2.1 `users` —— 用户表（第一阶段，沿用）

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | INT PK AI | 主键 |
| `username` | VARCHAR(20) UNIQUE | 登录名，**全表唯一**，重复插入报错 |
| `password_hash` | VARCHAR(256) | ★ **存哈希，绝不存明文** |
| `name` | VARCHAR(64) | 姓名 |
| `major` | VARCHAR(64) NOT NULL | 专业，未填时后端写「未填写」 |
| `grade` | VARCHAR(16) NOT NULL | 年级，未填时后端写「未填写」 |
| `created_at` | DATETIME NULL | 注册时间，**由后端写入 UTC 时间**（数据库不自动填） |

### 2.2 `questions` —— 问卷题库

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | INT PK AI | 主键 |
| `group_name` | VARCHAR(32) | 分组：`direction` / `status` / `interest` |
| `content` | VARCHAR(255) | 题干 |
| `q_type` | VARCHAR(16) | `single` 单选 / `multi` 多选 / `text` 填空 |
| `options` | TEXT | **JSON 数组字符串**，如 `["考研","就业"]` |
| `order_no` | INT | 组内排序号 |
| `created_at` | DATETIME NULL | 创建时间 |

> ★ **`options` 读出来必须 `json.loads()` 再返回**，否则前端拿到的是字符串，渲染不出选项。

### 2.3 `answers` —— 用户问卷答案

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | INT PK AI | 主键 |
| `user_id` | INT NOT NULL **UNIQUE** | ★ 一个用户只有一份问卷 |
| `direction` | VARCHAR(32) | 主方向 |
| `grade` | VARCHAR(16) NULL | 年级（冗余字段，方便筛案例） |
| `status_json` | TEXT NULL | B 组现状答案，JSON |
| `interest_json` | TEXT NULL | C 组想了解什么，JSON |
| `extra_note` | TEXT NULL | 补充说明 |
| `created_at` | DATETIME NULL | 填写时间 |

> ★ **`user_id` 是 UNIQUE** —— 重复提交要「有则改、无则插」，不能直接 INSERT。
> 有索引：`idx_direction`。

### 2.4 `cases` —— 案例主表

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | INT PK AI | 主键 |
| `title` | VARCHAR(128) NOT NULL | 标题 |
| `direction` | VARCHAR(32) NOT NULL | 方向：考研/就业/考公/保研/留学 |
| `school_level` | VARCHAR(32) NULL | 学校层次 |
| `major_type` | VARCHAR(32) NULL | 专业类型 |
| `grade` | VARCHAR(16) NULL | 起始年级 |
| `score_level` | VARCHAR(32) NULL | 成绩水平 |
| `summary` | TEXT NULL | 一句话概述（列表页显示） |
| `experience` | TEXT NULL | 经验教训（详情页显示） |
| `result` | VARCHAR(255) NULL | 最终结果 |
| `created_at` | DATETIME NULL | 创建时间 |

> 有组合索引：`idx_direction_grade (direction, grade)` —— 按方向+年级查案例走这个索引。

### 2.5 `case_steps` —— 案例步骤明细

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | INT PK AI | 主键 |
| `case_id` | INT NOT NULL | 关联 `cases.id` |
| `phase` | VARCHAR(64) NOT NULL | 阶段，如「大三上」「暑假」 |
| `content` | TEXT NOT NULL | 该阶段做了什么 |
| `is_key` | TINYINT NOT NULL DEFAULT 0 | **1 = 关键节点**（报名、考试这类），前端要高亮 |
| `order_no` | INT NOT NULL | 展示顺序 |

> 有索引：`idx_case_id`。

### 2.6 `chat_logs` —— 大模型对话记录

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | INT PK AI | 主键 |
| `user_id` | INT NOT NULL | 提问用户 |
| `question` | TEXT NOT NULL | 用户问的 |
| `answer` | TEXT NULL | 模型答的 |
| `tokens_used` | INT NULL | 消耗 token 数（**用于成本监控**） |
| `created_at` | DATETIME NULL | 提问时间 |

> 有索引：`idx_user_id`、`idx_created_at`（按天统计用量会用到）。

---

## 三、连数据库的代码

### 3.1 优先用 SQLAlchemy（推荐）

你们现在的架构是 **SQLAlchemy + 环境变量兜底**，新增代码请沿用这个方式，不要写裸 `pymysql`。

配置思路（`config.py` 或 `extensions.py`）：

```python
import os

# ★ 关键：有 .env 就用 MySQL，没有就降级到 SQLite
# 这样 B、A clone 下来没建 .env 也能直接跑起来，不会卡住
SQLALCHEMY_DATABASE_URI = os.getenv(
    "DATABASE_URL",
    "sqlite:///dev.db",           # 兜底：backend/instance/dev.db
)
SQLALCHEMY_TRACK_MODIFICATIONS = False
```

**为什么要有兜底**：`.env` 不进 Git（密码不能公开），
所以别人 clone 下来是没有这个文件的。有兜底就不会卡在启动那一步。

### 3.2 如果确实要用裸 pymysql

`init.sql` 建的是 MySQL 库，直接用 pymysql 也行。但**别再把密码写死在代码里**，从环境变量读：

```python
import os
import pymysql
from dotenv import load_dotenv   # 需要 pip install python-dotenv

load_dotenv()   # 读 backend/.env

def get_conn():
    """获取数据库连接。用完记得 close（或用 with 语句）"""
    url = os.getenv("DATABASE_URL")   # mysql+pymysql://root:pwd@localhost:3306/futurepath?charset=utf8mb4
    # 解析出 host/user/password/database 后连
    ...
```

> 说实话，既然已经有 SQLAlchemy 了，**不建议再引入一套 pymysql 写法**，
> 两套并存容易乱。统一成 SQLAlchemy 最省事。

---

## 四、四个必须注意的坑

### 坑 1：密码存哈希，绝不存明文

```python
from werkzeug.security import generate_password_hash, check_password_hash

# 注册：存哈希
hashed = generate_password_hash(password)

# 登录：拿哈希比对（不要自己写字符串比较！）
if user and check_password_hash(user.password_hash, password):
    ...  # 登录成功
```

> 数据库一旦泄露（截图、日志、备份），明文密码直接曝光。哈希之后也还原不出原密码。

### 坑 2：`username` 唯一，重复插入会抛异常

`users.username` 是 UNIQUE，插已存在的用户名会报 `IntegrityError`。
注册接口要 `try/except` 捕获，返回友好提示：

```python
from sqlalchemy.exc import IntegrityError

try:
    db.session.add(new_user)
    db.session.commit()
except IntegrityError:
    db.session.rollback()
    return fail(1003, "用户名已存在")
```

> ★ **`db.session.rollback()` 不能少** —— 出错后不 rollback，session 会一直处于坏状态，
> 后续所有数据库操作全部失败。这是 SQLAlchemy 新手最常踩的坑。

### 坑 3：SQL 参数用占位符，别用字符串拼接

```python
# ❌ 危险：SQL 注入
db.session.execute(f"SELECT * FROM users WHERE username = '{username}'")

# ✅ 安全：参数化
db.session.execute(text("SELECT * FROM users WHERE username = :u"), {"u": username})
```

> 拼接的话，用户输入 `' OR '1'='1` 就能把整张表捞走。

### 坑 4：`answers` 的 `user_id` 是 UNIQUE，用「有则改、无则插」

不能直接 INSERT，第二次提交会撞唯一约束。正确写法：

```python
ans = Answers.query.filter_by(user_id=uid).first()
if ans is None:
    ans = Answers(user_id=uid)
    db.session.add(ans)

ans.direction = direction
ans.grade = grade
ans.status_json = json.dumps(status, ensure_ascii=False)      # ★ 存 JSON 字符串
ans.interest_json = json.dumps(interest, ensure_ascii=False)
ans.extra_note = extra_note
db.session.commit()
```

> ★ `json.dumps(..., ensure_ascii=False)` 的 `ensure_ascii=False` 不能漏，
> 否则中文会被转义成 `\u8003\u7814` 这种，虽然能存但不好排查。

---

## 五、第二阶段要用的 SQL 片段

直接拿去用，字段名都对好了。

### 5.1 取问卷题目（按分组和序号排）

```sql
SELECT id, group_name, content, q_type, options, order_no
FROM questions
ORDER BY FIELD(group_name, 'direction', 'status', 'interest'), order_no;
```

> `FIELD()` 让三组按「方向 → 现状 → 想了解」的固定顺序返回，不依赖 id。
> 取出后记得 `json.loads(row.options)`。

### 5.2 查案例列表（按方向+年级，走组合索引）

```sql
SELECT id, title, direction, school_level, major_type, grade, score_level, summary, result
FROM cases
WHERE direction = %s
ORDER BY (grade = %s) DESC, id      -- 年级相同的排前面
LIMIT %s;
```

> **注意不要 SELECT `experience`** —— 列表页不需要，字段又大，拖慢查询。
> 详情页再取。

### 5.3 案例详情 + 步骤（一次 JOIN，别循环查）

```sql
-- 案例主体
SELECT * FROM cases WHERE id = %s;

-- 步骤（按 order_no 升序）
SELECT phase, content, is_key, order_no
FROM case_steps
WHERE case_id = %s
ORDER BY order_no;
```

> ⚠️ **不要写成「查出案例列表 → 循环里再查每个案例的步骤」** —— 这就是 N+1 问题，
> 10 条案例查 11 次数据库。要么一次 JOIN 出来，要么分批 IN 查询。

### 5.4 统计今天的提问次数（用来限流）

```sql
SELECT COUNT(*) AS cnt
FROM chat_logs
WHERE user_id = %s AND DATE(created_at) = CURDATE();
```

> 超过上限（比如 20 次）就返回错误码 `1007`。走 `idx_user_id` + `idx_created_at` 索引。

### 5.5 拼大模型上下文（查问卷）

```sql
SELECT direction, grade, status_json, interest_json, extra_note
FROM answers
WHERE user_id = %s;
-- 查不到 → 返回 1005「请先完成问卷」
```

---

## 六、接口对照（第二阶段）

详细定义见 `docs/接口文档-第二阶段.md`，这里只列和数据库相关的部分：

| 接口 | 方法 | 读/写的表 | 关键点 |
|------|------|----------|--------|
| `/api/questions` | GET | `questions` | `options` 要 `json.loads` |
| `/api/answers` | POST | `answers` | user_id UNIQUE，有则改无则插 |
| `/api/answers` | GET | `answers` | 没填过返回 `filled:false`，**不报错** |
| `/api/cases` | GET | `cases` | 无结果时放宽为只按 direction |
| `/api/cases/<id>` | GET | `cases` + `case_steps` | JOIN 查，别 N+1 |
| `/api/chat` | POST | `answers` + `chat_logs` | 先查问卷拼上下文，再记用量 |

统一返回格式（沿用第一阶段，不要改）：

```json
{ "code": 0, "msg": "成功", "data": {} }
```

新增错误码：`1005` 问卷未填写、`1006` 问卷格式不对、`1007` 提问太频繁、`2001` 大模型异常。

---

## 七、怎么验证你连上了

```python
# 在 backend 目录下建个 test_db.py
from app import create_app, db
from sqlalchemy import text

app = create_app()
with app.app_context():
    rows = db.session.execute(text("SELECT id, username FROM users")).fetchall()
    print(rows)
    n = db.session.execute(text("SELECT COUNT(*) FROM cases")).scalar()
    print("案例数:", n)
```

跑 `python test_db.py`：

- 打印出用户列表 + `案例数: 10` → **连上了 ✅**
- 报 `Unknown database` → 没跑 `init.sql`
- 报 `Access denied` → `.env` 密码错
- 打印空列表但没报错 → 你连的是 SQLite 兜底，`.env` 没生效

---

## 八、有问题找我

| 现象 | 先看这里 |
|------|---------|
| 连不上数据库 | `.env` 是否存在、密码对不对、MySQL 服务启动没 |
| `Unknown database 'futurepath'` | 你没执行 `init.sql` |
| 表里没数据但页面说成功 | `frontend/.env` 的 `VITE_USE_MOCK=false`，改完重启 |
| 想改字段 | **先在群里说**，我改 `init.sql`，你改模型，两边必须同步 |

> ★ **表结构以 `backend/init.sql` 为准**。改任何一边都要同步另一边——这是第一周踩过的坑。

---

**附：`init.sql` 已经推到 GitHub 了，`git pull` 就能拿到。记得自己建 `.env`（它不在仓库里）。**
