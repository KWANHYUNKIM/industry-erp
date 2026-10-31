package com.erp.config;

import com.erp.common.crypto.PiiCipher;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * 평문으로 남은 주민등록번호를 암호화한다(docs/보안-점검.md H3) — 본사 + 회사 스키마 전부, 기동할 때마다(멱등).
 *
 * <p>SQL 마이그레이션으로 하지 않는 까닭: 키가 SQL · DB 로그에 남으면 안 된다. 암호화는 앱이 {@link PiiCipher} 로 한다.
 * 키가 없으면(dev) 아무것도 안 한다. 칸을 넓히는 V521(본사) · V393(테넌트)이 먼저 돌아야 하므로
 * TenantMigrationRunner(@Order 0) 뒤에 돈다. 실패해도 기동은 막지 않는다(그 행은 다음 기동에 다시).
 */
@Slf4j
@Component
@Order(1)
@RequiredArgsConstructor
public class PiiEncryptionBackfill implements ApplicationRunner {

    /** 암호화할 칸 — 표 · 열. 새 개인정보 칸에 EncryptedStringConverter 를 붙이면 여기에도 더한다. */
    private static final List<String[]> COLUMNS = List.of(
            new String[]{"employees", "resident_no"},
            new String[]{"insurance_reports", "resident_no"});

    private static final Pattern SCHEMA = Pattern.compile("[a-z0-9_]+");

    private final JdbcTemplate jdbc;

    @Override
    public void run(ApplicationArguments args) {
        if (!PiiCipher.enabled()) return;
        List<String> schemas = new ArrayList<>(List.of("public"));
        try {
            schemas.addAll(jdbc.queryForList("select schema_name from public.companies", String.class));
        } catch (RuntimeException e) {
            log.warn("회사 레지스트리를 못 읽어 본사만 암호화한다: {}", e.getMessage());
        }
        int total = 0;
        for (String schema : schemas.stream().distinct().toList()) {
            if (schema == null || !SCHEMA.matcher(schema).matches()) continue;
            for (String[] col : COLUMNS) {
                try {
                    total += encryptColumn(schema, col[0], col[1]);
                } catch (RuntimeException e) {
                    log.warn("개인정보 암호화 건너뜀 {}.{}.{}: {}", schema, col[0], col[1], e.getMessage());
                }
            }
        }
        if (total > 0) log.info("평문 개인정보 {}건을 암호화했다", total);
    }

    private int encryptColumn(String schema, String table, String column) {
        String t = schema + "." + table;
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select id, " + column + " as v from " + t + " where " + column + " is not null and " + column + " <> ''"
                        + " and " + column + " not like '" + PiiCipher.PREFIX + "%'");
        for (Map<String, Object> r : rows) {
            String plain = String.valueOf(r.get("v"));
            jdbc.update("update " + t + " set " + column + " = ? where id = ? and " + column + " = ?",
                    PiiCipher.encrypt(plain), r.get("id"), plain);
        }
        return rows.size();
    }
}
