/*
 Navicat Premium Dump SQL

 Source Server         : root
 Source Server Type    : MySQL
 Source Server Version : 80042 (8.0.42)
 Source Host           : localhost:3306
 Source Schema         : proctor

 Target Server Type    : MySQL
 Target Server Version : 80042 (8.0.42)
 File Encoding         : 65001

 Date: 26/02/2026 17:29:54
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for departments
-- ----------------------------
DROP TABLE IF EXISTS `departments`;
CREATE TABLE `departments`  (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `school_id` bigint NOT NULL COMMENT '所属学校ID',
  `name` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '学院/院系名称',
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_dept_school`(`school_id` ASC) USING BTREE,
  CONSTRAINT `fk_dept_school` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE = InnoDB AUTO_INCREMENT = 5 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci COMMENT = '学院表' ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for exam_room_enrollments
-- ----------------------------
DROP TABLE IF EXISTS `exam_room_enrollments`;
CREATE TABLE `exam_room_enrollments`  (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键',
  `exam_room_id` bigint NOT NULL COMMENT 'exam_rooms.id',
  `student_id` bigint NOT NULL COMMENT '学生 users.id',
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `uq_room_student`(`exam_room_id` ASC, `student_id` ASC) USING BTREE,
  INDEX `idx_enroll_room`(`exam_room_id` ASC) USING BTREE,
  INDEX `fk_ere_student`(`student_id` ASC) USING BTREE,
  CONSTRAINT `fk_ere_room` FOREIGN KEY (`exam_room_id`) REFERENCES `exam_rooms` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT `fk_ere_student` FOREIGN KEY (`student_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci COMMENT = '房间-学生分配' ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for exam_rooms
-- ----------------------------
DROP TABLE IF EXISTS `exam_rooms`;
CREATE TABLE `exam_rooms`  (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键',
  `exam_id` bigint NOT NULL COMMENT '考试ID',
  `room_id` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '房间号',
  `invigilator_id` bigint NOT NULL COMMENT '监考教师用户ID（users.id）',
  `capacity` int NOT NULL DEFAULT 20 COMMENT '容量上限',
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `uq_exam_room`(`exam_id` ASC, `room_id` ASC) USING BTREE,
  INDEX `idx_room_exam`(`exam_id` ASC) USING BTREE,
  INDEX `fk_er_teacher`(`invigilator_id` ASC) USING BTREE,
  CONSTRAINT `fk_er_exam` FOREIGN KEY (`exam_id`) REFERENCES `exams` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT `fk_er_teacher` FOREIGN KEY (`invigilator_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci COMMENT = '考试-房间' ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for exam_sessions
-- ----------------------------
DROP TABLE IF EXISTS `exam_sessions`;
CREATE TABLE `exam_sessions`  (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键',
  `exam_id` bigint NOT NULL COMMENT '考试ID',
  `school_id` bigint NULL DEFAULT NULL COMMENT '学校',
  `department_id` bigint NULL DEFAULT NULL COMMENT '学院',
  `major_id` bigint NULL DEFAULT NULL COMMENT '专业',
  `exam_room_id` bigint NULL DEFAULT NULL COMMENT '所在房间',
  `invigilator_id` bigint NULL DEFAULT NULL COMMENT '监考老师（users.id）',
  `student_id` bigint NOT NULL COMMENT '学生（users.id）',
  `status` enum('NOT_STARTED','RUNNING','FINISHED','CANCELLED') CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT 'NOT_STARTED' COMMENT '状态机',
  `last_verify_score` double NULL DEFAULT NULL COMMENT '最近一次1:1相似度',
  `last_verify_at` timestamp NULL DEFAULT NULL COMMENT '最近验证时间',
  `entered_at` datetime NULL DEFAULT NULL COMMENT '进入时间',
  `finished_at` datetime NULL DEFAULT NULL COMMENT '完成/结束时间',
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `uq_exam_student`(`exam_id` ASC, `student_id` ASC) USING BTREE,
  INDEX `idx_exam_sessions_exam`(`exam_id` ASC) USING BTREE,
  INDEX `fk_ses_room`(`exam_room_id` ASC) USING BTREE,
  INDEX `fk_ses_inv`(`invigilator_id` ASC) USING BTREE,
  INDEX `fk_ses_student`(`student_id` ASC) USING BTREE,
  CONSTRAINT `fk_ses_exam` FOREIGN KEY (`exam_id`) REFERENCES `exams` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT `fk_ses_inv` FOREIGN KEY (`invigilator_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `fk_ses_room` FOREIGN KEY (`exam_room_id`) REFERENCES `exam_rooms` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `fk_ses_student` FOREIGN KEY (`student_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci COMMENT = '考试会话' ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for exam_violations
-- ----------------------------
DROP TABLE IF EXISTS `exam_violations`;
CREATE TABLE `exam_violations`  (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键',
  `exam_id` bigint NOT NULL COMMENT '考试ID',
  `student_id` bigint NOT NULL COMMENT '学生ID（users.id）',
  `session_id` bigint NOT NULL COMMENT '会话ID（exam_sessions.id）',
  `vtype` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '违规类型：FACE_MISMATCH/NO_FACE/MULTI_PERSON/LEAVE_SEAT/PHONE/OTHER',
  `confidence` decimal(5, 4) NULL DEFAULT NULL COMMENT '违规置信度（0-1）',
  `started_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '开始时间',
  `ended_at` timestamp NULL DEFAULT NULL COMMENT '结束时间（可选）',
  `details_json` json NULL COMMENT '附加信息（阈值、头姿角、检测框等）',
  `snapshot` longblob NULL COMMENT '证据截图（可选）',
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_vio_exam_student`(`exam_id` ASC, `student_id` ASC) USING BTREE,
  INDEX `idx_vio_session_time`(`session_id` ASC, `started_at` ASC) USING BTREE,
  INDEX `fk_vio_student`(`student_id` ASC) USING BTREE,
  CONSTRAINT `fk_vio_exam` FOREIGN KEY (`exam_id`) REFERENCES `exams` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT `fk_vio_session` FOREIGN KEY (`session_id`) REFERENCES `exam_sessions` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT `fk_vio_student` FOREIGN KEY (`student_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci COMMENT = '违规事件表' ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for exams
-- ----------------------------
DROP TABLE IF EXISTS `exams`;
CREATE TABLE `exams`  (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `school_id` bigint NOT NULL COMMENT '学校ID',
  `department_id` bigint NULL DEFAULT NULL COMMENT '学院ID',
  `major_id` bigint NULL DEFAULT NULL COMMENT '专业ID',
  `name` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '考试名称',
  `start_at` datetime NULL DEFAULT NULL COMMENT '计划开始时间',
  `end_at` datetime NULL DEFAULT NULL COMMENT '计划结束时间',
  `created_by` bigint NULL DEFAULT NULL COMMENT '创建者用户ID',
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_exam_school`(`school_id` ASC) USING BTREE,
  INDEX `fk_exam_dept`(`department_id` ASC) USING BTREE,
  INDEX `fk_exam_major`(`major_id` ASC) USING BTREE,
  CONSTRAINT `fk_exam_dept` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `fk_exam_major` FOREIGN KEY (`major_id`) REFERENCES `majors` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `fk_exam_school` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci COMMENT = '考试表' ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for majors
-- ----------------------------
DROP TABLE IF EXISTS `majors`;
CREATE TABLE `majors`  (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键',
  `department_id` bigint NOT NULL COMMENT '所属学院ID',
  `name` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '专业名称',
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_major_dept`(`department_id` ASC) USING BTREE,
  CONSTRAINT `fk_major_dept` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE = InnoDB AUTO_INCREMENT = 7 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci COMMENT = '专业表' ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for school_admin
-- ----------------------------
DROP TABLE IF EXISTS `school_admin`;
CREATE TABLE `school_admin`  (
  `user_id` bigint NOT NULL COMMENT '与 users.id 一致',
  `school_id` bigint NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`) USING BTREE,
  INDEX `idx_sap_school`(`school_id` ASC) USING BTREE,
  CONSTRAINT `fk_sap_school` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_sap_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci COMMENT = '学校管理员档案' ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for schools
-- ----------------------------
DROP TABLE IF EXISTS `schools`;
CREATE TABLE `schools`  (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `name` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '学校名称（唯一）',
  `domain` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '学校邮箱域名（如 @xxx.edu）',
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `name`(`name` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 34 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci COMMENT = '学校表' ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for students
-- ----------------------------
DROP TABLE IF EXISTS `students`;
CREATE TABLE `students`  (
  `user_id` bigint NOT NULL COMMENT '与 users.id 一致',
  `school_id` bigint NOT NULL COMMENT '学校',
  `department_id` bigint NOT NULL COMMENT '学院',
  `major_id` bigint NULL DEFAULT NULL COMMENT '专业',
  `face_photo` mediumblob NULL COMMENT '注册人脸原始照片',
  `face_photo_mime` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `face_photo_sha256` char(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `face_embedding_json` mediumtext CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL,
  `face_embedding_dim` smallint NULL DEFAULT 512,
  `face_det_score` decimal(6, 4) NULL DEFAULT NULL COMMENT '注册照片检出置信度（0-1）',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`) USING BTREE,
  INDEX `fk_sp_dept`(`department_id` ASC) USING BTREE,
  INDEX `fk_sp_major`(`major_id` ASC) USING BTREE,
  INDEX `idx_sp_school`(`school_id` ASC, `department_id` ASC, `major_id` ASC) USING BTREE,
  INDEX `idx_students_school_dep_major`(`school_id` ASC, `department_id` ASC, `major_id` ASC) USING BTREE,
  CONSTRAINT `fk_sp_dept` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_sp_major` FOREIGN KEY (`major_id`) REFERENCES `majors` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `fk_sp_school` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_sp_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci COMMENT = '学生档案' ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for teachers
-- ----------------------------
DROP TABLE IF EXISTS `teachers`;
CREATE TABLE `teachers`  (
  `user_id` bigint NOT NULL COMMENT '与 users.id 一致',
  `school_id` bigint NOT NULL,
  `department_id` bigint NOT NULL,
  `major_id` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`) USING BTREE,
  INDEX `fk_tp_dept`(`department_id` ASC) USING BTREE,
  INDEX `idx_tp_school`(`school_id` ASC, `department_id` ASC) USING BTREE,
  INDEX `idx_teachers_school_dep_major`(`school_id` ASC, `department_id` ASC, `major_id` ASC) USING BTREE,
  CONSTRAINT `fk_tp_dept` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_tp_school` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_tp_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci COMMENT = '教师档案' ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for users
-- ----------------------------
DROP TABLE IF EXISTS `users`;
CREATE TABLE `users`  (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `email` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '登录邮箱（唯一）',
  `password` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT 'BCrypt 加密后的密码',
  `name` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '姓名',
  `role` enum('ADMIN','SCHOOL_ADMIN','TEACHER','STUDENT') CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '角色',
  `enabled` tinyint(1) NOT NULL DEFAULT 1 COMMENT '账号是否启用：1=启用，0=禁用',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `email`(`email` ASC) USING BTREE,
  INDEX `idx_users_email`(`email` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 65 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci COMMENT = '用户账号表（最小字段）' ROW_FORMAT = Dynamic;

-- ----------------------------
-- View structure for v_users_legacy
-- ----------------------------
DROP VIEW IF EXISTS `v_users_legacy`;
CREATE ALGORITHM = UNDEFINED SQL SECURITY DEFINER VIEW `v_users_legacy` AS select `u`.`id` AS `id`,`u`.`email` AS `email`,`u`.`password` AS `password`,`u`.`name` AS `name`,`u`.`role` AS `role`,`u`.`enabled` AS `enabled`,(case when (`u`.`role` = 'STUDENT') then `sp`.`school_id` when (`u`.`role` = 'TEACHER') then `tp`.`school_id` when (`u`.`role` = 'SCHOOL_ADMIN') then `sap`.`school_id` else NULL end) AS `school_id`,(case when (`u`.`role` = 'STUDENT') then `sp`.`department_id` when (`u`.`role` = 'TEACHER') then `tp`.`department_id` else NULL end) AS `department_id`,`sp`.`face_photo` AS `face_photo`,`sp`.`face_photo_mime` AS `face_photo_mime`,`sp`.`face_photo_sha256` AS `face_photo_sha256`,`sp`.`face_embedding_json` AS `face_embedding_json`,`sp`.`face_embedding_dim` AS `face_embedding_dim`,`sp`.`face_det_score` AS `face_det_score` from (((`users` `u` left join `student_profiles` `sp` on((`sp`.`user_id` = `u`.`id`))) left join `teacher_profiles` `tp` on((`tp`.`user_id` = `u`.`id`))) left join `school_admin_profiles` `sap` on((`sap`.`user_id` = `u`.`id`)));

SET FOREIGN_KEY_CHECKS = 1;
