-- =====================================================
-- 在线考试系统：考试创建与房间分配相关表
-- 说明：基于现有 users / schools / teachers / students 结构
-- 执行前请确认当前数据库已创建上述基础表。
-- =====================================================

CREATE TABLE IF NOT EXISTS exams (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL,
  name VARCHAR(128) NOT NULL,
  room_code VARCHAR(64) NOT NULL,
  start_at DATETIME NOT NULL,
  end_at DATETIME NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'CREATED',
  created_by BIGINT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_exams_school
    FOREIGN KEY (school_id) REFERENCES schools(id),
  CONSTRAINT fk_exams_creator
    FOREIGN KEY (created_by) REFERENCES users(id),

  INDEX idx_exams_school_start (school_id, start_at),
  INDEX idx_exams_room (room_code)
);

CREATE TABLE IF NOT EXISTS exam_teachers (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  exam_id BIGINT NOT NULL,
  teacher_id BIGINT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_exam_teachers_exam
    FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
  CONSTRAINT fk_exam_teachers_teacher
    FOREIGN KEY (teacher_id) REFERENCES teachers(user_id) ON DELETE CASCADE,

  UNIQUE KEY uk_exam_teacher (exam_id, teacher_id),
  INDEX idx_exam_teachers_teacher (teacher_id)
);

CREATE TABLE IF NOT EXISTS exam_students (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  exam_id BIGINT NOT NULL,
  student_id BIGINT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_exam_students_exam
    FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
  CONSTRAINT fk_exam_students_student
    FOREIGN KEY (student_id) REFERENCES students(user_id) ON DELETE CASCADE,

  UNIQUE KEY uk_exam_student (exam_id, student_id),
  INDEX idx_exam_students_student (student_id)
);
