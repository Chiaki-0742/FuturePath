-- ===========================================================================
-- FuturePath 数据库初始化脚本
-- 负责人：C（数据库）
-- ===========================================================================
-- 【怎么执行这个文件】
-- 方式一（DataGrip，推荐）：
--     1. 打开这个文件
--     2. 全选（Ctrl + A）★ 一定要全选，否则只会执行光标所在那一句
--     3. 执行（Ctrl + Enter）
--
-- 方式二（命令行）：
--     mysql -u root -p < init.sql
--     ⚠️ PowerShell 不认 < 符号，先敲 cmd 切换再执行
--
-- 【执行成功的标志】
--     最后一行 SELECT 能显示出 testuser 这条数据
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 第 1 步：创建数据库
-- ---------------------------------------------------------------------------
CREATE DATABASE IF NOT EXISTS futurepath
    DEFAULT CHARACTER SET utf8mb4
    DEFAULT COLLATE utf8mb4_unicode_ci;

USE futurepath;


-- ---------------------------------------------------------------------------
-- 第 2 步：创建用户表
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS `user`;

CREATE TABLE `user` (
    `id` INT AUTO_INCREMENT PRIMARY KEY COMMENT '用户ID，主键',
    `username` VARCHAR(50) NOT NULL UNIQUE COMMENT '登录用户名',
    `password_hash` VARCHAR(255) NOT NULL COMMENT '密码哈希值（不是明文）',
    `name` VARCHAR(50) NOT NULL COMMENT '用户姓名',
    `major` VARCHAR(100) DEFAULT NULL COMMENT '专业',
    `grade` VARCHAR(20) DEFAULT NULL COMMENT '年级',
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '注册时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表';


-- ---------------------------------------------------------------------------
-- 第 3 步：插入一条测试数据
-- ---------------------------------------------------------------------------
INSERT INTO `user` (`username`, `password_hash`, `name`, `major`, `grade`)
VALUES ('testuser', 'placeholder', '测试用户', '计算机科学与技术', '大一');


-- ---------------------------------------------------------------------------
-- 第 4 步：验证
-- ---------------------------------------------------------------------------
SELECT * FROM `user`;
