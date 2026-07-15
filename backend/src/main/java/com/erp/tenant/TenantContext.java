package com.erp.tenant;

/**
 * 현재 요청이 어느 회사(스키마)에 대한 것인지 담는 ThreadLocal.
 * <p>
 * JWT 필터가 요청 시작에 설정하고 끝에 지운다. 로그인 등 테넌트가 아직 없을 때는
 * {@link #DEFAULT}(본사 = public)로 동작한다.
 */
public final class TenantContext {

    /** 본사(기존 데이터)의 스키마. 테넌트가 지정되지 않으면 여기로 간다. */
    public static final String DEFAULT = "public";

    private static final ThreadLocal<String> CURRENT = ThreadLocal.withInitial(() -> DEFAULT);

    private TenantContext() {}

    public static void set(String schema) {
        CURRENT.set(schema == null || schema.isBlank() ? DEFAULT : schema);
    }

    public static String get() {
        return CURRENT.get();
    }

    public static void clear() {
        CURRENT.remove();
    }
}
