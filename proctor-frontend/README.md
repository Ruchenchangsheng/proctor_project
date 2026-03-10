erDiagram
    SCHOOLS {
      int id PK "主键ID"
      string name
      string domain
    }

    DEPARTMENTS {
      int id PK
      int school_id FK
      string name
    }

    MAJORS {
      int id PK
      int department_id FK
      string name
    }

    USERS {
      int id PK
      string email
      string role
      boolean enabled
      datetime created_at
      datetime updated_at
    }

    STUDENTS {
      int user_id PK FK
      int school_id FK
      int department_id FK
      int major_id FK "可空"
      datetime created_at
      datetime updated_at
    }

    TEACHERS {
      int user_id PK FK
      int school_id FK
      int department_id FK
      int major_id "无外键"
      datetime created_at
      datetime updated_at
    }

    SCHOOL_ADMIN {
      int user_id PK FK
      int school_id FK
      datetime created_at
    }

    EXAMS {
      int id PK
      int school_id FK
      int department_id FK "可空"
      int major_id FK "可空"
      string name
      datetime start_at
      datetime end_at
      int created_by "无外键"
    }

    EXAM_ROOMS {
      int id PK
      int exam_id FK
      string room_id
      int invigilator_id FK
      int capacity
    }

    EXAM_ROOM_ENROLLMENTS {
      int id PK
      int exam_room_id FK
      int student_id FK
    }

    EXAM_SESSIONS {
      int id PK
      int exam_id FK
      int school_id "未声明外键"
      int department_id "未声明外键"
      int major_id "未声明外键"
      int exam_room_id FK "可空"
      int invigilator_id FK "可空"
      int student_id FK
      string status
      datetime entered_at
      datetime finished_at
    }

    EXAM_VIOLATIONS {
      int id PK
      int exam_id FK
      int student_id FK
      int session_id FK
      string vtype
      float confidence
      datetime started_at
      datetime ended_at
    }

    %% ---------- 关系（Crow's Foot） ----------
    SCHOOLS     ||--o{ DEPARTMENTS : contains
    DEPARTMENTS ||--o{ MAJORS      : contains

    SCHOOLS     ||--o{ STUDENTS    : has
    DEPARTMENTS ||--o{ STUDENTS    : has
    MAJORS      ||--o{ STUDENTS    : has
    USERS       ||--o| STUDENTS    : is_student

    SCHOOLS     ||--o{ TEACHERS    : has
    DEPARTMENTS ||--o{ TEACHERS    : has
    USERS       ||--o| TEACHERS    : is_teacher

    SCHOOLS     ||--o{ SCHOOL_ADMIN : has
    USERS       ||--o| SCHOOL_ADMIN : is_admin

    SCHOOLS     ||--o{ EXAMS       : holds
    DEPARTMENTS ||--o{ EXAMS       : covers
    MAJORS      ||--o{ EXAMS       : covers

    EXAMS       ||--o{ EXAM_ROOMS  : allocates
    USERS       ||--o{ EXAM_ROOMS  : invigilates

    EXAM_ROOMS  ||--o{ EXAM_ROOM_ENROLLMENTS : seats
    USERS       ||--o{ EXAM_ROOM_ENROLLMENTS : enrolls

    EXAMS       ||--o{ EXAM_SESSIONS : has
    EXAM_ROOMS  ||--o{ EXAM_SESSIONS : occurs_in
    USERS       ||--o{ EXAM_SESSIONS : student
    USERS       ||--o{ EXAM_SESSIONS : invigilator

    EXAMS         ||--o{ EXAM_VIOLATIONS : contains
    EXAM_SESSIONS ||--o{ EXAM_VIOLATIONS : during
    USERS         ||--o{ EXAM_VIOLATIONS : student
