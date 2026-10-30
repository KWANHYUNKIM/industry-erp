package com.erp.auth.user;

/**
 * 사용자등록 [권한] 탭의 기본권한. 업무마다 따로 정하지 않은 업무가 이 값을 따른다.
 * GROUP 이면 사용자의 (ADMIN 아닌) 역할 = 권한그룹의 업무권한을 따른다.
 */
public enum BasePermission {
    /** 업무모든권한 */
    ALL,
    /** 업무권한없음 */
    NONE,
    /** 권한그룹 */
    GROUP
}
