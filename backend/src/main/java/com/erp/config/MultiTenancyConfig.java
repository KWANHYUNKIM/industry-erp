package com.erp.config;

import com.erp.tenant.CurrentTenantResolver;
import com.erp.tenant.SchemaMultiTenantConnectionProvider;
import lombok.RequiredArgsConstructor;
import org.hibernate.cfg.AvailableSettings;
import org.springframework.boot.autoconfigure.orm.jpa.HibernatePropertiesCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import javax.sql.DataSource;

/**
 * Hibernate 스키마 멀티테넌시 배선. 회사(스키마)별로 커넥션의 search_path 를 라우팅한다.
 * {@code ddl-auto: validate} 는 부트 시 getAnyConnection()(=public)으로 검증하므로 기존처럼 동작한다.
 */
@Configuration
@RequiredArgsConstructor
public class MultiTenancyConfig {

    private final CurrentTenantResolver currentTenantResolver;

    @Bean
    public HibernatePropertiesCustomizer multiTenancyCustomizer(DataSource dataSource) {
        SchemaMultiTenantConnectionProvider connectionProvider =
                new SchemaMultiTenantConnectionProvider(dataSource);
        return props -> {
            props.put(AvailableSettings.MULTI_TENANT_CONNECTION_PROVIDER, connectionProvider);
            props.put(AvailableSettings.MULTI_TENANT_IDENTIFIER_RESOLVER, currentTenantResolver);
        };
    }
}
