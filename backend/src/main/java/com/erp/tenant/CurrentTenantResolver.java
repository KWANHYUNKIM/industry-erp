package com.erp.tenant;

import org.hibernate.context.spi.CurrentTenantIdentifierResolver;
import org.springframework.stereotype.Component;

/**
 * Hibernate 가 "지금 세션의 테넌트가 누구냐"를 물을 때 {@link TenantContext} 를 돌려준다.
 */
@Component
public class CurrentTenantResolver implements CurrentTenantIdentifierResolver<String> {

    @Override
    public String resolveCurrentTenantIdentifier() {
        return TenantContext.get();
    }

    @Override
    public boolean validateExistingCurrentSessions() {
        return true;
    }
}
