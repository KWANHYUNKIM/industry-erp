package com.erp.tenant;

import org.springframework.stereotype.Component;

/**
 * 기동이 덜 끝났는가. 웹 서버는 {@link TenantMigrationRunner} 보다 먼저 뜨므로, 그 사이(회사별 마이그레이션이 테이블에
 * 잠금을 거는 몇 초)에 들어온 요청이 사용자 조회에서 실패하면 JWT 필터의 예외가 /error 로 넘어가 <b>401</b> 이 되고,
 * 프론트는 토큰을 지우고 로그인 화면으로 보냈다. 준비되기 전에는 토큰이 있는 요청에 503 을 돌려 로그아웃되지 않게 한다.
 */
@Component
public class StartupGate {

    private volatile boolean ready = false;

    public boolean isReady() { return ready; }

    public void markReady() { ready = true; }
}
