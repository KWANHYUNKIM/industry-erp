package com.erp.tenant;

import com.erp.settings.domain.Company;
import com.erp.settings.repository.CompanyRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.exception.FlywayValidateException;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.util.List;

/**
 * 기동할 때 등록된 모든 회사 스키마에 {@code db/tenant} 마이그레이션을 적용한다.
 *
 * <p>이게 없으면 테넌트 스키마는 회사를 만들 때 baseline 한 번만 실행되고 그 뒤로 아무것도
 * 따라오지 않는다. 본사(public)에 컬럼이 늘어도 테넌트는 그대로라, 그 회사로 로그인해 해당
 * 화면을 열면 {@code column does not exist} 로 터진다. 실제로 테이블 15개·컬럼 25개가
 * 어긋난 상태였다. {@code ddl-auto: validate} 는 기동 시 기본 스키마만 검사하므로
 * 이 어긋남을 잡아주지 못한다 — 그래서 따라잡는 일을 여기서 명시적으로 한다.
 *
 * <p>스키마를 바꾸면 {@code db/migration}(본사)과 {@code db/tenant}(테넌트) <b>양쪽에</b> 넣는다.
 *
 * <p>한 회사에서 실패해도 나머지는 계속 진행하고 로그만 남긴다. 회사 하나의 스키마가 깨졌다고
 * 앱 전체를 못 뜨게 하면 다른 회사까지 같이 멈춘다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(0)   // 데이터 시더(CommandLineRunner)들보다 먼저 — 테이블이 있어야 시드가 돈다
public class TenantMigrationRunner implements ApplicationRunner {

    private final CompanyRepository companyRepository;
    private final DataSource dataSource;
    private final TenantSeeder tenantSeeder;

    @Override
    public void run(ApplicationArguments args) {
        List<Company> companies;
        try {
            companies = companyRepository.findAll();
        } catch (RuntimeException e) {
            // 레지스트리 자체가 아직 없는 첫 기동. 본사 마이그레이션이 만들고 나면 다음 기동에 돈다.
            log.warn("회사 레지스트리를 읽지 못해 테넌트 마이그레이션을 건너뜁니다: {}", e.getMessage());
            return;
        }

        for (Company c : companies) {
            String schema = c.getSchemaName();
            if (schema == null || schema.isBlank() || "public".equals(schema)) continue;   // 본사는 db/migration 이 담당
            Flyway flyway = Flyway.configure()
                    .dataSource(dataSource)
                    .schemas(schema)
                    .defaultSchema(schema)
                    .locations("classpath:db/tenant")
                    .baselineOnMigrate(false)
                    .load();
            try {
                int applied;
                try {
                    applied = flyway.migrate().migrationsExecuted;
                } catch (FlywayValidateException ve) {
                    // 과거에 V1__tenant_baseline.sql 을 여러 번 고쳤다. 그래서 이미 만들어진
                    // 테넌트에 기록된 체크섬이 지금 파일과 맞지 않는다. baseline 을 다시 실행할
                    // 수는 없으므로 기록만 현재 파일 기준으로 맞추고(repair) V2 부터 이어 붙인다 —
                    // 스키마를 public 모양으로 맞추는 책임은 V2 가 진다.
                    log.warn("테넌트 {} ({}) 체크섬 불일치 → repair 후 재시도: {}",
                            c.getCode(), schema, ve.getMessage().lines().findFirst().orElse(""));
                    flyway.repair();
                    applied = flyway.migrate().migrationsExecuted;
                }
                if (applied > 0) log.info("테넌트 {} ({}) 마이그레이션 {}건 적용", c.getCode(), schema, applied);
                ensureReferenceData(schema, c.getCode(), c.getName());
            } catch (RuntimeException e) {
                log.error("테넌트 {} ({}) 마이그레이션 실패 — 이 회사는 화면에서 오류가 날 수 있습니다: {}",
                        c.getCode(), schema, e.getMessage());
            }
        }
    }

    /**
     * 기준자료 보충. <b>이미 만들어진 회사</b>를 위한 것이다.
     *
     * <p>계정과목 목록이 예전에는 본사 시더 안에만 있어서, 그 전에 만들어진 회사는
     * 계정과목이 0개인 채로 남아 있다. 회계반영·급여이체가 계정을 코드값으로 찾아 쓰므로
     * 그 회사들은 지금도 그 기능을 못 쓴다. 회사정보(상호)도 마찬가지로 비어 있어
     * 인쇄물 공급자란에 "(회사정보 미등록)" 이 찍힌다 — 상호는 레지스트리가 알고 있다.
     * 새 회사는 TenantSeeder 가 채우고, 이미 있는 회사는 여기서 채운다.
     * 있으면 건드리지 않으므로 매 기동 불려도 안전하다.
     */
    private void ensureReferenceData(String schema, String companyCode, String companyName) {
        String prev = TenantContext.get();
        TenantContext.set(schema);
        try {
            tenantSeeder.ensureReferenceData(companyName);
        } catch (RuntimeException e) {
            log.error("테넌트 {} ({}) 기준자료 보충 실패: {}", companyCode, schema, e.getMessage());
        } finally {
            TenantContext.set(prev);
        }
    }
}
