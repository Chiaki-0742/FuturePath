-- ===========================================================================
-- FuturePath 数据库初始化脚本（完整版 · 第二阶段）
-- 负责人：C（数据库）
-- 日期：2026-10-01
-- ===========================================================================
-- 【这个文件干什么的】
--   一条脚本重建整个 futurepath 库：users（第一阶段）+ 5 张新表（第二阶段）。
--   新同学 clone 下来，执行这一个文件就有完整的库和种子数据。
--
-- 【怎么执行】
--   DataGrip：打开本文件 → Ctrl+A 全选 → Ctrl+Enter 执行
--   ★ 一定要全选，否则只执行光标所在那一句
--
--   命令行：
--       mysql -u root -p < init.sql
--       ⚠️ PowerShell 不认 < 符号，先敲 cmd 切到命令提示符再执行
--
-- 【执行成功的标志】
--   最后会显示「✅ 6 张表都建好了」和题数、案例数
--
-- 【报 ERROR 1067 Invalid default value 怎么办】
--   说明 futurepath 库的字符集不是 utf8mb4。先删库再重建：
--       mysql -u root -p -e "DROP DATABASE IF EXISTS futurepath;"
--   然后重新执行本文件（本文件第 1 步会自动重建库）
--
-- ===========================================================================
-- ⚠️⚠️⚠️  最 高 级 别 警 告  ⚠️⚠️⚠️
--
--   本文件里所有 DROP TABLE 都会【清空对应表的全部数据】，且无法恢复！
--
--   ✔ 开发阶段：反复重建很方便，随便跑
--   ✘ 上线之后：绝对不能再执行本文件！
--
--   ★ 备份数据库：
--       mysqldump -u root -p futurepath > backup_20261001.sql
--   ★ 上线前：把所有 DROP TABLE 语句删掉，或改用单独的迁移脚本
-- ===========================================================================
-- 表结构以 backend/app/models/ 下的 SQLAlchemy 模型为准。
-- 两边字段必须保持一致，改任何一边都要同步另一边（这是第一周踩过的坑）。
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 第 1 步：创建数据库
-- ---------------------------------------------------------------------------
-- IF NOT EXISTS：已存在就不重复建，重复执行不会报错。
-- 但注意：如果之前用别的字符集建过，这句不会改字符集，需要先 DROP 掉。

CREATE DATABASE IF NOT EXISTS futurepath
    DEFAULT CHARACTER SET utf8mb4
    DEFAULT COLLATE utf8mb4_unicode_ci;

-- 切换到刚创建的数据库，后面的操作都在这个库里进行
USE futurepath;


-- ---------------------------------------------------------------------------
-- 第 2 步：users —— 用户表（第一阶段）
-- ---------------------------------------------------------------------------
-- 表名是 users（复数），必须和 models 里的 __tablename__ 一致，
-- 否则 SQLAlchemy 找不到表，会报 Table does not exist。
--
-- ⚠️ DROP TABLE 会清空 users 表的数据！

DROP TABLE IF EXISTS `users`;

CREATE TABLE `users` (
    -- id：主键，自动增长，系统内部用它区分用户
    `id` INT AUTO_INCREMENT PRIMARY KEY COMMENT '用户ID，主键',

    -- username：登录账号，3-20 位字母或数字，长度限制在接口层校验。
    -- UNIQUE 表示不能重复，数据库层面加一层保护。
    `username` VARCHAR(20) NOT NULL UNIQUE COMMENT '登录用户名，全表唯一',

    -- password_hash：重点，存的是加密后的密码，不是明文。
    -- 留 256 长是因为哈希算法结果很长（Werkzeug 的 pbkdf2 约 100 位以上）。
    -- 千万不要改成 password 存明文，数据库一旦泄露，所有密码全曝光。
    `password_hash` VARCHAR(256) NOT NULL COMMENT '密码哈希值，不是明文',

    -- name：真实姓名，用于页面显示欢迎语
    `name` VARCHAR(64) NOT NULL COMMENT '用户姓名',

    -- major：专业。后端模型是 NOT NULL，Python 层 default="未填写"，
    -- 用户没填时由后端写入 未填写，数据库层不重复设默认值。
    `major` VARCHAR(64) NOT NULL COMMENT '专业，未填时后端写入 未填写',

    -- grade：年级。规则同 major。
    `grade` VARCHAR(16) NOT NULL COMMENT '年级，未填时后端写入 未填写',

    -- created_at：注册时间，由后端 Python 代码写入（UTC 时间），
    -- 不是数据库自动填，所以这里不加 DEFAULT CURRENT_TIMESTAMP。
    `created_at` DATETIME DEFAULT NULL COMMENT '注册时间，由后端写入 UTC 时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表';


-- ---------------------------------------------------------------------------
-- 第 3 步：插入一条测试数据，验证 users 表建对了
-- ---------------------------------------------------------------------------
-- 注意：password_hash 这里是占位符，不能用来登录（登录会校验失败）。
-- 真正的注册数据由后端接口写入，不需要手工 INSERT。

INSERT INTO `users` (`username`, `password_hash`, `name`, `major`, `grade`)
VALUES ('testuser', 'placeholder', '测试用户', '计算机科学与技术', '大一');


-- ---------------------------------------------------------------------------
-- 第 4 步：questions —— 问卷题库（第二阶段 · 第一层）
-- ---------------------------------------------------------------------------
-- 把题目存在表里而不是写死在代码里：以后加题、改选项只改数据，不用改代码重新部署。

DROP TABLE IF EXISTS `questions`;

CREATE TABLE `questions` (
    `id`         INT AUTO_INCREMENT PRIMARY KEY COMMENT '题目ID，主键',
    `group_name` VARCHAR(32)  NOT NULL COMMENT '分组：direction方向 / status现状 / interest想了解',
    `content`    VARCHAR(255) NOT NULL COMMENT '题干',
    `q_type`     VARCHAR(16)  NOT NULL COMMENT '题型：single单选 / multi多选 / text填空',
    `options`    TEXT         NOT NULL COMMENT '选项，JSON数组，如 ["考研","就业"]',
    `order_no`   INT          NOT NULL COMMENT '同一分组内的排序号',
    `created_at` DATETIME     DEFAULT NULL COMMENT '创建时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='问卷题库表';


-- ---------------------------------------------------------------------------
-- 第 5 步：answers —— 用户问卷答案（第二阶段 · 第一层）
-- ---------------------------------------------------------------------------
-- user_id 加 UNIQUE：一个用户只保留一份问卷，重复提交则覆盖（不新增记录）。

DROP TABLE IF EXISTS `answers`;

CREATE TABLE `answers` (
    `id`            INT AUTO_INCREMENT PRIMARY KEY COMMENT '答案ID，主键',
    `user_id`       INT          NOT NULL COMMENT '用户ID，关联 users.id',
    `direction`     VARCHAR(32)  NOT NULL COMMENT '主方向：考研/就业/考公/留学/创业/还没想好',
    `grade`         VARCHAR(16)  DEFAULT NULL COMMENT '年级（冗余字段，方便按年级筛案例）',
    `status_json`   TEXT         DEFAULT NULL COMMENT '现状答案，JSON格式',
    `interest_json` TEXT         DEFAULT NULL COMMENT '想了解什么，JSON格式',
    `extra_note`    TEXT         DEFAULT NULL COMMENT '用户补充说明',
    `created_at`    DATETIME     DEFAULT NULL COMMENT '填写时间',
    UNIQUE KEY `uk_user_id` (`user_id`),
    KEY `idx_direction` (`direction`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户问卷答案表';


-- ---------------------------------------------------------------------------
-- 第 6 步：cases —— 案例主表（第二阶段 · 第二层）
-- ---------------------------------------------------------------------------
-- 每条案例 = 一个真实感的人物画像 + 他走过的路。

DROP TABLE IF EXISTS `cases`;

CREATE TABLE `cases` (
    `id`           INT AUTO_INCREMENT PRIMARY KEY COMMENT '案例ID，主键',
    `title`        VARCHAR(128) NOT NULL COMMENT '案例标题，如"双非计算机大三考研上岸211"',
    `direction`    VARCHAR(32)  NOT NULL COMMENT '方向：考研/就业/考公/留学/创业',
    `school_level` VARCHAR(32)  DEFAULT NULL COMMENT '学校层次：985/211/普通一本/二本/专科',
    `major_type`   VARCHAR(32)  DEFAULT NULL COMMENT '专业类型：理工类/文史类/经管类等',
    `grade`        VARCHAR(16)  DEFAULT NULL COMMENT '起始年级：大一/大二/大三/大四',
    `score_level`  VARCHAR(32)  DEFAULT NULL COMMENT '成绩水平：前10%/前30%/中等/偏下',
    `summary`      TEXT         DEFAULT NULL COMMENT '一句话概述，列表页显示',
    `experience`   TEXT         DEFAULT NULL COMMENT '经验教训、踩过的坑',
    `result`       VARCHAR(255) DEFAULT NULL COMMENT '最终结果，如"已上岸某211"',
    `created_at`   DATETIME     DEFAULT NULL COMMENT '创建时间',
    KEY `idx_direction_grade` (`direction`, `grade`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='案例主表';


-- ---------------------------------------------------------------------------
-- 第 7 步：case_steps —— 案例步骤明细（第二阶段 · 第二层）
-- ---------------------------------------------------------------------------
-- 一条案例对应多条步骤（1:N）。

DROP TABLE IF EXISTS `case_steps`;

CREATE TABLE `case_steps` (
    `id`       INT AUTO_INCREMENT PRIMARY KEY COMMENT '步骤ID，主键',
    `case_id`  INT          NOT NULL COMMENT '所属案例ID，关联 cases.id',
    `phase`    VARCHAR(64)  NOT NULL COMMENT '阶段，如"大三上"/"暑假"',
    `content`  TEXT         NOT NULL COMMENT '该阶段做了什么',
    `is_key`   TINYINT      NOT NULL DEFAULT 0 COMMENT '是否关键节点：1是 0否',
    `order_no` INT          NOT NULL COMMENT '展示顺序',
    KEY `idx_case_id` (`case_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='案例步骤明细表';


-- ---------------------------------------------------------------------------
-- 第 8 步：chat_logs —— 大模型对话记录（第二阶段 · 第三层）
-- ---------------------------------------------------------------------------
-- 节后接大模型时用，现在先建好表，接口可以先返回假数据。
-- tokens_used 用于成本监控：能看出谁用得多、花了多少。

DROP TABLE IF EXISTS `chat_logs`;

CREATE TABLE `chat_logs` (
    `id`          INT AUTO_INCREMENT PRIMARY KEY COMMENT '记录ID，主键',
    `user_id`     INT      NOT NULL COMMENT '提问用户ID，关联 users.id',
    `question`    TEXT     NOT NULL COMMENT '用户问的问题',
    `answer`      TEXT     DEFAULT NULL COMMENT '模型回答',
    `tokens_used` INT      DEFAULT NULL COMMENT '消耗token数，用于控成本',
    `created_at`  DATETIME DEFAULT NULL COMMENT '提问时间',
    KEY `idx_user_id` (`user_id`),
    KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='大模型对话记录表';


-- ---------------------------------------------------------------------------
-- 第 9 步：种子数据 —— 问卷题库
-- ---------------------------------------------------------------------------
-- 共 9 题，分三组：A组方向 1 题 + B组现状 6 题 + C组想了解 2 题。
-- 设计约束：总题数不超过 10 题，控制在 2 分钟内填完。
--
-- 不需要 DELETE：上面刚 DROP 重建过，表本来就是空的。
-- 补 DELETE 反而会在 DataGrip 里弹「不安全的查询」警告。

INSERT INTO `questions` (group_name, content, q_type, options, order_no, created_at) VALUES
-- A 组：未来方向
('direction', '你毕业后最想走哪条路？', 'single',
 '["考研","就业","考公","留学","创业","还没想好"]', 1, NOW()),
-- B 组：当前现状
('status', '你现在大几？', 'single',
 '["大一","大二","大三","大四","研究生"]', 1, NOW()),
('status', '你的专业属于哪一类？', 'single',
 '["理工类","文史类","经管类","艺术类","医学类","其他"]', 2, NOW()),
('status', '你的学校属于哪个层次？', 'single',
 '["985/211","普通一本","二本","专科"]', 3, NOW()),
('status', '你的成绩在专业里大概什么水平？', 'single',
 '["前10%","前30%","中等","偏下"]', 4, NOW()),
('status', '你的英语水平？', 'single',
 '["已过六级","已过四级","未过四级"]', 5, NOW()),
('status', '你已经有哪些经历？（可多选）', 'multi',
 '["实习","科研","竞赛获奖","学生工作","项目经历","都没有"]', 6, NOW()),
-- C 组：想了解什么
('interest', '你最想搞清楚哪些问题？（最多选3个）', 'multi',
 '["该选哪条路","每条路的利弊","具体怎么准备","时间节点怎么安排","需要具备什么能力","怎么弥补短板"]', 1, NOW()),
('interest', '还有什么想告诉我们的？（选填）', 'text',
 '[]', 2, NOW());


-- ---------------------------------------------------------------------------
-- 第 10 步：种子数据 —— 案例
-- ---------------------------------------------------------------------------
-- 目标 10 条，覆盖 5 个方向（考研 / 就业 / 考公 / 留学 / 创业）。
-- 下面目前是 2 条示例，C 按同样格式补齐到 10 条即可。
-- 完整的 19 条素材见 docs/真实人物案例库.md。

INSERT INTO `cases` (title, direction, school_level, major_type, grade, score_level, summary, experience, result, created_at) VALUES
('双非计算机大三考研上岸 211',
 '考研', '普通一本', '理工类', '大三', '前30%',
 '大三上定校，暑假强化刷题，12月一战上岸。',
 '最大的坑是数学开始太晚，大三下才正式复习，暑假一度跟不上进度。建议数学最晚大三上就开始。',
 '已上岸某 211 计算机专硕', NOW()),

('二本经管类大四秋招进银行',
 '就业', '二本', '经管类', '大四', '中等',
 '大三暑假实习，大四秋招投递 60 家，最终拿到城商行 offer。',
 '简历上没实习经历是最致命的。大三暑假一定要去实习，哪怕不给钱。银行笔试的行测题要提前一个月刷。',
 '已签约某城商行管培生', NOW());


-- 案例步骤（case_id 对应上面插入的顺序：1=考研案例，2=就业案例）
INSERT INTO `case_steps` (case_id, phase, content, is_key, order_no) VALUES
-- 案例1：考研
(1, '大三上', '确定目标院校和专业，收集历年分数线、报录比；开始数学一轮复习', 1, 1),
(1, '大三上', '英语单词每天 50 个，不中断', 0, 2),
(1, '大三下', '数学二轮强化；专业课教材过一遍并做笔记', 0, 3),
(1, '大三下', '英语开始做真题阅读，一周 2 套', 0, 4),
(1, '暑假', '数学刷 1000 题；专业课背诵第一轮；英语真题精读', 1, 5),
(1, '大四上', '政治冲刺；各科真题模拟；调整作息到考试节奏', 0, 6),
(1, '9月-10月', '关注研招网，9 月预报名、10 月正式报名（错过就只能等明年）', 1, 7),
(1, '12月', '打印准考证，提前踩点考场，参加初试', 1, 8),
-- 案例2：就业
(2, '大三下', '开始准备简历；了解银行招聘流程和时间线', 0, 1),
(2, '大三暑假', '争取银行或相关行业实习（实习经历是简历的敲门砖）', 1, 2),
(2, '大四上 9-10月', '秋招主战场：网申、笔试、面试同步进行', 1, 3),
(2, '大四上', '提前一个月刷行测题，银行笔试必考', 0, 4),
(2, '大四上 11-12月', '面试复盘，多投多练；拿到 offer 后及时签约', 0, 5);


-- ---------------------------------------------------------------------------
-- 第 11 步：验证 —— 看到结果就说明一切正常
-- ---------------------------------------------------------------------------

-- 11.1 六张表是否都在
SELECT TABLE_NAME AS 表名, TABLE_COMMENT AS 说明
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'futurepath'
ORDER BY TABLE_NAME;

-- 11.2 题库题数（应该是 9）
SELECT COUNT(*) AS 题库题数 FROM `questions`;

-- 11.3 案例条数（现在是 2，补齐后应该是 10）
SELECT COUNT(*) AS 案例条数 FROM `cases`;

-- 11.4 案例一览
SELECT id, title, direction, grade, result FROM `cases`;

-- 11.5 一条完整的案例看长什么样（含步骤）
SELECT c.title, s.phase, s.content, s.is_key
FROM `cases` c
JOIN `case_steps` s ON s.case_id = c.id
WHERE c.id = 1
ORDER BY s.order_no;


-- ===========================================================================
-- 【验收标准】
--   1. 第 11.1 步能看到 6 张表：
--      answers / case_steps / cases / chat_logs / questions / users
--   2. 第 11.2 步题库题数 = 9
--   3. 第 11.3 步案例条数 >= 2（补齐后 = 10）
--   4. 第 11.5 步能看到考研案例的 8 条步骤
--
-- 【和后端的一致性检查表】改字段时对照，两边都要改
--   users 表：
--   字段            MySQL 类型        SQLAlchemy 定义
--   id              INT PK AI         Integer, primary_key
--   username        VARCHAR(20) UQ    String(20), unique, index
--   password_hash   VARCHAR(256)      String(256)
--   name            VARCHAR(64)       String(64)
--   major           VARCHAR(64) NN    String(64), NOT NULL, default 未填写
--   grade           VARCHAR(16) NN    String(16), NOT NULL, default 未填写
--   created_at      DATETIME NULL     DateTime, default=now(utc)
--
--   新表模型见 docs/接口文档-第二阶段.md 第七节。
-- ===========================================================================

-- 💡 想切回 SQLite 兜底（不连 MySQL）：
--    删掉 backend/.env 即可，后端会自动用 backend/instance/dev.db。
--    但那种情况下本脚本不用执行。
