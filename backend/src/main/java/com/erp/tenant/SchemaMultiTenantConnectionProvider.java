package com.erp.tenant;

import org.hibernate.engine.jdbc.connections.spi.MultiTenantConnectionProvider;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;

/**
 * 스키마 기반 멀티테넌시. 회사(테넌트)마다 Postgres 스키마를 하나씩 두고, 커넥션을 내줄 때
 * 그 스키마로 {@code search_path} 를 맞춘다. 엔티티·쿼리는 스키마를 몰라도 되고, 이 계층이
 * "지금 이 회사 창고를 봐라"를 커넥션 단위로 정한다.
 *
 * <p>풀에서 재사용되는 커넥션에 테넌트가 눌어붙지 않도록, 반납할 때 search_path 를 되돌린다.
 */
public class SchemaMultiTenantConnectionProvider implements MultiTenantConnectionProvider<String> {

    private final DataSource dataSource;

    public SchemaMultiTenantConnectionProvider(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Override
    public Connection getAnyConnection() throws SQLException {
        return dataSource.getConnection();   // 부트 스키마검증 등 테넌트 무관 커넥션 → 기본(public)
    }

    @Override
    public void releaseAnyConnection(Connection connection) throws SQLException {
        connection.close();
    }

    @Override
    public Connection getConnection(String tenantIdentifier) throws SQLException {
        Connection connection = dataSource.getConnection();
        setSearchPath(connection, safe(tenantIdentifier));
        return connection;
    }

    @Override
    public void releaseConnection(String tenantIdentifier, Connection connection) throws SQLException {
        // 풀로 돌려보내기 전에 기본 스키마로 복구 (다음 사용자에게 테넌트가 새지 않도록)
        try {
            setSearchPath(connection, TenantContext.DEFAULT);
        } finally {
            connection.close();
        }
    }

    private void setSearchPath(Connection connection, String schema) throws SQLException {
        try (Statement st = connection.createStatement()) {
            // schema 는 안전 검증을 거친 스키마명 상수만 들어온다.
            st.execute("SET search_path TO \"" + schema + "\", public");
        }
    }

    /** 스키마명 화이트리스트 검증 (SQL 주입 방지). 소문자/숫자/밑줄만 허용. */
    private String safe(String schema) {
        if (schema == null || !schema.matches("[a-z0-9_]+")) {
            return TenantContext.DEFAULT;
        }
        return schema;
    }

    @Override
    public boolean supportsAggressiveRelease() {
        return false;
    }

    @Override
    public boolean isUnwrappableAs(@SuppressWarnings("rawtypes") Class unwrapType) {
        return false;
    }

    @Override
    public <T> T unwrap(Class<T> unwrapType) {
        return null;
    }
}
