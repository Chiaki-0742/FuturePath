-- ===========================================================================
-- FuturePath 数据库初始化脚本
-- 负责人：C（数据库）
-- 表结构以 backend/app/models/user.py 为准（B 的 SQLAlchemy 模型定义）
-- 两边字段必须保持一致，改任何一边都要同步另一边！
-- ===========================================================================
-- 【怎么执行这个文件】
-- 方式一（DataGrip，推荐，最适合新手）：
--     1. 打开这个文件
--     2. 全选（Ctrl + A）★ 一定要全选，否则只会执行光标所在那一句
--     3. 执行（Ctrl + Enter）
--
-- 方式二（命令行）：
--     mysql -u root -p < init.sql      然后输入你的 MySQL root 密码
--     ⚠️ PowerShell 不认 < 符号，先用 cmd 切到命令提示符再执行
--
-- 方式三（Navicat / Workbench 等图形界面）：
--     打开这个文件，点"执行"
--
-- 【执行成功的标志】
--     最后一行 SELECT 能显示出 testuser 这条数据
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 第 1 步：创建数据库
-- ---------------------------------------------------------------------------
-- IF NOT EXISTS 意思是"如果不存在才创建"，这样重复执行不会报错。

CREATE DATABASE IF NOT EXISTS futurepath
    DEFAULT CHARACTER SET utf8mb4
    DEFAULT COLLATE utf8mb4_unicode_ci;

-- 切换到刚创建的数据库（后面的操作都在这个库里进行）
USE futurepath;


-- ---------------------------------------------------------------------------
-- 第 2 步：创建用户表
-- ★ 表名是 users（复数），必须和 models/user.py 里的 __tablename__ 一致，
--   否则 SQLAlchemy 会找不到表，报 Table 'xxx.users' doesn't exist
-- ---------------------------------------------------------------------------
-- DROP TABLE IF EXISTS 意思是"如果要有了就先删掉，重建"。
-- 只在开发阶段用！这样可以反复重来。
-- ★ 注意：上线后绝对不能留这句，否则一执行数据就全没了。
DROP TABLE IF EXISTS `users`;

CREATE TABLE `users` (
    -- id：主键，自动增长。每个用户的唯一编号，系统内部用它来区分用户。
    `id` INT AUTO_INCREMENT PRIMARY KEY COMMENT '用户ID，主键',

    -- username：登录账号，3-20 位字母或数字（长度限制在接口层校验）。
    -- UNIQUE 表示"不能重复"——这就是为什么注册时要查重。
    -- 数据库层面也加一层保护，双保险。
    `username` VARCHAR(20) NOT NULL UNIQUE COMMENT '登录用户名，全表唯一',

    -- password_hash：★ 重点！这里存的是加密后的密码，不是明文！
    -- 为什么留 256 这么长？因为哈希算法产生的字符串很长
    -- （Werkzeug 的 pbkdf2 算法结果约 100+ 位）。
    -- 千万不要把这个字段改成 password 然后存明文，一旦数据库泄露
    -- 所有用户的密码就全曝光了。
    `password_hash` VARCHAR(256) NOT NULL COMMENT '密码哈希值（不是明文）',

    -- name：真实姓名，用于页面显示"欢迎你，张三"。
    `name` VARCHAR(64) NOT NULL COMMENT '用户姓名',

    -- major：专业。
    -- ★ 后端模型里是 NOT NULL + 默认值"未填写"：
    --   用户注册时如果没填专业，后端会写入"未填写"而不是 NULL。
    --   所以这里也必须是 NOT NULL，保持一致。
    `major` VARCHAR(64) NOT NULL COMMENT '专业，未填时存"未填写"',

    -- grade：年级，比如"大一"。规则同上。
    `grade` VARCHAR(16) NOT NULL COMMENT '年级，未填时存"未填写"',

    -- created_at：注册时间。★★★★ 每张表都建议加上这个字段。
    -- 当出问题时（比如"这个用户什么时候注册的？"），
    -- 或者做数据统计时（"今日新增多少用户"），全靠它。
    -- ★ 注意：这个值由后端 Python 代码写入（UTC 时间），
    --   不是数据库自动填，所以这里不加 DEFAULT CURRENT_TIMESTAMP。
    `created_at` DATETIME DEFAULT NULL COMMENT '注册时间，由后端写入 UTC 时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表';


-- ---------------------------------------------------------------------------
-- 第 3 步：插入一条测试数据，验证表建对了
-- ---------------------------------------------------------------------------
-- 注意：password_hash 这里是占位符，不能用来登录（登录会校验失败）。
-- 想造一条"能登录"的测试数据，有两个办法：
--   ① 直接在前端页面注册一个（推荐，顺便验证接口）
--   ② 让后端跑一段生成哈希的代码，把结果贴进这里
-- D2 之后真正的注册数据由后端接口写入，不需要手工 INSERT。

INSERT INTO `users` (`username`, `password_hash`, `name`, `major`, `grade`)
VALUES ('testuser', 'placeholder', '测试用户', '计算机科学与技术', '大一');


-- ---------------------------------------------------------------------------
-- 第 4 步：验证
-- ---------------------------------------------------------------------------
-- 执行下面这句，如果能看到刚才插入的那条数据，说明一切正常。
SELECT * FROM `users`;


-- ===========================================================================
-- 【验收标准】
--   1. 执行 DESC users;  能看到 7 个字段（id/username/password_hash/name/
--      major/grade/created_at）
--   2. 执行 SELECT * FROM users;  能看到 1 条 testuser 的数据
--
-- 【和后端的一致性检查表】改字段时对照这张表，两边都要改：
--   字段            MySQL 类型        SQLAlchemy 定义
--   id              INT PK AI         Integer, primary_key
--   username        VARCHAR(20) UQ    String(20), unique, index
--   password_hash   VARCHAR(256)      String(256)
--   name            VARCHAR(64)       String(64)
--   major           VARCHAR(64) NN    String(64), NOT NULL, default="未填写"
--   grade           VARCHAR(16) NN    String(16), NOT NULL, default="未填写"
--   created_at      DATETIME NULL     DateTime, default=now(utc)
-- ===========================================================================

-- ===========================================================================
-- 第 5 步：第二阶段新增表（问卷 / 案例 / 对话）
-- 说明：这 5 张表为新增模块服务，users 表不动
-- ===========================================================================


-- CREATE DATABASE IF NOT EXISTS futurepath
--     DEFAULT CHARACTER SET utf8mb4
--     DEFAULT COLLATE utf8mb4_unicode_ci;


-- ------------------------------------------------------------
-- 1. questions —— 问卷题库
--    把题目存在表里而不是写死在代码里：以后加题、改选项只改数据
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- 2. answers —— 用户问卷答案
--    user_id 加 UNIQUE：一个用户只保留一份问卷，重复提交则覆盖
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- 3. cases —— 案例主表
--    每条案例 = 一个真实感的人物画像 + 他走过的路
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- 4. case_steps —— 案例步骤明细
--    一条案例对应多条步骤（1:N）
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- 5. chat_logs —— 大模型对话记录
--    节后接大模型时用，现在先建好表，接口可以先返回假数据
--    tokens_used 用于成本监控：能看出谁用得多、花了多少
-- ------------------------------------------------------------
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

-- ============================================================
--  种子数据：问卷题库
--  说明：共 10 题，分三组，与《第二阶段功能设计》一致
-- ============================================================
DELETE FROM `questions`;
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

-- ============================================================
--  种子数据：案例
--  说明：10 条案例，覆盖 5 个方向
--  ⚠️ 下面是 2 条示例，C 需要按同样格式补齐到 10 条
-- ============================================================


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

-- 查看结果
-- ===========================================================================
-- 第 6 步：验证（全部执行完，应该看到下面这些结果）
-- ===========================================================================
SHOW TABLES;                          -- 应显示 6 张表：users + 5 张新表
SELECT COUNT(*) AS 题库题数 FROM `questions`;   -- 应为 10
SELECT COUNT(*) AS 案例数 FROM `cases`;         -- 现在 2，补完后应为 10
SELECT CASE WHEN COUNT(*) = 6 THEN '✅ 6 张表都建好了' ELSE '❌ 表数量不对' END AS 建表检查
FROM information_schema.tables WHERE table_schema = 'futurepath';

USE futurepath;
SHOW TABLES;
SELECT COUNT(*) AS 题库题数 FROM questions;
SELECT COUNT(*) AS 案例数 FROM cases;
