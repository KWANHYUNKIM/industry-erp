package com.erp.settings.service;

import com.erp.common.ApiException;
import com.erp.settings.domain.Company;
import com.erp.settings.dto.CompanyDtos.CompanyResponse;
import com.erp.settings.dto.CompanyDtos.CreateCompanyRequest;
import com.erp.settings.repository.CompanyRepository;
import com.erp.tenant.TenantContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.flywaydb.core.Flyway;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.sql.DataSource;
import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;
import com.erp.settings.dto.CompanyDtos;
import com.erp.tenant.TenantSeeder;

/**
 * 회사(테넌트) 등록·조회. 새 회사를 만들면 전용 스키마를 만들고 테넌트 baseline 으로 테이블을
 * 구성한 뒤, 기본 역할·권한·첫 관리자를 심는다. 본사(public)는 여기서 만들지 않는다(레지스트리 시드).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CompanyService {

    private final CompanyRepository companyRepository;
    private final TenantSeeder tenantSeeder;
    private final DataSource dataSource;
    private final JdbcTemplate jdbcTemplate;

    @Transactional(readOnly = true)
    public List<CompanyResponse> list() {
        return companyRepository.findAll().stream()
                .sorted(Comparator.comparing(Company::getId))
                .map(CompanyResponse::from)
                .toList();
    }

    /**
     * 새 회사 생성. 스키마 DDL·Flyway·시드는 JPA 트랜잭션 밖에서(각자 커밋) 진행하고,
     * 레지스트리 등록만 트랜잭션으로 저장한다. 도중 실패하면 방금 만든 스키마를 지운다.
     */
    public CompanyResponse create(CreateCompanyRequest req) {
        String code = nextCode();
        String schema = "co_" + code;   // 코드가 숫자라 스키마명은 항상 [a-z0-9_]

        if (companyRepository.existsBySchemaName(schema)) {
            throw ApiException.conflict("이미 존재하는 회사 스키마입니다: " + schema);
        }

        createSchema(schema);
        try {
            migrateTenant(schema);
            seedTenant(schema, req);
        } catch (RuntimeException e) {
            dropSchema(schema);   // 롤백: 반쯤 만든 스키마 제거
            throw new ApiException(org.springframework.http.HttpStatus.INTERNAL_SERVER_ERROR,
                    "회사 스키마 생성에 실패했습니다: " + e.getMessage());
        }

        // 레지스트리 등록(public). Company 는 @Table(schema="public") 이라 항상 public 에 저장된다.
        Company company = companyRepository.save(Company.builder()
                .code(code).name(req.name()).schemaName(schema).active(true)
                .createdAt(LocalDateTime.now())
                .build());
        log.info("회사 생성 완료 → {} ({}), 스키마 {}", req.name(), code, schema);
        return CompanyResponse.from(company);
    }

    private void createSchema(String schema) {
        jdbcTemplate.execute("CREATE SCHEMA IF NOT EXISTS \"" + schema + "\"");
    }

    private void dropSchema(String schema) {
        try {
            jdbcTemplate.execute("DROP SCHEMA IF EXISTS \"" + schema + "\" CASCADE");
        } catch (RuntimeException ignore) {
            log.warn("스키마 정리 실패(무시): {}", schema);
        }
    }

    /** 새 스키마에 테넌트 baseline(db/tenant) 을 적용해 전체 테이블을 만든다. */
    private void migrateTenant(String schema) {
        Flyway.configure()
                .dataSource(dataSource)
                .schemas(schema)
                .defaultSchema(schema)
                .locations("classpath:db/tenant")
                .baselineOnMigrate(false)
                .load()
                .migrate();
    }

    /** 새 스키마 안에 역할·권한·첫 관리자를 심는다. TenantContext 로 라우팅. */
    private void seedTenant(String schema, CreateCompanyRequest req) {
        String prev = TenantContext.get();
        TenantContext.set(schema);
        try {
            String adminName = (req.adminName() == null || req.adminName().isBlank())
                    ? "관리자" : req.adminName();
            tenantSeeder.seed(req.adminUsername(), req.adminPassword(), adminName);
        } finally {
            TenantContext.set(prev);
        }
    }

    /** 다음 회사코드: 숫자 코드 중 최댓값 + 1 (본사 0001 → 0002, 0003 …). */
    private String nextCode() {
        int max = companyRepository.findAll().stream()
                .map(Company::getCode)
                .filter(c -> c.matches("\\d+"))
                .mapToInt(Integer::parseInt)
                .max()
                .orElse(0);
        return String.format("%04d", max + 1);
    }
}
