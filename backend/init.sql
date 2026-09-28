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

