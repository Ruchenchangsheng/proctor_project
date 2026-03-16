package com.kovr.proctor.service;

import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@Slf4j
public class DatabaseSchemaInitializer {
    private final JdbcTemplate jdbcTemplate;

    @PostConstruct
    public void initialize() {
        createAuditLogsTable();
        createPlatformSettingsTable();
        createNotificationTemplatesTable();
        ensureUserSecurityColumns();
        ensureEvidenceReviewColumns();
    }

    private void createAuditLogsTable() {
        jdbcTemplate.execute("""
                create table if not exists audit_logs (
                    id bigint primary key auto_increment,
                    actor_user_id bigint null,
                    actor_role varchar(32) null,
                    actor_name varchar(128) null,
                    action_type varchar(64) not null,
                    target_type varchar(64) not null,
                    target_id varchar(128) null,
                    summary varchar(255) not null,
                    detail text null,
                    created_at datetime not null default current_timestamp
                )
                """);
    }

    private void createPlatformSettingsTable() {
        jdbcTemplate.execute("""
                create table if not exists platform_settings (
                    id bigint primary key auto_increment,
                    setting_group varchar(64) not null,
                    setting_key varchar(64) not null,
                    setting_value text null,
                    value_type varchar(32) not null default 'STRING',
                    updated_by_user_id bigint null,
                    updated_at datetime not null default current_timestamp on update current_timestamp,
                    unique key uk_platform_settings_group_key (setting_group, setting_key)
                )
                """);
    }

    private void createNotificationTemplatesTable() {
        jdbcTemplate.execute("""
                create table if not exists notification_templates (
                    id bigint primary key auto_increment,
                    template_code varchar(64) not null,
                    channel varchar(32) not null default 'EMAIL',
                    subject varchar(255) not null,
                    content text not null,
                    enabled tinyint not null default 1,
                    updated_by_user_id bigint null,
                    updated_at datetime not null default current_timestamp on update current_timestamp,
                    unique key uk_notification_templates_code (template_code)
                )
                """);
    }

    private void ensureUserSecurityColumns() {
        addColumnIfMissing("users", "must_change_password", "alter table users add column must_change_password tinyint not null default 0 after enabled");
        addColumnIfMissing("users", "failed_login_attempts", "alter table users add column failed_login_attempts int not null default 0 after must_change_password");
        addColumnIfMissing("users", "locked_until", "alter table users add column locked_until datetime null after failed_login_attempts");
    }

    private void ensureEvidenceReviewColumns() {
        addColumnIfMissing("anomaly_evidences", "review_status", "alter table anomaly_evidences add column review_status varchar(32) not null default 'PENDING' after frame_count");
        addColumnIfMissing("anomaly_evidences", "review_note", "alter table anomaly_evidences add column review_note text null after review_status");
        addColumnIfMissing("anomaly_evidences", "reviewed_by_user_id", "alter table anomaly_evidences add column reviewed_by_user_id bigint null after review_note");
        addColumnIfMissing("anomaly_evidences", "reviewed_by_name", "alter table anomaly_evidences add column reviewed_by_name varchar(128) null after reviewed_by_user_id");
        addColumnIfMissing("anomaly_evidences", "reviewed_at", "alter table anomaly_evidences add column reviewed_at datetime null after reviewed_by_name");
        addColumnIfMissing("anomaly_evidences", "last_viewed_at", "alter table anomaly_evidences add column last_viewed_at datetime null after reviewed_at");
    }

    private void addColumnIfMissing(String tableName, String columnName, String ddl) {
        Integer count = jdbcTemplate.queryForObject(
                """
                select count(1)
                from information_schema.columns
                where table_schema = database()
                  and table_name = ?
                  and column_name = ?
                """,
                Integer.class,
                tableName,
                columnName);
        if (count == null || count == 0) {
            log.info("Applying schema update: {}.{}", tableName, columnName);
            jdbcTemplate.execute(ddl);
        }
    }
}
